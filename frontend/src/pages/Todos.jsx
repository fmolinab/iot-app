// frontend/src/pages/Todos.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTodos, addTodo, deleteTodo } from '../lib/todos';
import { isAuthenticated, removeAuthToken } from '../lib/auth';
import { useCurrentTask } from '../hooks/useCurrentTask';
import NowPlaying from '../components/NowPlaying';
import QueueDisplay from '../components/QueueDisplay';
import TaskCard from '../components/TaskCard';
import './Todos.css';
import { useHourglassWebSocket } from '../hooks/useHourglassWebSocket';

export default function Todos() {
  const [todos, setTodos] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [duration, setDuration] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [description, setDescription] = useState('');
  const [showDescriptionField, setShowDescriptionField] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentStatus, setCurrentStatus] = useState('idle');
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  const hourglass = useHourglassWebSocket();
  
  const timeOptions = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute of ['00', '30']) {
      const time = `${String(hour).padStart(2, '0')}:${minute}`;
      timeOptions.push(time);
    }
  }

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

  async function handleAddTodo(e) {
    e.preventDefault();

    if (!newTask.trim()) {
      setError('Please enter a task name.');
      return;
    }

    if (!duration) {
      setError('Please select a duration.');
      return;
    }

    if (!dueDate) {
      setError('Please select a due date.');
      return;
    }

    if (!dueTime) {
      setError('Please select a due time.');
      return;
    }

    try {
      const finalDueDate = new Date(`${dueDate}T${dueTime}`).toISOString();
      const newTodo = await addTodo(newTask.trim(), parseInt(duration), finalDueDate, description.trim() || null);
      const todoToAdd = newTodo.newTodo || newTodo;
      setTodos(currentTodos => [todoToAdd, ...currentTodos]);
      await refreshTasks();
      handleTaskCreated(todoToAdd);
      await loadTasks();
      setNewTask('');
      setDuration('');
      setDueDate('');
      setDueTime('');
      setDescription('');
      setShowDescriptionField(false);
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

              <select 
                value={duration} 
                onChange={(e) => setDuration(e.target.value)}
                className="duration-select"
                required
              >
                <option value="">Duration</option>
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="240">4 hours</option>
                <option value="480">8 hours</option>
                <option value="1440">1 day</option>
              </select>

              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="date-input"
                required
              />

              <select
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="date-input"
                required
              >
                <option value="">Time</option>
                {timeOptions.map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
              
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