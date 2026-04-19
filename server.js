const express = require('express');
const bodyParser = require('body-parser');
const db = require('./db');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  secret: 'library-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 3600000 }
}));

// ================= FILE UPLOAD =================
const storage = multer.diskStorage({
  destination: './public/images/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ================= ROLE CHECK =================
function checkRole(role) {
  return (req, res, next) => {
    if (!req.session.user) {
      if (req.path.endsWith('.html')) return res.redirect('/login');
      return res.status(401).json({ error: 'Not logged in' });
    }
    if (req.session.user.role !== role) {
      if (req.path.endsWith('.html')) return res.redirect('/index.html');
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
}

// ================= AUTH ROUTES =================
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/api/user', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  res.json(req.session.user);
});

// ================= PAGE ROUTES =================
app.get('/index.html', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/add.html', checkRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'add.html'));
});

app.get('/books.html', checkRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'books.html'));
});

app.get('/admin-reports.html', checkRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-reports.html'));
});

// ================= REGISTER =================
app.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;

  db.query('SELECT * FROM users WHERE email=?', [email], async (err, results) => {
    if (results.length > 0) return res.json({ message: 'User already exists' });

    const hash = await bcrypt.hash(password, 10);

    db.query(
      'INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)',
      [name, email, hash, role],
      () => res.json({ message: 'Registered successfully' })
    );
  });
});

// ================= LOGIN =================
app.post('/login', (req, res) => {
  const { email, password, role } = req.body;

  db.query('SELECT * FROM users WHERE email=? AND role=?', [email, role], async (err, results) => {
    if (results.length === 0) return res.json({ message: 'Invalid user' });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) return res.json({ message: 'Wrong password' });

    req.session.user = { id: user.id, name: user.name, role: user.role };

    res.json({ message: 'Login success', user: req.session.user });
  });
});

// ================= BOOKS =================

// Get all books with issued status
app.get('/api/books', (req, res) => {
  const sql = `
    SELECT b.*, 
    CASE WHEN i.id IS NULL THEN 0 ELSE 1 END AS issued
    FROM books b
    LEFT JOIN issue i 
    ON b.id = i.book_id AND i.return_date IS NULL
  `;

  db.query(sql, (err, results) => res.json(results));
});

// Search books
app.get('/api/books/search', (req, res) => {
  const q = req.query.q || '';

  db.query(
    'SELECT * FROM books WHERE title LIKE ? OR author LIKE ?',
    [`%${q}%`, `%${q}%`],
    (err, results) => res.json(results)
  );
});

// Add book
app.post('/api/books', checkRole('admin'), upload.single('image'), (req, res) => {
  const image = req.file ? '/images/' + req.file.filename : req.body.imageUrl;

  db.query(
    'INSERT INTO books (title,author,description,image,available) VALUES (?,?,?,?,1)',
    [req.body.title, req.body.author, req.body.description, image],
    () => res.json({ message: 'Book Added' })
  );
});

// Update book
app.put('/api/books/:id', checkRole('admin'), upload.single('image'), (req, res) => {
  const image = req.file ? '/images/' + req.file.filename : req.body.imageUrl;

  db.query(
    'UPDATE books SET title=?,author=?,description=?,image=? WHERE id=?',
    [req.body.title, req.body.author, req.body.description, image, req.params.id],
    () => res.json({ message: 'Updated' })
  );
});

// Delete book
app.delete('/api/books/:id', checkRole('admin'), (req, res) => {
  db.query('DELETE FROM books WHERE id=?', [req.params.id], () => {
    res.json({ message: 'Deleted' });
  });
});

// ================= ISSUE BOOK =================
app.post('/api/issue', checkRole('admin'), (req, res) => {
  const { user_id, book_id } = req.body;

  // Check user
  db.query('SELECT * FROM users WHERE id=?', [user_id], (err, user) => {
    if (user.length === 0) {
      return res.json({ message: 'Invalid User ID' });
    }

    // Check if already issued
    db.query(
      'SELECT * FROM issue WHERE book_id=? AND return_date IS NULL',
      [book_id],
      (err, issue) => {

        if (issue.length > 0) {
          return res.json({ message: 'Book already issued' });
        }

        // Issue book
        db.query(
          'INSERT INTO issue (book_id, user_id, issue_date) VALUES (?,?,CURDATE())',
          [book_id, user_id],
          () => {
            res.json({ message: 'Book Issued Successfully' });
          }
        );
      }
    );
  });
});

// ================= RETURN BOOK =================
app.put('/api/return/:id', checkRole('admin'), (req, res) => {
  db.query(
    'UPDATE issue SET return_date=CURDATE() WHERE book_id=? AND return_date IS NULL',
    [req.params.id],
    () => res.json({ message: 'Returned Successfully' })
  );
});

// ================= ADMIN REPORT =================
app.get('/api/admin/issues', checkRole('admin'), (req, res) => {
  const sql = `
    SELECT 
      u.id as user_id,
      u.name,
      u.email,
      b.title,
      b.author,
      b.id as book_id,
      i.issue_date,
      i.return_date
    FROM issue i
    JOIN users u ON i.user_id = u.id
    JOIN books b ON i.book_id = b.id
    ORDER BY i.issue_date DESC
  `;

  db.query(sql, (err, results) => res.json(results));
});

// ================= STUDENT VIEW =================
app.get('/api/mybooks', (req, res) => {
  if (!req.session.user) return res.json([]);

  const userId = req.session.user.id;

  const sql = `
    SELECT b.title, b.author, i.issue_date, i.return_date
    FROM issue i
    JOIN books b ON i.book_id = b.id
    WHERE i.user_id = ?
  `;

  db.query(sql, [userId], (err, results) => res.json(results));
});

// ================= SERVER =================
app.listen(3000, () => console.log('Server running on port 3000'));