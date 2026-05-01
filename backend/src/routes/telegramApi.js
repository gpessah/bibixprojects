const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// File-based link code storage (works across WASM SQLite process boundaries)
const LINK_CODES_FILE = path.join(__dirname, '../../../data/link_codes.json');

function readLinkCodes() {
  try { return JSON.parse(fs.readFileSync(LINK_CODES_FILE, 'utf8')); } catch { return {}; }
}
function writeLinkCodes(codes) {
  fs.mkdirSync(path.dirname(LINK_CODES_FILE), { recursive: true });
  fs.writeFileSync(LINK_CODES_FILE, JSON.stringify(codes));
}

// Generate a one-time link code for the logged-in user
router.post('/link-code', authenticate, (req, res) => {
  const code = 'LINK-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const expires = Date.now() + 15 * 60 * 1000; // 15 min

  // Store in file (works across all processes)
  const codes = readLinkCodes();
  // Remove old codes for this user
  Object.keys(codes).forEach(k => { if (codes[k].userId === req.user.id) delete codes[k]; });
  // Clean expired codes
  Object.keys(codes).forEach(k => { if (codes[k].expires < Date.now()) delete codes[k]; });
  codes[code] = { userId: req.user.id, expires };
  writeLinkCodes(codes);

  const botName = process.env.TELEGRAM_BOT_NAME || null;
  res.json({ code, botName, expiresAt: new Date(expires).toISOString() });
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
