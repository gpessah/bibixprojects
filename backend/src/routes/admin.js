const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate, requireAdmin, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

const AVATAR_COLORS = ['#0073ea','#e2445c','#00c875','#ffcb00','#a25ddc','#037f4c','#bb3354','#ff642e','#9aadbd'];

// ── List users ─────────────────────────────────────────────────────────────────
// super_admin: all users with workspace count
// admin: only users sharing at least one workspace with the caller
router.get('/users', authenticate, requireAdmin, (req, res) => {
  const caller = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);

  if (caller.role === 'super_admin') {
    const users = db.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_color, u.role, u.permissions, u.created_at,
             COUNT(DISTINCT wm.workspace_id) AS workspace_count
      FROM users u
      LEFT JOIN workspace_members wm ON wm.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at ASC
    `).all();
    return res.json(users.map(u => ({ ...u, permissions: JSON.parse(u.permissions || '{}') })));
  }

  // plain admin — only users in shared workspaces
  const users = db.prepare(`
    SELECT DISTINCT u.id, u.name, u.email, u.avatar_color, u.role, u.permissions, u.created_at,
           COUNT(DISTINCT wm2.workspace_id) AS workspace_count
    FROM users u
    JOIN workspace_members wm ON wm.user_id = u.id
    LEFT JOIN workspace_members wm2 ON wm2.user_id = u.id
    WHERE wm.workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = ?
    )
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `).all(req.user.id);
  res.json(users.map(u => ({ ...u, permissions: JSON.parse(u.permissions || '{}') })));
});

// ── Change a user's role (super_admin only) ────────────────────────────────────
// Valid promotions: super_admin can set role to 'admin', 'member', or 'super_admin'
// Cannot demote another super_admin (safety: only the caller themselves can do that)
router.put('/users/:id/role', authenticate, requireSuperAdmin, (req, res) => {
  const { role } = req.body;
  const validRoles = ['super_admin', 'admin', 'user', 'readonly'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
  }

  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  // Prevent demoting another super_admin (must use /setup to re-promote)
  if (target.role === 'super_admin' && target.id !== req.user.id && role !== 'super_admin') {
    return res.status(403).json({ error: 'Cannot demote another super_admin' });
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  const updated = db.prepare('SELECT id, name, email, avatar_color, role, created_at FROM users WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ── Update permissions for a user (admin or super_admin) ──────────────────────
router.put('/users/:id/permissions', authenticate, requireAdmin, (req, res) => {
  const { permissions } = req.body;
  if (!permissions || typeof permissions !== 'object') return res.status(400).json({ error: 'permissions object required' });
  db.prepare('UPDATE users SET permissions = ? WHERE id = ?').run(JSON.stringify(permissions), req.params.id);
  const user = db.prepare('SELECT id, name, email, avatar_color, role, permissions, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ ...user, permissions: JSON.parse(user.permissions || '{}') });
});

// ── Create user (super_admin only) ────────────────────────────────────────────
router.post('/users', authenticate, requireSuperAdmin, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  const validRoles = ['super_admin', 'admin', 'user', 'readonly'];
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

// ── Update user (super_admin only) ────────────────────────────────────────────
router.put('/users/:id', authenticate, requireSuperAdmin, (req, res) => {
  const { name, email, role, password, avatar_color } = req.body;
  const validRoles = ['super_admin', 'admin', 'user', 'readonly'];
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

// ── Delete user (super_admin only) ────────────────────────────────────────────
router.delete('/users/:id', authenticate, requireSuperAdmin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id);
  if (target && target.role === 'super_admin') {
    return res.status(403).json({ error: 'Cannot delete a super_admin account' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Promote self to admin if no admin exists (self-service initial setup) ──────
router.post('/promote-self', authenticate, (req, res) => {
  const count = db.prepare("SELECT COUNT(*) as c FROM users WHERE role IN ('admin', 'super_admin')").get();
  if (count.c > 0) return res.status(403).json({ error: 'Admin already exists' });
  db.prepare("UPDATE users SET role = 'super_admin' WHERE id = ?").run(req.user.id);
  res.json({ success: true });
});

module.exports = router;
