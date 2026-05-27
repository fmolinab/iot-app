#include <Wire.h>
#include <Adafruit_NeoPixel.h>
#include <ArduinoWebsockets.h>
#include <WiFi.h>
#include "config.example.h"

using namespace websockets;

// ==========================================
// STATE MACHINE DEFINITION
// ==========================================

enum AppState {
  STATE_IDLE,           // No task running, hourglass full
  STATE_SAND_RUNNING,   // Sand animation active (0-95%)
  STATE_SAND_COMPLETE,  // Sand finished, waiting for 100% (95-100%)
  STATE_OVERTIME        // Past 100%, showing breathing LED
};

enum Orientation {
  ORIENT_UP,
  ORIENT_DOWN,
  ORIENT_LEAN,
  ORIENT_UNKNOWN
};

enum CommandType {
  CMD_START_SAND,
  CMD_PAUSE_SAND,
  CMD_RESUME_SAND,
  CMD_STOP_SAND,
  CMD_FOCUS_COMPLETE,
  CMD_NONE
};

// ==========================================
// HARDWARE CONFIG
// ==========================================

#define SDA_PIN 6
#define SCL_PIN 5
#define MPU_ADDR 0x68
#define PIN 4
#define NUMPIXELS 19

Adafruit_NeoPixel pixels(NUMPIXELS, PIN, NEO_GRB + NEO_KHZ800);
WebsocketsClient wsClient;

// ==========================================
// LED MAPPINGS (same as before)
// ==========================================

const int neckLED = 9;

const int upperSourceOrder[9] = {15, 16, 17, 18, 14, 13, 12, 10, 11};
const int lowerFinalOrder[9] = {0, 1, 2, 3, 6, 5, 4, 7, 8};
const int lowerSourceOrder[9] = {0, 1, 2, 3, 6, 5, 4, 7, 8};
const int upperFinalOrder[9] = {15, 16, 17, 18, 14, 13, 12, 10, 11};

const int* sourceBulb = upperSourceOrder;
const int* finalBulb = lowerFinalOrder;

// Gravity paths (same as before)
const int upPath0[] = {8, 6, 0};
const int upPath1[] = {7, 5, 1};
const int upPath2[] = {8, 4, 2};
const int upPath3[] = {8, 4, 3};
const int upPath4[] = {7, 6};
const int upPath5[] = {7, 5};
const int upPath6[] = {8, 4};
const int upPath7[] = {7};
const int upPath8[] = {8};

const int* gravityPathsUp[9] = {upPath0, upPath1, upPath2, upPath3, upPath4, upPath5, upPath6, upPath7, upPath8};
const int gravityLengthsUp[9] = {3, 3, 3, 3, 2, 2, 2, 1, 1};

const int downPath0[] = {10, 14, 15};
const int downPath1[] = {11, 13, 16};
const int downPath2[] = {11, 12, 17};
const int downPath3[] = {11, 12, 18};
const int downPath4[] = {10, 14};
const int downPath5[] = {11, 13};
const int downPath6[] = {11, 12};
const int downPath7[] = {10};
const int downPath8[] = {11};

const int* gravityPathsDown[9] = {downPath0, downPath1, downPath2, downPath3, downPath4, downPath5, downPath6, downPath7, downPath8};
const int gravityLengthsDown[9] = {3, 3, 3, 3, 2, 2, 2, 1, 1};

const int** currentGravityPaths = gravityPathsUp;
const int* currentGravityLengths = gravityLengthsUp;

// ==========================================
// STATE VARIABLES
// ==========================================

AppState currentState = STATE_IDLE;
Orientation currentOrientation = ORIENT_UNKNOWN;
Orientation fallOrientation = ORIENT_UP;

String currentMode = "TIMER";  // "TIMER" or "FOCUS"
unsigned long totalDurationMs = 0;
unsigned long taskStartTime = 0;
unsigned long totalPausedDuration = 0;
unsigned long currentPauseStartTime = 0;

// Sand animation variables
int grainsFallen = 0;
int animationStep = 0;
int gravityIndex = 0;
unsigned long lastAnimationTime = 0;
unsigned long fadeStartTime = 0;
unsigned long gravityStepStartTime = 0;
unsigned long sandInterval = 0;
unsigned long grainTotalMs = 0;
unsigned long fadeDuration = 400;
unsigned long gravityStepMs = 90;

