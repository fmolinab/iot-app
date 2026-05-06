import React, { useState, useEffect, useRef } from 'react';
import { useHourglassWebSocket } from '../hooks/useHourglassWebSocket';
import './NowPlaying.css';

export default function NowPlaying({ 
  currentTask, 
  onComplete, 
  onStatusChange,
  refreshTasks 
}) {
  const [status, setStatus] = useState('idle'); // idle, active, paused, completed
  const [timeElapsed, setTimeElapsed] = useState(0);
  const intervalRef = useRef(null);
  
  const {
    connectionStatus,
    devicePosition,
    availableDevices,
    subscribedDevice,
    subscribeToDevice,
    sendLedPulse,
    fetchDevices
  } = useHourglassWebSocket();

  // Reset timer when current task changes
  useEffect(() => {
    setTimeElapsed(0);
    setStatus('idle');
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [currentTask?.id]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Listen to hardware position changes
  useEffect(() => {
    if (!devicePosition) return;
    
    console.log(`Hardware position changed to: ${devicePosition}`);
    
    // Send LED pulse as visual feedback
    sendLedPulse();
    
    // Map hardware position to timer actions
    switch(devicePosition) {
      case 'A': // Upright — Start/Resume
        if (status !== 'active') {
          handlePlay();
        }
        break;
      case 'B': // Flipped — Complete
        if (status !== 'completed' && currentTask) {
          handleComplete();
        }
        break;
      case 'C': // Horizontal — Pause
        if (status === 'active') {
          handlePause();
        }
        break;
      default:
        break;
    }
  }, [devicePosition]);

  const startTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);
  };

  const pauseTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handlePlay = () => {
  if (!currentTask) return;
  setStatus('active');
  startTimer();
  onStatusChange?.('active');
  sendLedPulse();
};

  const handlePause = () => {
  if (!currentTask) return;
  setStatus('paused');
  pauseTimer();
  onStatusChange?.('paused');
  sendLedPulse();
};

  const handleComplete = async () => {
  if (!currentTask) return; // Safety check
  
  pauseTimer();
  setStatus('completed');
  await onComplete?.();
  await refreshTasks?.();
  setTimeElapsed(0);
  setStatus('idle');
  sendLedPulse(); // Visual feedback
};

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = () => {
    switch(status) {
      case 'active': return '▶';
      case 'paused': return '⏸';
      case 'completed': return '✓';
      default: return '⏹';
    }
  };

  const getStatusText = () => {
    switch(status) {
      case 'active': return 'Active';
      case 'paused': return 'Paused';
      case 'completed': return 'Completed';
      default: return 'Not started';
    }
  };

  const getConnectionIcon = () => {
    switch(connectionStatus) {
      case 'connected': return '🟢';
      case 'connecting': return '🟡';
      case 'error': return '🔴';
      default: return '⚫';
    }
  };

  // Device selector handler
  const handleSubscribe = (e) => {
    const deviceId = e.target.value;
    if (deviceId) {
      subscribeToDevice(deviceId);
    }
  };

  return (
    <div className="now-playing">
      <div className="now-playing-header">
        <h3>Now Playing</h3>
        <div className="connection-status" title={`WebSocket: ${connectionStatus}`}>
          {getConnectionIcon()} {connectionStatus}
        </div>
      </div>

      {/* Device selector — show when no device subscribed */}
      {!subscribedDevice && (
        <div className="device-selector">
          <h4>Connect to Hourglass</h4>
          {availableDevices.length > 0 ? (
            <>
              <select onChange={handleSubscribe} defaultValue="">
                <option value="">Select a device...</option>
                {availableDevices.map((device, idx) => (
                  <option key={device.uuid || idx} value={device.uuid || device.id}>
                    {device.name || device.uuid || device.id}
                  </option>
                ))}
              </select>
              <button onClick={fetchDevices} className="refresh-devices-btn">
                Refresh
              </button>
            </>
          ) : (
            <div className="no-devices">
              <p>No devices found</p>
              <button onClick={fetchDevices} className="refresh-devices-btn">
                Scan for devices
              </button>
              <small>Make sure your ESP32 is connected to NodeRED</small>
            </div>
          )}
        </div>
      )}

      {/* Show subscribed device info */}
      {subscribedDevice && (
        <div className="subscribed-device">
          <span className="device-indicator">📡 Connected to: </span>
          <span className="device-id">{subscribedDevice.slice(0, 8)}...</span>
        </div>
      )}

      {!currentTask ? (
        <div className="empty-message">
          <p>No active task</p>
          <p className="empty-hint">Select a task from the list to begin</p>
        </div>
      ) : (
        <>
          <div className="current-task">
            <h2>{currentTask.task}</h2>
            {currentTask.duration && (
              <p className="task-duration">Planned: {currentTask.duration} min</p>
            )}
          </div>

          <div className="timer-section">
            <div className="timer-display">
              <span className="timer-icon">{getStatusIcon()}</span>
              <span className="timer-time">{formatTime(timeElapsed)}</span>
            </div>
            <div className="timer-status">{getStatusText()}</div>
          </div>

          <div className="task-controls">
            <button 
              onClick={handlePlay} 
              className="control-btn play"
              disabled={status === 'active'}
            >
              Play
            </button>
            <button 
              onClick={handlePause} 
              className="control-btn pause"
              disabled={status !== 'active'}
            >
              Pause
            </button>
            <button 
              onClick={handleComplete} 
              className="control-btn complete"
              disabled={status === 'completed'}
            >
              Complete
            </button>
          </div>

          <div className="device-mapping">
            <small>Device mapping: Play (A) | Pause (C) | Complete (B)</small>
          </div>

          {/* Show current position from hardware */}
          {devicePosition && (
            <div className="current-position">
              <small>Hardware position: {
                devicePosition === 'A' ? 'Upright (Active)' :
                devicePosition === 'B' ? 'Flipped (Complete)' :
                'Horizontal (Pause)'
              }</small>
            </div>
          )}
        </>
      )}
    </div>
  );
}