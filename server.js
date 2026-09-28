const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
require("dotenv").config();

const app = express();
const PORT = 3000;

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error(
    "SESSION_SECRET must be set and at least 32 characters long."
  );
}

const db = new Database("sadhana.db");

db.exec(`
  const adminExists = db
  .prepare("SELECT id FROM admins LIMIT 1")
  .get();

if (!adminExists) {
  const hashedPassword = bcrypt.hashSync("devesh@123", 12);

  db.prepare(`
    INSERT INTO admins (username, password)
    VALUES (?, ?)
  `).run("devesh", hashedPassword);
}
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mobile TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);
`);
// ===============================
// IST DATE
// ===============================

function getTodayIST() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const year = parts.find(p => p.type === "year").value;
  const month = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;

  return `${year}-${month}-${day}`;
}


// ===============================
// MIDDLEWARE
// ===============================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 4
    }
  })
);

app.use(express.static("public"));


// ===============================
// HOME
// ===============================

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});


// ===============================
// ADMIN LOGIN
// ===============================
// ADMIN LOGIN PAGE
app.get("/admin-login", (req, res) => {
  res.sendFile(__dirname + "/public/admin-login.html");
});
app.post("/admin-login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.send("Username और password दोनों भरें।");
  }

  const admin = db
    .prepare("SELECT * FROM admins WHERE username = ?")
    .get(username);

  if (!admin) {
    return res.send("Invalid username या password.");
  }

  const passwordMatch = bcrypt.compareSync(password, admin.password);

  if (!passwordMatch) {
    return res.send("Invalid username या password.");
  }

  req.session.adminId = admin.id;
  req.session.adminName = admin.name;

  res.redirect("/admin-dashboard.html");
});


// ===============================
// ADMIN AUTH CHECK
// ===============================

app.get("/api/admin/me", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({
      loggedIn: false
    });
  }

  res.json({
    loggedIn: true,
    name: req.session.adminName
  });
});


// ===============================
// ADMIN LOGOUT
// ===============================

app.get("/admin-logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin-login.html");
  });
});


// ===============================
// STUDENT MANAGEMENT
// ===============================

// Get all students
app.get("/api/students", (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const students = db
    .prepare(`
      SELECT
        id,
        name,
        mobile,
        seat_number,
        fee_status,
        attendance,
        created_at
      FROM students
      ORDER BY id DESC
    `)
    .all();

  res.json(students);
});


// Add new student
app.post("/api/students", (req, res) => {

  if (!req.session.adminId) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const {
    name,
    mobile,
    password,
    seat_number
  } = req.body;

  if (!name || !mobile || !password) {
    return res.status(400).json({
      error: "Name, mobile और password जरूरी हैं।"
    });
  }

  // Duplicate mobile check
  const existing = db
    .prepare(`
      SELECT id
      FROM students
      WHERE mobile = ?
    `)
    .get(mobile);

  if (existing) {
    return res.status(400).json({
      error: "इस mobile number का student पहले से मौजूद है।"
    });
  }

  // Duplicate seat check
  const seatTaken = seat_number
    ? db
        .prepare(`
          SELECT id
          FROM students
          WHERE seat_number = ?
        `)
        .get(seat_number)
    : null;

  if (seatTaken) {
    return res.status(400).json({
      error: "यह seat पहले से किसी student को दी गई है।"
    });
  }

  const hashedPassword = bcrypt.hashSync(password, 12);

  const result = db
    .prepare(`
      INSERT INTO students
      (name, mobile, password, seat_number)
      VALUES (?, ?, ?, ?)
    `)
    .run(
      name,
      mobile,
      hashedPassword,
      seat_number || null
    );

  res.json({
    success: true,
    studentId: result.lastInsertRowid
  });
});


