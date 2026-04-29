const bcrypt = require('bcryptjs');
const { Database: WasmDatabase } = require('node-sqlite3-wasm');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data/monday.db');
const db = new WasmDatabase(DB_PATH);

const email = process.argv[2] || 'scopedomains@gmail.com';
const newPassword = process.argv[3] || 'Admin1234!';

const hash = bcrypt.hashSync(newPassword, 10);

const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE email = ?');
const result = stmt.run([hash, email]);

if (result.changes === 0) {
  console.log(`❌ No user found with email: ${email}`);
} else {
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE email = ?').get([email]);
  console.log(`✅ Password reset successfully!`);
  console.log(`   User: ${user.name} (${user.email})`);
  console.log(`   New password: ${newPassword}`);
}

db.close();
