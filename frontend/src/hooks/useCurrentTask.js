import { useState, useEffect, useCallback } from 'react';
import { getTodos, updateTodo } from '../lib/todos';

const STORAGE_KEY = 'hourglass_current_task';
const QUEUE_KEY = 'hourglass_queued_task';

export function useCurrentTask() {
  const [currentTask, setCurrentTask] = useState(null);
  const [queuedTask, setQueuedTask] = useState(null);
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = useCallback(async () => {
    try {
      const todos = await getTodos();
      setAllTasks(todos);
      return todos;
    } catch (err) {
      console.error('Failed to load tasks:', err);
      return [];
    }
  }, []);

  // Load saved state from localStorage
  useEffect(() => {
    const loadSavedState = async () => {
      const todos = await loadTasks();
      
      const savedCurrentId = localStorage.getItem(STORAGE_KEY);
      const savedQueueId = localStorage.getItem(QUEUE_KEY);
      
      if (savedCurrentId) {
        const current = todos.find(t => t.id === parseInt(savedCurrentId) && t.completed !== 1);
        if (current) setCurrentTask(current);
      }
      
      if (savedQueueId) {
        const queued = todos.find(t => t.id === parseInt(savedQueueId) && t.completed !== 1);
        if (queued) setQueuedTask(queued);
      }
      
      setLoading(false);
    };
    
    loadSavedState();
  }, [loadTasks]);

  // Save to localStorage
  useEffect(() => {
    if (currentTask) {
      localStorage.setItem(STORAGE_KEY, currentTask.id.toString());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [currentTask]);

  useEffect(() => {
    if (queuedTask) {
      localStorage.setItem(QUEUE_KEY, queuedTask.id.toString());
    } else {
      localStorage.removeItem(QUEUE_KEY);
    }
  }, [queuedTask]);

  const switchToTask = useCallback(async (newTask, currentStatus, onConfirmNeeded) => {
    if (!currentTask || currentStatus === 'completed') {
      setCurrentTask(newTask);
      return true;
    }
    
    const confirmed = await onConfirmNeeded(currentTask.task, newTask.task);
    if (confirmed) {
      setCurrentTask(newTask);
      return true;
    }
    return false;
  }, [currentTask]);

  const completeCurrentTask = useCallback(async () => {
    if (!currentTask) return null;
    
    const updated = await updateTodo(currentTask.id, { completed: 1 });
    
    const refreshedTasks = await loadTasks();

    const incompleteTasks = refreshedTasks.filter(t => t.completed !== 1);

    let nextCurrentTask = null;
    let nextQueuedTask = null;

    if (queuedTask) {
      // Move queued task into Now Playing
      nextCurrentTask = incompleteTasks.find(t => t.id === queuedTask.id) || null;

      // Find the next incomplete task after the queued/current one
      nextQueuedTask = incompleteTasks.find(
        t => t.id !== currentTask.id && t.id !== queuedTask.id
      ) || null;
    } else {
      // No queue, so choose first available task
      nextCurrentTask = incompleteTasks.find(t => t.id !== currentTask.id) || null;

      // Then queue the task after that
      if (nextCurrentTask) {
        nextQueuedTask = incompleteTasks.find(
          t => t.id !== currentTask.id && t.id !== nextCurrentTask.id
        ) || null;
      }
    }

    setCurrentTask(nextCurrentTask);
    setQueuedTask(nextQueuedTask);

    return updated;
  }, [currentTask, queuedTask, loadTasks]);

  const setQueue = useCallback((task) => {
    setQueuedTask(task);
  }, []);

  const clearQueue = useCallback(() => {
    setQueuedTask(null);
  }, []);

  const refreshTasks = useCallback(async () => {
    const todos = await loadTasks();
    // Update current task if it still exists and is incomplete
    if (currentTask) {
      const stillExists = todos.find(t => t.id === currentTask.id && t.completed !== 1);
      if (!stillExists) {
        // Current task was completed elsewhere, load next
        const nextTask = queuedTask || todos.find(t => t.completed !== 1);
        setCurrentTask(nextTask || null);
        if (queuedTask && nextTask?.id === queuedTask?.id) setQueuedTask(null);
      }
    }
    // Update queued task if it still exists
    if (queuedTask) {
      const stillExists = todos.find(t => t.id === queuedTask.id && t.completed !== 1);
      if (!stillExists) setQueuedTask(null);
    }
  }, [currentTask, queuedTask, loadTasks]);

  //This will control the traffic for new tasks
  const handleTaskCreated = useCallback((task) => {
    setAllTasks(prev => [task, ...prev.filter(t => t.id !== task.id)]);

    if (!currentTask) {
      setCurrentTask(task);
      return 'current';
    }

    if (!queuedTask && currentTask.id !== task.id) {
      setQueuedTask(task);
      return 'queued';
    }
    
    return 'list';
  }, [currentTask, queuedTask]);

  return {
    currentTask,
    queuedTask,
    allTasks,
    loading,
    switchToTask,
    completeCurrentTask,
    setQueue,
    clearQueue,
    refreshTasks,
    loadTasks,
    handleTaskCreated,
  };
}