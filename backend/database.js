const Database = require('better-sqlite3');
const db = new Database('attendance.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('teacher', 'student')) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    session_id INTEGER,
    date TEXT NOT NULL,
    status TEXT CHECK(status IN ('present', 'absent')) NOT NULL,
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    is_open INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT NOT NULL,
    file_path TEXT,
    FOREIGN KEY (teacher_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    file_path TEXT,
    grade TEXT,
    feedback TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id),
    FOREIGN KEY (student_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS doubts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    parent_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES doubts(id)
  );
`);

// Check if file_path column exists in assignments, if not add it
try {
  db.exec("ALTER TABLE assignments ADD COLUMN file_path TEXT");
} catch (e) {
  // Column already exists
}

// Check if file_path column exists in submissions, if not add it
try {
  db.exec("ALTER TABLE submissions ADD COLUMN file_path TEXT");
} catch (e) {
  // Column already exists
}

// Check if grade column exists in submissions, if not add it
try {
  db.exec("ALTER TABLE submissions ADD COLUMN grade TEXT");
} catch (e) {
  // Column already exists
}

// Check if feedback column exists in submissions, if not add it
try {
  db.exec("ALTER TABLE submissions ADD COLUMN feedback TEXT");
} catch (e) {
  // Column already exists
}

// Check if session_id column exists in attendance, if not add it
try {
  db.exec("ALTER TABLE attendance ADD COLUMN session_id INTEGER");
} catch (e) {
  // Column already exists
}

// Check if is_open column exists in sessions, if not add it
try {
  db.exec("ALTER TABLE sessions ADD COLUMN is_open INTEGER DEFAULT 1");
} catch (e) {
  // Column already exists
}

// Check if parent_id column exists in doubts, if not add it
try {
  db.exec("ALTER TABLE doubts ADD COLUMN parent_id INTEGER");
} catch (e) {
  // Column already exists
}

// Add profile columns to users table
try {
  db.exec("ALTER TABLE users ADD COLUMN enrollment_number TEXT");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN branch TEXT");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN semester TEXT");
} catch (e) {}

module.exports = db;
