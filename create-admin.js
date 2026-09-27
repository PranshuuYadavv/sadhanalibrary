const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const db = new Database("sadhana.db");

const username = "deveshadmin";
const password = "Devesh@123";

const hashedPassword = bcrypt.hashSync(password, 12);

const existing = db
  .prepare("SELECT id FROM admins WHERE username = ?")
  .get(username);

if (existing) {
  console.log("Admin already exists.");
} else {
  db.prepare(`
    INSERT INTO admins (name, username, password)
    VALUES (?, ?, ?)
  `).run("Devesh Pandey", username, hashedPassword);

  console.log("Admin created successfully.");
  console.log("Username:", username);
  console.log("Temporary password:", password);
}

db.close();