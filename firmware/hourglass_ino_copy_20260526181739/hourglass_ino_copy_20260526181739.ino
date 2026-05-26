#include <Wire.h>
#include <Adafruit_NeoPixel.h>
#include <ArduinoWebsockets.h>
#include <WiFi.h>
#include "config.example.h"

// ==========================================
// WEBSOCKET
// ==========================================

using namespace websockets;
WebsocketsClient wsClient;

// ==========================================
// HARDWARE CONFIG
// ==========================================

#define SDA_PIN 6
#define SCL_PIN 5
#define MPU_ADDR 0x68

#define PIN 4
#define NUMPIXELS 19

Adafruit_NeoPixel pixels(NUMPIXELS, PIN, NEO_GRB + NEO_KHZ800);

// ==========================================
// LED MAPPINGS - ROW BASED HOURGLASS
//
// Physical shape from bottom to top:
//
// 0  1  2  3
// 6  5  4
// 7  8
// 9
// 10 11
// 14 13 12
// 15 16 17 18
// ==========================================

const int neckLED = 9;

// Source order when upright: top outer row -> row 3 -> row 2
const int upperSourceOrder[9] = {
  15, 16, 17, 18,
  14, 13, 12,
  10, 11
};

// Final destination order when upright
const int lowerFinalOrder[9] = {
  0, 1, 2, 3,
  6, 5, 4,
  7, 8
};

// Source order when flipped: bottom outer row -> row 3 -> row 2
const int lowerSourceOrder[9] = {
  0, 1, 2, 3,
  6, 5, 4,
  7, 8
};

// Final destination order when flipped
const int upperFinalOrder[9] = {
  15, 16, 17, 18,
  14, 13, 12,
  10, 11
};

const int* sourceBulb = upperSourceOrder;
const int* finalBulb = lowerFinalOrder;

// ==========================================
// GRAVITY PATHS
//
// Upright logic:
//
// 15-8-6-0
// 16-7-5-1
// 17-8-4-2
// 18-8-4-3
// 14-7-6
// 13-7-5
// 12-8-4
// 10-7
// 11-8
// ==========================================

const int upPath0[] = {8, 6, 0};
const int upPath1[] = {7, 5, 1};
const int upPath2[] = {8, 4, 2};
const int upPath3[] = {8, 4, 3};
const int upPath4[] = {7, 6};
const int upPath5[] = {7, 5};
const int upPath6[] = {8, 4};
const int upPath7[] = {7};
const int upPath8[] = {8};

const int* gravityPathsUp[9] = {
  upPath0,
  upPath1,
  upPath2,
  upPath3,
  upPath4,
  upPath5,
  upPath6,
  upPath7,
  upPath8
};

const int gravityLengthsUp[9] = {
  3, 3, 3, 3,
  2, 2, 2,
  1, 1
};

// Flipped paths: bottom to top
const int downPath0[] = {10, 14, 15};
const int downPath1[] = {11, 13, 16};
const int downPath2[] = {11, 12, 17};
const int downPath3[] = {11, 12, 18};
const int downPath4[] = {10, 14};
const int downPath5[] = {11, 13};
const int downPath6[] = {11, 12};
const int downPath7[] = {10};
const int downPath8[] = {11};

const int* gravityPathsDown[9] = {
  downPath0,
  downPath1,
  downPath2,
  downPath3,
  downPath4,
  downPath5,
  downPath6,
  downPath7,
  downPath8
};

const int gravityLengthsDown[9] = {
  3, 3, 3, 3,
  2, 2, 2,
  1, 1
};

const int** currentGravityPaths = gravityPathsUp;
const int* currentGravityLengths = gravityLengthsUp;

// ==========================================
// ANIMATION VARIABLES
// ==========================================

unsigned long previousSandMillis = 0;
unsigned long fadeStartTime = 0;
unsigned long pauseStartedMillis = 0;
unsigned long gravityStepMillis = 0;

unsigned long totalDurationMinutes = 1;
unsigned long totalDurationMs = 0;

