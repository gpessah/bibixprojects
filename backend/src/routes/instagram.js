const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate, authenticateFlexible } = require('../middleware/auth');

const router = express.Router();

// ── Media uploads for scheduled posts ────────────────────────────────────────
const IG_UPLOADS_DIR = path.join(__dirname, '../../data/instagram-uploads');
fs.mkdirSync(IG_UPLOADS_DIR, { recursive: true });
const igStorage = multer.diskStorage({
  destination: IG_UPLOADS_DIR,
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname) || ''}`),
});
const igUpload = multer({ storage: igStorage, limits: { fileSize: 100 * 1024 * 1024 } });
router.UPLOADS_DIR = IG_UPLOADS_DIR;

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
      my_profile TEXT,
      full_name TEXT,
      post_owner TEXT,
      action_date DATETIME,
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
    CREATE TABLE IF NOT EXISTS instagram_scheduled_posts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      my_profile TEXT,
      post_type TEXT DEFAULT 'post',
      caption TEXT,
      hashtags TEXT,
      location TEXT,
      media_filename TEXT,
      media_mime TEXT,
      media_size INTEGER,
      scheduled_at DATETIME NOT NULL,
      status TEXT DEFAULT 'scheduled',
      posted_at DATETIME,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS instagram_follower_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      my_profile TEXT,
      captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      follower_count INTEGER,
      followers_json TEXT
    );
    CREATE TABLE IF NOT EXISTS instagram_scrape_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      target_username TEXT NOT NULL,
      post_count INTEGER NOT NULL DEFAULT 25,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      posts_scraped INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME
    );
    CREATE TABLE IF NOT EXISTS instagram_scraped_posts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      target_username TEXT NOT NULL,
      shortcode TEXT NOT NULL,
      post_url TEXT NOT NULL,
      post_type TEXT,
      likes INTEGER,
      views INTEGER,
      comments INTEGER,
      caption TEXT,
      last_scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, target_username, shortcode)
    );
    CREATE INDEX IF NOT EXISTS idx_ig_sched_due
      ON instagram_scheduled_posts(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_ig_snap_user_profile
      ON instagram_follower_snapshots(user_id, my_profile, captured_at);
    CREATE INDEX IF NOT EXISTS idx_ig_scrape_pending
      ON instagram_scrape_jobs(user_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_ig_scraped_user_target
      ON instagram_scraped_posts(user_id, target_username, last_scraped_at);
  `);
} catch (e) { console.error('Instagram table init error (non-fatal):', e.message); }

// Migrate existing DBs — ignore errors if columns already exist
['my_profile TEXT', 'full_name TEXT', 'post_owner TEXT', 'action_date DATETIME'].forEach(col => {
  try { db.exec(`ALTER TABLE instagram_actions ADD COLUMN ${col}`); } catch (_) {}
});
// Per-user list of detected Instagram accounts (scanned by the extension from
// IG's "Switch accounts" modal). Stored as a JSON array on the users row.
try { db.exec('ALTER TABLE users ADD COLUMN instagram_accounts TEXT'); } catch (_) {}

// helper — which user_id to query
function targetUser(req) {
  const { as_user } = req.query;
  if (as_user && (req.user.role === 'super_admin' || req.user.role === 'admin')) return as_user;
  return req.user.id;
}

