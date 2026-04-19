require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const db = require("./db");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();

// ================= TRUST PROXY =================
app.set("trust proxy", 1);

// ================= MIDDLEWARE =================
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// 🔥 SESSION FIXED
app.use(
  session({
    secret: "library-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 3600000,
      httpOnly: true,
      secure: false
    }
  })
);

// ================= FILE UPLOAD =================
const storage = multer.diskStorage({
  destination: "./public/images/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ================= ROLE CHECK =================
function checkRole(role) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect("/login.html");
    }

    if (req.session.user.role !== role) {
      return res.redirect("/index.html");
    }

    next();
  };
}

// ================= AUTH PAGES =================
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login.html"));
});

// ================= USER SESSION API =================
app.get("/api/user", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
  }
  res.json(req.session.user);
});

// ================= HOME ROUTE =================
app.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");
  res.redirect("/index.html");
});

app.get("/index.html", (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================= ADMIN PAGES =================
app.get("/add.html", checkRole("admin"), (req, res) => {
  res.sendFile(path.join(__dirname, "public", "add.html"));
});

app.get("/books.html", checkRole("admin"), (req, res) => {
  res.sendFile(path.join(__dirname, "public", "books.html"));
});

app.get("/admin-reports.html", checkRole("admin"), (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-reports.html"));
});

// ================= REGISTER =================
app.post("/register", async (req, res) => {
  const { name, email, password, role } = req.body;

  db.query("SELECT * FROM users WHERE email=?", [email], async (err, results) => {
    if (err) return res.status(500).json({ message: "DB error" });

    if (results && results.length > 0) {
      return res.json({ message: "User already exists" });
    }

    const hash = await bcrypt.hash(password, 10);

    db.query(
      "INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)",
      [name, email, hash, role],
      () => res.json({ message: "Registered successfully" })
    );
  });
});

// ================= LOGIN (FIXED FINAL VERSION) =================
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM users WHERE email=?', [email], async (err, results) => {

    if (err) {
      console.log("DB ERROR:", err);   // ⭐ IMPORTANT
      return res.status(500).json({ message: "DB error" });
    }

    if (!results || results.length === 0) {
      return res.status(401).json({ message: 'Invalid user' });
    }

    const user = results[0];

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ message: 'Wrong password' });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      role: user.role
    };

    req.session.save(() => {
      res.json({
        message: 'Login success',
        user: req.session.user
      });
    });
  });
});

// ================= BOOKS =================
app.get("/api/books", (req, res) => {
  const sql = `
    SELECT b.*,
    CASE WHEN i.id IS NULL THEN 0 ELSE 1 END AS issued
    FROM books b
    LEFT JOIN issue i
    ON b.id = i.book_id AND i.return_date IS NULL
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json([]);
    res.json(results);
  });
});

// ================= ADD BOOK =================
app.post("/api/books", checkRole("admin"), upload.single("image"), (req, res) => {
  const image = req.file ? "/images/" + req.file.filename : req.body.imageUrl;

  db.query(
    "INSERT INTO books (title,author,description,image,available) VALUES (?,?,?,?,1)",
    [req.body.title, req.body.author, req.body.description, image],
    () => res.json({ message: "Book Added" })
  );
});

// ================= ISSUE BOOK =================
app.post("/api/issue", checkRole("admin"), (req, res) => {
  const { user_id, book_id } = req.body;

  db.query("SELECT * FROM users WHERE id=?", [user_id], (err, user) => {
    if (err) return res.status(500).json({ message: "DB error" });

    if (!user || user.length === 0) {
      return res.json({ message: "Invalid User ID" });
    }

    db.query(
      "SELECT * FROM issue WHERE book_id=? AND return_date IS NULL",
      [book_id],
      (err, issue) => {
        if (issue && issue.length > 0) {
          return res.json({ message: "Book already issued" });
        }

        db.query(
          "INSERT INTO issue (book_id, user_id, issue_date) VALUES (?,?,CURDATE())",
          [book_id, user_id],
          () => res.json({ message: "Book Issued Successfully" })
        );
      }
    );
  });
});

// ================= RETURN BOOK =================
app.put("/api/return/:id", checkRole("admin"), (req, res) => {
  db.query(
    "UPDATE issue SET return_date=CURDATE() WHERE book_id=? AND return_date IS NULL",
    [req.params.id],
    () => res.json({ message: "Returned Successfully" })
  );
});

// ================= ADMIN REPORT =================
app.get("/api/admin/issues", checkRole("admin"), (req, res) => {
  const sql = `
    SELECT u.id as user_id, u.name, u.email,
           b.title, b.author, b.id as book_id,
           i.issue_date, i.return_date
    FROM issue i
    JOIN users u ON i.user_id = u.id
    JOIN books b ON i.book_id = b.id
    ORDER BY i.issue_date DESC
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json([]);
    res.json(results);
  });
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});