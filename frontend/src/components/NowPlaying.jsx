import React, { useState, useEffect, useRef } from 'react';
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
    setStatus('active');
    startTimer();
    onStatusChange?.('active');
  };

  const handlePause = () => {
    setStatus('paused');
    pauseTimer();
    onStatusChange?.('paused');
  };

  const handleComplete = async () => {
    pauseTimer();
    setStatus('completed');
    await onComplete?.();
    // After complete, refresh tasks and reset for next task
    await refreshTasks?.();
    setTimeElapsed(0);
    setStatus('idle');
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

  if (!currentTask) {
    return (
      <div className="now-playing empty">
        <h3>Now Playing</h3>
        <p className="empty-message">No active task</p>
        <p className="empty-hint">Select a task from the list to begin</p>
      </div>
    );
  }

  return (
    <div className="now-playing">
      <h3>Now Playing</h3>
      
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
    </div>
  );
}