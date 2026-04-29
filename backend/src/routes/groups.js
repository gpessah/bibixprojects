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

router.post('/', authenticate, (req, res) => {
  const { board_id, name, color } = req.body;
  if (!board_id || !name) return res.status(400).json({ error: 'board_id and name required' });
  if (!canAccessBoard(board_id, req.user.id)) return res.status(403).json({ error: 'Access denied' });

  const maxPos = db.prepare('SELECT MAX(position) as mp FROM groups WHERE board_id = ?').get(board_id);
  const id = uuidv4();
  db.prepare('INSERT INTO groups (id, board_id, name, color, position) VALUES (?, ?, ?, ?, ?)')
    .run(id, board_id, name, color || '#0073ea', (maxPos?.mp ?? -1) + 1);

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  res.json(group);
});

router.put('/:id', authenticate, (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  if (!canAccessBoard(group.board_id, req.user.id)) return res.status(403).json({ error: 'Access denied' });

  const { name, color, collapsed } = req.body;
  db.prepare('UPDATE groups SET name = COALESCE(?, name), color = COALESCE(?, color), collapsed = COALESCE(?, collapsed) WHERE id = ?')
    .run(name || null, color || null, collapsed !== undefined ? (collapsed ? 1 : 0) : null, req.params.id);

  const updated = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', authenticate, (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  if (!canAccessBoard(group.board_id, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.put('/:id/reorder', authenticate, (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  if (!canAccessBoard(group.board_id, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  const { position } = req.body;
  db.prepare('UPDATE groups SET position = ? WHERE id = ?').run(position, req.params.id);
  res.json({ success: true });
});

module.exports = router;
