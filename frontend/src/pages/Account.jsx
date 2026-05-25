import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, changePassword, deleteAccount, removeAuthToken } from '../lib/auth';

import { getTodos } from '../lib/todos';
import { getSessions } from '../lib/sessions';

import { formatEuropeanDate } from '../utils/todoUtils';

import './Account.css'; // TODO: this

function Account() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: ''
    });
    const [deletePassword, setDeletePassword] = useState('');
    const [message, setMessage] = useState({ text: '', type: '' });
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [completedTodos, setCompletedTodos] = useState([]);
    const [sessions, setSessions] = useState([]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            navigate('/login');
            return;
        }
        loadUser();
        loadCompletedTodos();
        loadSessions();
    }, [navigate]);

    const loadUser = async () => {
        try {
            const userData = await getCurrentUser();
            setUser(userData);
        } catch (error) {
            console.error('Error loading user data:', error);
            if (error.message === 'Not authenticated') {
                navigate('/login');
            }
        } finally {
            setLoading(false);
        }
    };

    const loadCompletedTodos = async () => {

        try {
            const todos = await getTodos();
            const completed = todos.filter(todo => todo.completed === 1);
            setCompletedTodos(completed);

        } catch (error) {
            console.error('Error loading completed todos:', error);
        }
    };

    const loadSessions = async () => {
        try {
            const data = await getSessions();
            setSessions(data);
        } catch (error) {
            console.error('Error loading session:', error);
        }
    };

    const formatDuration = (seconds) => {
        const safeSeconds = Math.max(0, Number(seconds) || 0);
        const minutes = Math.floor(safeSeconds / 60);
        const remainingSeconds = safeSeconds % 60;

        return `${minutes}m ${remainingSeconds}s`;
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        setMessage({ text: '', type: '' });

        if (passwordData.newPassword !== passwordData.confirmNewPassword) {
            setMessage({ text: 'New passwords do not match', type: 'error' });
            return;
        }

        if (passwordData.newPassword.length < 6) {
            setMessage({ text: 'New password must be at least 6 characters long', type: 'error' });
            return;
        }

        try {
            await changePassword(passwordData.currentPassword, passwordData.newPassword);
            setMessage({ text: 'Password changed successfully', type: 'success' });
            setPasswordData({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
        } catch (error) {
            console.error('Error changing password:', error);
            setMessage({ text: error.message, type: 'error' });
        }
    };

    const handleDeleteAccount = async () => {
        try {
            await deleteAccount(deletePassword);
            removeAuthToken();
            navigate('/login');
        } catch (error) {
            console.error('Error deleting account:', error);
            setMessage({ text: error.message, type: 'error' });
        }
    };

    if (loading) {
        return <div className="account-container"><p>Loading...</p></div>
    }

        return (
        <div className="account-container">
            <div className="account-card">
                <h1>My Account</h1>
                
                <div className="user-info">
                    <h2>User Information</h2>
                    <p><strong>Username:</strong> {user?.username}</p>
                    <p className="info-note">
                        Note: We only store your username and password. 
                        No additional personal information is collected.
                    </p>
                </div>

                {message.text && (
                    <div className={`message ${message.type}`}>
                        {message.text}
                    </div>
                    )}

                <div className="past-tasks-section">
                    <h2>Past Tasks</h2>

                    {completedTodos.length === 0 ? (
                        <p className="info-note">You do not have any completed tasks yet.</p>
                    ) : (
                        <ul className="past-tasks-list">
                            {completedTodos.map(todo => (
                                <li key={todo.id} className="past-task-item">
                                    <div>
                                        <strong>{todo.task}</strong>
                                        {todo.due_date && (
                                            <p className="past-task-date">
                                                Due: {formatEuropeanDate(todo.due_date)}
                                            </p>
                                        )}
                                    </div>

                                    {todo.duration && (
                                        <span className="past-task-duration">
                                            {todo.duration} min
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                    
                <div className="past-tasks-section">
                    <h2>Session History</h2>

                    {sessions.length === 0 ? (
                        <p className="info-note">No timer or focus sessions saved yet.</p>
                    ) : (
                        <ul className="past-tasks-list">
                            {sessions.map(session => (
                                <li key={session.id} className="past-task-item">
                                    <div>
                                        <strong>
                                            {session.task || 'Deleted task'}
                                        </strong>

                                        <p className="past-task-date">
                                            Mode: {session.mode === 'timer' ? 'Timer' : 'Focus'}
                                        </p>

                                        <p className="past-task-date">
                                            Planned: {session.planned_minutes} min | Actual: {formatDuration(session.actual_seconds)}
                                        </p>

                                        {session.overtime_seconds > 0 && (
                                            <p className="past-task-date">
                                                Overtime: {formatDuration(session.overtime_seconds)}
                                            </p>
                                        )}

                                        {session.notes && (
                                            <p className="past-task-date">
                                                Notes: {session.notes}
                                            </p>
                                        )}

                                        <p className="past-task-date">
                                            Completed: {formatEuropeanDate(session.ended_at)}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                
                <div className="password-section">
                    <h2>Change Password</h2>

                    <form onSubmit={handlePasswordChange}>
                        <div className="form-group">
                            <label>Current Password:</label>
                            <input
                                type="password"
                                value={passwordData.currentPassword}
                                onChange={(e) => setPasswordData({ 
                                    ...passwordData, 
                                    currentPassword: e.target.value 
                                })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>New Password:</label>
                            <input
                                type="password"
                                value={passwordData.newPassword}
                                onChange={(e) => setPasswordData({ 
                                    ...passwordData, 
                                    newPassword: e.target.value 
                                })}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Confirm New Password:</label>
                            <input
                                type="password"
                                value={passwordData.confirmNewPassword}
                                onChange={(e) => setPasswordData({ 
                                    ...passwordData, 
                                    confirmNewPassword: e.target.value 
                                })}
                                required
                            />
                        </div>
                        <button type="submit" className="btn-primary">
                            Change Password
                        </button>
                    </form>
                </div>

                <div className="delete-section">
                    <h2>Delete Account</h2>
                    <p className="warning-text">
                        Warning: This action is permanent and cannot be undone. 
                        All your todos will be deleted.
                    </p>
                    
                    {!showDeleteConfirm ? (
                        <button 
                            onClick={() => setShowDeleteConfirm(true)} 
                            className="btn-danger"
                        >
                            Delete My Account
                        </button>
                    ) : (
                        <div className="delete-confirm">
                            <p>Please enter your password to confirm account deletion:</p>
                            <input
                                type="password"
                                value={deletePassword}
                                onChange={(e) => setDeletePassword(e.target.value)}
                                placeholder="Enter your password"
                            />
                            <div className="delete-actions">
                                <button onClick={handleDeleteAccount} className="btn-danger">
                                    Confirm Delete
                                </button>
                                <button 
                                    onClick={() => {
                                        setShowDeleteConfirm(false);
                                        setDeletePassword('');
                                    }} 
                                    className="btn-secondary"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Account;