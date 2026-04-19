require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const db = require("./db");
const multer = require("multer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cloudinary = require("./cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();

app.set("trust proxy", 1);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

const JWT_SECRET = process.env.JWT_SECRET || "library-secret-key";

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "library_books",
    allowed_formats: ["jpg", "png", "jpeg"]
  }
});

const upload = multer({ storage });

function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: "No token provided" });

  try {
    const token = auth.split(" ")[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

function checkRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    if (req.user.role !== role) {
      return res.status(403).json({ message: "Wrong role access" });
    }
    next();
  };
}

app.get("/login", (req, res) => {
  res.sendFile(__dirname + "/public/login.html");
});

app.get("/register", (req, res) => {
  res.sendFile(__dirname + "/public/register.html");
});

app.post("/register", async (req, res) => {
  const { name, email, password, role } = req.body;

  db.query("SELECT * FROM users WHERE email=?", [email], async (err, r) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (r.length) return res.status(400).json({ message: "User already exists" });

    const hash = await bcrypt.hash(password, 10);

    db.query(
      "INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)",
      [name, email, hash, role || "student"],
      () => res.json({ message: "Registered successfully" })
    );
  });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE email=?", [email], async (err, r) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (!r.length) return res.status(401).json({ message: "Invalid user" });

    const user = r[0];

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Wrong password" });

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role
      }
    });
  });
});

app.get("/api/user", verifyToken, (req, res) => {
  res.json(req.user);
});

app.get("/api/books", verifyToken, (req, res) => {
  const sql = `
    SELECT b.*,
    CASE WHEN i.id IS NULL THEN 0 ELSE 1 END AS issued
    FROM books b
    LEFT JOIN issue i
    ON b.id = i.book_id AND i.return_date IS NULL
  `;

  db.query(sql, (err, r) => {
    if (err) return res.status(500).json([]);
    res.json(r);
  });
});

app.get("/api/books/:id", verifyToken, (req, res) => {
  db.query("SELECT * FROM books WHERE id=?", [req.params.id], (err, r) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (!r.length) return res.status(404).json({ message: "Not found" });
    res.json(r[0]);
  });
});

app.post("/api/books", verifyToken, checkRole("admin"), upload.single("image"), (req, res) => {
  const image = req.file ? req.file.path : req.body.imageUrl;

  db.query(
    "INSERT INTO books (title,author,description,image,available) VALUES (?,?,?,?,1)",
    [req.body.title, req.body.author, req.body.description, image],
    () => res.json({ message: "Book Added" })
  );
});

app.put("/api/books/:id", verifyToken, checkRole("admin"), upload.single("image"), (req, res) => {
  const image = req.file ? req.file.path : req.body.imageUrl;

  db.query(
    "UPDATE books SET title=?, author=?, description=?, image=? WHERE id=?",
    [req.body.title, req.body.author, req.body.description, image, req.params.id],
    () => res.json({ message: "Book Updated" })
  );
});

app.delete("/api/books/:id", verifyToken, checkRole("admin"), (req, res) => {
  db.query("DELETE FROM books WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ message: "Delete failed" });
    res.json({ message: "Deleted successfully" });
  });
});

app.post("/api/issue", verifyToken, checkRole("admin"), (req, res) => {
  const { user_id, book_id } = req.body;

  db.query("SELECT * FROM users WHERE id=?", [user_id], (err, u) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (!u.length) return res.status(400).json({ message: "Invalid User ID" });

    db.query(
      "SELECT * FROM issue WHERE book_id=? AND return_date IS NULL",
      [book_id],
      (err, i) => {
        if (i.length) return res.status(400).json({ message: "Book already issued" });

        db.query(
          "INSERT INTO issue (book_id,user_id,issue_date) VALUES (?,?,CURDATE())",
          [book_id, user_id],
          () => res.json({ message: "Book Issued Successfully" })
        );
      }
    );
  });
});

app.put("/api/return/:id", verifyToken, checkRole("admin"), (req, res) => {
  db.query(
    "UPDATE issue SET return_date=CURDATE() WHERE book_id=? AND return_date IS NULL",
    [req.params.id],
    () => res.json({ message: "Returned Successfully" })
  );
});

app.get("/api/admin/issues", verifyToken, checkRole("admin"), (req, res) => {
  const sql = `
    SELECT u.id as user_id, u.name, u.email,
           b.title, b.author, b.id as book_id,
           i.issue_date, i.return_date
    FROM issue i
    JOIN users u ON i.user_id = u.id
    JOIN books b ON i.book_id = b.id
    ORDER BY i.issue_date DESC
  `;

  db.query(sql, (err, r) => {
    if (err) return res.status(500).json([]);
    res.json(r);
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});