const path = require("path");
const fs = require("fs");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");

const app = express();
const PORT = 4000;

// --- Middleware ---
app.use(express.json());

// Serve static frontend
const frontendPath = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

// Uploads (timetable) setup
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });
app.use("/uploads", express.static(uploadDir));

// --- Database setup ---
const dbPath = path.join(__dirname, "mess.db");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");

  db.run(
    `CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'admin'))
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      meal TEXT NOT NULL CHECK(meal IN ('breakfast','lunch','dinner')),
      will_attend INTEGER NOT NULL DEFAULT 1,
      UNIQUE(student_id, date, meal),
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      rating INTEGER,
      message TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS timetable (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    )`
  );

  // Seed demo users if table empty
  db.get("SELECT COUNT(*) as count FROM students", (err, row) => {
    if (err) {
      console.error("Error counting students:", err);
      return;
    }
    if (row.count === 0) {
      const stmt = db.prepare(
        "INSERT INTO students (name, email, password, role) VALUES (?,?,?,?)"
      );
      stmt.run("Demo Student", "student@college.edu", "student123", "student");
      stmt.run("Mess Admin", "admin@college.edu", "admin123", "admin");
      stmt.finalize();
      console.log("Seeded demo users:");
      console.log("Student -> student@college.edu / student123");
      console.log("Admin   -> admin@college.edu / admin123");
    }
  });
});

// Utility: today's date YYYY-MM-DD
function today() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// --- Routes ---

// Login
app.post("/api/login", (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password || !role) {
    return res.status(400).json({ error: "Email, password and role required." });
  }

  db.get(
    "SELECT id, name, email, role, password FROM students WHERE email = ? AND role = ?",
    [email, role],
    (err, user) => {
      if (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: "Internal server error" });
      }
      if (!user || user.password !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    }
  );
});

// Get student attendance for a date
app.get("/api/student/:id/attendance", (req, res) => {
  const studentId = Number(req.params.id);
  const date = req.query.date || today();
  if (!studentId) return res.status(400).json({ error: "Invalid student id" });

  db.all(
    "SELECT meal, will_attend FROM attendance WHERE student_id = ? AND date = ?",
    [studentId, date],
    (err, rows) => {
      if (err) {
        console.error("Attendance fetch error:", err);
        return res.status(500).json({ error: "Internal server error" });
      }
      const state = { breakfast: true, lunch: true, dinner: true };
      rows.forEach((r) => {
        state[r.meal] = Boolean(r.will_attend);
      });
      res.json({ date, state });
    }
  );
});

// Update single meal attendance
app.post("/api/student/:id/attendance", (req, res) => {
  const studentId = Number(req.params.id);
  const { meal, willAttend, date } = req.body || {};
  const targetDate = date || today();

  if (!studentId || !meal || typeof willAttend !== "boolean") {
    return res.status(400).json({ error: "studentId, meal and willAttend required" });
  }

  db.run(
    `INSERT INTO attendance (student_id, date, meal, will_attend)
     VALUES (?,?,?,?)
     ON CONFLICT(student_id, date, meal)
     DO UPDATE SET will_attend = excluded.will_attend`,
    [studentId, targetDate, meal, willAttend ? 1 : 0],
    function (err) {
      if (err) {
        console.error("Attendance update error:", err);
        return res.status(500).json({ error: "Internal server error" });
      }
      res.json({ success: true });
    }
  );
});

// Submit feedback
app.post("/api/feedback", (req, res) => {
  const { studentId, rating, message } = req.body || {};
  if (!studentId || (!rating && !message)) {
    return res
      .status(400)
      .json({ error: "studentId and rating or message required" });
  }

  const createdAt = new Date().toISOString();
  db.run(
    "INSERT INTO feedback (student_id, rating, message, created_at) VALUES (?,?,?,?)",
    [studentId, rating || null, message || null, createdAt],
    function (err) {
      if (err) {
        console.error("Feedback insert error:", err);
        return res.status(500).json({ error: "Internal server error" });
      }
      res.json({ success: true });
    }
  );
});

// Admin summary
app.get("/api/admin/summary", (req, res) => {
  const date = req.query.date || today();

  db.all(
    `SELECT meal, COUNT(*) as count
     FROM attendance
     WHERE date = ? AND will_attend = 1
     GROUP BY meal`,
    [date],
    (err, rows) => {
      if (err) {
        console.error("Summary attendance error:", err);
        return res.status(500).json({ error: "Internal server error" });
      }

      const counts = { breakfast: 0, lunch: 0, dinner: 0 };
      rows.forEach((r) => {
        counts[r.meal] = r.count;
      });

      db.all(
        `SELECT f.id, f.rating, f.message, f.created_at, s.name
         FROM feedback f
         JOIN students s ON s.id = f.student_id
         ORDER BY f.created_at DESC
         LIMIT 20`,
        [],
        (err2, feedbackRows) => {
          if (err2) {
            console.error("Summary feedback error:", err2);
            return res.status(500).json({ error: "Internal server error" });
          }
          res.json({
            date,
            counts,
            feedback: feedbackRows,
          });
        }
      );
    }
  );
});

// Upload mess timetable (admin)
app.post("/api/admin/timetable", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const { filename, originalname } = req.file;
  const uploadedAt = new Date().toISOString();

  db.run(
    "INSERT INTO timetable (file_name, original_name, uploaded_at) VALUES (?,?,?)",
    [filename, originalname, uploadedAt],
    function (err) {
      if (err) {
        console.error("Timetable insert error:", err);
        return res.status(500).json({ error: "Internal server error" });
      }
      res.json({
        success: true,
        url: `/uploads/${filename}`,
        originalName: originalname,
        uploadedAt,
      });
    }
  );
});

// Get latest mess timetable (student/admin)
app.get("/api/timetable", (req, res) => {
  db.get(
    "SELECT file_name, original_name, uploaded_at FROM timetable ORDER BY uploaded_at DESC LIMIT 1",
    [],
    (err, row) => {
      if (err) {
        console.error("Timetable fetch error:", err);
        return res.status(500).json({ error: "Internal server error" });
      }
      if (!row) {
        return res.json({ url: null });
      }
      res.json({
        url: `/uploads/${row.file_name}`,
        originalName: row.original_name,
        uploadedAt: row.uploaded_at,
      });
    }
  );
});

// Fallback to index.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