// Delete student
app.delete("/api/students/:id", (req, res) => {

  if (!req.session.adminId) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const studentId = req.params.id;

  const student = db
    .prepare(`
      SELECT id
      FROM students
      WHERE id = ?
    `)
    .get(studentId);

  if (!student) {
    return res.status(404).json({
      error: "Student नहीं मिला।"
    });
  }

  // Student के payments हटाएँ
  db.prepare(`
    DELETE FROM payments
    WHERE student_id = ?
  `).run(studentId);

  // Student की daily attendance हटाएँ
  db.prepare(`
    DELETE FROM attendance_records
    WHERE student_id = ?
  `).run(studentId);

  // Student हटाएँ
  db.prepare(`
    DELETE FROM students
    WHERE id = ?
  `).run(studentId);

  res.json({
    success: true,
    message: "Student delete हो गया।"
  });
});


// ===============================
// STUDENT LOGIN
// ===============================
// STUDENT LOGIN PAGE
app.get("/student-login", (req, res) => {
  res.sendFile(__dirname + "/public/student-login.html");
});
app.post("/student-login", (req, res) => {
  const { mobile, password } = req.body;

  if (!mobile || !password) {
    return res.send("Mobile और password दोनों भरें।");
  }

  const student = db
    .prepare(`
      SELECT *
      FROM students
      WHERE mobile = ?
    `)
    .get(mobile);

  if (!student) {
    return res.send("Invalid mobile या password.");
  }

  const passwordMatch = bcrypt.compareSync(
    password,
    student.password
  );

  if (!passwordMatch) {
    return res.send("Invalid mobile या password.");
  }

  req.session.studentId = student.id;
  req.session.studentName = student.name;

  res.redirect("/student-dashboard.html");
});


// ===============================
// STUDENT AUTH CHECK
// ===============================

app.get("/api/student/me", (req, res) => {

  if (!req.session.studentId) {
    return res.status(401).json({
      loggedIn: false
    });
  }

  const student = db
    .prepare(`
      SELECT
        id,
        name,
        mobile,
        seat_number,
        fee_status,
        attendance
      FROM students
      WHERE id = ?
    `)
    .get(req.session.studentId);

  if (!student) {
    return res.status(401).json({
      loggedIn: false
    });
  }

  // Current month
  const paymentMonth = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit"
  }).format(new Date());

  // Current month का latest payment
  const currentPayment = db
    .prepare(`
      SELECT status
      FROM payments
      WHERE student_id = ?
      AND payment_month = ?
      ORDER BY id DESC
      LIMIT 1
    `)
    .get(
      req.session.studentId,
      paymentMonth
    );

  // Monthly fee status
  if (currentPayment) {
    student.fee_status = currentPayment.status;
  } else {
    student.fee_status = "Pending";
  }

  res.json({
    loggedIn: true,
    student
  });
});


// ===============================
// STUDENT LOGOUT
// ===============================

app.get("/student-logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/student-login.html");
  });
});


// ===============================
// FEE PAYMENT / UTR
// ===============================

app.post("/api/payments", (req, res) => {

  if (!req.session.studentId) {
    return res.status(401).json({
      error: "Student login required"
    });
  }

  const { amount, utr } = req.body;

  if (!amount || !utr) {
    return res.status(400).json({
      error: "Amount और UTR जरूरी हैं।"
    });
  }

  // Current month: YYYY-MM
  const paymentMonth = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit"
  }).format(new Date());

  // Duplicate UTR check
  const existing = db
    .prepare(`
      SELECT id
      FROM payments
      WHERE utr = ?
    `)
    .get(utr);

  if (existing) {
    return res.status(400).json({
      error: "यह UTR पहले से submit हो चुका है।"
    });
  }

  // Same student + same month में दूसरा payment रोकें
  const monthlyPayment = db
    .prepare(`
      SELECT id
      FROM payments
      WHERE student_id = ?
      AND payment_month = ?
      AND status IN ('Pending', 'Verified')
    `)
    .get(
      req.session.studentId,
      paymentMonth
    );

  if (monthlyPayment) {
    return res.status(400).json({
      error: "इस महीने का payment पहले से submit हो चुका है।"
    });
  }

  db.prepare(`
    INSERT INTO payments
    (student_id, amount, utr, status, payment_month)
    VALUES (?, ?, ?, 'Pending', ?)
  `).run(
    req.session.studentId,
    Number(amount),
    utr,
    paymentMonth
  );

  res.json({
    success: true,
    message: "Payment verification के लिए submit हो गया।"
  });
});


