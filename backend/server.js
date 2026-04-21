const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./database');
const multer = require('multer');
const path = require('path');
const stringSimilarity = require('string-similarity');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.JWT_SECRET || 'your_secret_key';

// CORS Configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Auth Middlewares
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ message: 'Forbidden' });
    req.user = user;
    next();
  });
};

// --- AUTH ROUTES ---

// Register
app.post('/api/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)');
    const result = stmt.run(name, email, hashedPassword, role);
    res.status(201).json({ id: result.lastInsertRowid, name, email, role });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(400).json({ message: 'Email already exists' });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        role: user.role, 
        email: user.email,
        enrollment_number: user.enrollment_number,
        branch: user.branch,
        semester: user.semester
      } 
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- PROFILE ROUTES ---

// Update Profile
app.patch('/api/profile', authenticateToken, (req, res) => {
  const { enrollment_number, branch, semester } = req.body;
  try {
    const stmt = db.prepare('UPDATE users SET enrollment_number = ?, branch = ?, semester = ? WHERE id = ?');
    stmt.run(enrollment_number, branch, semester, req.user.id);
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get Profile
app.get('/api/profile', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, role, enrollment_number, branch, semester FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- ATTENDANCE ROUTES ---

// Create a Class Session (Teacher only)
app.post('/api/sessions', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can create sessions' });
  const { title, date } = req.body;
  try {
    const stmt = db.prepare('INSERT INTO sessions (teacher_id, title, date) VALUES (?, ?, ?)');
    const result = stmt.run(req.user.id, title, date);
    res.status(201).json({ id: result.lastInsertRowid, title, date });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get All Sessions
app.get('/api/sessions', authenticateToken, (req, res) => {
  try {
    const records = db.prepare(`
      SELECT s.*, u.name as teacher_name,
      (SELECT COUNT(*) FROM attendance WHERE session_id = s.id AND status = 'present') as present_count
      FROM sessions s 
      JOIN users u ON s.teacher_id = u.id 
      ORDER BY s.id DESC
    `).all();
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get Attendance for a Specific Session (Teacher only)
app.get('/api/sessions/:id/attendance', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can view session attendance' });
  const { id } = req.params;
  try {
    const records = db.prepare(`
      SELECT a.*, u.name as student_name 
      FROM attendance a 
      JOIN users u ON a.student_id = u.id 
      WHERE a.session_id = ?
      ORDER BY u.name ASC
    `).all(id);
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Toggle Session Attendance Status (Teacher only)
app.patch('/api/sessions/:id/toggle', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can toggle attendance' });
  const { id } = req.params;
  const { is_open } = req.body;
  try {
    const stmt = db.prepare('UPDATE sessions SET is_open = ? WHERE id = ? AND teacher_id = ?');
    const result = stmt.run(is_open ? 1 : 0, id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ message: 'Session not found or unauthorized' });
    res.json({ message: `Attendance ${is_open ? 'opened' : 'closed'} successfully` });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Mark Attendance (For Students)
app.post('/api/attendance', authenticateToken, (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Only students can mark attendance' });
  const { date, status, session_id } = req.body;
  try {
    // Check if session exists and is open
    if (session_id) {
      const session = db.prepare('SELECT is_open FROM sessions WHERE id = ?').get(session_id);
      if (!session) return res.status(404).json({ message: 'Session not found' });
      if (session.is_open === 0) return res.status(400).json({ message: 'Attendance for this session is closed' });

      // Check if already marked for this session
      const existing = db.prepare('SELECT id FROM attendance WHERE student_id = ? AND session_id = ?').get(req.user.id, session_id);
      if (existing) return res.status(400).json({ message: 'Attendance already marked for this session' });
    }

    const stmt = db.prepare('INSERT INTO attendance (student_id, date, status, session_id) VALUES (?, ?, ?, ?)');
    stmt.run(req.user.id, date, status, session_id || null);
    res.status(201).json({ message: 'Attendance marked' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get Student Attendance
app.get('/api/attendance/student', authenticateToken, (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Only students can view their attendance' });
  try {
    const records = db.prepare(`
      SELECT a.*, s.title as session_title 
      FROM attendance a 
      LEFT JOIN sessions s ON a.session_id = s.id 
      WHERE a.student_id = ? 
      ORDER BY a.id DESC
    `).all(req.user.id);
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get Teacher Student Attendance
app.get('/api/attendance/teacher', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can view all attendance' });
  try {
    const records = db.prepare(`
      SELECT a.*, u.name as student_name, u.enrollment_number, u.branch, u.semester, s.title as session_title 
      FROM attendance a 
      JOIN users u ON a.student_id = u.id 
      LEFT JOIN sessions s ON a.session_id = s.id 
      ORDER BY a.id DESC
    `).all();
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- ASSIGNMENT ROUTES ---

// Post Assignment (Teacher only)
app.post('/api/assignments', authenticateToken, upload.single('file'), (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can post assignments' });
  const { title, description, due_date } = req.body;
  const file_path = req.file ? `/uploads/${req.file.filename}` : null;
  try {
    const stmt = db.prepare('INSERT INTO assignments (teacher_id, title, description, due_date, file_path) VALUES (?, ?, ?, ?, ?)');
    stmt.run(req.user.id, title, description, due_date, file_path);
    res.status(201).json({ message: 'Assignment created' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete Assignment (Teacher only)
app.delete('/api/assignments/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can delete assignments' });
  const { id } = req.params;
  try {
    // Also delete submissions related to this assignment
    db.prepare('DELETE FROM submissions WHERE assignment_id = ?').run(id);
    const stmt = db.prepare('DELETE FROM assignments WHERE id = ? AND teacher_id = ?');
    const result = stmt.run(id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ message: 'Assignment not found or unauthorized' });
    res.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get All Assignments
app.get('/api/assignments', authenticateToken, (req, res) => {
  try {
    const records = db.prepare(`
      SELECT a.*, u.name as teacher_name,
      (SELECT COUNT(*) FROM submissions WHERE assignment_id = a.id) as submission_count
      FROM assignments a 
      JOIN users u ON a.teacher_id = u.id 
      ORDER BY a.due_date ASC
    `).all();
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Submit Assignment (Student only)
app.post('/api/submissions', authenticateToken, upload.single('file'), (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Only students can submit assignments' });
  const { assignment_id, content } = req.body;
  const file_path = req.file ? `/uploads/${req.file.filename}` : null;
  
  try {
    // Check if already submitted
    const existing = db.prepare('SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ?').get(assignment_id, req.user.id);
    if (existing) return res.status(400).json({ message: 'You have already submitted this assignment' });

    const stmt = db.prepare('INSERT INTO submissions (assignment_id, student_id, content, file_path) VALUES (?, ?, ?, ?)');
    stmt.run(assignment_id, req.user.id, content, file_path);
    res.status(201).json({ message: 'Submission successful' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get Student's own submissions
app.get('/api/submissions/student', authenticateToken, (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Only students can view their submissions' });
  try {
    const records = db.prepare('SELECT * FROM submissions WHERE student_id = ?').all(req.user.id);
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get Submissions for an Assignment (Teacher only)
app.get('/api/submissions/:assignmentId', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can view submissions' });
  const { assignmentId } = req.params;
  try {
    const records = db.prepare(`
      SELECT s.*, u.name as student_name, u.enrollment_number, u.branch, u.semester 
      FROM submissions s 
      JOIN users u ON s.student_id = u.id 
      WHERE s.assignment_id = ?
    `).all(assignmentId);
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Grade a Submission (Teacher only)
app.post('/api/submissions/:id/grade', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can grade submissions' });
  const { id } = req.params;
  const { grade, feedback } = req.body;
  try {
    const stmt = db.prepare('UPDATE submissions SET grade = ?, feedback = ? WHERE id = ?');
    const result = stmt.run(grade, feedback, id);
    if (result.changes === 0) return res.status(404).json({ message: 'Submission not found' });
    res.json({ message: 'Grading successful' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Plagiarism Check (Teacher only)
app.get('/api/submissions/:assignmentId/plagiarism', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can run plagiarism checks' });
  const { assignmentId } = req.params;
  try {
    const assignment = db.prepare('SELECT description FROM assignments WHERE id = ?').get(assignmentId);
    const records = db.prepare(`
      SELECT s.*, u.name as student_name 
      FROM submissions s 
      JOIN users u ON s.student_id = u.id 
      WHERE s.assignment_id = ?
    `).all(assignmentId);

    if (records.length === 0) return res.json([]);

    const reports = [];
    
    // Compare each student against the assignment description
    if (assignment && assignment.description) {
      for (const record of records) {
        const similarity = stringSimilarity.compareTwoStrings(
          record.content || '', 
          assignment.description || ''
        );
        reports.push({
          student1: record.student_name,
          student2: 'Assignment Instructions',
          score: (similarity * 100).toFixed(2),
          content1: record.content,
          content2: assignment.description
        });
      }
    }

    // Peer comparison
    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const similarity = stringSimilarity.compareTwoStrings(
          records[i].content || '', 
          records[j].content || ''
        );
        
        reports.push({
          student1: records[i].student_name,
          student2: records[j].student_name,
          score: (similarity * 100).toFixed(2),
          content1: records[i].content,
          content2: records[j].content
        });
      }
    }
    
    // Sort by highest score
    reports.sort((a, b) => b.score - a.score);
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- DOUBT ROUTES ---

// Post a Doubt
app.post('/api/doubts', authenticateToken, (req, res) => {
  const { content, parent_id } = req.body;
  if (!content) return res.status(400).json({ message: 'Doubt content is required' });
  try {
    const stmt = db.prepare('INSERT INTO doubts (user_id, content, parent_id) VALUES (?, ?, ?)');
    stmt.run(req.user.id, content, parent_id || null);
    res.status(201).json({ message: 'Doubt posted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get All Doubts
app.get('/api/doubts', authenticateToken, (req, res) => {
  try {
    const records = db.prepare(`
      SELECT d.*, u.name as user_name, u.role, u.enrollment_number, u.branch, u.semester 
      FROM doubts d 
      JOIN users u ON d.user_id = u.id 
      ORDER BY d.created_at ASC
    `).all();
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete a Doubt (Own only)
app.delete('/api/doubts/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  try {
    const stmt = db.prepare('DELETE FROM doubts WHERE id = ? AND user_id = ?');
    const result = stmt.run(id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ message: 'Doubt not found or unauthorized' });
    res.json({ message: 'Doubt deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
