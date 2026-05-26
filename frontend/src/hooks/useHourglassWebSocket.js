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

  const POSITION_THRESHOLDS = {
    UPRIGHT: { axis: 'z', min: 7.0, max: 11.0 },
    FLIPPED: { axis: 'z', min: -11.0, max: -7.0 },
    HORIZONTAL: { axis: 'x', min: 7.0, max: 11.0 }
  };

  const parseIMUData = (value) => {
    const parts = value.split(',');
    if (parts.length < 6) return null;

    return {
      accel: {
        x: parseFloat(parts[0]),
        y: parseFloat(parts[1]),
        z: parseFloat(parts[2])
      },
      gyro: {
        x: parseFloat(parts[3]),
        y: parseFloat(parts[4]),
        z: parseFloat(parts[5])
      },
      hasMag: parts.length >= 9,
      mag: parts.length >= 9
        ? {
            x: parseFloat(parts[6]),
            y: parseFloat(parts[7]),
            z: parseFloat(parts[8])
          }
        : null
    };
  };

  const determinePosition = (imuData) => {
    if (!imuData) return null;

    const { accel } = imuData;

    if (
      accel.z >= POSITION_THRESHOLDS.UPRIGHT.min &&
      accel.z <= POSITION_THRESHOLDS.UPRIGHT.max
    ) {
      return 'A';
    }

    if (
      accel.z >= POSITION_THRESHOLDS.FLIPPED.min &&
      accel.z <= POSITION_THRESHOLDS.FLIPPED.max
    ) {
      return 'B';
    }

    const absX = Math.abs(accel.x);

    if (
      absX >= POSITION_THRESHOLDS.HORIZONTAL.min &&
      absX <= POSITION_THRESHOLDS.HORIZONTAL.max
    ) {
      return 'C';
    }

    return null;
  };

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
      type: 'actuator_cmd',
      actuator,
      value,
      device: subscribedDevice,
      client_id: clientIdRef.current
    };

    wsRef.current.send(JSON.stringify(command));
    console.log(`Actuator command sent: ${actuator}`, value);

    return true;
  }, [subscribedDevice]);

  const sendLedCommand = useCallback((state) => {
    return sendActuatorCommand('led', state ? 1 : 0);
  }, [sendActuatorCommand]);

  const sendLedPulse = useCallback(async () => {
    await sendLedCommand(true);
    setTimeout(() => sendLedCommand(false), 200);
  }, [sendLedCommand]);

  // Sand command sent to ESP32.
  // Example payload sent through Node-RED:
  // {
  //   command: "START_SAND",
  //   duration_minutes: 25,
  //   mode: "focus"
  // }
  const sendSandCommand = useCallback((command, durationMinutes = null, mode = null) => {
    if (!command) {
      console.warn('Missing sand command');
      return false;
    }

    const payload = {
      command
    };

    if (durationMinutes !== null && durationMinutes !== undefined) {
      const minutes = Number(durationMinutes);

      if (!Number.isFinite(minutes) || minutes <= 0) {
        console.warn('Invalid sand duration:', durationMinutes);
        return false;
      }

      payload.duration_minutes = minutes;
    }

    if (mode) {
      payload.mode = mode;
    }

    return sendActuatorCommand('sand', payload);
  }, [sendActuatorCommand]);

  const subscribeToDevice = useCallback((deviceId) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return false;
    }

    const subscribeMsg = {
      type: 'subscribe',
      device: deviceId,
      client: clientIdRef.current
    };

    wsRef.current.send(JSON.stringify(subscribeMsg));
    setSubscribedDevice(deviceId);

    console.log(`Subscribed to device: ${deviceId}`);

    return true;
  }, []);

  const fetchDevices = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }

    const msg = {
      type: 'get_devices',
      timestamp: Date.now()
    };

    wsRef.current.send(JSON.stringify(msg));

    return true;
  }, []);

  const sendPing = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const pingMsg = {
      type: 'pwa_ping',
      client_id: clientIdRef.current,
      timestamp: Date.now()
    };

    wsRef.current.send(JSON.stringify(pingMsg));
  }, []);

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

      const registrationMsg = {
        type: 'pwa_registration',
        client_id: clientIdRef.current,
        client_name: 'Hourglass Web App',
        user_agent: navigator.userAgent,
        timestamp: Date.now()
      };

      wsRef.current.send(JSON.stringify(registrationMsg));

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }

      pingIntervalRef.current = setInterval(sendPing, 5000);

      setTimeout(() => fetchDevices(), 500);
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'sensor_data') {
          if (
            data.sensor === 'imu' ||
            (typeof data.value === 'string' && data.value.startsWith('I'))
          ) {
            let imuData = null;

            if (typeof data.value === 'string') {
              const rawValue = data.value.startsWith('I')
                ? data.value.substring(1)
                : data.value;

              imuData = parseIMUData(rawValue);
            } else if (data.value?.accel) {
              imuData = data.value;
            }

            if (imuData) {
              setLastSensorData(imuData);

              const position = determinePosition(imuData);

              if (position) {
                console.log(
                  `Position detected: ${position} ` +
                  `(accel: x=${imuData.accel.x.toFixed(2)}, ` +
                  `y=${imuData.accel.y.toFixed(2)}, ` +
                  `z=${imuData.accel.z.toFixed(2)})`
                );

                setDevicePosition(position);
              }
            }
          } else {
            console.log(`Sensor data: ${data.sensor} = ${data.value}`);
          }
        }

        else if (data.type === 'device_list') {
          setAvailableDevices(data.devices || []);
          console.log('Available devices:', data.devices);
        }

        else if (data.type === 'subscription_ack') {
          console.log(`Subscribed to ${data.device}`);
        }

        else if (data.type === 'pwa_registration_ack') {
          console.log(`Registration: ${data.status} - ${data.message}`);
        }

      } catch (err) {
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

      setTimeout(() => {
        console.log('Attempting to reconnect...');
        connect();
      }, 3000);
    };
  }, [sendPing, fetchDevices]);

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