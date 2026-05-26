import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTodos, updateTodo, deleteTodo } from '../lib/todos';
import {
    getTodoColor,
    getTimeRemainingText,
    formatEuropeanDate,
    getTodoUrgencyLabel,
    formatDurationText
} from '../utils/todoUtils';
import './TodoPage.css';

export default function TodoPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [todo, setTodo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({ task: '', duration: '', due_date: '', description: '' });

    useEffect(() => {
        loadTodo();
    }, [id]);

    async function loadTodo() {
        try {
            const todos = await getTodos();
            const foundTodo = todos.find(t => t.id === parseInt(id));
            if (foundTodo) {
                setTodo(foundTodo);
                setEditForm({
                    task: foundTodo.task,
                    duration: foundTodo.duration || '',
                    due_date: foundTodo.due_date ? foundTodo.due_date.slice(0, 16) : '',
                    description: foundTodo.description || ''
                });
            }
        } catch (err) {
            console.error('Failed to load todo:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleUpdate(e) {
        e.preventDefault();
        try {
            const updates = {
                task: editForm.task,
                duration: editForm.duration ? parseInt(editForm.duration) : null,
                due_date: editForm.due_date ? new Date(editForm.due_date).toISOString() : null,
                description: editForm.description || null
            };
            const updated = await updateTodo(todo.id, updates);
            setTodo(updated);
            setEditing(false);
        } catch (err) {
            console.error('Failed to update todo:', err);
        }
    }

    async function handleDelete() {
        if (window.confirm('Are you sure you want to delete this task?')) {
            try {
                await deleteTodo(todo.id);
                navigate('/todos');
            } catch (err) {
                console.error('Failed to delete todo:', err);
            }
        }
    }

    if (loading) return <div className="loading-message">Loading...</div>;
    if (!todo) return <div className="error-message">Todo not found</div>;

    return (
        <div className="todo-page-wrapper">
            <div className="todo-page-container" style={{ backgroundColor: getTodoColor(todo) }}>
                <button onClick={() => navigate('/todos')} className="back-btn">
                    ← Back to Todos
                </button>

                {editing ? (
                    <form onSubmit={handleUpdate} className="edit-form">
                        <h2>Edit Task</h2>
                        
                        <div className="form-group">
                            <label>Task:</label>
                            <input
                                type="text"
                                value={editForm.task}
                                onChange={(e) => setEditForm({...editForm, task: e.target.value})}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Duration (minutes):</label>
                            <input
                                type="number"
                                value={editForm.duration}
                                onChange={(e) => setEditForm({...editForm, duration: e.target.value})}
                                placeholder="Optional"
                            />
                        </div>

                        <div className="form-group">
                            <label>Due Date:</label>
                            <input
                                type="datetime-local"
                                value={editForm.due_date}
                                onChange={(e) => setEditForm({...editForm, due_date: e.target.value})}
                            />
                        </div>

                        <div className="form-group">
                            <label>Description:</label>
                            <textarea
                                value={editForm.description}
                                onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                                placeholder="Optional description..."
                                rows="4"
                            />
                        </div>

                        <div className="edit-actions">
                            <button type="button" onClick={() => setEditing(false)} className="cancel-btn">
                                Cancel
                            </button>
                            <button type="submit" className="save-btn">
                                Save Changes
                            </button>
                        </div>
                    </form>
                ) : (
                    <>
                        <div className="todo-header">
                            <h1>{todo.task}</h1>
                            <div className="todo-actions">
                                <button onClick={() => setEditing(true)} className="edit-btn">
                                    Edit
                                </button>
                                <button onClick={handleDelete} className="delete-btn">
                                    Delete
                                </button>
                            </div>
                        </div>

                        <div className="todo-details">
                            <div className="detail-item">
                                <span className="detail-label">Status:</span>
                                <span className="detail-value">
                                    {todo.completed ? 'Completed' : 'In Progress'}
                                </span>
                            </div>

                            {todo.description && (
                                <div className="detail-item">
                                    <span className="detail-label">Description:</span>
                                    <span className="detail-value">{todo.description}</span>
                                </div>
                            )}

                            {todo.duration && (
                                <div className="detail-item">
                                    <span className="detail-label">Duration:</span>
                                    <span className="detail-value">{formatDurationText(todo.duration)}</span>
                                </div>
                            )}

                            {todo.due_date && (
                                <>
                                    <div className="detail-item">
                                        <span className="detail-label">Due Date:</span>
                                        <span className="detail-value">
                                            {formatEuropeanDate(todo.due_date)}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="detail-label">Time Left:</span>
                                        <span className="detail-value">
                                            {getTimeRemainingText(todo.due_date)}
                                        </span>
                                    </div>
                                </>
                            )}

                            <div className="detail-item">
                                <span className="detail-label">Created:</span>
                                <span className="detail-value">
                                    {new Date(todo.created_at).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {!todo.completed && todo.due_date && (
                            <div className="urgency-indicator">
                                Current urgency level: {getTodoUrgencyLabel(todo)}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}