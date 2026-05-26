import React, { useEffect, useRef, useState, useCallback } from 'react';
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
    sendSandCommand,
    fetchDevices
  } = device;

  const handleBreakComplete = useCallback(async () => {
    await onComplete?.();
  }, [onComplete]);

  const {
    mode,
    setMode,
    status,
    isBreak,
    displaySeconds,
    plannedMinutes,
    overtimeSeconds,
    isOvertime,
    pendingSession,
    setPendingSession,
    startSession,
    startBreak,
    pauseSession,
    completeSession,
    completeBreak,
    resetSession
  } = useHourglassSession({
    currentTask,
    onStatusChange,
    sendSandCommand,
    onBreakComplete: handleBreakComplete
  });

  const finishBreakNow = useCallback(async () => {
    if (completingRef.current) return;

    completingRef.current = true;

    try {
      completeBreak();
      await onComplete?.();
      resetSession();
    } finally {
      completingRef.current = false;
    }
  }, [completeBreak, onComplete, resetSession]);

  const handlePlay = useCallback(() => {
    if (!currentTask) return;

    if (isBreak) {
      startBreak();
      return;
    }

    startSession();
  }, [currentTask, isBreak, startBreak, startSession]);

  const handlePause = useCallback(() => {
    if (!currentTask) return;

    pauseSession();
  }, [currentTask, pauseSession]);

  const handleComplete = useCallback(async () => {
    if (!currentTask) return;

    // During the hidden break, B / Complete means skip break and move to next real task.
    if (isBreak) {
      await finishBreakNow();
      return;
    }

    const sessionSummary = completeSession();

    if (!sessionSummary) return;

    console.log('Session completed, waiting for notes:', sessionSummary);

    setNotes('');
    setSaveError('');
  }, [currentTask, isBreak, finishBreakNow, completeSession]);

  // Listen to hardware position changes.
  useEffect(() => {
    if (!devicePosition) return;

    // Ignore repeated same position signals.
    // This also prevents "task complete B" from instantly skipping the break
    // if the device stays flipped while the break starts.
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
  }, [
    devicePosition,
    status,
    currentTask,
    handlePlay,
    handlePause,
    handleComplete
  ]);

  const afterSessionSaved = async (sessionMode) => {
    if (sessionMode === 'timer') {
      // Pomodoro behavior:
      // real task saved -> hidden automatic 5 min break starts.
      // The real task is completed only after the break ends/skips.
      startBreak();
      return;
    }

    // Focus mode:
    // no break, move directly to next task.
    await onComplete?.();
    resetSession();
  };

  const handleSaveSession = async () => {
    if (!pendingSession) return;

    try {
      setIsSavingSession(true);
      setSaveError('');

      const sessionMode = pendingSession.mode;

      await saveSession({
        ...pendingSession,
        notes
      });

      setPendingSession(null);
      setNotes('');

      await afterSessionSaved(sessionMode);
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

      const sessionMode = pendingSession.mode;

      await saveSession({
        ...pendingSession,
        notes: ''
      });

      setPendingSession(null);
      setNotes('');

      await afterSessionSaved(sessionMode);
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
    if (isBreak) {
      switch (status) {
        case 'active':
          return '☕';
        case 'paused':
          return '⏸';
        case 'completed':
          return '✓';
        default:
          return '☕';
      }
    }

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
    if (isBreak) {
      switch (status) {
        case 'active':
          return 'Break running';
        case 'paused':
          return 'Break paused';
        case 'completed':
          return 'Break completed';
        default:
          return 'Break ready';
      }
    }

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

  const playLabel = isBreak
    ? status === 'paused'
      ? 'Resume Break'
      : 'Start Break'
    : status === 'paused'
      ? 'Resume'
      : 'Play';

  const completeLabel = isBreak ? 'Skip Break' : 'Complete';

  return (
    <div className="now-playing">
      <div className="now-playing-header">
        <h3>{isBreak ? 'Pomodoro Break' : 'Task Hub'}</h3>

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

              <small>Make sure your ESP32 is connected to Node-RED</small>
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
            {isBreak ? (
              <>
                <h2>Break time</h2>
                <p className="task-duration">Break · 5 min</p>
                <p className="task-description">
                  Finished: {currentTask.task}
                </p>
              </>
            ) : (
              <>
                <h2>{currentTask.task}</h2>

                {currentTask.duration && (
                  <p className="task-duration">Planned: {currentTask.duration} min</p>
                )}

                {currentTask.description && (
                  <p className="task-description">{currentTask.description}</p>
                )}
              </>
            )}
          </div>

          {!isBreak && (
            <div className="mode-selector">
              <button
                type="button"
                className={`control-btn ${mode === 'timer' ? 'active-mode' : ''}`}
                onClick={() => setMode('timer')}
                disabled={status === 'active' || status === 'paused'}
              >
                Timer
              </button>

              <button
                type="button"
                className={`control-btn ${mode === 'focus' ? 'active-mode' : ''}`}
                onClick={() => setMode('focus')}
                disabled={status === 'active' || status === 'paused'}
              >
                Focus
              </button>
            </div>
          )}

          <div className={`timer-section ${isBreak ? 'break-timer-section' : ''}`}>
            <div className="timer-display">
              <span className="timer-icon">{getStatusIcon()}</span>
              <span className="timer-time">{formatTime(displaySeconds)}</span>
            </div>

            <div className="timer-status">{getStatusText()}</div>

            {!isBreak && mode === 'timer' && (
              <div className="timer-planned">
                Planned: {plannedMinutes} min
              </div>
            )}

            {!isBreak && mode === 'focus' && (
              <div className="timer-planned">
                Focus mode tracks actual time
              </div>
            )}

            {isBreak && (
              <div className="timer-planned">
                Break before the next task
              </div>
            )}

            {!isBreak && isOvertime && (
              <div className="overtime-warning">
                Overtime: {formatTime(overtimeSeconds)}
              </div>
            )}
          </div>

          <div className="task-controls">
            <button
              onClick={handlePlay}
              className="control-btn play"
              disabled={status === 'active' || status === 'completed'}
            >
              {playLabel}
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
              {completeLabel}
            </button>
          </div>

          <div className="device-mapping">
            <small>
              {isBreak
                ? 'Break mapping: Resume (A) | Pause (C) | Skip Break (B)'
                : 'Device mapping: Play/Resume (A) | Pause (C) | Complete (B)'}
            </small>
          </div>

          {devicePosition && (
            <div className="current-position">
              <small>
                Hardware position:{' '}
                {devicePosition === 'A'
                  ? 'Upright (Play/Resume)'
                  : devicePosition === 'B'
                    ? isBreak
                      ? 'Flipped (Skip Break)'
                      : 'Flipped (Complete)'
                    : 'Horizontal (Pause)'}
              </small>
            </div>
          )}
        </>
      )}

      {pendingSession && (
        <div className="notes-modal-backdrop">
          <div className="notes-modal">
            <h3>Session completed</h3>

            <p>
              Add a short note about this session before continuing.
            </p>

            <div className="session-summary">
              <span>
                Mode: {pendingSession.mode === 'timer' ? 'Timer' : 'Focus'}
              </span>

              <span>
                Planned: {pendingSession.planned_minutes} min
              </span>

              <span>
                Actual: {formatTime(pendingSession.actual_seconds)}
              </span>

              {pendingSession.overtime_seconds > 0 && (
                <span>
                  Overtime: {formatTime(pendingSession.overtime_seconds)}
                </span>
              )}

              {pendingSession.mode === 'timer' && (
                <span>
                  Next: hidden 5 min break
                </span>
              )}
            </div>

            <label className="notes-label" htmlFor="session-notes">
              Notes
            </label>

            <textarea
              id="session-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows="5"
              placeholder="How did this task go?"
            />

            {saveError && (
              <div className="notes-error">{saveError}</div>
            )}

            <div className="notes-actions">
              <button
                className="control-btn pause"
                onClick={handleSkipNotes}
                disabled={isSavingSession}
              >
                Skip
              </button>

              <button
                className="control-btn complete"
                onClick={handleSaveSession}
                disabled={isSavingSession}
              >
                {isSavingSession ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}