unsigned long grainTotalMs = 0;
unsigned long sandInterval = 0;

unsigned long fadeDuration = 400;
unsigned long gravityStepMs = 90;

int grainsFallen = 0;
int animationStep = 0;
int gravityIndex = 0;

String currentOrientation = "UNKNOWN";
String fallOrientation = "UP";

bool webPaused = false;
bool orientationPaused = false;
bool isPaused = false;
bool sandRunning = false;

// ==========================================
// MODE / FOCUS OVERTIME VARIABLES
// ==========================================

String currentMode = "TIMER";     // "TIMER" or "FOCUS"
bool inOvertime = false;          // true only after focus sand finishes
unsigned long overtimeStartTime = 0;

// ==========================================
// FUNCTION PROTOTYPES
// ==========================================

void connectWiFi();
void setupWebSocket();
void sendDeviceRegistration();

void readMPU();
void sendImuForOrientation(String orientation);

void startSand(int minutes, String mode);
void pauseSand();
void resumeSand();
void stopSandToFinal();
void updatePauseState();
void recalculateSandInterval();

void resetHourglass();
void showCompletedHourglass();
void redrawStableHourglass();
void runGreenSand();
void runOvertimeBlink();

uint32_t getGreenFade(float progress);
uint32_t getBlueBreathing(float brightness);

void checkSerialInput();
int extractDurationMinutes(String data);
String extractMode(String data);

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

  recalculateSandInterval();

  connectWiFi();
  setupWebSocket();

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00);
  byte error = Wire.endTransmission();

  if (error == 0) {
    Serial.println("MPU6050 Awake!");
    resetHourglass();
  } else {
    Serial.println("MPU6050 Wake Error: " + String(error));
  }
}

// ==========================================
// LOOP
// ==========================================

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (WiFi.status() == WL_CONNECTED) {
    wsClient.poll();
  }

  checkSerialInput();
  readMPU();

  if (sandRunning && !isPaused && grainsFallen < 9) {
    runGreenSand();
  }

  if (inOvertime && !isPaused && currentMode == "FOCUS") {
    runOvertimeBlink();
  }
}

// ==========================================
// WIFI
// ==========================================

void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;

  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi FAILED.");
    Serial.println("Try phone hotspot if aalto open does not work.");
  }
}

// ==========================================
// WEBSOCKET
// ==========================================

void setupWebSocket() {
  wsClient.onMessage([&](WebsocketsMessage message) {
    String data = message.data();
    Serial.println("WS Message Received: " + data);

    if (data.indexOf("START_SAND") >= 0) {
      int inputMinutes = extractDurationMinutes(data);
      String mode = extractMode(data);

      if (inputMinutes > 0) {
        startSand(inputMinutes, mode);
      } else {
        Serial.println("START_SAND received but duration_minutes was invalid.");
      }
    }

    else if (data.indexOf("PAUSE_SAND") >= 0) {
      Serial.println("--- PAUSE_SAND RECEIVED ---");
      webPaused = true;
      updatePauseState();
    }

    else if (data.indexOf("RESUME_SAND") >= 0) {
      Serial.println("--- RESUME_SAND RECEIVED ---");
      webPaused = false;
      updatePauseState();
    }

    else if (data.indexOf("STOP_SAND") >= 0) {
      Serial.println("--- STOP_SAND RECEIVED ---");
      stopSandToFinal();
    }

    else {
      int inputMinutes = data.toInt();

      if (inputMinutes > 0) {
        startSand(inputMinutes, "TIMER");
      }
    }
  });

  wsClient.onEvent([&](WebsocketsEvent event, String data) {
    if (event == WebsocketsEvent::ConnectionOpened) {
      Serial.println("WebSocket Connection Opened!");
      sendDeviceRegistration();
    }

    else if (event == WebsocketsEvent::ConnectionClosed) {
      Serial.println("WebSocket Connection Closed!");
    }

    else if (event == WebsocketsEvent::GotPing) {
      Serial.println("Got Ping");
    }

    else if (event == WebsocketsEvent::GotPong) {
      Serial.println("Got Pong");
    }
  });

  Serial.println("Connecting to WebSocket Server:");
  Serial.println(WEBSOCKET_URL);

  wsClient.setCACert(ROOT_CA_CERT);

  bool connected = wsClient.connect(WEBSOCKET_URL);

  if (connected) {
    Serial.println("WebSocket connect() returned TRUE");
  } else {
    Serial.println("WebSocket connect() returned FALSE");
    Serial.println("Possible causes:");
    Serial.println("1. WiFi blocks ESP32 / captive portal");
    Serial.println("2. Railway broker is sleeping/down");
    Serial.println("3. TLS certificate issue");
    Serial.println("4. Wrong WebSocket URL");
  }
}