// ── Extension auth verify (uses instagram_api_token, not JWT) ────────────────
router.get('/auth/verify', function(req, res) {
  var authHeader = req.headers['authorization'] || '';
  var token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'No token' });
  var user = db.prepare('SELECT id, name, email, role FROM users WHERE instagram_api_token = ?').get(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// ── Actions ───────────────────────────────────────────────────────────────────
router.post("/actions", authenticateFlexible, (req, res) => {
  var b = req.body;
  // Accept both backend field names and extension field names
  var type           = b.type           || b.action         || null;
  var username       = b.username       || b.targetUsername  || null;
  var follower_count = b.follower_count  || b.followers      || null;
  var post_url       = b.post_url       || b.postUrl         || null;
  var reply_text     = b.reply_text     || b.replyText       || null;
  var comment_text   = b.comment_text   || null;
  var campaign_id    = b.campaign_id    || null;
  var my_profile     = b.my_profile     || b.myProfile       || null;
  var full_name      = b.full_name      || b.fullName        || null;
  var post_owner     = b.post_owner     || b.postOwner       || null;
  var action_date    = b.action_date    || b.date            || null;

  if (!type) return res.status(400).json({ error: 'type required' });
  var id = uuidv4();
  db.prepare(`
    INSERT INTO instagram_actions
      (id,user_id,type,username,follower_count,post_url,reply_text,comment_text,campaign_id,my_profile,full_name,post_owner,action_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, req.user.id, type, username, follower_count, post_url, reply_text, comment_text, campaign_id, my_profile, full_name, post_owner, action_date);
  res.json({ id });
});

router.post('/actions/bulk', authenticateFlexible, (req, res) => {
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

router.get("/actions", authenticateFlexible, (req, res) => {
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
router.post("/campaigns", authenticateFlexible, (req, res) => {
  const { type, notes } = req.body;
  if (!type) return res.status(400).json({ error: 'type required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO instagram_campaigns (id,user_id,type,notes) VALUES (?,?,?,?)`)
    .run(id, req.user.id, type, notes||null);
  res.json(db.prepare('SELECT * FROM instagram_campaigns WHERE id = ?').get(id));
});

router.patch("/campaigns/:id", authenticateFlexible, (req, res) => {
  var b = req.body;
  var status        = b.status || null;
  var actions_count = b.actions_count != null ? b.actions_count : (b.completed != null ? b.completed : null);
  // followerStats can be { gained: N } or { after: N, before: M } or just a number
  var new_followers = b.new_followers != null ? b.new_followers
    : (b.followerStats && b.followerStats.gained != null) ? b.followerStats.gained
    : (b.followerStats && b.followerStats.after != null && b.followerStats.before != null) ? (b.followerStats.after - b.followerStats.before)
    : null;
  var notes         = b.notes || null;
  const camp = db.prepare('SELECT * FROM instagram_campaigns WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!camp) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE instagram_campaigns SET
    status = COALESCE(?, status),
    actions_count = COALESCE(?, actions_count),
    new_followers = COALESCE(?, new_followers),
    notes = COALESCE(?, notes),
    ended_at = CASE WHEN ? IN ('completed','stopped','done') THEN CURRENT_TIMESTAMP ELSE ended_at END
    WHERE id = ?
  `).run(status||null, actions_count??null, new_followers??null, notes||null, status||null, req.params.id);
  res.json(db.prepare('SELECT * FROM instagram_campaigns WHERE id = ?').get(req.params.id));
});

router.get("/campaigns", authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  // Compute actions_count from the actions table (campaign_id link) when stored value is 0/null
  const rows = db.prepare(`
    SELECT ic.*,
      CASE
        WHEN ic.actions_count > 0 THEN ic.actions_count
        ELSE (SELECT COUNT(*) FROM instagram_actions ia
              WHERE ia.campaign_id = ic.id AND ia.user_id = ic.user_id)
      END AS actions_count
    FROM instagram_campaigns ic
    WHERE ic.user_id = ?
    ORDER BY ic.started_at DESC
  `).all(uid);
  res.json(rows);
});

// ── Stats / Dashboard ─────────────────────────────────────────────────────────
router.get("/stats", authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const { days = 30 } = req.query;
  const since = `datetime('now', '-${Number(days)} days')`;

  const total   = db.prepare(`SELECT COUNT(*) as n FROM instagram_actions WHERE user_id = ? AND datetime(created_at) >= ${since}`).get(uid).n;
  const byType  = db.prepare(`SELECT type, COUNT(*) as n FROM instagram_actions WHERE user_id = ? AND datetime(created_at) >= ${since} GROUP BY type`).all(uid);
  const follows = (byType.find(r => r.type === 'follow') || {}).n || 0;
  // Count new_follower events recorded by the extension's scan notifications
  const newFollowers = db.prepare(`SELECT COUNT(*) as n FROM instagram_actions WHERE user_id = ? AND type = 'new_follower' AND datetime(created_at) >= ${since}`).get(uid).n;
  const followBack = total > 0 ? Math.round((newFollowers / total) * 100) : 0;

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

// ── Scheduled Posts ──────────────────────────────────────────────────────────
// Create a scheduled post — multipart/form-data with `media` file + fields.
router.post('/scheduled-posts', authenticateFlexible, igUpload.single('media'), (req, res) => {
  const b = req.body || {};
  const scheduled_at = b.scheduled_at || b.scheduledAt;
  if (!scheduled_at) return res.status(400).json({ error: 'scheduled_at required' });
  if (!req.file) return res.status(400).json({ error: 'media file required' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO instagram_scheduled_posts
      (id, user_id, my_profile, post_type, caption, hashtags, location,
       media_filename, media_mime, media_size, scheduled_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
  `).run(
    id, req.user.id,
    b.my_profile || b.myProfile || null,
    b.post_type  || b.postType  || 'post',
    b.caption    || null,
    b.hashtags   || null,
    b.location   || null,
    req.file.filename, req.file.mimetype, req.file.size,
    scheduled_at,
  );
  res.json(db.prepare('SELECT * FROM instagram_scheduled_posts WHERE id = ?').get(id));
});

// List user's scheduled posts.
router.get('/scheduled-posts', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const { status } = req.query;
  let q = 'SELECT * FROM instagram_scheduled_posts WHERE user_id = ?';
  const params = [uid];
  if (status) { q += ' AND status = ?'; params.push(status); }
  q += ' ORDER BY scheduled_at ASC LIMIT 500';
  res.json(db.prepare(q).all(...params));
});

