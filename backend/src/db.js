const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let dbPath;

if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH;
    if (!fs.existsSync(volumePath)) {
        fs.mkdirSync(volumePath, { recursive: true });
    }
    dbPath = path.join(volumePath, 'app.sqlite');
    console.log(`Using Railway volume at: ${dbPath}`);
} else {
    dbPath = path.join(__dirname, 'app.sqlite');
    console.log(`Using local database at: ${dbPath}`);
}

const db = new Database(dbPath);

// users table
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// todos table
db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        task TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        duration INTEGER,
        due_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
`);

//sessions table
//stores completed Timer Mode / Focus Mode runs for analytics and notes
db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        todo_id INTEGER,
        mode TEXT NOT NULL,
        planned_minutes INTEGER,
        actual_seconds INTEGER NOT NULL,
        overtime_seconds INTEGER DEFAULT 0,
        notes TEXT,
        started_at DATETIME NOT NULL,
        ended_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (todo_id) REFERENCES todos (id) ON DELETE SET NULL
    )
`);

const todoColumns = db.prepare("PRAGMA table_info(todos)").all();
const todoColumnNames = todoColumns.map(col => col.name);

if (!todoColumnNames.includes('duration')) {
    db.exec(`ALTER TABLE todos ADD COLUMN duration INTEGER`);
    console.log('Added missing column: duration');
}

if (!todoColumnNames.includes('due_date')) {
    db.exec(`ALTER TABLE todos ADD COLUMN due_date DATETIME`);
    console.log('Added missing column: due_date');
}

console.log('Database ready');
module.exports = db;