// Use relative path for prod, localhost for dev 
// src/lib/auth.js

const API_URL = import.meta.env.PROD ? '/api' : 'http://localhost:3000/api';

export async function login(username, password) {
    const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-type': 'application/json'},
        body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error('Login failed');
    return res.json();
}

export async function register(username, password) {
    const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    if (!res.ok) throw new Error('Registration failed');
    return res.json();
}

// Add this function - store token in localStorage
export function setAuthToken(token) {
    localStorage.setItem('token', token);
}

export function getAuthToken() {
    return localStorage.getItem('token');
}

export function removeAuthToken() {
    localStorage.removeItem('token');
}

export function isAuthenticated() {
    return !!getAuthToken();
}

export async function getCurrentUser() {
    const token = getAuthToken();
    if (!token) {
        throw new Error('Not authenticated');
    }

    const res = await fetch(`${API_URL}/auth/me`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to get user info');
    }

    return res.json();
}

export async function changePassword(currentPassword, newPassword) {
    const token = getAuthToken();
    if (!token) {
        throw new Error('Not authenticated');
    }

    const res = await fetch(`${API_URL}/auth/change-password`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await res.json();
    
    if (!res.ok) {
        throw new Error(data.error || 'Failed to change password');
    }
    
    return data;
}

export async function deleteAccount(password) {
    const token = getAuthToken();
    if (!token) {
        throw new Error('Not authenticated');
    }

    const res = await fetch(`${API_URL}/auth/delete-account`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password })
    });

    const data = await res.json();
    
    if (!res.ok) {
        throw new Error(data.error || 'Failed to delete account');
    }
    
    return data;
}