// Extension polls this every 60s — returns posts whose time has arrived but are still 'scheduled'.
// Flips them to 'claimed' atomically so two extension instances don't double-publish.
router.get('/scheduled-posts/due', authenticateFlexible, (req, res) => {
  const { my_profile, myProfile } = req.query;
  const profile = my_profile || myProfile || null;

  const rows = db.prepare(`
    SELECT * FROM instagram_scheduled_posts
    WHERE user_id = ?
      AND status = 'scheduled'
      AND datetime(scheduled_at) <= datetime('now')
      ${profile ? "AND (my_profile = ? OR my_profile IS NULL)" : ''}
    ORDER BY scheduled_at ASC
    LIMIT 5
  `).all(...(profile ? [req.user.id, profile] : [req.user.id]));

  const claim = db.prepare(`UPDATE instagram_scheduled_posts SET status = 'claimed' WHERE id = ? AND status = 'scheduled'`);
  const claimed = [];
  for (const r of rows) {
    const info = claim.run(r.id);
    if (info.changes > 0) claimed.push({ ...r, status: 'claimed', media_url: `/api/instagram/scheduled-posts/${r.id}/media` });
  }
  res.json(claimed);
});

// Serve the media file for a scheduled post (extension downloads then uploads to IG).
router.get('/scheduled-posts/:id/media', authenticateFlexible, (req, res) => {
  const row = db.prepare('SELECT * FROM instagram_scheduled_posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row || !row.media_filename) return res.status(404).json({ error: 'Not found' });
  const filePath = path.join(IG_UPLOADS_DIR, row.media_filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });
  res.setHeader('Content-Type', row.media_mime || 'application/octet-stream');
  res.sendFile(filePath);
});