bool webPaused = false;
bool orientationPaused = false;

// ==========================================
// FUNCTION PROTOTYPES
// ==========================================

void setupWiFi();
void setupWebSocket();
void sendDeviceRegistration();
void processWebSocketMessage(String data);
CommandType parseCommand(String data);
int extractDurationMinutes(String data);
String extractMode(String data);
void sendIMUData();

void readMPU();
void updateOrientation(float x_g, float y_g, float z_g);
void handleOrientationChange();

void transitionTo(AppState newState);
void startSand(int minutes, String mode);
void pauseSand();
void resumeSand();
void stopSand();
void focusComplete();

void updateSandAnimation();
void runGreenSand();
void resetHourglass();
void showCompletedHourglass();
void redrawStableHourglass();
void runOvertimeBlink();
void flashBlueLED();

void recalculateSandTiming();
void updatePauseState();
void keepAlive();

uint32_t getGreenFade(float progress);
uint32_t getBlueBreathing(float brightness);
uint32_t getRedBreathing(float brightness);

// ==========================================
// SETUP
// ==========================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  pixels.begin();
  pixels.setBrightness(50);
  pixels.clear();
  pixels.show();

  setupWiFi();
  setupWebSocket();

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00);
  Wire.endTransmission();

  resetHourglass();
  Serial.println("ESP32 Ready - State Machine Active");
}

// ==========================================
// MAIN LOOP
// ==========================================

void loop() {
  keepAlive();
  
  if (WiFi.status() == WL_CONNECTED) {
    wsClient.poll();
  }

  readMPU();
  updateSandAnimation();
}

// ==========================================
// STATE MACHINE TRANSITIONS
// ==========================================

void transitionTo(AppState newState) {
  if (currentState == newState) return;
  
  Serial.print("State transition: ");
  Serial.print(currentState);
  Serial.print(" -> ");
  Serial.println(newState);
  
  // Exit current state
  switch (currentState) {
    case STATE_SAND_RUNNING:
    case STATE_SAND_COMPLETE:
    case STATE_OVERTIME:
      // No special exit actions needed
      break;
    default:
      break;
  }
  
  currentState = newState;
  
  // Enter new state
  switch (currentState) {
    case STATE_IDLE:
      resetHourglass();
      break;
    case STATE_SAND_RUNNING:
      // Sand animation already running
      break;
    case STATE_SAND_COMPLETE:
      showCompletedHourglass();
      break;
    case STATE_OVERTIME:
      // Overtime animation will run in loop
      break;
  }
}

// ==========================================
// COMMAND HANDLERS
// ==========================================

void startSand(int minutes, String mode) {
  totalDurationMs = (unsigned long)minutes * 60000UL;
  currentMode = mode;
  currentMode.toUpperCase();
  
  taskStartTime = millis();
  totalPausedDuration = 0;
  webPaused = false;
  orientationPaused = false;
  
  recalculateSandTiming();
  
  Serial.println("--- START_SAND ---");
  Serial.println("Mode: " + currentMode);
  Serial.println("Duration: " + String(minutes) + " minutes (" + String(totalDurationMs) + " ms)");
  
  resetHourglass();
  transitionTo(STATE_SAND_RUNNING);
}

void pauseSand() {
  if (currentPauseStartTime == 0) {
    currentPauseStartTime = millis();
    Serial.println("Sand PAUSED");
  }
}

void resumeSand() {
  if (currentPauseStartTime > 0) {
    unsigned long pausedDuration = millis() - currentPauseStartTime;
    totalPausedDuration += pausedDuration;
    
    // Adjust animation timers
    lastAnimationTime += pausedDuration;
    if (animationStep == 1) fadeStartTime += pausedDuration;
    if (animationStep == 2) gravityStepStartTime += pausedDuration;
    
    currentPauseStartTime = 0;
    Serial.println("Sand RESUMED (paused for " + String(pausedDuration) + " ms)");
  }
}

void stopSand() {
  Serial.println("Sand STOPPED");
  transitionTo(STATE_IDLE);
}

void focusComplete() {
  Serial.println("FOCUS_COMPLETE received - flashing blue LED");
  flashBlueLED();
  
  // If we're in overtime, transition to idle after flash
  if (currentState == STATE_OVERTIME) {
    transitionTo(STATE_IDLE);
  }
}

