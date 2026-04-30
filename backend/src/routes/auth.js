const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const AVATAR_COLORS = ['#0073ea','#e2445c','#00c875','#ffcb00','#a25ddc','#037f4c','#bb3354','#ff642e','#9aadbd'];

router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  const id = uuidv4();
  const password_hash = bcrypt.hashSync(password, 10);
  const avatar_color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

  db.prepare('INSERT INTO users (id, name, email, password_hash, avatar_color) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, email, password_hash, avatar_color);

  const wsId = uuidv4();
  db.prepare('INSERT INTO workspaces (id, name, description, created_by) VALUES (?, ?, ?, ?)')
    .run(wsId, `${name}'s Workspace`, 'My personal workspace', id);
  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
    .run(wsId, id, 'owner');

  const sampleBoardId = uuidv4();
  db.prepare('INSERT INTO boards (id, workspace_id, name, description, icon, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(sampleBoardId, wsId, 'My First Board', 'A sample project board', '📋', id);

  const cols = [
    { id: uuidv4(), name: 'Status', type: 'status', settings: JSON.stringify({ options: [{ label: 'Done', color: '#00c875' }, { label: 'Working on it', color: '#fdab3d' }, { label: 'Stuck', color: '#e2445c' }, { label: 'Not started', color: '#c4c4c4' }] }), pos: 0 },
    { id: uuidv4(), name: 'Owner', type: 'person', settings: '{}', pos: 1 },
    { id: uuidv4(), name: 'Due Date', type: 'date', settings: '{}', pos: 2 },
    { id: uuidv4(), name: 'Priority', type: 'priority', settings: '{}', pos: 3 },
  ];
  for (const c of cols) {
    db.prepare('INSERT INTO board_columns (id, board_id, name, type, settings, position) VALUES (?, ?, ?, ?, ?, ?)')
      .run(c.id, sampleBoardId, c.name, c.type, c.settings, c.pos);
  }

  const groups = [
    { id: uuidv4(), name: 'To Do', color: '#0073ea', pos: 0 },
    { id: uuidv4(), name: 'In Progress', color: '#fdab3d', pos: 1 },
    { id: uuidv4(), name: 'Done', color: '#00c875', pos: 2 },
  ];
  for (const g of groups) {
    db.prepare('INSERT INTO groups (id, board_id, name, color, position) VALUES (?, ?, ?, ?, ?)')
      .run(g.id, sampleBoardId, g.name, g.color, g.pos);
    const items = ['Sample task 1', 'Sample task 2'];
    items.forEach((itemName, i) => {
      db.prepare('INSERT INTO items (id, group_id, board_id, name, position, created_by) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), g.id, sampleBoardId, itemName, i, id);
    });
  }

  const token = jwt.sign({ id, name, email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id, name, email, avatar_color } });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, avatar_color: user.avatar_color, role: user.role } });
});

router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, name, email, avatar_color, role, permissions, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ ...user, permissions: JSON.parse(user.permissions || '{}') });
});

router.put('/me', authenticate, (req, res) => {
  const { name, avatar_color } = req.body;
  db.prepare('UPDATE users SET name = COALESCE(?, name), avatar_color = COALESCE(?, avatar_color) WHERE id = ?')
    .run(name || null, avatar_color || null, req.user.id);
  const user = db.prepare('SELECT id, name, email, avatar_color FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// ── One-time setup endpoint — creates first super_admin if no users exist ──────
// Access: GET /api/auth/setup?secret=SETUP_SECRET
// Also allows promoting an existing user to super_admin by passing ?email=
router.get('/setup', (req, res) => {
  const { secret, email, password, name } = req.query;
  if (secret !== (process.env.SETUP_SECRET || 'bibix-setup-2026')) {
    return res.status(403).json({ error: 'Invalid setup secret' });
  }
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0) {
    // Allow promoting an existing user to super_admin
    const targetEmail = email || 'admin@bibix.com';
    const user = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(targetEmail);
    if (user) {
      db.prepare("UPDATE users SET role = 'super_admin' WHERE email = ?").run(targetEmail);
      // Also reset password if provided
      if (password) {
        const hash = bcrypt.hashSync(password, 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(hash, targetEmail);
        return res.json({ success: true, message: `User ${targetEmail} is now super_admin and password has been reset` });
      }
      return res.json({ success: true, message: `User ${targetEmail} is now super_admin` });
    }
    return res.status(400).json({ error: 'Users already exist. Pass ?email=existing@email.com to promote to super_admin.' });
  }
  const adminEmail    = email    || 'admin@bibix.com';
  const adminPassword = password || 'Admin1234!';
  const adminName     = name     || 'Admin';
  const id            = uuidv4();
  const hash          = bcrypt.hashSync(adminPassword, 10);
  db.prepare('INSERT INTO users (id, name, email, password_hash, avatar_color, role) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, adminName, adminEmail, hash, '#4F46E5', 'super_admin');
  const wsId = uuidv4();
  db.prepare('INSERT INTO workspaces (id, name, description, created_by) VALUES (?, ?, ?, ?)')
    .run(wsId, `${adminName}'s Workspace`, 'Main workspace', id);
  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
    .run(wsId, id, 'owner');
  res.json({ success: true, message: 'Super admin created', email: adminEmail, password: adminPassword });
});

router.get('/users', authenticate, (req, res) => {
  const caller = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  if (!caller) return res.status(404).json({ error: 'User not found' });

  // super_admin sees everyone
  if (caller.role === 'super_admin') {
    const users = db.prepare('SELECT id, name, email, avatar_color FROM users ORDER BY name ASC').all();
    return res.json(users);
  }

  // admin and regular members see only users sharing at least one workspace
  const users = db.prepare(`
    SELECT DISTINCT u.id, u.name, u.email, u.avatar_color
    FROM users u
    JOIN workspace_members wm ON wm.user_id = u.id
    WHERE wm.workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = ?
    )
    ORDER BY u.name ASC
  `).all(req.user.id);
  res.json(users);
});

router.put('/password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both currentPassword and newPassword are required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const password_hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, req.user.id);
  res.json({ success: true });
});

module.exports = router;