// Update a scheduled post. The extension calls this with `status` after a
// publish attempt; the UI calls it with edit fields (caption, time, account,
// post_type). Editing is blocked once a post has been claimed/posted.
router.patch('/scheduled-posts/:id', authenticateFlexible, (req, res) => {
  const b = req.body || {};
  const row = db.prepare('SELECT * FROM instagram_scheduled_posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  // If this isn't a status update (i.e. it's a user edit), refuse if the post
  // has already been published or is in flight.
  const isUserEdit = b.status == null;
  if (isUserEdit && ['posted', 'claimed'].includes(row.status)) {
    return res.status(409).json({ error: `Cannot edit a post that's already ${row.status}` });
  }

  const myProfile = b.my_profile != null
    ? (typeof b.my_profile === 'string' ? b.my_profile.replace(/^@/, '') : null)
    : null;

  db.prepare(`
    UPDATE instagram_scheduled_posts SET
      status        = COALESCE(?, status),
      scheduled_at  = COALESCE(?, scheduled_at),
      caption       = COALESCE(?, caption),
      post_type     = COALESCE(?, post_type),
      my_profile    = COALESCE(?, my_profile),
      posted_at     = CASE WHEN ? = 'posted' THEN CURRENT_TIMESTAMP ELSE posted_at END,
      error_message = COALESCE(?, error_message)
    WHERE id = ?
  `).run(
    b.status || null,
    b.scheduled_at || b.scheduledAt || null,
    b.caption ?? null,
    b.post_type || b.postType || null,
    myProfile,
    b.status || null,
    b.error_message || b.errorMessage || null,
    req.params.id,
  );
  res.json(db.prepare('SELECT * FROM instagram_scheduled_posts WHERE id = ?').get(req.params.id));
});

// Replace the media file on an existing scheduled post (multipart/form-data
// with `media` field). Refuses if the post is already in flight or posted.
router.post('/scheduled-posts/:id/media', authenticateFlexible, igUpload.single('media'), (req, res) => {
  const row = db.prepare('SELECT * FROM instagram_scheduled_posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (['posted', 'claimed'].includes(row.status)) {
    return res.status(409).json({ error: `Cannot replace media on a post that's already ${row.status}` });
  }
  if (!req.file) return res.status(400).json({ error: 'media file required' });

  // Delete the old file off disk
  if (row.media_filename) {
    try { fs.unlinkSync(path.join(IG_UPLOADS_DIR, row.media_filename)); } catch (_) {}
  }
  db.prepare(`
    UPDATE instagram_scheduled_posts SET
      media_filename = ?, media_mime = ?, media_size = ?
    WHERE id = ?
  `).run(req.file.filename, req.file.mimetype, req.file.size, req.params.id);
  res.json(db.prepare('SELECT * FROM instagram_scheduled_posts WHERE id = ?').get(req.params.id));
});

router.delete('/scheduled-posts/:id', authenticateFlexible, (req, res) => {
  const row = db.prepare('SELECT * FROM instagram_scheduled_posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.media_filename) {
    try { fs.unlinkSync(path.join(IG_UPLOADS_DIR, row.media_filename)); } catch (_) {}
  }
  db.prepare('DELETE FROM instagram_scheduled_posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Distinct accounts whose due posts are waiting ───────────────────────────
// Used by the scheduler to decide whether it's worth switching IG accounts.
router.get('/scheduled-posts/pending-accounts', authenticateFlexible, (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT my_profile FROM instagram_scheduled_posts
    WHERE user_id = ?
      AND status = 'scheduled'
      AND datetime(scheduled_at) <= datetime('now')
      AND my_profile IS NOT NULL AND my_profile != ''
  `).all(req.user.id);
  res.json(rows.map(r => r.my_profile));
});

// ── Account list (multi-profile management) ──────────────────────────────────
// The extension scans IG's "Switch accounts" modal and submits the list here;
// the frontend reads it back to populate dropdowns. We also union in any
// my_profile values seen in the user's data so manual entries aren't lost.
// Merges the scanned list with whatever's already stored — so manual entries
// added via the UI aren't wiped every time the extension scans.
router.post('/accounts/scan', authenticateFlexible, (req, res) => {
  const incoming = Array.isArray(req.body.accounts)
    ? req.body.accounts.filter(a => typeof a === 'string' && a.length > 0)
    : [];
  const row = db.prepare('SELECT instagram_accounts FROM users WHERE id = ?').get(req.user.id);
  let existing = [];
  if (row?.instagram_accounts) {
    try { existing = JSON.parse(row.instagram_accounts) || []; } catch (_) {}
  }
  const merged = [...new Set([...existing, ...incoming])].sort();
  db.prepare('UPDATE users SET instagram_accounts = ? WHERE id = ?')
    .run(JSON.stringify(merged), req.user.id);
  res.json({ ok: true, count: merged.length, accounts: merged });
});

// Add a single account manually (e.g. for accounts not yet logged into IG)
router.post('/accounts', authenticateFlexible, (req, res) => {
  const username = (req.body.username || '').trim().replace(/^@/, '');
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(username)) {
    return res.status(400).json({ error: 'Invalid Instagram username' });
  }
  const row = db.prepare('SELECT instagram_accounts FROM users WHERE id = ?').get(req.user.id);
  let list = [];
  if (row?.instagram_accounts) {
    try { list = JSON.parse(row.instagram_accounts) || []; } catch (_) {}
  }
  if (!list.includes(username)) list.push(username);
  list = [...new Set(list)].sort();
  db.prepare('UPDATE users SET instagram_accounts = ? WHERE id = ?')
    .run(JSON.stringify(list), req.user.id);
  res.json({ ok: true, accounts: list });
});

router.delete('/accounts/:username', authenticateFlexible, (req, res) => {
  const target = (req.params.username || '').trim().replace(/^@/, '').toLowerCase();
  const row = db.prepare('SELECT instagram_accounts FROM users WHERE id = ?').get(req.user.id);
  let list = [];
  if (row?.instagram_accounts) {
    try { list = JSON.parse(row.instagram_accounts) || []; } catch (_) {}
  }
  list = list.filter(a => a.toLowerCase() !== target);
  db.prepare('UPDATE users SET instagram_accounts = ? WHERE id = ?')
    .run(JSON.stringify(list), req.user.id);
  res.json({ ok: true, accounts: list });
});

router.get('/accounts', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const row = db.prepare('SELECT instagram_accounts FROM users WHERE id = ?').get(uid);
  let scanned = [];
  if (row?.instagram_accounts) {
    try { scanned = JSON.parse(row.instagram_accounts) || []; } catch (_) {}
  }
  const seen = db.prepare(`
    SELECT DISTINCT my_profile FROM instagram_actions
      WHERE user_id = ? AND my_profile IS NOT NULL AND my_profile != ''
    UNION
    SELECT DISTINCT my_profile FROM instagram_follower_snapshots
      WHERE user_id = ? AND my_profile IS NOT NULL AND my_profile != ''
    UNION
    SELECT DISTINCT my_profile FROM instagram_scheduled_posts
      WHERE user_id = ? AND my_profile IS NOT NULL AND my_profile != ''
  `).all(uid, uid, uid).map(r => r.my_profile);
  res.json([...new Set([...scanned, ...seen])].sort());
});

// ── Follower Snapshots ───────────────────────────────────────────────────────
// Extension posts the followers list it scraped from instagram.com.
router.post('/followers/snapshot', authenticateFlexible, (req, res) => {
  const b = req.body || {};
  const followers = Array.isArray(b.followers) ? b.followers : [];
  const id = uuidv4();
  db.prepare(`
    INSERT INTO instagram_follower_snapshots (id, user_id, my_profile, follower_count, followers_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.user.id, b.my_profile || b.myProfile || null, followers.length, JSON.stringify(followers));
  res.json({ id, follower_count: followers.length });
});

// Diff the latest snapshot against the most recent older one (or one ≥ `days` ago).
router.get('/followers/changes', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const { my_profile, days = 7 } = req.query;
  const profile = my_profile || null;

  const latest = db.prepare(`
    SELECT * FROM instagram_follower_snapshots
    WHERE user_id = ? ${profile ? 'AND my_profile = ?' : ''}
    ORDER BY captured_at DESC LIMIT 1
  `).get(...(profile ? [uid, profile] : [uid]));

  if (!latest) return res.json({ latest: null, baseline: null, gained: [], lost: [] });

  const baseline = db.prepare(`
    SELECT * FROM instagram_follower_snapshots
    WHERE user_id = ? ${profile ? 'AND my_profile = ?' : ''}
      AND captured_at < ?
      AND datetime(captured_at) <= datetime('now', '-${Number(days)} days')
    ORDER BY captured_at DESC LIMIT 1
  `).get(...(profile ? [uid, profile, latest.captured_at] : [uid, latest.captured_at]));

  const fallbackBaseline = baseline || db.prepare(`
    SELECT * FROM instagram_follower_snapshots
    WHERE user_id = ? ${profile ? 'AND my_profile = ?' : ''} AND id != ?
    ORDER BY captured_at DESC LIMIT 1
  `).get(...(profile ? [uid, profile, latest.id] : [uid, latest.id]));

  if (!fallbackBaseline) {
    return res.json({ latest: { ...latest, followers_json: undefined }, baseline: null, gained: [], lost: [] });
  }

  const latestSet  = new Set(JSON.parse(latest.followers_json || '[]'));
  const baseSet    = new Set(JSON.parse(fallbackBaseline.followers_json || '[]'));
  const gained = [...latestSet].filter(u => !baseSet.has(u));
  const lost   = [...baseSet].filter(u => !latestSet.has(u));
  res.json({
    latest:   { id: latest.id, captured_at: latest.captured_at, follower_count: latest.follower_count, my_profile: latest.my_profile },
    baseline: { id: fallbackBaseline.id, captured_at: fallbackBaseline.captured_at, follower_count: fallbackBaseline.follower_count },
    gained, lost,
  });
});

// List snapshots (without the giant followers_json blob).
router.get('/followers/snapshots', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const { my_profile } = req.query;
  const rows = db.prepare(`
    SELECT id, my_profile, captured_at, follower_count
    FROM instagram_follower_snapshots
    WHERE user_id = ? ${my_profile ? 'AND my_profile = ?' : ''}
    ORDER BY captured_at DESC LIMIT 100
  `).all(...(my_profile ? [uid, my_profile] : [uid]));
  res.json(rows);
});

// ── Profile scraping (research) ──────────────────────────────────────────────
// Monday queues a job → extension's background alarm claims it → extension
// opens an IG tab to the target profile → content script scrapes the first N
// post tiles via hover overlay → results upserted into instagram_scraped_posts.

function cleanUsername(u) {
  return String(u || '').trim().replace(/^@/, '').toLowerCase();
}

// Monday creates a job
router.post('/scrape-jobs', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const target = cleanUsername(req.body?.target_username);
  if (!target) return res.status(400).json({ error: 'target_username required' });
  const count = Math.max(1, Math.min(200, parseInt(req.body?.post_count, 10) || 25));
  const id = uuidv4();
  db.prepare(`
    INSERT INTO instagram_scrape_jobs (id, user_id, target_username, post_count)
    VALUES (?, ?, ?, ?)
  `).run(id, uid, target, count);
  const row = db.prepare('SELECT * FROM instagram_scrape_jobs WHERE id = ?').get(id);
  res.json(row);
});

// Monday lists this user's jobs (most recent first)
router.get('/scrape-jobs', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const rows = db.prepare(`
    SELECT * FROM instagram_scrape_jobs
    WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 100
  `).all(uid);
  res.json(rows);
});

// Extension polls for the next pending job, claiming it atomically
router.get('/scrape-jobs/pending', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const job = db.prepare(`
    SELECT * FROM instagram_scrape_jobs
    WHERE user_id = ? AND status = 'pending'
    ORDER BY created_at ASC LIMIT 1
  `).get(uid);
  if (!job) return res.json(null);
  const claim = db.prepare(`
    UPDATE instagram_scrape_jobs
    SET status = 'running', started_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending'
  `).run(job.id);
  if (claim.changes === 0) return res.json(null);
  res.json({ ...job, status: 'running' });
});

