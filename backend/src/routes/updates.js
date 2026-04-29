const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function canAccessItem(itemId, userId) {
  return db.prepare(`
    SELECT i.id FROM items i
    JOIN workspace_members wm ON wm.workspace_id = (SELECT workspace_id FROM boards WHERE id = i.board_id)
    WHERE i.id = ? AND wm.user_id = ?
  `).get(itemId, userId);
}

function getAttachments(updateId) {
  return db.prepare('SELECT * FROM attachments WHERE update_id = ? ORDER BY created_at ASC').all(updateId);
}

router.post('/', authenticate, (req, res) => {
  const { item_id, content, attachment_ids } = req.body;
  if (!item_id || !content?.trim()) return res.status(400).json({ error: 'item_id and content required' });
  if (!canAccessItem(item_id, req.user.id)) return res.status(403).json({ error: 'Access denied' });

  const id = uuidv4();
  db.prepare('INSERT INTO updates (id, item_id, user_id, content) VALUES (?, ?, ?, ?)')
    .run(id, item_id, req.user.id, content.trim());

  if (Array.isArray(attachment_ids) && attachment_ids.length > 0) {
    for (const attId of attachment_ids) {
      db.prepare('UPDATE attachments SET update_id = ? WHERE id = ?').run(id, attId);
    }
  }

  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(item_id);
  const members = db.prepare(`
    SELECT DISTINCT wm.user_id FROM workspace_members wm
    JOIN boards b ON b.workspace_id = wm.workspace_id
    WHERE b.id = ? AND wm.user_id != ?
  `).all(item.board_id, req.user.id);

  for (const m of members) {
    db.prepare('INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), m.user_id, 'update', `New update on "${item.name}"`,
        `${req.user.name}: ${content.trim().slice(0, 100)}`,
        `/board/${item.board_id}/item/${item_id}`);
  }

  const update = db.prepare(`
    SELECT u.*, usr.name as author_name, usr.avatar_color as author_color
    FROM updates u JOIN users usr ON u.user_id = usr.id WHERE u.id = ?
  `).get(id);
  res.json({ ...update, attachments: getAttachments(id) });
});

router.delete('/:id', authenticate, (req, res) => {
  const update = db.prepare('SELECT * FROM updates WHERE id = ?').get(req.params.id);
  if (!update) return res.status(404).json({ error: 'Update not found' });
  if (update.user_id !== req.user.id) return res.status(403).json({ error: 'Can only delete own updates' });

  // Delete attachment files from disk
  const atts = db.prepare('SELECT * FROM attachments WHERE update_id = ?').all(req.params.id);
  const UPLOADS_DIR = path.join(__dirname, '../../data/uploads');
  for (const att of atts) {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, att.filename)); } catch {}
  }

  db.prepare('DELETE FROM updates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