void sendDeviceRegistration() {
  String registration =
    "{"
      "\"type\":\"device_registration\","
      "\"device\":\"hourglass-esp32-01\","
      "\"device_name\":\"Hourglass ESP32\","
      "\"device_type\":\"ESP32\","
      "\"library\":\"ArduinoWebsockets\","
      "\"version\":\"1.0\","
      "\"ip\":\"ESP32\","
      "\"sensors\":["
        "{"
          "\"name\":\"imu\","
          "\"type\":\"imu\","
          "\"data_type\":\"object\""
        "}"
      "],"
      "\"actuators\":["
        "{"
          "\"name\":\"sand\","
          "\"type\":\"mp3_player\","
          "\"data_type\":\"object\""
        "}"
      "]"
    "}";

  wsClient.send(registration);

  Serial.println("Device registration sent:");
  Serial.println(registration);
}

// ==========================================
// SAND COMMAND LOGIC
// ==========================================

void startSand(int minutes, String mode) {
  totalDurationMinutes = minutes;
  totalDurationMs = minutes * 60000UL;

  currentMode = mode;
  currentMode.toUpperCase();

  inOvertime = false;

  recalculateSandInterval();

  Serial.println("--- START_SAND ---");
  Serial.println("Mode: " + currentMode);
  Serial.println("Total Time: " + String(totalDurationMinutes) + " minutes");
  Serial.println("Sand finishes at 95% of task duration");
  Serial.println("Per grain total: " + String(grainTotalMs / 1000.0) + " seconds");
  Serial.println("Wait before grain: " + String(sandInterval / 1000.0) + " seconds");
  Serial.println("Fade duration: " + String(fadeDuration / 1000.0) + " seconds");
  Serial.println("Gravity step: " + String(gravityStepMs / 1000.0) + " seconds");

  webPaused = false;
  orientationPaused = false;
  isPaused = false;
  sandRunning = true;

  resetHourglass();
}

void pauseSand() {
  if (!isPaused) {
    pauseStartedMillis = millis();
  }

  isPaused = true;
}

void resumeSand() {
  if (isPaused) {
    unsigned long pausedDuration = millis() - pauseStartedMillis;

    previousSandMillis += pausedDuration;
    gravityStepMillis += pausedDuration;

    if (animationStep == 1) {
      fadeStartTime += pausedDuration;
    }

    if (inOvertime) {
      overtimeStartTime += pausedDuration;
    }
  }

  isPaused = false;
}

void updatePauseState() {
  bool shouldPause = webPaused || orientationPaused;

  if (shouldPause && !isPaused) {
    pauseSand();
  }

  else if (!shouldPause && isPaused) {
    resumeSand();
  }
}

void stopSandToFinal() {
  sandRunning = false;
  inOvertime = false;

  webPaused = false;
  orientationPaused = false;
  isPaused = true;

  showCompletedHourglass();
}

