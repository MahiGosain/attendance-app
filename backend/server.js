const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const stringSimilarity = require('string-similarity');
require('dotenv').config();

const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.JWT_SECRET || 'your_secret_key';
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();

// CORS Configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

app.use('/uploads', express.static(uploadsDir, { fallthrough: false }));

// Multer Storage Configuration
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const sendStoredFile = (res, record, fallbackLabel) => {
  if (record?.file_data) {
    res.setHeader('Content-Type', record.file_mime || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${path.basename(record.file_name || fallbackLabel)}"`
    );
    return res.send(record.file_data);
  }

  if (record?.file_path) {
    const fallbackFilePath = path.join(uploadsDir, path.basename(record.file_path));
    if (fs.existsSync(fallbackFilePath)) {
      return res.sendFile(fallbackFilePath);
    }
  }

  return res.status(404).json({ message: 'File not found' });
};

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
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, email, hashedPassword, role]
    );
    res.status(201).json({ id: result.rows[0].id, name, email, role });
  } catch (error) {
    if (error.code === '23505') { // PostgreSQL unique violation code
      res.status(400).json({ message: 'Email already exists' });
    } else {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
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
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- PROFILE ROUTES ---

// Update Profile
app.patch('/api/profile', authenticateToken, async (req, res) => {
  const { enrollment_number, branch, semester } = req.body;
  try {
    await pool.query(
      'UPDATE users SET enrollment_number = $1, branch = $2, semester = $3 WHERE id = $4',
      [enrollment_number, branch, semester, req.user.id]
    );
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get Profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, enrollment_number, branch, semester FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- ATTENDANCE ROUTES ---

// Create a Class Session (Teacher only)
app.post('/api/sessions', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can create sessions' });
  const { title, date } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO sessions (teacher_id, title, date) VALUES ($1, $2, $3) RETURNING id',
      [req.user.id, title, date]
    );
    res.status(201).json({ id: result.rows[0].id, title, date });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get All Sessions
app.get('/api/sessions', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, u.name as teacher_name,
      (SELECT COUNT(*) FROM attendance WHERE session_id = s.id AND status = 'present') as present_count
      FROM sessions s 
      JOIN users u ON s.teacher_id = u.id 
      ORDER BY s.id DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get Attendance for a Specific Session (Teacher only)
app.get('/api/sessions/:id/attendance', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can view session attendance' });
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT a.*, u.name as student_name 
      FROM attendance a 
      JOIN users u ON a.student_id = u.id 
      WHERE a.session_id = $1
      ORDER BY u.name ASC
    `, [id]);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Toggle Session Attendance Status (Teacher only)
app.patch('/api/sessions/:id/toggle', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can toggle attendance' });
  const { id } = req.params;
  const { is_open } = req.body;
  try {
    const result = await pool.query(
      'UPDATE sessions SET is_open = $1 WHERE id = $2 AND teacher_id = $3',
      [is_open ? 1 : 0, id, req.user.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Session not found or unauthorized' });
    res.json({ message: `Attendance ${is_open ? 'opened' : 'closed'} successfully` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Mark Attendance (For Students)
app.post('/api/attendance', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Only students can mark attendance' });
  const { date, status, session_id } = req.body;
  try {
    // Check if session exists and is open
    if (session_id) {
      const sessionResult = await pool.query('SELECT is_open FROM sessions WHERE id = $1', [session_id]);
      const session = sessionResult.rows[0];
      if (!session) return res.status(404).json({ message: 'Session not found' });
      if (session.is_open === 0) return res.status(400).json({ message: 'Attendance for this session is closed' });

      // Check if already marked for this session
      const existingResult = await pool.query('SELECT id FROM attendance WHERE student_id = $1 AND session_id = $2', [req.user.id, session_id]);
      if (existingResult.rows.length > 0) return res.status(400).json({ message: 'Attendance already marked for this session' });
    }

    await pool.query(
      'INSERT INTO attendance (student_id, date, status, session_id) VALUES ($1, $2, $3, $4)',
      [req.user.id, date, status, session_id || null]
    );
    res.status(201).json({ message: 'Attendance marked' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get Student Attendance
app.get('/api/attendance/student', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Only students can view their attendance' });
  try {
    const result = await pool.query(`
      SELECT a.*, s.title as session_title 
      FROM attendance a 
      LEFT JOIN sessions s ON a.session_id = s.id 
      WHERE a.student_id = $1 
      ORDER BY a.id DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get Teacher Student Attendance
app.get('/api/attendance/teacher', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can view all attendance' });
  try {
    const result = await pool.query(`
      SELECT a.*, u.name as student_name, u.enrollment_number, u.branch, u.semester, s.title as session_title 
      FROM attendance a 
      JOIN users u ON a.student_id = u.id 
      LEFT JOIN sessions s ON a.session_id = s.id 
      ORDER BY a.id DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- ASSIGNMENT ROUTES ---

// Post Assignment (Teacher only)
app.post('/api/assignments', authenticateToken, upload.single('file'), async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can post assignments' });
  const { title, description, due_date } = req.body;
  const filePath = req.file ? `/uploads/${Date.now()}-${req.file.originalname}` : null;
  try {
    await pool.query(
      `INSERT INTO assignments (
        teacher_id, title, description, due_date, file_path, file_name, file_mime, file_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.user.id,
        title,
        description,
        due_date,
        filePath,
        req.file?.originalname || null,
        req.file?.mimetype || null,
        req.file?.buffer || null,
      ]
    );
    res.status(201).json({ message: 'Assignment created' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete Assignment (Teacher only)
app.delete('/api/assignments/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can delete assignments' });
  const { id } = req.params;
  try {
    // Also delete submissions related to this assignment
    await pool.query('DELETE FROM submissions WHERE assignment_id = $1', [id]);
    const result = await pool.query('DELETE FROM assignments WHERE id = $1 AND teacher_id = $2', [id, req.user.id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Assignment not found or unauthorized' });
    res.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get All Assignments
app.get('/api/assignments', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, u.name as teacher_name,
      (SELECT COUNT(*) FROM submissions WHERE assignment_id = a.id) as submission_count
      FROM assignments a 
      JOIN users u ON a.teacher_id = u.id 
      ORDER BY a.due_date ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Submit Assignment (Student only)
app.post('/api/submissions', authenticateToken, upload.single('file'), async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Only students can submit assignments' });
  const { assignment_id, content } = req.body;
  const filePath = req.file ? `/uploads/${Date.now()}-${req.file.originalname}` : null;
  
  try {
    // Check if already submitted
    const existingResult = await pool.query('SELECT id FROM submissions WHERE assignment_id = $1 AND student_id = $2', [assignment_id, req.user.id]);
    if (existingResult.rows.length > 0) return res.status(400).json({ message: 'You have already submitted this assignment' });

    await pool.query(
      `INSERT INTO submissions (
        assignment_id, student_id, content, file_path, file_name, file_mime, file_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        assignment_id,
        req.user.id,
        content,
        filePath,
        req.file?.originalname || null,
        req.file?.mimetype || null,
        req.file?.buffer || null,
      ]
    );
    res.status(201).json({ message: 'Submission successful' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/files/assignments/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT file_name, file_mime, file_data, file_path FROM assignments WHERE id = $1',
      [req.params.id]
    );
    const assignment = result.rows[0];
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    return sendStoredFile(res, assignment, 'assignment-file');
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/files/submissions/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT file_name, file_mime, file_data, file_path FROM submissions WHERE id = $1',
      [req.params.id]
    );
    const submission = result.rows[0];
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    return sendStoredFile(res, submission, 'submission-file');
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Get Student's own submissions
app.get('/api/submissions/student', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: 'Only students can view their submissions' });
  try {
    const result = await pool.query('SELECT * FROM submissions WHERE student_id = $1', [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get Submissions for an Assignment (Teacher only)
app.get('/api/submissions/:assignmentId', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can view submissions' });
  const { assignmentId } = req.params;
  try {
    const result = await pool.query(`
      SELECT s.*, u.name as student_name, u.enrollment_number, u.branch, u.semester 
      FROM submissions s 
      JOIN users u ON s.student_id = u.id 
      WHERE s.assignment_id = $1
    `, [assignmentId]);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Grade a Submission (Teacher only)
app.post('/api/submissions/:id/grade', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can grade submissions' });
  const { id } = req.params;
  const { grade, feedback } = req.body;
  try {
    const result = await pool.query(
      'UPDATE submissions SET grade = $1, feedback = $2 WHERE id = $3',
      [grade, feedback, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Submission not found' });
    res.json({ message: 'Grading successful' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Plagiarism Check (Teacher only)
app.get('/api/submissions/:assignmentId/plagiarism', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ message: 'Only teachers can run plagiarism checks' });
  const { assignmentId } = req.params;
  try {
    const assignmentResult = await pool.query('SELECT description FROM assignments WHERE id = $1', [assignmentId]);
    const assignment = assignmentResult.rows[0];
    const result = await pool.query(`
      SELECT s.*, u.name as student_name 
      FROM submissions s 
      JOIN users u ON s.student_id = u.id 
      WHERE s.assignment_id = $1
    `, [assignmentId]);
    const records = result.rows;

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
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- DOUBT ROUTES ---

// Post a Doubt
app.post('/api/doubts', authenticateToken, async (req, res) => {
  const { content, parent_id } = req.body;
  if (!content) return res.status(400).json({ message: 'Doubt content is required' });
  try {
    await pool.query(
      'INSERT INTO doubts (user_id, content, parent_id) VALUES ($1, $2, $3)',
      [req.user.id, content, parent_id || null]
    );
    res.status(201).json({ message: 'Doubt posted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get All Doubts
app.get('/api/doubts', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, u.name as user_name, u.role, u.enrollment_number, u.branch, u.semester 
      FROM doubts d 
      JOIN users u ON d.user_id = u.id 
      ORDER BY d.created_at ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete a Doubt (Own only)
app.delete('/api/doubts/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM doubts WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Doubt not found or unauthorized' });
    res.json({ message: 'Doubt deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- STATIC FILES ---
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Catch-all route to serve the frontend index.html for SPA
app.get('*', (req, res) => {
  // If it's an API request, don't serve index.html
  if (req.url.startsWith('/api')) {
    return res.status(404).json({ message: 'API route not found' });
  }
  
  const indexPath = path.resolve(__dirname, '../frontend/dist/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend build not found');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
