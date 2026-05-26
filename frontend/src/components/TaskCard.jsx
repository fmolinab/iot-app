// src/components/TaskCard.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getTimeRemainingText, getUrgencyLevel } from '../utils/todoUtils';

export default function TaskCard({ task, isCurrent, onEdit, onDelete }) {
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(`/todos/${task.id}`);
  };

  const handleEditClick = (e) => {
    e.stopPropagation();
    onEdit(task);
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${task.task}"?`)) {
      onDelete(task.id);
    }
  };

  const urgencyLevel = getUrgencyLevel(task.due_date);
  const timeRemaining = getTimeRemainingText(task.due_date);

  const getUrgencyClass = () => {
    if (!task.due_date) return 'no-deadline';
    switch (urgencyLevel) {
      case 'overdue': return 'overdue';
      case 'critical': return 'critical';
      case 'urgent': return 'urgent';
      case 'warning': return 'warning';
      case 'approaching': return 'approaching';
      default: return 'ok';
    }
  };

  return (
    <div 
      className={`task-card ${isCurrent ? 'current-task' : ''}`}
      onClick={handleCardClick}
    >
      <div className="task-title">{task.task}</div>
      
      {task.description && (
        <div className="task-description">
          {task.description.length > 100 ? `${task.description.substring(0, 100)}...` : task.description}
        </div>
      )}
      
      {task.due_date && (
        <div className="task-due-date">
          Due: {new Date(task.due_date).toLocaleDateString()}
        </div>
      )}
      
      <div className={`urgency-badge ${getUrgencyClass()}`}>
        {timeRemaining}
      </div>
      
      <div className="task-actions" onClick={(e) => e.stopPropagation()}>
        <button className="edit-task-btn" onClick={handleEditClick}>
          Edit
        </button>
        <button className="delete-task-btn" onClick={handleDeleteClick}>
          Delete
        </button>
      </div>
    </div>
  );
}