// ==========================================
// SANDS TIMING (95% for animation)
// ==========================================

void recalculateSandTiming() {
  unsigned long sandDurationMs = (totalDurationMs * 95UL) / 100UL;
  grainTotalMs = sandDurationMs / 9UL;
  
  if (grainTotalMs < 1500UL) {
    fadeDuration = 150;
    gravityStepMs = 40;
  } else if (grainTotalMs < 5000UL) {
    fadeDuration = 250;
    gravityStepMs = 60;
  } else {
    fadeDuration = 400;
    gravityStepMs = 90;
  }
  
  unsigned long maxGravityTime = 3UL * gravityStepMs;
  if (grainTotalMs > fadeDuration + maxGravityTime) {
    sandInterval = grainTotalMs - fadeDuration - maxGravityTime;
  } else {
    sandInterval = 1;
  }
}

void updateSandAnimation() {
  if (currentState != STATE_SAND_RUNNING) return;
  
  bool isPaused = webPaused || orientationPaused;
  if (isPaused) return;
  
  runGreenSand();
  
  // Check if sand animation completed (95%)
  if (grainsFallen >= 9) {
    transitionTo(STATE_SAND_COMPLETE);
  }
}

void updatePauseState() {
  bool shouldPause = webPaused || orientationPaused;
  
  if (shouldPause && currentPauseStartTime == 0) {
    pauseSand();
  } else if (!shouldPause && currentPauseStartTime > 0) {
    resumeSand();
  }
}

// ==========================================
// LED ANIMATIONS
// ==========================================

void runGreenSand() {
  unsigned long currentMillis = millis();
  
  if (animationStep == 0 && currentMillis - lastAnimationTime >= sandInterval) {
    lastAnimationTime = currentMillis;
    fadeStartTime = currentMillis;
    animationStep = 1;
  }
  else if (animationStep == 1) {
    float progress = (currentMillis - fadeStartTime) / (float)fadeDuration;
    if (progress > 1.0) progress = 1.0;
    
    redrawStableHourglass();
    pixels.setPixelColor(sourceBulb[grainsFallen], getGreenFade(1.0 - progress));
    pixels.show();
    
    if (progress >= 1.0) {
      gravityIndex = 0;
      gravityStepStartTime = currentMillis;
      animationStep = 2;
    }
  }
  else if (animationStep == 2) {
    int pathLength = currentGravityLengths[grainsFallen];
    
    if (currentMillis - gravityStepStartTime >= gravityStepMs) {
      gravityStepStartTime = currentMillis;
      
      redrawStableHourglass();
      int currentLed = currentGravityPaths[grainsFallen][gravityIndex];
      pixels.setPixelColor(currentLed, pixels.Color(0, 255, 0));
      pixels.show();
      
      gravityIndex++;
      if (gravityIndex >= pathLength) {
        animationStep = 3;
      }
    }
  }
  else if (animationStep == 3) {
    redrawStableHourglass();
    pixels.setPixelColor(finalBulb[grainsFallen], pixels.Color(0, 255, 0));
    pixels.show();
    
    grainsFallen++;
    animationStep = 0;
    gravityIndex = 0;
  }
}

void resetHourglass() {
  grainsFallen = 0;
  animationStep = 0;
  gravityIndex = 0;
  lastAnimationTime = millis();
  fadeStartTime = millis();
  gravityStepStartTime = millis();
  
  pixels.clear();
  for (int i = 0; i < 9; i++) {
    pixels.setPixelColor(sourceBulb[i], pixels.Color(0, 255, 0));
  }
  pixels.setPixelColor(neckLED, pixels.Color(0, 255, 0));
  pixels.show();
}

void showCompletedHourglass() {
  pixels.clear();
  for (int i = 0; i < 9; i++) {
    pixels.setPixelColor(finalBulb[i], pixels.Color(0, 255, 0));
  }
  pixels.setPixelColor(neckLED, pixels.Color(0, 255, 0));
  pixels.show();
}

void redrawStableHourglass() {
  pixels.clear();
  for (int i = grainsFallen + 1; i < 9; i++) {
    pixels.setPixelColor(sourceBulb[i], pixels.Color(0, 255, 0));
  }
  for (int i = 0; i < grainsFallen; i++) {
    pixels.setPixelColor(finalBulb[i], pixels.Color(0, 255, 0));
  }
  pixels.setPixelColor(neckLED, pixels.Color(0, 255, 0));
}