// Extension updates job status when scraping finishes (or fails)
router.patch('/scrape-jobs/:id', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const { status, error_message, posts_scraped } = req.body || {};
  const isTerminal = status === 'completed' || status === 'failed';
  db.prepare(`
    UPDATE instagram_scrape_jobs
    SET status = COALESCE(?, status),
        error_message = COALESCE(?, error_message),
        posts_scraped = COALESCE(?, posts_scraped),
        completed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE completed_at END
    WHERE id = ? AND user_id = ?
  `).run(status || null, error_message || null, posts_scraped ?? null, isTerminal ? 1 : 0, req.params.id, uid);
  res.json({ ok: true });
});

// Extension uploads scraped data — bulk upsert
router.post('/scraped-posts', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const target = cleanUsername(req.body?.target_username);
  const posts = Array.isArray(req.body?.posts) ? req.body.posts : [];
  if (!target) return res.status(400).json({ error: 'target_username required' });

  const upsert = db.prepare(`
    INSERT INTO instagram_scraped_posts
      (id, user_id, target_username, shortcode, post_url, post_type, likes, views, comments, caption, last_scraped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, target_username, shortcode) DO UPDATE SET
      post_url = excluded.post_url,
      post_type = excluded.post_type,
      likes = excluded.likes,
      views = excluded.views,
      comments = excluded.comments,
      caption = excluded.caption,
      last_scraped_at = CURRENT_TIMESTAMP
  `);
  const tx = db.transaction((rows) => {
    for (const p of rows) {
      if (!p?.shortcode) continue;
      upsert.run(
        uuidv4(), uid, target,
        String(p.shortcode),
        String(p.post_url || ''),
        p.post_type === 'reel' ? 'reel' : 'post',
        Number.isFinite(p.likes) ? p.likes : null,
        Number.isFinite(p.views) ? p.views : null,
        Number.isFinite(p.comments) ? p.comments : null,
        p.caption ? String(p.caption).slice(0, 500) : null
      );
    }
  });
  tx(posts);
  res.json({ ok: true, count: posts.length });
});

// Monday reads scraped posts — by target_username for detail, or grouped summary
router.get('/scraped-posts', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const target = req.query.target_username ? cleanUsername(req.query.target_username) : null;
  if (target) {
    const rows = db.prepare(`
      SELECT * FROM instagram_scraped_posts
      WHERE user_id = ? AND target_username = ?
      ORDER BY last_scraped_at DESC LIMIT 500
    `).all(uid, target);
    return res.json(rows);
  }
  const rows = db.prepare(`
    SELECT target_username,
           COUNT(*) AS post_count,
           MAX(last_scraped_at) AS last_scraped_at
    FROM instagram_scraped_posts
    WHERE user_id = ?
    GROUP BY target_username
    ORDER BY last_scraped_at DESC
  `).all(uid);
  res.json(rows);
});

module.exports = router;
