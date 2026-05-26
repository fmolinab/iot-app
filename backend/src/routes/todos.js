const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// all todo routes require authentication
router.use(authenticateToken);

// get all todos for logged in user
router.get('/', (req, res) => {
    const userId = req.user.id;
    try {
        const todos = db.prepare(`
            SELECT * FROM todos
            WHERE user_id = ?
            ORDER BY created_at DESC
        `).all(userId);
        res.json(todos);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// create todo, fixed bug: now it saves duration and due date
router.post('/', (req, res) => {
    const userId = req.user?.id;
    const { task, duration, due_date, description } = req.body;

    if (!userId) {
        return res.status(401).json({ error: "No user ID" });
    }

    if (!task) {
        return res.status(400).json({ error: "Task is required" });
    }

    if (!duration) {
        return res.status(400).json({ error: "Duration is required" });
    }

    if (!due_date) {
        return res.status(400).json({ error: "Due date is required" });
    }

    try {
        const stmt = db.prepare(`
            INSERT INTO todos (user_id, task, duration, due_date, description) 
            VALUES (?, ?, ?, ?, ?)
        `);

        const result = stmt.run(userId, task, duration, due_date, description || null);
        const newTodo = db.prepare(`SELECT * FROM todos WHERE id = ?`).get(result.lastInsertRowid);

        res.status(201).json(newTodo);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to create todo" });
    }
});

/*

// create a new todo 
// create a new todo - SIMPLIFIED FOR DEBUGGING
// create a new todo - ULTRA DEBUG VERSION
router.post('/', (req, res) => {
    console.log('========== POST /todos DEBUG ==========');
    console.log('1. Headers:', req.headers);
    console.log('2. User from token:', req.user);
    console.log('3. Full request body:', req.body);
    console.log('4. Body type:', typeof req.body);
    console.log('5. Is body empty?', Object.keys(req.body).length === 0);
    
    const userId = req.user?.id;
    console.log('6. User ID:', userId);
    
    if (!userId) {
        console.log('No user ID found');
        return res.status(401).json({ error: "No user ID" });
    }

    const { task } = req.body;
    console.log('7. Task value:', task);
    console.log('8. Task type:', typeof task);
    console.log('9. Task exists?', !!task);
    
    if (!task) {
        console.log('No task in request body');
        return res.status(400).json({ error: "Task is required" });
    }

    try {
        console.log('10. Attempting database insert...');
        console.log('11. SQL: INSERT INTO todos (user_id, task) VALUES (?, ?)');
        console.log('12. Values:', [userId, task]);
        
        // Check if database is connected
        console.log('13. Database object exists?', !!db);
        
        // Test database with a simple query first
        const testQuery = db.prepare('SELECT 1').get();
        console.log('14. Database test query result:', testQuery);
        
        // Check if todos table exists
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        console.log('15. All tables:', tables);
        
        // Check todos table schema
        const tableInfo = db.prepare("PRAGMA table_info(todos)").all();
        console.log('16. Todos table schema:', tableInfo);
        
        // Now do the actual insert
        console.log('17. Preparing insert statement...');
        const stmt = db.prepare(`
            INSERT INTO todos (user_id, task) 
            VALUES (?, ?)
        `);
        console.log('18. Statement prepared');
        
        console.log('19. Running insert...');
        const result = stmt.run(userId, task);
        console.log('20. Insert result:', result);
        
        console.log('21. Getting new todo...');
        const newTodo = db.prepare(`SELECT * FROM todos WHERE id = ?`).get(result.lastInsertRowid);
        console.log('22. New todo retrieved:', newTodo);
        
        console.log('✅ SUCCESS! Sending response');
        res.status(201).json(newTodo);
        
    } catch (err) {
        console.log('========== ERROR CAUGHT ==========');
        console.log('Error name:', err.name);
        console.log('Error message:', err.message);
        console.log('Error code:', err.code);
        console.log('Error errno:', err.errno);
        console.log('Error stack:', err.stack);
        console.log('===================================');
        
        // Try to get more database info
        try {
            const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='todos'").get();
            console.log('Todos table exists?', tableCheck);
        } catch (e) {
            console.log('Could not check table existence:', e.message);
        }
        
        res.status(500).json({ error: err.message });
    }
});

*/

// update todo
// update todo
router.put('/:id', (req, res) => {
    const userId = req.user.id;
    const todoId = req.params.id;
    const { task, completed, duration, due_date, description } = req.body;  
    try {
        // verify ownership
        const todo = db.prepare(`SELECT * FROM todos WHERE id = ? AND user_id = ?`).get(todoId, userId);
        if (!todo) {
            return res.status(404).json({ error: "Todo not found" });
        }

        let updateQuery = 'UPDATE todos SET ';
        const updates = [];
        const values = [];

        if (task !== undefined) {
            updates.push('task = ?');
            values.push(task);
        }
        if (completed !== undefined) {
            updates.push('completed = ?');
            values.push(completed ? 1 : 0);
        }
        if (duration !== undefined) { 
            updates.push('duration = ?');
            values.push(duration);
        }
        if (due_date !== undefined) { 
            updates.push('due_date = ?');
            values.push(due_date);
        }
        if (description !== undefined) { 
            updates.push('description = ?');
            values.push(description || null);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        updateQuery += updates.join(', ') + ' WHERE id = ? AND user_id = ?';
        values.push(todoId, userId);

        db.prepare(updateQuery).run(...values);

        const updatedTodo = db.prepare(`SELECT * FROM todos WHERE id = ?`).get(todoId);
        res.json(updatedTodo);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update todo" });
    }
});

// delete a todo
router.delete('/:id', (req, res) => {
    const userId = req.user.id;
    const todoId = req.params.id;

    try {
        const result = db.prepare(`DELETE FROM todos WHERE id = ? AND user_id = ?`).run(todoId, userId);
        if (result.changes === 0) {
            return res.status(404).json({ error: "Todo not found" });
        }
        res.json({ message: "Todo deleted" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete todo" });
    }
})

module.exports = router;