// ===============================
// STUDENT PAYMENT HISTORY
// ===============================

app.get("/api/student/payments", (req, res) => {

  if (!req.session.studentId) {
    return res.status(401).json({
      error: "Student login required"
    });
  }

  const payments = db
    .prepare(`
      SELECT
        id,
        amount,
        utr,
        status,
        payment_month,
        created_at
      FROM payments
      WHERE student_id = ?
      ORDER BY id DESC
    `)
    .all(req.session.studentId);

  res.json({
    success: true,
    payments
  });
});


// ===============================
// ADMIN PAYMENTS
// ===============================

app.get("/api/admin/payments", (req, res) => {

  if (!req.session.adminId) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const payments = db
    .prepare(`
      SELECT
        payments.id,
        payments.amount,
        payments.utr,
        payments.status,
        payments.payment_month,
        payments.created_at,
        students.name,
        students.mobile,
        students.id AS student_id
      FROM payments
      JOIN students
        ON payments.student_id = students.id
      ORDER BY payments.id DESC
    `)
    .all();

  res.json(payments);
});


// ===============================
// VERIFY PAYMENT
// ===============================

app.post("/api/admin/payments/:id/verify", (req, res) => {

  if (!req.session.adminId) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const paymentId = req.params.id;

  const payment = db
    .prepare(`
      SELECT *
      FROM payments
      WHERE id = ?
    `)
    .get(paymentId);

  if (!payment) {
    return res.status(404).json({
      error: "Payment नहीं मिला।"
    });
  }

  db.prepare(`
    UPDATE payments
    SET status = 'Verified'
    WHERE id = ?
  `).run(paymentId);

  // Legacy fee_status भी Paid रखें
  db.prepare(`
    UPDATE students
    SET fee_status = 'Paid'
    WHERE id = ?
  `).run(payment.student_id);

  res.json({
    success: true,
    message: "Payment verify हो गया।"
  });
});


// ===============================
// REJECT PAYMENT
// ===============================

app.post("/api/admin/payments/:id/reject", (req, res) => {

  if (!req.session.adminId) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const paymentId = req.params.id;

  const payment = db
    .prepare(`
      SELECT *
      FROM payments
      WHERE id = ?
    `)
    .get(paymentId);

  if (!payment) {
    return res.status(404).json({
      error: "Payment नहीं मिला।"
    });
  }

  db.prepare(`
    UPDATE payments
    SET status = 'Rejected'
    WHERE id = ?
  `).run(paymentId);

  res.json({
    success: true,
    message: "Payment reject हो गया।"
  });
});


// ===============================
// DAILY ATTENDANCE
// ===============================

app.get("/api/admin/attendance/daily", (req, res) => {
app.get("/api/student/attendance", (req, res) => {
  if (!req.session.studentId) {
    return res.status(401).json({
      error: "Student login required"
    });
  }

  const records = db.prepare(`
    SELECT
      attendance_date,
      status
    FROM attendance_records
    WHERE student_id = ?
    ORDER BY attendance_date DESC
    LIMIT 30
  `).all(req.session.studentId);

  const total = records.length;
  const present = records.filter(
    record => record.status === "Present"
  ).length;

  const absent = records.filter(
    record => record.status === "Absent"
  ).length;

  const percentage = total
    ? Math.round((present / total) * 100)
    : 0;

  res.json({
    success: true,
    summary: {
      total,
      present,
      absent,
      percentage
    },
    records
  });
});
  if (!req.session.adminId) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const date = req.query.date || getTodayIST();

  const students = db
    .prepare(`
      SELECT
        students.id,
        students.name,
        students.mobile,
        students.seat_number,
        COALESCE(
          attendance_records.status,
          'Absent'
        ) AS status
      FROM students
      LEFT JOIN attendance_records
        ON attendance_records.student_id = students.id
        AND attendance_records.attendance_date = ?
      ORDER BY
        students.seat_number ASC,
        students.id ASC
    `)
    .all(date);

  res.json({
    date,
    students
  });
});


