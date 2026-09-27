const Database = require("better-sqlite3");

const db = new Database("sadhana.db");

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mobile TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    seat_number TEXT,
    fee_status TEXT DEFAULT 'Pending',
    attendance INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    utr TEXT,
    status TEXT DEFAULT 'Pending',
    payment_month TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    attendance_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Absent',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, attendance_date)
  );
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Existing database में payment_month column नहीं है तो add करें
try {
  db.prepare(`
    ALTER TABLE payments
    ADD COLUMN payment_month TEXT
  `).run();

  console.log("payment_month column added.");

} catch (error) {

  // Column पहले से मौजूद है तो कुछ नहीं करना
  if (!error.message.includes("duplicate column name")) {
    throw error;
  }

}
// पुराने payments का month उनके created_at से भरें
db.prepare(`
  UPDATE payments
  SET payment_month = substr(created_at, 1, 7)
  WHERE payment_month IS NULL
`).run();
console.log("Sadhana Library database ready.");

db.close();