void runOvertimeBlink() {
  unsigned long currentMillis = millis();
  unsigned long overtimeElapsed = currentMillis - taskStartTime - totalPausedDuration;
  
  // Wait until we've passed 100%
  if (overtimeElapsed < totalDurationMs) {
    showCompletedHourglass();
    return;
  }
  
  // Breathing animation after 100%
  unsigned long cycleTime = 3000;
  unsigned long cyclePosition = (overtimeElapsed - totalDurationMs) % cycleTime;
  float normalizedPosition = (float)cyclePosition / (float)cycleTime;
  float brightness = (normalizedPosition < 0.5) ? normalizedPosition * 2.0 : 2.0 - (normalizedPosition * 2.0);
  
  uint32_t breathColor = (currentMode == "FOCUS") ? getBlueBreathing(brightness) : getRedBreathing(brightness);
  
  for (int i = 0; i < NUMPIXELS; i++) {
    pixels.setPixelColor(i, breathColor);
  }
  pixels.show();
}

void flashBlueLED() {
  for (int flash = 0; flash < 3; flash++) {
    for (int i = 0; i < NUMPIXELS; i++) {
      pixels.setPixelColor(i, pixels.Color(0, 0, 255));
    }
    pixels.show();
    delay(200);
    
    for (int i = 0; i < NUMPIXELS; i++) {
      pixels.setPixelColor(i, pixels.Color(0, 0, 0));
    }
    pixels.show();
    delay(200);
  }
}

uint32_t getGreenFade(float progress) {
  return pixels.Color(0, (uint8_t)(255 * constrain(progress, 0, 1)), 0);
}

uint32_t getBlueBreathing(float brightness) {
  return pixels.Color(0, 0, (uint8_t)(255 * constrain(brightness, 0, 1)));
}

uint32_t getRedBreathing(float brightness) {
  return pixels.Color((uint8_t)(255 * constrain(brightness, 0, 1)), 0, 0);
}

float constrain(float value, float minVal, float maxVal) {
  if (value < minVal) return minVal;
  if (value > maxVal) return maxVal;
  return value;
}

// ==========================================
// MPU / ORIENTATION
// ==========================================

void readMPU() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom((uint16_t)MPU_ADDR, (uint8_t)6, true);
  
  if (Wire.available() >= 6) {
    int16_t ax_raw = (Wire.read() << 8) | Wire.read();
    int16_t ay_raw = (Wire.read() << 8) | Wire.read();
    int16_t az_raw = (Wire.read() << 8) | Wire.read();
    
    float x_g = ax_raw / 16384.0;
    float y_g = ay_raw / 16384.0;
    float z_g = az_raw / 16384.0;
    
    updateOrientation(x_g, y_g, z_g);
  }
  delay(50);
}

void updateOrientation(float x_g, float y_g, float z_g) {
  Orientation newOrientation = ORIENT_UNKNOWN;
  
  if (x_g > 0.7) {
    newOrientation = ORIENT_UP;
  } else if (x_g < -0.7) {
    newOrientation = ORIENT_DOWN;
  } else if (abs(z_g) > 0.7 || abs(y_g) > 0.7) {
    newOrientation = ORIENT_LEAN;
  }
  
  if (newOrientation != currentOrientation && newOrientation != ORIENT_UNKNOWN) {
    currentOrientation = newOrientation;
    handleOrientationChange();
    sendIMUData();
  }
}

void handleOrientationChange() {
  Serial.println("Orientation: " + String(currentOrientation));
  
  orientationPaused = (currentOrientation == ORIENT_LEAN);
  updatePauseState();
  
  if (currentOrientation == ORIENT_UP) {
    fallOrientation = ORIENT_UP;
    sourceBulb = upperSourceOrder;
    finalBulb = lowerFinalOrder;
    currentGravityPaths = gravityPathsUp;
    currentGravityLengths = gravityLengthsUp;
  } else if (currentOrientation == ORIENT_DOWN) {
    fallOrientation = ORIENT_DOWN;
    sourceBulb = lowerSourceOrder;
    finalBulb = upperFinalOrder;
    currentGravityPaths = gravityPathsDown;
    currentGravityLengths = gravityLengthsDown;
  }
  
  if (currentState == STATE_IDLE) {
    resetHourglass();
  }
}

