import React from 'react';
import './TaskActions.css';

export default function TaskActions({ 
  task, 
  isCurrent, 
  isQueued, 
  onPlay, 
  onQueue,
  disabled 
}) {
  return (
    <div className="task-actions">
      <button
        onClick={() => onPlay(task)}
        className="action-btn play-task"
        disabled={disabled}
        title="Set as current task"
      >
        ▶
      </button>
      <button
        onClick={() => onQueue(task)}
        className={`action-btn queue-task ${isQueued ? 'queued' : ''}`}
        disabled={disabled || isQueued}
        title={isQueued ? 'Already queued' : 'Queue as next up'}
      >
        ⏩
      </button>
      {isCurrent && <span className="current-badge" title="Currently playing">Now</span>}
    </div>
  );
}