app.post("/api/admin/attendance/daily", (req, res) => {

  if (!req.session.adminId) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const {
    student_id,
    attendance_date,
    status
  } = req.body;

  if (!student_id || !attendance_date || !status) {
    return res.status(400).json({
      error: "Student, date और status जरूरी हैं।"
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendance_date)) {
    return res.status(400).json({
      error: "Invalid date format."
    });
  }

  if (!["Present", "Absent"].includes(status)) {
    return res.status(400).json({
      error: "Status केवल Present या Absent हो सकता है।"
    });
  }

  const student = db
    .prepare(`
      SELECT id
      FROM students
      WHERE id = ?
    `)
    .get(student_id);

  if (!student) {
    return res.status(404).json({
      error: "Student नहीं मिला।"
    });
  }

  db.prepare(`
    INSERT INTO attendance_records
    (student_id, attendance_date, status)
    VALUES (?, ?, ?)
    ON CONFLICT(student_id, attendance_date)
    DO UPDATE SET status = excluded.status
  `).run(
    student_id,
    attendance_date,
    status
  );

  res.json({
    success: true,
    message: "Daily attendance save हो गई।"
  });
});


// ===============================
// OLD ATTENDANCE API
// ===============================

app.get("/api/admin/attendance", (req, res) => {

  if (!req.session.adminId) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const students = db
    .prepare(`
      SELECT
        id,
        name,
        mobile,
        seat_number,
        attendance
      FROM students
      ORDER BY seat_number ASC
    `)
    .all();

  res.json(students);
});


app.post("/api/admin/attendance/:id", (req, res) => {

  if (!req.session.adminId) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const studentId = req.params.id;
  const { attendance } = req.body;

  if (attendance === undefined) {
    return res.status(400).json({
      error: "Attendance value जरूरी है।"
    });
  }

  db.prepare(`
    UPDATE students
    SET attendance = ?
    WHERE id = ?
  `).run(
    Number(attendance),
    studentId
  );

  res.json({
    success: true,
    message: "Attendance update हो गई।"
  });
});


// ===============================
// NOTICES
// ===============================

// Get notices
app.get("/api/notices", (req, res) => {

  const notices = db
    .prepare(`
      SELECT
        id,
        title,
        message,
        created_at
      FROM notices
      ORDER BY id DESC
    `)
    .all();

  res.json(notices);
});


// Add notice
app.post("/api/admin/notices", (req, res) => {

  if (!req.session.adminId) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const { title, message } = req.body;

  if (!title || !message) {
    return res.status(400).json({
      error: "Title और message जरूरी हैं।"
    });
  }

  const result = db
    .prepare(`
      INSERT INTO notices
      (title, message)
      VALUES (?, ?)
    `)
    .run(
      title,
      message
    );

  res.json({
    success: true,
    noticeId: result.lastInsertRowid
  });
});


// Delete notice
app.delete("/api/admin/notices/:id", (req, res) => {

  if (!req.session.adminId) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const noticeId = req.params.id;

  const result = db
    .prepare(`
      DELETE FROM notices
      WHERE id = ?
    `)
    .run(noticeId);

  if (result.changes === 0) {
    return res.status(404).json({
      error: "Notice नहीं मिला।"
    });
  }

  res.json({
    success: true,
    message: "Notice delete हो गया।"
  });
});


// ===============================
// SERVER START
// ===============================

app.listen(PORT, () => {
  console.log(
    `Sadhana Library server running on http://localhost:${PORT}`
  );
});