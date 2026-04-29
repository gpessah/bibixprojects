const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const q = req.query.q?.trim();
  if (!q || q.length < 2) return res.json({ boards: [], items: [] });

  const like = `%${q}%`;

  const boards = db.prepare(`
    SELECT b.id, b.name, b.icon, b.workspace_id, w.name as workspace_name
    FROM boards b
    JOIN workspaces w ON b.workspace_id = w.id
    JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
    WHERE wm.user_id = ? AND b.name LIKE ?
    LIMIT 10
  `).all(req.user.id, like);

  const items = db.prepare(`
    SELECT i.id, i.name, i.board_id, b.name as board_name, b.icon as board_icon, g.name as group_name
    FROM items i
    JOIN boards b ON i.board_id = b.id
    JOIN groups g ON i.group_id = g.id
    JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
    WHERE wm.user_id = ? AND i.name LIKE ?
    LIMIT 20
  `).all(req.user.id, like);

  res.json({ boards, items });
});

module.exports = router;