void recalculateSandInterval() {
  unsigned long totalMs = totalDurationMinutes * 60000UL;
  unsigned long sandDurationMs = (totalMs * 95UL) / 100UL;

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

  Serial.println("--- SAND TIMING UPDATED ---");
  Serial.println("Task duration: " + String(totalDurationMinutes) + " minutes");
  Serial.println("Sand duration 95%: " + String(sandDurationMs / 1000.0) + " seconds");
  Serial.println("Per grain total: " + String(grainTotalMs / 1000.0) + " seconds");
  Serial.println("Wait before grain: " + String(sandInterval / 1000.0) + " seconds");
  Serial.println("Fade duration: " + String(fadeDuration / 1000.0) + " seconds");
  Serial.println("Gravity step: " + String(gravityStepMs / 1000.0) + " seconds");
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

    String newOrientation = "TRANSITION";

    if (x_g > 0.7) {
      newOrientation = "UP";
    } else if (x_g < -0.7) {
      newOrientation = "DOWN";
    } else if (abs(z_g) > 0.7 || abs(y_g) > 0.7) {
      newOrientation = "LEAN";
    }

    if (
      newOrientation != currentOrientation &&
      (newOrientation == "UP" || newOrientation == "DOWN" || newOrientation == "LEAN")
    ) {
      currentOrientation = newOrientation;

      Serial.println("Orientation changed to: " + currentOrientation);

      if (newOrientation == "LEAN") {
        orientationPaused = true;
        updatePauseState();
      }

      else {
        orientationPaused = false;

        if (newOrientation != fallOrientation) {
          fallOrientation = newOrientation;

          if (newOrientation == "UP") {
            sourceBulb = upperSourceOrder;
            finalBulb = lowerFinalOrder;
            currentGravityPaths = gravityPathsUp;
            currentGravityLengths = gravityLengthsUp;
          }

          else if (newOrientation == "DOWN") {
            sourceBulb = lowerSourceOrder;
            finalBulb = upperFinalOrder;
            currentGravityPaths = gravityPathsDown;
            currentGravityLengths = gravityLengthsDown;
          }

          if (!sandRunning && !inOvertime) {
            resetHourglass();
          }
        }

        updatePauseState();
      }

      sendImuForOrientation(currentOrientation);
    }
  }

  delay(50);
}

void sendImuForOrientation(String orientation) {
  if (!wsClient.available()) {
    Serial.println("Cannot send IMU: WebSocket not available.");
    return;
  }

  String imuMsg = "";

  if (orientation == "UP") {
    imuMsg = "I0,0,9.8,0,0,0";
  } else if (orientation == "LEAN") {
    imuMsg = "I9.8,0,0,0,0,0";
  } else if (orientation == "DOWN") {
    imuMsg = "I0,0,-9.8,0,0,0";
  }

  if (imuMsg != "") {
    wsClient.send(imuMsg);
    Serial.println("Sent IMU position: " + imuMsg);
  }
}

// ==========================================
// LED ANIMATION
// ==========================================

uint32_t getGreenFade(float progress) {
  if (progress > 1.0) progress = 1.0;
  if (progress < 0.0) progress = 0.0;

  return pixels.Color(0, (uint8_t)(255 * progress), 0);
}

uint32_t getBlueBreathing(float brightness) {
  if (brightness > 1.0) brightness = 1.0;
  if (brightness < 0.0) brightness = 0.0;

  return pixels.Color(0, 0, (uint8_t)(255 * brightness));
}

