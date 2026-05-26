import { useState, useEffect, useRef, useCallback } from 'react';

const BREAK_DURATION_SECONDS = 5 * 60;
const BREAK_DURATION_MINUTES = 5;

export function useHourglassSession({
  currentTask,
  onStatusChange,
  sendSandCommand,
  onBreakComplete
}) {
  const [mode, setMode] = useState('timer'); // "timer" or "focus"
  const [status, setStatus] = useState('idle'); // "idle", "active", "paused", "completed"
  const [sessionPhase, setSessionPhase] = useState('task'); // "task" or "break"
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [pendingSession, setPendingSession] = useState(null);

  const intervalRef = useRef(null);
  const startedAtRef = useRef(null);
  const breakCompletingRef = useRef(false);

  const isBreak = sessionPhase === 'break';

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
    if (sessionPhase !== 'task') return false;

    const plannedMinutes = getPlannedMinutes();

    if (plannedMinutes <= 0) return false;
    if (status === 'active') return true;

    if (status === 'idle' || status === 'completed') {
      setTimeElapsed(0);
      setPendingSession(null);

      const startedAt = new Date().toISOString();
      startedAtRef.current = startedAt;

      // Send mode to ESP32:
      // timer -> normal sand ends with task.
      // focus -> firmware can switch to focus/overtime animation after planned duration.
      sendSandCommand?.('START_SAND', plannedMinutes, mode);
    }

    if (status === 'paused') {
      sendSandCommand?.('RESUME_SAND');
    }

    setStatus('active');
    onStatusChange?.('active');
    startClock();

    return true;
  }, [
    currentTask,
    sessionPhase,
    status,
    mode,
    getPlannedMinutes,
    sendSandCommand,
    onStatusChange,
    startClock
  ]);

  const startBreak = useCallback(() => {
    if (!currentTask) return false;

    if (sessionPhase === 'break' && status === 'paused') {
      sendSandCommand?.('RESUME_SAND');
      setStatus('active');
      onStatusChange?.('break-active');
      startClock();
      return true;
    }

    setSessionPhase('break');
    setStatus('active');
    setTimeElapsed(0);
    setPendingSession(null);
    breakCompletingRef.current = false;

    // Break is a hidden automatic task, but for firmware it should behave like timer mode.
    sendSandCommand?.('START_SAND', BREAK_DURATION_MINUTES, 'timer');

    onStatusChange?.('break-active');
    startClock();

    return true;
  }, [
    currentTask,
    sessionPhase,
    status,
    sendSandCommand,
    onStatusChange,
    startClock
  ]);

  const pauseSession = useCallback(() => {
    if (!currentTask) return false;
    if (status !== 'active') return false;

    clearClock();
    sendSandCommand?.('PAUSE_SAND');

    setStatus('paused');
    onStatusChange?.(sessionPhase === 'break' ? 'break-paused' : 'paused');

    return true;
  }, [
    currentTask,
    status,
    sessionPhase,
    clearClock,
    sendSandCommand,
    onStatusChange
  ]);

  const completeSession = useCallback(() => {
    if (!currentTask) return null;
    if (sessionPhase !== 'task') return null;

    clearClock();
    sendSandCommand?.('STOP_SAND');

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
    sessionPhase,
    mode,
    timeElapsed,
    getPlannedMinutes,
    clearClock,
    sendSandCommand,
    onStatusChange
  ]);

  const completeBreak = useCallback(() => {
    if (sessionPhase !== 'break') return false;

    clearClock();
    sendSandCommand?.('STOP_SAND');

    setStatus('completed');
    onStatusChange?.('break-completed');

    return true;
  }, [
    sessionPhase,
    clearClock,
    sendSandCommand,
    onStatusChange
  ]);

  const resetSession = useCallback(() => {
    clearClock();
    startedAtRef.current = null;
    breakCompletingRef.current = false;

    setSessionPhase('task');
    setStatus('idle');
    setTimeElapsed(0);
    setPendingSession(null);

    onStatusChange?.('idle');
  }, [clearClock, onStatusChange]);

  useEffect(() => {
    resetSession();
  }, [currentTask?.id]);

  useEffect(() => {
    return () => {
      clearClock();
    };
  }, [clearClock]);

  // Timer Mode ends automatically at planned duration.
  useEffect(() => {
    if (sessionPhase !== 'task') return;
    if (status !== 'active') return;
    if (mode !== 'timer') return;

    const plannedSeconds = getPlannedMinutes() * 60;

    if (plannedSeconds > 0 && timeElapsed >= plannedSeconds) {
      completeSession();
    }
  }, [
    sessionPhase,
    status,
    mode,
    timeElapsed,
    getPlannedMinutes,
    completeSession
  ]);

  // Focus Mode does not auto-complete.
  // It keeps counting upward, and completeSession() saves the actual stopped duration.

  // Hidden break auto-completion.
  useEffect(() => {
    if (sessionPhase !== 'break') return;
    if (status !== 'active') return;
    if (timeElapsed < BREAK_DURATION_SECONDS) return;
    if (breakCompletingRef.current) return;

    breakCompletingRef.current = true;

    const finishBreak = async () => {
      completeBreak();
      await onBreakComplete?.();
      resetSession();
    };

    finishBreak();
  }, [
    sessionPhase,
    status,
    timeElapsed,
    completeBreak,
    onBreakComplete,
    resetSession
  ]);

  const plannedMinutes = getPlannedMinutes();
  const plannedSeconds = plannedMinutes * 60;

  const breakRemainingSeconds = Math.max(
    0,
    BREAK_DURATION_SECONDS - timeElapsed
  );

  const remainingSeconds =
    sessionPhase === 'break'
      ? breakRemainingSeconds
      : mode === 'timer'
        ? Math.max(0, plannedSeconds - timeElapsed)
        : null;

  const displaySeconds =
    sessionPhase === 'break'
      ? breakRemainingSeconds
      : mode === 'timer'
        ? remainingSeconds
        : timeElapsed;

  const overtimeSeconds =
    sessionPhase === 'task'
      ? Math.max(0, timeElapsed - plannedSeconds)
      : 0;

  const isOvertime = overtimeSeconds > 0;

  return {
    mode,
    setMode,

    status,
    sessionPhase,
    isBreak,

    timeElapsed,
    displaySeconds,
    remainingSeconds,

    plannedMinutes,
    plannedSeconds,

    breakDurationSeconds: BREAK_DURATION_SECONDS,
    breakRemainingSeconds,

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
  };
}