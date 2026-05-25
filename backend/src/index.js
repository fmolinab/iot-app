require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const todoRoutes = require('./routes/todos');
const sessionsRoutes = require('./routes/sessions');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/todos', todoRoutes);
app.use('/api/sessions', sessionsRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
    const frontendPath = path.join(__dirname, '../../frontend/dist');
    app.use(express.static(frontendPath));
    // Change from app.get('*') to app.use() for better compatibility
    app.use((req, res, next) => {
        // If it's an API route, skip
        if (req.path.startsWith('/api')) {
            return next();
        }
        // Otherwise serve the frontend
        res.sendFile(path.join(frontendPath, 'index.html'));
    });
    console.log(`Serving frontend from: ${frontendPath}`);
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
