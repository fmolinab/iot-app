// frontend/src/pages/Todos.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTodos, addTodo, deleteTodo } from '../lib/todos';
import { isAuthenticated } from '../lib/auth';
import { useCurrentTask } from '../hooks/useCurrentTask';
import NowPlaying from '../components/NowPlaying';
import QueueDisplay from '../components/QueueDisplay';
import TaskCard from '../components/TaskCard';
import './Todos.css';
import { useHourglassWebSocket } from '../hooks/useHourglassWebSocket';

const DEFAULT_DUE_TIME = '23:59';

export default function Todos() {
  const [todos, setTodos] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [duration, setDuration] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState(DEFAULT_DUE_TIME);
  const [description, setDescription] = useState('');
  const [showDescriptionField, setShowDescriptionField] = useState(false);
  const [showCustomDuration, setShowCustomDuration] = useState(false);
  const [customDurationMinutes, setCustomDurationMinutes] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentStatus, setCurrentStatus] = useState('idle');
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  const hourglass = useHourglassWebSocket();

  const {
    currentTask,
    queuedTask,
    switchToTask,
    completeCurrentTask,
    setQueue,
    clearQueue,
    refreshTasks,
    loadTasks,
    handleTaskCreated
  } = useCurrentTask();

  useEffect(() => {
    const handleFilterChange = (event) => {
      setFilter(event.detail);
    };
    window.addEventListener('filterChange', handleFilterChange);
    return () => window.removeEventListener('filterChange', handleFilterChange);
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }
    loadTodos();
    
    const interval = setInterval(() => {
      setTodos(currentTodos => [...currentTodos]);
    }, 60000);
    
    return () => clearInterval(interval);
  }, [navigate]);

  async function loadTodos(showLoading = true) {
    try {
      if (showLoading) setLoading(true);
      const data = await getTodos();
      if (!data) {
        setError('No todos found');
        return;
      }
      setTodos(data);
    } catch (err) {
      setError('Failed to load todos');
    } finally {
      setLoading(false);
    }
  }

  const isUrgent = (dueDate) => {
    if (!dueDate) return false;
    const now = new Date();
    const due = new Date(dueDate);
    const hoursUntilDue = (due - now) / (1000 * 60 * 60);
    return hoursUntilDue <= 3;
  };

  const getFilteredTodos = () => {
    switch (filter) {
      case 'completed':
        return todos.filter(todo => todo.completed === 1);
      case 'doitnow':
        return todos.filter(todo => todo.completed !== 1 && isUrgent(todo.due_date));
      case 'all':
      default:
        return todos.filter(todo => todo.completed !== 1);
    }
  };

  const getUrgentCount = () => {
    return todos.filter(todo => todo.completed !== 1 && isUrgent(todo.due_date)).length;
  };

  useEffect(() => {
    const urgentCount = getUrgentCount();
    window.dispatchEvent(new CustomEvent('urgentCountUpdate', { detail: urgentCount }));
  }, [todos]);

  const handleDurationChange = (e) => {
    const value = e.target.value;
    if (value === 'custom') {
      setShowCustomDuration(true);
      setDuration('');
    } else {
      setShowCustomDuration(false);
      setDuration(value);
      setCustomDurationMinutes('');
    }
  };

  const handleCustomDurationChange = (e) => {
    const minutes = e.target.value;
    setCustomDurationMinutes(minutes);
    if (minutes && !isNaN(minutes) && minutes > 0) {
      setDuration(minutes);
    } else {
      setDuration('');
    }
  };

  const handleDueDateChange = (e) => {
    setDueDate(e.target.value);
    // Reset time to default when date changes
    setDueTime(DEFAULT_DUE_TIME);
  };

  async function handleAddTodo(e) {
    e.preventDefault();

    if (!newTask.trim()) {
      setError('Please enter a task name.');
      return;
    }

    if (!duration || duration === 'custom') {
      setError('Please select a duration.');
      return;
    }

    if (!dueDate) {
      setError('Please select a due date.');
      return;
    }

    // Use default time if none selected
    const finalDueTime = dueTime || DEFAULT_DUE_TIME;

    const durationMinutes = parseInt(duration);
    if (isNaN(durationMinutes) || durationMinutes <= 0) {
      setError('Please enter a valid duration.');
      return;
    }

    try {
      const finalDueDate = new Date(`${dueDate}T${finalDueTime}`).toISOString();
      const newTodo = await addTodo(newTask.trim(), durationMinutes, finalDueDate, description.trim() || null);
      const todoToAdd = newTodo.newTodo || newTodo;
      setTodos(currentTodos => [todoToAdd, ...currentTodos]);
      await refreshTasks();
      handleTaskCreated(todoToAdd);
      await loadTasks();
      setNewTask('');
      setDuration('');
      setDueDate('');
      setDueTime(DEFAULT_DUE_TIME);
      setDescription('');
      setShowDescriptionField(false);
      setShowCustomDuration(false);
      setCustomDurationMinutes('');
      setError('');
    } catch (err) {
      console.error('Failed to add todo:', err);
      setError(err.message || 'Failed to add todo');
    }
  }

  async function handleDelete(id) {
    try {
      await deleteTodo(id);
      setTodos(todos.filter(t => t.id !== id));
      await refreshTasks();
    } catch (err) {
      setError('Failed to delete todo');
    }
  }

  async function handleEdit(todo) {
    navigate(`/todos/${todo.id}?edit=true`);
  }

  const handleSwitchTask = async (newTask) => {
    const confirmSwitch = (currentName, newName) => {
      return window.confirm(
        `Switch from "${currentName}" to "${newName}"?\n\nYour progress on "${currentName}" will be saved.`
      );
    };
    
    const success = await switchToTask(newTask, currentStatus, confirmSwitch);
    if (success) {
      setCurrentStatus('idle');
      await loadTasks();
    }
  };

  const handleQueue = (task) => {
    if (queuedTask && queuedTask.id === task.id) {
      return;
    }
    setQueue(task);
  };

  const filteredTodos = getFilteredTodos();
  const sectionTitle = filter === 'completed' ? 'Completed Tasks' : 
                       filter === 'doitnow' ? 'Do It Now - Urgent Tasks' : 
                       'Active Tasks';

  if (loading) return <div className="loading-message">Loading...</div>;

  return (
    <div className="todos-wrapper">
      <div className="todos-layout">
        <div className="todos-container">
          <div className="todos-header">
            <h1>My Tasks</h1>
          </div>

          <form onSubmit={handleAddTodo} className="todo-form">
            <div className="form-row">
              <input
                type="text"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Add a new task..."
                className="todo-input"
                required
              />

              <div className="duration-wrapper">
                <select 
                  value={showCustomDuration ? 'custom' : duration} 
                  onChange={handleDurationChange}
                  className="duration-select"
                  required
                >
                  <option value="">Duration</option>
                  <option value="1">1 minute</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="240">4 hours</option>
                  <option value="720">12 hours</option>
                  <option value="1440">1 day</option>
                  <option value="10080">1 week</option>
                  <option value="custom">Custom (enter minutes)</option>
                </select>
                
                {showCustomDuration && (
                  <input
                    type="number"
                    value={customDurationMinutes}
                    onChange={handleCustomDurationChange}
                    placeholder="Enter minutes (e.g., 75)"
                    className="custom-duration-input"
                    min="1"
                    step="1"
                    autoFocus
                  />
                )}
              </div>

              <input
                type="date"
                value={dueDate}
                onChange={handleDueDateChange}
                className="date-input"
                required
              />

              <div className="time-wrapper">
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="time-input"
                  step="60"
                />
              </div>
              
              <button type="button" className="add-description-btn" onClick={() => setShowDescriptionField(!showDescriptionField)}>
                {showDescriptionField ? '− Description' : '+ Description'}
              </button>
              
              <button type="submit" className="add-btn">Add Todo</button>
            </div>

            {showDescriptionField && (
              <div className="description-row">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description (optional)..."
                  className="description-textarea"
                  rows="2"
                />
              </div>
            )}
          </form>

          {error && <p className="error-text">{error}</p>}

          <h2 className="section-title">{sectionTitle}</h2>

          <div className="tasks-grid">
            {filteredTodos.length === 0 && (
              <div className="empty-state">
                {filter === 'doitnow' ? 'Nothing urgent! Great job!' : 'Nothing to do :)'}
              </div>
            )}

            {filteredTodos.map(todo => (
              <TaskCard
                key={todo.id}
                task={todo}
                isCurrent={currentTask?.id === todo.id}
                isQueued={queuedTask?.id === todo.id}
                onPlay={handleSwitchTask}
                onQueue={handleQueue}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>

        <div className="now-playing-column">
          <NowPlaying
            currentTask={currentTask}
            onComplete={async () => {
              await completeCurrentTask();
              setCurrentStatus('completed');
              await refreshTasks();
              await loadTodos(false);
            }}
            onStatusChange={setCurrentStatus}
            refreshTasks={refreshTasks}
            device={hourglass}
          />
          <QueueDisplay queuedTask={queuedTask} onClearQueue={clearQueue} />
        </div>
      </div>
    </div>
  );
}