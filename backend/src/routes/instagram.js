const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── Tables ────────────────────────────────────────────────────────────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS instagram_actions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      username TEXT,
      follower_count INTEGER,
      post_url TEXT,
      reply_text TEXT,
      comment_text TEXT,
      campaign_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS instagram_campaigns (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'running',
      actions_count INTEGER DEFAULT 0,
      new_followers INTEGER DEFAULT 0,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      notes TEXT
    );
  `);
} catch (e) { console.error('Instagram table init error (non-fatal):', e.message); }

// helper — which user_id to query
function targetUser(req) {
  const { as_user } = req.query;
  if (as_user && (req.user.role === 'super_admin' || req.user.role === 'admin')) return as_user;
  return req.user.id;
}

// ── Actions ───────────────────────────────────────────────────────────────────
router.post('/actions', authenticate, (req, res) => {
  const { type, username, follower_count, post_url, reply_text, comment_text, campaign_id } = req.body;
  if (!type) return res.status(400).json({ error: 'type required' });
  const id = uuidv4();
  db.prepare(`
    INSERT INTO instagram_actions (id,user_id,type,username,follower_count,post_url,reply_text,comment_text,campaign_id)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(id, req.user.id, type, username||null, follower_count||null, post_url||null, reply_text||null, comment_text||null, campaign_id||null);
  res.json({ id });
});

router.post('/actions/bulk', authenticate, (req, res) => {
  const { actions } = req.body;
  if (!Array.isArray(actions)) return res.status(400).json({ error: 'actions array required' });
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO instagram_actions (id,user_id,type,username,follower_count,post_url,reply_text,comment_text,campaign_id)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);
  const insert = db.transaction((rows) => {
    for (const a of rows) {
      stmt.run(a.id || uuidv4(), req.user.id, a.type, a.username||null, a.follower_count||null,
        a.post_url||null, a.reply_text||null, a.comment_text||null, a.campaign_id||null);
    }
  });
  insert(actions);
  res.json({ inserted: actions.length });
});

router.get('/actions', authenticate, (req, res) => {
  const uid = targetUser(req);
  const { type, limit = 200, offset = 0 } = req.query;
  let q = 'SELECT * FROM instagram_actions WHERE user_id = ?';
  const params = [uid];
  if (type) { q += ' AND type = ?'; params.push(type); }
  q += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  res.json(db.prepare(q).all(...params));
});

// ── Campaigns ─────────────────────────────────────────────────────────────────
router.post('/campaigns', authenticate, (req, res) => {
  const { type, notes } = req.body;
  if (!type) return res.status(400).json({ error: 'type required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO instagram_campaigns (id,user_id,type,notes) VALUES (?,?,?,?)`)
    .run(id, req.user.id, type, notes||null);
  res.json(db.prepare('SELECT * FROM instagram_campaigns WHERE id = ?').get(id));
});

router.patch('/campaigns/:id', authenticate, (req, res) => {
  const { status, actions_count, new_followers, notes } = req.body;
  const camp = db.prepare('SELECT * FROM instagram_campaigns WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!camp) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE instagram_campaigns SET
    status = COALESCE(?, status),
    actions_count = COALESCE(?, actions_count),
    new_followers = COALESCE(?, new_followers),
    notes = COALESCE(?, notes),
    ended_at = CASE WHEN ? IN ('completed','stopped') THEN CURRENT_TIMESTAMP ELSE ended_at END
    WHERE id = ?
  `).run(status||null, actions_count??null, new_followers??null, notes||null, status||null, req.params.id);
  res.json(db.prepare('SELECT * FROM instagram_campaigns WHERE id = ?').get(req.params.id));
});

router.get('/campaigns', authenticate, (req, res) => {
  const uid = targetUser(req);
  res.json(db.prepare('SELECT * FROM instagram_campaigns WHERE user_id = ? ORDER BY started_at DESC').all(uid));
});

// ── Stats / Dashboard ─────────────────────────────────────────────────────────
router.get('/stats', authenticate, (req, res) => {
  const uid = targetUser(req);
  const { days = 30 } = req.query;
  const since = `datetime('now', '-${Number(days)} days')`;

  const total   = db.prepare(`SELECT COUNT(*) as n FROM instagram_actions WHERE user_id = ? AND datetime(created_at) >= ${since}`).get(uid).n;
  const byType  = db.prepare(`SELECT type, COUNT(*) as n FROM instagram_actions WHERE user_id = ? AND datetime(created_at) >= ${since} GROUP BY type`).all(uid);
  const follows = byType.find(r => r.type === 'follow')?.n || 0;
  const newFollowers = db.prepare(`SELECT COALESCE(SUM(new_followers),0) as n FROM instagram_campaigns WHERE user_id = ? AND datetime(started_at) >= ${since}`).get(uid).n;
  const followBack = follows > 0 ? Math.round((newFollowers / follows) * 100) : 0;

  // Daily activity for chart
  const daily = db.prepare(`
    SELECT date(created_at) as day, type, COUNT(*) as n
    FROM instagram_actions WHERE user_id = ? AND datetime(created_at) >= ${since}
    GROUP BY day, type ORDER BY day ASC
  `).all(uid);

  // Top users interacted with
  const topUsers = db.prepare(`
    SELECT username, COUNT(*) as n FROM instagram_actions
    WHERE user_id = ? AND username IS NOT NULL AND datetime(created_at) >= ${since}
    GROUP BY username ORDER BY n DESC LIMIT 10
  `).all(uid);

  res.json({ total, byType, follows, newFollowers, followBack, daily, topUsers });
});

// ── Admin: list all users with stats ─────────────────────────────────────────
router.get('/admin/users', authenticate, (req, res) => {
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const users = db.prepare(`
    SELECT u.id, u.name, u.email,
      (SELECT COUNT(*) FROM instagram_actions ia WHERE ia.user_id = u.id) as total_actions,
      (SELECT COUNT(*) FROM instagram_campaigns ic WHERE ic.user_id = u.id) as total_campaigns,
      (SELECT MAX(created_at) FROM instagram_actions ia WHERE ia.user_id = u.id) as last_action
    FROM users u ORDER BY total_actions DESC
  `).all();
  res.json(users);
});

module.exports = router;