void resetHourglass() {
  grainsFallen = 0;
  animationStep = 0;
  gravityIndex = 0;

  previousSandMillis = millis();
  fadeStartTime = millis();
  gravityStepMillis = millis();

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

  grainsFallen = 9;
  animationStep = 0;
  gravityIndex = 0;
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

void runGreenSand() {
  unsigned long currentMillis = millis();

  if (animationStep == 0 && currentMillis - previousSandMillis >= sandInterval) {
    previousSandMillis = currentMillis;
    fadeStartTime = currentMillis;
    animationStep = 1;
  }

  else if (animationStep == 1) {
    float progress = (currentMillis - fadeStartTime) / (float)fadeDuration;

    redrawStableHourglass();

    pixels.setPixelColor(sourceBulb[grainsFallen], getGreenFade(1.0 - progress));
    pixels.show();

    if (progress >= 1.0) {
      gravityIndex = 0;
      gravityStepMillis = currentMillis;
      animationStep = 2;
    }
  }

  else if (animationStep == 2) {
    int pathLength = currentGravityLengths[grainsFallen];

    if (currentMillis - gravityStepMillis >= gravityStepMs) {
      gravityStepMillis = currentMillis;

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

    if (grainsFallen >= 9) {
      sandRunning = false;

      showCompletedHourglass();

      if (currentMode == "FOCUS") {
        inOvertime = true;
        isPaused = false;
        overtimeStartTime = millis();

        Serial.println("Focus Mode: sand completed at 95%.");
        Serial.println("Waiting until 100%, then starting blue overtime animation.");
      } else {
        inOvertime = false;
        isPaused = true;

        wsClient.send("{\"s\":\"timer\",\"v\":\"finished\"}");
        Serial.println("Timer finished sent to broker");
      }
    }
  }
}

void runOvertimeBlink() {
  unsigned long currentMillis = millis();

  // Sand finished at 95%.
  // Wait the remaining 5% of the planned duration before blue breathing starts.
  unsigned long additionalWaitMs = (totalDurationMs * 5UL) / 100UL;
  unsigned long overtimeElapsed = currentMillis - overtimeStartTime;

  if (overtimeElapsed < additionalWaitMs) {
    // Keep completed green hourglass visible between 95% and 100%.
    return;
  }

  // After 100%: all LEDs breathe blue.
  unsigned long cycleTime = 3000;
  unsigned long cyclePosition =
    (currentMillis - overtimeStartTime - additionalWaitMs) % cycleTime;

  float normalizedPosition = (float)cyclePosition / (float)cycleTime;
  float brightness;

  if (normalizedPosition < 0.5) {
    brightness = normalizedPosition * 2.0;
  } else {
    brightness = 2.0 - (normalizedPosition * 2.0);
  }

  uint32_t blueColor = getBlueBreathing(brightness);

  for (int i = 0; i < NUMPIXELS; i++) {
    pixels.setPixelColor(i, blueColor);
  }

  pixels.show();
}

// ==========================================
// HELPERS
// ==========================================

int extractDurationMinutes(String data) {
  int keyIndex = data.indexOf("duration_minutes");

  if (keyIndex < 0) {
    return 0;
  }

  int colonIndex = data.indexOf(":", keyIndex);

  if (colonIndex < 0) {
    return 0;
  }

  int commaIndex = data.indexOf(",", colonIndex);
  int braceIndex = data.indexOf("}", colonIndex);

  int endIndex = braceIndex;

  if (commaIndex > 0 && commaIndex < braceIndex) {
    endIndex = commaIndex;
  }

  if (endIndex < 0) {
    return 0;
  }

  String minutesStr = data.substring(colonIndex + 1, endIndex);
  minutesStr.trim();

  return minutesStr.toInt();
}

String extractMode(String data) {
  int modeIndex = data.indexOf("\"mode\"");

  if (modeIndex < 0) {
    Serial.println("No mode field found, defaulting to TIMER");
    return "TIMER";
  }

  int colonIndex = data.indexOf(":", modeIndex);
  if (colonIndex < 0) return "TIMER";

  int firstQuote = data.indexOf("\"", colonIndex + 1);
  if (firstQuote < 0) return "TIMER";

  int secondQuote = data.indexOf("\"", firstQuote + 1);
  if (secondQuote < 0) return "TIMER";

  String mode = data.substring(firstQuote + 1, secondQuote);
  mode.toUpperCase();

  if (mode == "FOCUS") {
    Serial.println("Mode extracted: FOCUS");
    return "FOCUS";
  }

  Serial.println("Mode extracted: TIMER");
  return "TIMER";
}

void checkSerialInput() {
  if (Serial.available() > 0) {
    int inputMinutes = Serial.parseInt();

    while (Serial.available() > 0) {
      Serial.read();
    }

    if (inputMinutes > 0) {
      startSand(inputMinutes, "TIMER");
    }
  }
}