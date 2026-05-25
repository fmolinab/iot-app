const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// All session routes require login
router.use(authenticateToken);

// Save a completed timer/focus session
router.post('/', (req, res) => {
    const userId = req.user.id;

    const {
        todo_id = null,
        mode,
        planned_minutes = null,
        actual_seconds,
        overtime_seconds = 0,
        notes = '',
        started_at,
        ended_at
    } = req.body;

    if (!mode || !['timer', 'focus'].includes(mode)) {
        return res.status(400).json({ error: 'Mode must be either timer or focus' });
    }

    if (actual_seconds === undefined || actual_seconds === null) {
        return res.status(400).json({ error: 'Actual seconds is required' });
    }

    if (!started_at || !ended_at) {
        return res.status(400).json({ error: 'Started at and ended at are required' });
    }

    try {
        // If a todo_id is provided, verify that this todo belongs to the logged-in user
        if (todo_id !== null) {
            const todo = db.prepare(`
                SELECT id FROM todos
                WHERE id = ? AND user_id = ?
            `).get(todo_id, userId);

            if (!todo) {
                return res.status(404).json({ error: 'Todo not found for this user' });
            }
        }

        const result = db.prepare(`
            INSERT INTO sessions (
                user_id,
                todo_id,
                mode,
                planned_minutes,
                actual_seconds,
                overtime_seconds,
                notes,
                started_at,
                ended_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            userId,
            todo_id,
            mode,
            planned_minutes,
            actual_seconds,
            overtime_seconds,
            notes,
            started_at,
            ended_at
        );

        const newSession = db.prepare(`
            SELECT * FROM sessions
            WHERE id = ?
        `).get(result.lastInsertRowid);

        res.status(201).json(newSession);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save session' });
    }
});

// Get all sessions for the logged-in user
router.get('/', (req, res) => {
    const userId = req.user.id;

    try {
        const sessions = db.prepare(`
            SELECT
                sessions.*,
                todos.task AS task
            FROM sessions
            LEFT JOIN todos ON sessions.todo_id = todos.id
            WHERE sessions.user_id = ?
            ORDER BY sessions.created_at DESC
        `).all(userId);

        res.json(sessions);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load sessions' });
    }
});

module.exports = router;