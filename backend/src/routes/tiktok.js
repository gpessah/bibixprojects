// TikTok routes — MVP scaffold.
//
// Just enough to receive actions from the Chrome extension and log them.
// Deliberately narrow — no batches, no campaigns, no automation. The IG
// module's complexity grew organically; this one starts minimal so we
// can extend deliberately.
//
// Endpoints:
//   POST /api/tiktok/actions   — extension logs one action (like/reply)
//   GET  /api/tiktok/actions   — read the log (for the future History tab)
//
// Table: tiktok_actions
//   id             uuid  primary key
//   user_id        who owns this record (from JWT / api token)
//   type           'like' | 'reply' | ...
//   target_username  the TikTok user we engaged with
//   video_url      the URL of the video we acted on
//   reply_text     for replies, the text we posted
//   created_at     when the extension reported it

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticateFlexible } = require('../middleware/auth');

const router = express.Router();

// ── Table init ─────────────────────────────────────────────────────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tiktok_actions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      target_username TEXT,
      video_url TEXT,
      reply_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tiktok_actions_user_created
      ON tiktok_actions(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tiktok_actions_user_type
      ON tiktok_actions(user_id, type, created_at);
  `);
} catch (e) {
  console.error('TikTok table init error (non-fatal):', e.message);
}

// Helper — target user is either the JWT user OR (if super admin passing
// ?as_user=UUID) the impersonated user. Same convention as instagram.js.
function targetUser(req) {
  const { as_user } = req.query;
  if (as_user && (req.user.role === 'super_admin' || req.user.role === 'admin')) return as_user;
  return req.user.id;
}

// ── POST /actions ─────────────────────────────────────────────────────────
// Extension calls this after every like/reply on TikTok. Idempotent — accepts
// a client-provided `id` so retries don't duplicate rows.
router.post('/actions', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const b = req.body || {};
  const id = b.id || uuidv4();
  const type = b.type || null;
  if (!type) return res.status(400).json({ error: 'type required' });
  db.prepare(`
    INSERT OR IGNORE INTO tiktok_actions
      (id, user_id, type, target_username, video_url, reply_text)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id, uid, type,
    (b.target_username || '').replace(/^@/, '') || null,
    b.video_url || null,
    b.reply_text || null,
  );
  res.json({ ok: true, id });
});

// ── GET /actions ──────────────────────────────────────────────────────────
// Read the log — used by the frontend History tab once we wire it up.
// Pagination via ?limit + ?offset, defaults match the IG endpoint.
router.get('/actions', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 200));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const q = req.query.type
    ? `SELECT * FROM tiktok_actions WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    : `SELECT * FROM tiktok_actions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const params = req.query.type
    ? [uid, req.query.type, limit, offset]
    : [uid, limit, offset];
  res.json(db.prepare(q).all(...params));
});

module.exports = router;
