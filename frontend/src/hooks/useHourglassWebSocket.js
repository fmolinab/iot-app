// src/hooks/useHourglassWebSocket.js
import { useState, useEffect, useCallback, useRef } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:1880/ws/app';

export function useHourglassWebSocket() {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [devicePosition, setDevicePosition] = useState(null);
  const [lastSensorData, setLastSensorData] = useState(null);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [subscribedDevice, setSubscribedDevice] = useState(null);
  
  const wsRef = useRef(null);
  const clientIdRef = useRef(`hourglass_${Date.now()}_${Math.random()}`);
  const pingIntervalRef = useRef(null);

  // Position mapping configuration — ADJUST THESE VALUES based on your IMU
  // You'll need to read raw accelerometer values from Serial Monitor
  // and update these thresholds
  const POSITION_THRESHOLDS = {
    // Upright: Z axis points up (gravity ~9.81)
    UPRIGHT: { axis: 'z', min: 7.0, max: 11.0 },
    // Flipped: Z axis points down (gravity ~ -9.81)
    FLIPPED: { axis: 'z', min: -11.0, max: -7.0 },
    // Horizontal: X or Y axis points up (gravity on horizontal axis)
    HORIZONTAL: { axis: 'x', min: 7.0, max: 11.0 }
  };

  // Parse IMU data from I code format
  // Format: IaccelX,accelY,accelZ,gyroX,gyroY,gyroZ (6-DOF)
  // or with magnetometer: IaccelX,accelY,accelZ,gyroX,gyroY,gyroZ,magX,magY,magZ (9-DOF)
  const parseIMUData = (value) => {
    const parts = value.split(',');
    if (parts.length < 6) return null;
    
    return {
      accel: { x: parseFloat(parts[0]), y: parseFloat(parts[1]), z: parseFloat(parts[2]) },
      gyro: { x: parseFloat(parts[3]), y: parseFloat(parts[4]), z: parseFloat(parts[5]) },
      hasMag: parts.length >= 9,
      mag: parts.length >= 9 ? { x: parseFloat(parts[6]), y: parseFloat(parts[7]), z: parseFloat(parts[8]) } : null
    };
  };

  // Determine position from accelerometer data
  const determinePosition = (imuData) => {
    if (!imuData) return null;
    
    const { accel } = imuData;
    
    // Check upright
    if (accel.z >= POSITION_THRESHOLDS.UPRIGHT.min && accel.z <= POSITION_THRESHOLDS.UPRIGHT.max) {
      return 'A'; // Upright — Start/Resume
    }
    
    // Check flipped
    if (accel.z >= POSITION_THRESHOLDS.FLIPPED.min && accel.z <= POSITION_THRESHOLDS.FLIPPED.max) {
      return 'B'; // Flipped — Complete
    }
    
    // Check horizontal (X axis up)
    const absX = Math.abs(accel.x);
    if (absX >= POSITION_THRESHOLDS.HORIZONTAL.min && absX <= POSITION_THRESHOLDS.HORIZONTAL.max) {
      return 'C'; // Horizontal — Pause
    }
    
    return null;
  };
  // Send a generic actuator command to the ESP32 through Node-RED
  const sendActuatorCommand = useCallback((actuator, value) => {

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return false;
    }

    if (!subscribedDevice) {
      console.warn('No device subscribed');
      return false;
    }

    const command = {
      type: "actuator_cmd",
      actuator,
      value,
      device: subscribedDevice,
      client_id: clientIdRef.current
    };

    wsRef.current.send(JSON.stringify(command));
    console.log(`Actuator command sent: ${actuator}`, value);

    return true;
  }, [subscribedDevice]);

  // Send LED command to ESP32
  const sendLedCommand = useCallback((state) => {
    return sendActuatorCommand("led", state ? 1 : 0);
  }, [sendActuatorCommand]);

  // Send LED pulse (brief blink)
  const sendLedPulse = useCallback(async () => {
    await sendLedCommand(true);
    setTimeout(() => sendLedCommand(false), 200);
  }, [sendLedCommand]);

  // Send sand command to ESP32
  const sendSandCommand = useCallback((durationMinutes) => {
    const minutes = Number(durationMinutes);

    if (!Number.isFinite(minutes) || minutes <= 0) {
      console.warn('Invalid sand duration:', durationMinutes);
      return false;
    }

    return sendActuatorCommand("sand", {
      command: "START_SAND",
      duration_minutes: minutes
    });
  }, [sendActuatorCommand]);

  // Subscribe to a device
  const subscribeToDevice = useCallback((deviceId) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return false;
    }
    
    const subscribeMsg = {
      type: "subscribe",
      device: deviceId,
      client: clientIdRef.current
    };
    
    wsRef.current.send(JSON.stringify(subscribeMsg));
    setSubscribedDevice(deviceId);
    console.log(`Subscribed to device: ${deviceId}`);
    return true;
  }, []);

  // Request list of available devices
  const fetchDevices = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }
    
    const msg = {
      type: "get_devices",
      timestamp: Date.now()
    };
    
    wsRef.current.send(JSON.stringify(msg));
    return true;
  }, []);

  // Send PWA ping to keep connection alive
  const sendPing = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    
    const pingMsg = {
      type: "pwa_ping",
      client_id: clientIdRef.current,
      timestamp: Date.now()
    };
    
    wsRef.current.send(JSON.stringify(pingMsg));
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }
    
    setConnectionStatus('connecting');
    console.log(`Connecting to ${WS_URL}`);
    
    wsRef.current = new WebSocket(WS_URL);
    
    wsRef.current.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      
      // Register as PWA client
      const registrationMsg = {
        type: "pwa_registration",
        client_id: clientIdRef.current,
        client_name: "Hourglass Web App",
        user_agent: navigator.userAgent,
        timestamp: Date.now()
      };
      wsRef.current.send(JSON.stringify(registrationMsg));
      
      // Start ping interval (every 5 seconds as per protocol)
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(sendPing, 5000);
      
      // Fetch available devices
      setTimeout(() => fetchDevices(), 500);
    };
    
    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle sensor data
        if (data.type === 'sensor_data') {
          // Check if it's IMU data (sensor name 'imu' or value contains I)
          if (data.sensor === 'imu' || (typeof data.value === 'string' && data.value.startsWith('I'))) {
            let imuData = null;

            if (typeof data.value === 'string') {
              const rawValue = data.value.startsWith('I') ? data.value.substring(1) : data.value;
              imuData = parseIMUData(rawValue);
            } else if (data.value?.accel) {
              imuData = data.value;
            }
            
            if (imuData) {
              setLastSensorData(imuData);
              const position = determinePosition(imuData);
              if (position) {
                console.log(`Position detected: ${position} (accel: x=${imuData.accel.x.toFixed(2)}, y=${imuData.accel.y.toFixed(2)}, z=${imuData.accel.z.toFixed(2)})`);
                setDevicePosition(position);
              }
            }
          }
          // Handle other sensors
          else {
            console.log(`Sensor data: ${data.sensor} = ${data.value}`);
          }
        }
        
        // Handle device list response
        else if (data.type === 'device_list') {
          setAvailableDevices(data.devices || []);
          console.log('Available devices:', data.devices);
        }
        
        // Handle subscription confirmation
        else if (data.type === 'subscription_ack') {
          console.log(`Subscribed to ${data.device}`);
        }
        
        // Handle registration acknowledgment
        else if (data.type === 'pwa_registration_ack') {
          console.log(`Registration: ${data.status} - ${data.message}`);
        }
        
      } catch (err) {
        // Might be compact protocol or non-JSON
        console.log('Raw message (non-JSON):', event.data);
      }
    };
    
    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('error');
    };
    
    wsRef.current.onclose = () => {
      console.log('WebSocket disconnected');
      setConnectionStatus('disconnected');
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        console.log('Attempting to reconnect...');
        connect();
      }, 3000);

    };
  }, [sendPing, fetchDevices]);
  
  // Disconnect
  const disconnect = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
    setDevicePosition(null);
    setSubscribedDevice(null);
  }, []);
  
  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);
  
  return {
    connectionStatus,
    devicePosition,
    lastSensorData,
    availableDevices,
    subscribedDevice,
    subscribeToDevice,
    fetchDevices,
    sendActuatorCommand,
    sendLedCommand,
    sendLedPulse,
    sendSandCommand,
    connect,
    disconnect
  };
}