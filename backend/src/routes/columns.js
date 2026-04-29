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
  const { board_id, name, type, settings } = req.body;
  if (!board_id || !name || !type) return res.status(400).json({ error: 'board_id, name, type required' });
  if (!canAccessBoard(board_id, req.user.id)) return res.status(403).json({ error: 'Access denied' });

  const maxPos = db.prepare('SELECT MAX(position) as mp FROM board_columns WHERE board_id = ?').get(board_id);
  const id = uuidv4();
  const pos = (maxPos?.mp ?? -1) + 1;
  const settingsJson = JSON.stringify(settings || getDefaultSettings(type));

  db.prepare('INSERT INTO board_columns (id, board_id, name, type, settings, position) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, board_id, name, type, settingsJson, pos);

  const col = db.prepare('SELECT * FROM board_columns WHERE id = ?').get(id);
  res.json({ ...col, settings: JSON.parse(col.settings) });
});

router.put('/:id', authenticate, (req, res) => {
  const col = db.prepare('SELECT * FROM board_columns WHERE id = ?').get(req.params.id);
  if (!col) return res.status(404).json({ error: 'Column not found' });
  if (!canAccessBoard(col.board_id, req.user.id)) return res.status(403).json({ error: 'Access denied' });

  const { name, settings, position, width, type } = req.body;

  // Determine new settings:
  // • explicit settings payload → use it
  // • type changed + no settings → reset to defaults for new type
  // • otherwise → keep existing
  let settingsJson;
  if (settings !== undefined) {
    settingsJson = JSON.stringify(settings);
  } else if (type && type !== col.type) {
    settingsJson = JSON.stringify(getDefaultSettings(type));
  } else {
    settingsJson = col.settings;
  }

  db.prepare(`UPDATE board_columns
    SET name     = COALESCE(?, name),
        type     = COALESCE(?, type),
        settings = ?,
        position = COALESCE(?, position),
        width    = COALESCE(?, width)
    WHERE id = ?`)
    .run(
      name || null,
      type || null,
      settingsJson,
      position !== undefined ? position : null,
      width || null,
      req.params.id,
    );

  const updated = db.prepare('SELECT * FROM board_columns WHERE id = ?').get(req.params.id);
  res.json({ ...updated, settings: JSON.parse(updated.settings) });
});

router.delete('/:id', authenticate, (req, res) => {
  const col = db.prepare('SELECT * FROM board_columns WHERE id = ?').get(req.params.id);
  if (!col) return res.status(404).json({ error: 'Column not found' });
  if (!canAccessBoard(col.board_id, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  db.prepare('DELETE FROM board_columns WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.put('/:id/reorder', authenticate, (req, res) => {
  const col = db.prepare('SELECT * FROM board_columns WHERE id = ?').get(req.params.id);
  if (!col) return res.status(404).json({ error: 'Column not found' });
  if (!canAccessBoard(col.board_id, req.user.id)) return res.status(403).json({ error: 'Access denied' });
  const { position } = req.body;
  db.prepare('UPDATE board_columns SET position = ? WHERE id = ?').run(position, req.params.id);
  res.json({ success: true });
});

function getDefaultSettings(type) {
  switch (type) {
    case 'status': return { options: [{ label: 'Done', color: '#00c875' }, { label: 'Working on it', color: '#fdab3d' }, { label: 'Stuck', color: '#e2445c' }, { label: 'Not started', color: '#c4c4c4' }] };
    case 'priority': return { options: [{ label: 'Critical', color: '#333333' }, { label: 'High', color: '#401694' }, { label: 'Medium', color: '#fdab3d' }, { label: 'Low', color: '#579bfc' }] };
    default: return {};
  }
}

module.exports = router;
