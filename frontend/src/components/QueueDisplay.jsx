import React from 'react';
import './QueueDisplay.css';

export default function QueueDisplay({ queuedTask, onClearQueue }) {
  if (!queuedTask) {
    return null;
  }

  return (
    <div className="queue-display">
      <h4>Next up</h4>
      <div className="queued-task">
        <span className="queued-task-name">{queuedTask.task}</span>
        <button onClick={onClearQueue} className="clear-queue-btn" title="Clear queue">
          ×
        </button>
      </div>
    </div>
  );
}