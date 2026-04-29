const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Generate a one-time link code for the logged-in user
router.post('/link-code', authenticate, (req, res) => {
  // Invalidate any existing codes for this user
  db.prepare('DELETE FROM telegram_link_codes WHERE user_id = ?').run(req.user.id);

  const code = 'LINK-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min
  db.prepare('INSERT INTO telegram_link_codes (code, user_id, expires_at) VALUES (?, ?, ?)').run(code, req.user.id, expires);

  const botName = process.env.TELEGRAM_BOT_NAME || null;
  res.json({ code, botName, expiresAt: expires });
});

// Get link status for the logged-in user
router.get('/status', authenticate, (req, res) => {
  const link = db.prepare('SELECT chat_id, username, default_board_id, default_group_id, created_at FROM telegram_links WHERE user_id = ?').get(req.user.id);
  if (!link) return res.json({ linked: false });

  let defaultBoard = null;
  let defaultGroup = null;
  if (link.default_board_id) {
    const b = db.prepare('SELECT name, icon FROM boards WHERE id = ?').get(link.default_board_id);
    if (b) defaultBoard = b;
  }
  if (link.default_group_id) {
    const g = db.prepare('SELECT name FROM groups WHERE id = ?').get(link.default_group_id);
    if (g) defaultGroup = g;
  }

  res.json({
    linked: true,
    username: link.username,
    defaultBoard,
    defaultGroup,
    createdAt: link.created_at,
  });
});

// Unlink
router.delete('/unlink', authenticate, (req, res) => {
  db.prepare('DELETE FROM telegram_links WHERE user_id = ?').run(req.user.id);
  res.json({ success: true });
});

module.exports = router;
