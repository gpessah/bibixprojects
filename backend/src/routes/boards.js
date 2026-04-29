const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function canAccessBoard(boardId, userId) {
  if (db.prepare("SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?").get(boardId, userId)) return true;
  return db.prepare(`
    SELECT b.id FROM boards b
    JOIN workspace_members wm ON b.workspace_id = wm.workspace_id
    WHERE b.id = ? AND wm.user_id = ?
  `).get(boardId, userId);
}

router.get('/workspace/:workspaceId', authenticate, (req, res) => {
  const member = db.prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(req.params.workspaceId, req.user.id);
  if (!member) return res.status(403).json({ error: 'Access denied' });
  const boards = db.prepare('SELECT * FROM boards WHERE workspace_id = ? ORDER BY created_at ASC')
    .all(req.params.workspaceId);
  res.json(boards);
});

router.post('/', authenticate, (req, res) => {
  const { workspace_id, name, description, icon } = req.body;
  if (!workspace_id || !name) return res.status(400).json({ error: 'workspace_id and name required' });
  const member = db.prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(workspace_id, req.user.id);
  if (!member) return res.status(403).json({ error: 'Access denied' });

  const id = uuidv4();
  db.prepare('INSERT INTO boards (id, workspace_id, name, description, icon, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, workspace_id, name, description || null, icon || '📋', req.user.id);

  const defaultCols = [
    { id: uuidv4(), name: 'Status', type: 'status', settings: JSON.stringify({ options: [{ label: 'Done', color: '#00c875' }, { label: 'Working on it', color: '#fdab3d' }, { label: 'Stuck', color: '#e2445c' }, { label: 'Not started', color: '#c4c4c4' }] }), pos: 0 },
    { id: uuidv4(), name: 'Owner', type: 'person', settings: '{}', pos: 1 },
    { id: uuidv4(), name: 'Due Date', type: 'date', settings: '{}', pos: 2 },
  ];
  for (const c of defaultCols) {
    db.prepare('INSERT INTO board_columns (id, board_id, name, type, settings, position) VALUES (?, ?, ?, ?, ?, ?)')
      .run(c.id, id, c.name, c.type, c.settings, c.pos);
  }

  const groupId = uuidv4();
  db.prepare('INSERT INTO groups (id, board_id, name, color, position) VALUES (?, ?, ?, ?, ?)')
    .run(groupId, id, 'Group 1', '#0073ea', 0);

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(id);
  res.json(board);
});

router.get('/:id', authenticate, (req, res) => {
  if (!canAccessBoard(req.params.id, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Board not found' });
  const columns = db.prepare('SELECT * FROM board_columns WHERE board_id = ? ORDER BY position ASC').all(req.params.id);
  const groups = db.prepare('SELECT * FROM groups WHERE board_id = ? ORDER BY position ASC').all(req.params.id);
  const items = db.prepare('SELECT * FROM items WHERE board_id = ? ORDER BY position ASC').all(req.params.id);
  const itemIds = items.map(i => i.id);
  let values = [];
  if (itemIds.length > 0) {
    const placeholders = itemIds.map(() => '?').join(',');
    values = db.prepare(`SELECT * FROM item_values WHERE item_id IN (${placeholders})`).all(...itemIds);
  }
  res.json({ ...board, columns: columns.map(c => ({ ...c, settings: JSON.parse(c.settings || '{}') })), groups, items, values });
});

router.put('/:id', authenticate, (req, res) => {
  if (!canAccessBoard(req.params.id, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  const { name, description, icon } = req.body;
  db.prepare('UPDATE boards SET name = COALESCE(?, name), description = COALESCE(?, description), icon = COALESCE(?, icon) WHERE id = ?')
    .run(name || null, description || null, icon || null, req.params.id);
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  res.json(board);
});

router.delete('/:id', authenticate, (req, res) => {
  if (!canAccessBoard(req.params.id, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  db.prepare('DELETE FROM boards WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
