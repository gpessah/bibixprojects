// Run this once on the server to create the first admin user:
//   node create-admin.js <email> <password> <name>
// Example:
//   node create-admin.js admin@example.com MyPassword123 "Admin User"

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { Database: WasmDatabase } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data/monday.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new WasmDatabase(DB_PATH);

const email    = process.argv[2] || 'admin@bibix.com';
const password = process.argv[3] || 'Admin1234!';
const name     = process.argv[4] || 'Admin';

// Check if user already exists
const existing = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get([email]);
if (existing) {
  // Just make sure they are admin
  db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run([email]);
  console.log(`✅ User already exists — role set to admin`);
  console.log(`   Email: ${email}`);
} else {
  const id           = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  const avatarColor  = '#4F46E5';

  db.prepare('INSERT INTO users (id, name, email, password_hash, avatar_color, role) VALUES (?, ?, ?, ?, ?, ?)')
    .run([id, name, email, passwordHash, avatarColor, 'admin']);

  const wsId = uuidv4();
  db.prepare('INSERT INTO workspaces (id, name, description, created_by) VALUES (?, ?, ?, ?)')
    .run([wsId, `${name}'s Workspace`, 'Main workspace', id]);
  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
    .run([wsId, id, 'owner']);

  console.log(`✅ Admin user created successfully!`);
  console.log(`   Name:     ${name}`);
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Role:     admin`);
}

db.close();
