const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const AVATAR_COLORS = ['#0073ea','#e2445c','#00c875','#ffcb00','#a25ddc','#037f4c','#bb3354','#ff642e','#9aadbd'];

// List all users
router.get('/users', authenticate, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, name, email, avatar_color, role, permissions, created_at FROM users ORDER BY created_at ASC').all();
  res.json(users.map(u => ({ ...u, permissions: JSON.parse(u.permissions || '{}') })));
});

// Update permissions for a user
router.put('/users/:id/permissions', authenticate, requireAdmin, (req, res) => {
  const { permissions } = req.body;
  if (!permissions || typeof permissions !== 'object') return res.status(400).json({ error: 'permissions object required' });
  db.prepare('UPDATE users SET permissions = ? WHERE id = ?').run(JSON.stringify(permissions), req.params.id);
  const user = db.prepare('SELECT id, name, email, avatar_color, role, permissions, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ ...user, permissions: JSON.parse(user.permissions || '{}') });
});

// Create user
router.post('/users', authenticate, requireAdmin, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  const validRoles = ['admin', 'user', 'readonly'];
  const userRole = validRoles.includes(role) ? role : 'user';

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  const id = uuidv4();
  const password_hash = bcrypt.hashSync(password, 10);
  const avatar_color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  db.prepare('INSERT INTO users (id, name, email, password_hash, avatar_color, role) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, email, password_hash, avatar_color, userRole);

  res.json(db.prepare('SELECT id, name, email, avatar_color, role, created_at FROM users WHERE id = ?').get(id));
});

// Update user
router.put('/users/:id', authenticate, requireAdmin, (req, res) => {
  const { name, email, role, password, avatar_color } = req.body;
  const validRoles = ['admin', 'user', 'readonly'];
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  let password_hash = user.password_hash;
  if (password) password_hash = bcrypt.hashSync(password, 10);

  db.prepare(`UPDATE users SET
    name = COALESCE(?, name),
    email = COALESCE(?, email),
    role = COALESCE(?, role),
    avatar_color = COALESCE(?, avatar_color),
    password_hash = ?
    WHERE id = ?`)
    .run(name || null, email || null,
      validRoles.includes(role) ? role : null,
      avatar_color || null,
      password_hash,
      req.params.id);

  res.json(db.prepare('SELECT id, name, email, avatar_color, role, created_at FROM users WHERE id = ?').get(req.params.id));
});

// Delete user
router.delete('/users/:id', authenticate, requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Promote first registered user to admin (self-service for initial setup)
router.post('/promote-self', authenticate, (req, res) => {
  const count = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get();
  if (count.c > 0) return res.status(403).json({ error: 'Admin already exists' });
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(req.user.id);
  res.json({ success: true });
});

module.exports = router;
