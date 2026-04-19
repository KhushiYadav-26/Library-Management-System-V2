require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const db = require("./db");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();

app.set("trust proxy", 1);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

const JWT_SECRET = process.env.JWT_SECRET || "library-secret-key";


const storage = multer.diskStorage({
  destination: "./public/images/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });


function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

/* ROLE CHECK */
function checkRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    if (req.user.role !== role) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}


app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});


app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});


app.post("/register", async (req, res) => {
  const { name, email, password, role } = req.body;

  db.query("SELECT * FROM users WHERE email=?", [email], async (err, results) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (results.length > 0) return res.json({ message: "User already exists" });

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

  db.query("SELECT * FROM users WHERE email=?", [email], async (err, results) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (!results || results.length === 0)
      return res.status(401).json({ message: "Invalid user" });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) return res.status(401).json({ message: "Wrong password" });

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login success",
      token,
      user: { id: user.id, name: user.name, role: user.role }
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

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json([]);
    res.json(results);
  });
});


app.post(
  "/api/books",
  verifyToken,
  checkRole("admin"),
  upload.single("image"),
  (req, res) => {
    const image = req.file ? "/images/" + req.file.filename : req.body.imageUrl;

    db.query(
      "INSERT INTO books (title,author,description,image,available) VALUES (?,?,?,?,1)",
      [req.body.title, req.body.author, req.body.description, image],
      () => res.json({ message: "Book Added" })
    );
  }
);


app.post("/api/issue", verifyToken, checkRole("admin"), (req, res) => {
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


app.put("/api/return/:id", verifyToken, checkRole("admin"), (req, res) => {
  db.query(
    "UPDATE issue SET return_date=CURDATE() WHERE book_id=? AND return_date IS NULL",
    [req.params.id],
    () => res.json({ message: "Returned Successfully" })
  );
});

/* ADMIN REPORT */
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

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json([]);
    res.json(results);
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});