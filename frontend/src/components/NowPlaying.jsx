import React, { useEffect, useRef, useState } from 'react';
import './NowPlaying.css';
import { useHourglassSession } from '../hooks/useHourglassSession';
import { saveSession } from '../lib/sessions';

export default function NowPlaying({
  currentTask,
  onComplete,
  onStatusChange,
  refreshTasks,
  device
}) {
  const lastHandledPositionRef = useRef(null);
  const completingRef = useRef(false);

  const [notes, setNotes] = useState('');
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [saveError, setSaveError] = useState('');

  const {
    connectionStatus,
    devicePosition,
    availableDevices,
    subscribedDevice,
    subscribeToDevice,
    sendLedPulse,
    sendSandCommand,
    fetchDevices
  } = device;

  const {
    mode,
    setMode,
    status,
    displaySeconds,
    plannedMinutes,
    overtimeSeconds,
    isOvertime,
    pendingSession,
    setPendingSession,
    startSession,
    pauseSession,
    completeSession,
    resetSession
  } = useHourglassSession({
    currentTask,
    onStatusChange,
    sendSandCommand
  });

  // Listen to hardware position changes
  useEffect(() => {
    if (!devicePosition) return;

    // Ignore repeated same position signals
    if (lastHandledPositionRef.current === devicePosition) {
      return;
    }

    lastHandledPositionRef.current = devicePosition;

    console.log(`Hardware position changed to: ${devicePosition}`);

    switch (devicePosition) {
      case 'A':
        if (status !== 'active' && currentTask) {
          handlePlay();
        }
        break;

      case 'B':
        if (!completingRef.current && status !== 'completed' && currentTask) {
          completingRef.current = true;
          handleComplete().finally(() => {
            completingRef.current = false;
          });
        }
        break;

      case 'C':
        if (status === 'active') {
          handlePause();
        }
        break;

      default:
        break;
    }
  }, [devicePosition, status, currentTask]);

  const handlePlay = () => {
    if (!currentTask) return;

    startSession();
  };

  const handlePause = () => {
    if (!currentTask) return;

    pauseSession();
  };

  const handleComplete = async () => {
    if (!currentTask) return;

    const sessionSummary = completeSession();

    if (!sessionSummary) return;

    console.log('Session completed, waiting for notes:', sessionSummary);

    setNotes('');
    setSaveError('');
  };

  const handleSaveSession = async () => {
    if (!pendingSession) return;

    try {
     setIsSavingSession(true);
      setSaveError('');

      await saveSession({
        ...pendingSession,
        notes
      });

      setPendingSession(null);
      setNotes('');

      await onComplete?.();

      resetSession();
    } catch (err) {
      console.error('Failed to save session:', err);
      setSaveError(err.message || 'Failed to save session');
    } finally {
      setIsSavingSession(false);
    }
  };

  const handleSkipNotes = async () => {
    if (!pendingSession) return;

    try {
      setIsSavingSession(true);
      setSaveError('');

      await saveSession({
        ...pendingSession,
        notes: ''
      });

      setPendingSession(null);
      setNotes('');

      await onComplete?.();

      resetSession();
    } catch (err) {
    console.error('Failed to save session:', err);
    setSaveError(err.message || 'Failed to save session');
    } finally {
      setIsSavingSession(false);
    }
  };

  const formatTime = (seconds) => {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;

    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'active':
        return '▶';
      case 'paused':
        return '⏸';
      case 'completed':
        return '✓';
      default:
        return '⏹';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'active':
        return mode === 'timer' ? 'Timer running' : 'Focus running';
      case 'paused':
        return 'Paused';
      case 'completed':
        return 'Completed';
      default:
        return 'Not started';
    }
  };

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return '🟢';
      case 'connecting':
        return '🟡';
      case 'error':
        return '🔴';
      default:
        return '⚫';
    }
  };

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

      {!subscribedDevice && (
        <div className="device-selector">
          <h4>Connect to Hourglass</h4>

          {availableDevices.length > 0 ? (
            <>
              <select onChange={handleSubscribe} defaultValue="">
                <option value="">Select a device...</option>

                {availableDevices.map((device, idx) => (
                  <option key={device.uuid || idx} value={device.uuid || device.id}>
                    {device.name || device.deviceName || device.uuid || device.id}
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
              <p className="task-duration">Task planned: {currentTask.duration} min</p>
            )}
          </div>

          <div className="mode-selector">
            <button
              type="button"
              className={`control-btn ${mode === 'timer' ? 'active-mode' : ''}`}
              onClick={() => setMode('timer')}
              disabled={status === 'active'}
            >
              Timer Mode
            </button>

            <button
              type="button"
              className={`control-btn ${mode === 'focus' ? 'active-mode' : ''}`}
              onClick={() => setMode('focus')}
              disabled={status === 'active'}
            >
              Focus Mode
            </button>
          </div>

          <div className="timer-section">
            <div className="timer-display">
              <span className="timer-icon">{getStatusIcon()}</span>
              <span className="timer-time">{formatTime(displaySeconds)}</span>
            </div>

            <div className="timer-status">{getStatusText()}</div>

            <div className="timer-planned">
              <small>
                Mode: {mode === 'timer' ? 'Timer' : 'Focus'} | Planned:{' '}
                {plannedMinutes} min
              </small>
            </div>

            {mode === 'focus' && isOvertime && (
              <div className="overtime-warning">
                <small>Overtime: {formatTime(overtimeSeconds)}</small>
              </div>
            )}
          </div>

          <div className="task-controls">
            <button
              onClick={handlePlay}
              className="control-btn play"
              disabled={status === 'active'}
            >
              {status === 'paused' ? 'Resume' : 'Play'}
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
            <small>Device mapping: Play/Resume (A) | Pause (C) | Complete (B)</small>
          </div>

          {devicePosition && (
            <div className="current-position">
              <small>
                Hardware position:{' '}
                {devicePosition === 'A'
                  ? 'Upright (Start / Resume)'
                  : devicePosition === 'B'
                  ? 'Flipped (Complete)'
                  : 'Horizontal (Pause)'}
              </small>
            </div>
          )}
        </>
      )}
      {pendingSession && (
        <div className="notes-modal-backdrop">
          <div className="notes-modal">
            <h3>Session complete</h3>

            <p>
              You completed a {pendingSession.mode === 'timer' ? 'Timer' : 'Focus'} session.
            </p>

            <div className="session-summary">
              <small>Planned: {pendingSession.planned_minutes} min</small>
              <small>
                Actual: {formatTime(pendingSession.actual_seconds)}
              </small>
              {pendingSession.overtime_seconds > 0 && (
                <small>
                  Overtime: {formatTime(pendingSession.overtime_seconds)}
                </small>
              )}
            </div>

            <label className="notes-label" htmlFor="session-notes">
              Notes
            </label>

            <textarea
              id="session-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you work on? Any reflections?"
              rows={5}
              disabled={isSavingSession}
            />

            {saveError && (
              <p className="notes-error">{saveError}</p>
            )}

            <div className="notes-actions">
              <button
                type="button"
                className="control-btn"
                onClick={handleSkipNotes}
                disabled={isSavingSession}
              >
                Skip notes
              </button>

              <button
                type="button"
                className="control-btn complete"
                onClick={handleSaveSession}
                disabled={isSavingSession}
              >
                {isSavingSession ? 'Saving...' : 'Save session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}