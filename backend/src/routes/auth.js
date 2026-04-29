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
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, avatar_color: user.avatar_color } });
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

router.get('/users', authenticate, (req, res) => {
  const users = db.prepare('SELECT id, name, email, avatar_color FROM users').all();
  res.json(users);
});

module.exports = router;
