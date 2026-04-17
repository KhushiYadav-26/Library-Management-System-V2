// server.js

const express = require('express');
const bodyParser = require('body-parser');
const db = require('./db'); // MySQL connection
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();

// middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// session setup
app.use(session({
  secret: 'library-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 3600000 }
}));

// file upload config
const storage = multer.diskStorage({
  destination: './public/images/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// role check middleware
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

// pages
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/index.html', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// admin pages
app.get('/add.html', checkRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'add.html'));
});

app.get('/books.html', checkRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'books.html'));
});

// register
app.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;

  db.query('SELECT * FROM users WHERE email=?', [email], async (err, results) => {
    if (results.length > 0) return res.status(400).json({ error: 'User exists' });

    const hash = await bcrypt.hash(password, 10);

    db.query(
      'INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)',
      [name, email, hash, role],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Registered' });
      }
    );
  });
});

// login
app.post('/login', (req, res) => {
  const { email, password, role } = req.body;

  db.query('SELECT * FROM users WHERE email=? AND role=?', [email, role], async (err, results) => {
    if (results.length === 0) return res.status(400).json({ error: 'Invalid user' });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Wrong password' });

    req.session.user = { id: user.id, name: user.name, role: user.role };
    res.json({ message: 'Login success' });
  });
});

// books
app.get('/api/books', (req, res) => {
  db.query('SELECT * FROM books', (err, results) => {
    res.json(results);
  });
});

app.get('/api/books/search', (req, res) => {
  const q = req.query.q || '';
  db.query(
    'SELECT * FROM books WHERE title LIKE ? OR author LIKE ?',
    [`%${q}%`, `%${q}%`],
    (err, results) => res.json(results)
  );
});

app.get('/api/books/:id', (req, res) => {
  db.query('SELECT * FROM books WHERE id=?', [req.params.id], (err, results) => {
    res.json(results[0]);
  });
});

// add book
app.post('/api/books', checkRole('admin'), upload.single('image'), (req, res) => {
  const image = req.file ? '/images/' + req.file.filename : req.body.imageUrl;

  db.query(
    'INSERT INTO books (title,author,description,image,available) VALUES (?,?,?,?,1)',
    [req.body.title, req.body.author, req.body.description, image],
    (err) => res.json({ message: 'Book Added' })
  );
});

// update book
app.put('/api/books/:id', checkRole('admin'), upload.single('image'), (req, res) => {
  const image = req.file ? '/images/' + req.file.filename : req.body.imageUrl;

  db.query(
    'UPDATE books SET title=?,author=?,description=?,image=? WHERE id=?',
    [req.body.title, req.body.author, req.body.description, image, req.params.id],
    () => res.json({ message: 'Updated' })
  );
});

// delete book
app.delete('/api/books/:id', checkRole('admin'), (req, res) => {
  db.query('DELETE FROM books WHERE id=?', [req.params.id], () => {
    res.json({ message: 'Deleted' });
  });
});

// issue book
app.put('/api/issue/:id', checkRole('admin'), (req, res) => {
  db.query('UPDATE books SET available=0 WHERE id=?', [req.params.id]);
  db.query('INSERT INTO issue (book_id,issue_date) VALUES (?,CURDATE())', [req.params.id]);
  res.json({ message: 'Issued' });
});

// return book
app.put('/api/return/:id', checkRole('admin'), (req, res) => {
  db.query('UPDATE books SET available=1 WHERE id=?', [req.params.id]);
  db.query('UPDATE issue SET return_date=CURDATE() WHERE book_id=? AND return_date IS NULL', [req.params.id]);
  res.json({ message: 'Returned' });
});

// server start
app.listen(3000, () => console.log('Server running')); 