void sendIMUData() {
  if (!wsClient.available()) return;
  
  String imuMsg;
  if (currentOrientation == ORIENT_UP) {
    imuMsg = "I0,0,9.8,0,0,0";
  } else if (currentOrientation == ORIENT_LEAN) {
    imuMsg = "I9.8,0,0,0,0,0";
  } else if (currentOrientation == ORIENT_DOWN) {
    imuMsg = "I0,0,-9.8,0,0,0";
  }
  
  if (imuMsg != "") {
    wsClient.send(imuMsg);
  }
}

// ==========================================
// WEBSOCKET
// ==========================================

void setupWebSocket() {
  wsClient.onMessage([&](WebsocketsMessage message) {
    processWebSocketMessage(message.data());
  });
  
  wsClient.onEvent([&](WebsocketsEvent event, String data) {
    if (event == WebsocketsEvent::ConnectionOpened) {
      Serial.println("WebSocket Connected");
      sendDeviceRegistration();
    } else if (event == WebsocketsEvent::ConnectionClosed) {
      Serial.println("WebSocket Disconnected");
    }
  });
  
  wsClient.setCACert(ROOT_CA_CERT);
  wsClient.connect(WEBSOCKET_URL);
}

void processWebSocketMessage(String data) {
  Serial.println("WS: " + data);
  
  if (data.indexOf("START_SAND") >= 0) {
    int minutes = extractDurationMinutes(data);
    String mode = extractMode(data);
    if (minutes > 0) startSand(minutes, mode);
  }
  else if (data.indexOf("PAUSE_SAND") >= 0) {
    webPaused = true;
    updatePauseState();
  }
  else if (data.indexOf("RESUME_SAND") >= 0) {
    webPaused = false;
    updatePauseState();
  }
  else if (data.indexOf("STOP_SAND") >= 0) {
    stopSand();
  }
  else if (data.indexOf("FOCUS_COMPLETE") >= 0) {
    focusComplete();
  }
}

CommandType parseCommand(String data) {
  if (data.indexOf("START_SAND") >= 0) return CMD_START_SAND;
  if (data.indexOf("PAUSE_SAND") >= 0) return CMD_PAUSE_SAND;
  if (data.indexOf("RESUME_SAND") >= 0) return CMD_RESUME_SAND;
  if (data.indexOf("STOP_SAND") >= 0) return CMD_STOP_SAND;
  if (data.indexOf("FOCUS_COMPLETE") >= 0) return CMD_FOCUS_COMPLETE;
  return CMD_NONE;
}

int extractDurationMinutes(String data) {
  int keyIndex = data.indexOf("duration_minutes");
  if (keyIndex < 0) return 0;
  
  int colonIndex = data.indexOf(":", keyIndex);
  if (colonIndex < 0) return 0;
  
  int commaIndex = data.indexOf(",", colonIndex);
  int braceIndex = data.indexOf("}", colonIndex);
  int endIndex = (commaIndex > 0 && commaIndex < braceIndex) ? commaIndex : braceIndex;
  
  if (endIndex < 0) return 0;
  
  String minutesStr = data.substring(colonIndex + 1, endIndex);
  minutesStr.trim();
  return minutesStr.toInt();
}

String extractMode(String data) {
  int modeIndex = data.indexOf("\"mode\"");
  if (modeIndex < 0) return "TIMER";
  
  int colonIndex = data.indexOf(":", modeIndex);
  int firstQuote = data.indexOf("\"", colonIndex + 1);
  int secondQuote = data.indexOf("\"", firstQuote + 1);
  
  if (firstQuote < 0 || secondQuote < 0) return "TIMER";
  
  String mode = data.substring(firstQuote + 1, secondQuote);
  mode.toUpperCase();
  return (mode == "FOCUS") ? "FOCUS" : "TIMER";
}

void sendDeviceRegistration() {
  String registration = "{\"type\":\"device_registration\",\"device\":\"hourglass-esp32-01\",\"device_name\":\"Hourglass ESP32\"}";
  wsClient.send(registration);
}

// ==========================================
// WIFI & KEEPALIVE
// ==========================================

void setupWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected");
}

void keepAlive() {
  static unsigned long lastPing = 0;
  unsigned long now = millis();
  
  if (now - lastPing > 30000) {
    if (wsClient.available()) wsClient.ping();
    lastPing = now;
  }
}