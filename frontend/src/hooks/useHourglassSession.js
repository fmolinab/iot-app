import { useState, useEffect, useRef, useCallback } from 'react';

export function useHourglassSession({
  currentTask,
  onStatusChange,
  sendSandCommand
}) {
  const [mode, setMode] = useState('timer'); // "timer" or "focus"
  const [status, setStatus] = useState('idle'); // "idle", "active", "paused", "completed"
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [pendingSession, setPendingSession] = useState(null);

  const intervalRef = useRef(null);
  const startedAtRef = useRef(null);

  const getPlannedMinutes = useCallback(() => {
    return Number(currentTask?.duration) || 0;

  }, [currentTask?.duration]);
  
  const clearClock = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startClock = useCallback(() => {
    clearClock();

    intervalRef.current = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);
  }, [clearClock]);

  const startSession = useCallback(() => {
    if (!currentTask) return false;
    
    const plannedMinutes = getPlannedMinutes();

    if (plannedMinutes <= 0) return false;

    if (status === 'active') return true;

    if (status === 'idle' || status === 'completed') {
      setTimeElapsed(0);
      setPendingSession(null);

      const startedAt = new Date().toISOString();
      startedAtRef.current = startedAt;
      sendSandCommand?.("START_SAND", plannedMinutes);
    }
    if (status === 'paused') {
      sendSandCommand?.("RESUME_SAND");
    }

    setStatus('active');
    onStatusChange?.('active');
    startClock();

    return true;
  }, [
    currentTask,
    status,
    getPlannedMinutes,
    sendSandCommand,
    onStatusChange,
    startClock
  ]);

  const pauseSession = useCallback(() => {
    if (!currentTask) return false;
    if (status !== 'active') return false;

    clearClock();
    sendSandCommand?.("PAUSE_SAND");
    setStatus('paused');
    onStatusChange?.('paused');

    return true;
  }, [currentTask, status, clearClock, sendSandCommand, onStatusChange]);

  const completeSession = useCallback(() => {
    if (!currentTask) return null;

    clearClock();
    sendSandCommand?.("STOP_SAND");

    const endedAt = new Date().toISOString();
    const startedAt = startedAtRef.current || endedAt;
    const plannedMinutes = getPlannedMinutes();
    const plannedSeconds = plannedMinutes * 60;
    const actualSeconds = timeElapsed;
    const overtimeSeconds = Math.max(0, actualSeconds - plannedSeconds);

    const sessionSummary = {
      todo_id: currentTask.id,
      mode,
      planned_minutes: plannedMinutes,
      actual_seconds: actualSeconds,
      overtime_seconds: overtimeSeconds,
      started_at: startedAt,
      ended_at: endedAt
    };

    setStatus('completed');
    setPendingSession(sessionSummary);
    onStatusChange?.('completed');

    return sessionSummary;
  }, [
    currentTask,
    mode,
    timeElapsed,
    getPlannedMinutes,
    clearClock,
    sendSandCommand,
    onStatusChange
  ]);

  const resetSession = useCallback(() => {
    clearClock();
    startedAtRef.current = null;
    setStatus('idle');
    setTimeElapsed(0);
    setPendingSession(null);
    onStatusChange?.('idle');
  }, [clearClock, onStatusChange]);

  // Reset when the current task changes
  useEffect(() => {
    resetSession();
  }, [currentTask?.id]);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      clearClock();
    };
  }, [clearClock]);

  // Timer Mode auto-completion
  useEffect(() => {
    if (status !== 'active') return;
    if (mode !== 'timer') return;

    const plannedSeconds = getPlannedMinutes() * 60;

    if (plannedSeconds > 0 && timeElapsed >= plannedSeconds) {
      completeSession();
    }
  }, [
    status,
    mode,
    timeElapsed,
    getPlannedMinutes,
    completeSession
  ]);

  const plannedMinutes = getPlannedMinutes();
  const plannedSeconds = plannedMinutes * 60;

  const remainingSeconds =
    mode === 'timer'
      ? Math.max(0, plannedSeconds - timeElapsed)
      : null;

  const displaySeconds =
    mode === 'timer'
      ? remainingSeconds
      : timeElapsed;

  const overtimeSeconds = Math.max(0, timeElapsed - plannedSeconds);
  const isOvertime = overtimeSeconds > 0;

  return {
    mode,
    setMode,

    status,
    timeElapsed,
    displaySeconds,
    remainingSeconds,

    plannedMinutes,
    plannedSeconds,
    overtimeSeconds,
    isOvertime,

    pendingSession,
    setPendingSession,

    startSession,
    pauseSession,
    completeSession,
    resetSession
  };
}