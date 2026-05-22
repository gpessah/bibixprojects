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
    CREATE TABLE IF NOT EXISTS instagram_action_campaigns (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT,
      as_account TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      total_requested INTEGER DEFAULT 0,
      total_completed INTEGER DEFAULT 0,
      concurrency INTEGER DEFAULT 6,
      consecutive_failures INTEGER DEFAULT 0,
      start_at DATETIME,
      started_at DATETIME,
      ended_at DATETIME,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS instagram_follower_counts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      my_profile TEXT NOT NULL,
      follower_count INTEGER NOT NULL,
      captured_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS instagram_action_queue (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      as_account TEXT NOT NULL,
      post_url TEXT NOT NULL,
      action_type TEXT NOT NULL,
      count_requested INTEGER NOT NULL,
      count_done INTEGER DEFAULT 0,
      reply_source TEXT,
      reply_texts TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      claimed_at DATETIME,
      started_at DATETIME,
      completed_at DATETIME,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ig_sched_due
      ON instagram_scheduled_posts(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_ig_snap_user_profile
      ON instagram_follower_snapshots(user_id, my_profile, captured_at);
    CREATE INDEX IF NOT EXISTS idx_ig_scrape_pending
      ON instagram_scrape_jobs(user_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_ig_scraped_user_target
      ON instagram_scraped_posts(user_id, target_username, last_scraped_at);
    CREATE INDEX IF NOT EXISTS idx_ig_action_queue_pending
      ON instagram_action_queue(user_id, as_account, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_ig_action_campaign_status
      ON instagram_action_campaigns(user_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_ig_follower_counts_user_profile
      ON instagram_follower_counts(user_id, my_profile, captured_at);
  `);
} catch (e) { console.error('Instagram table init error (non-fatal):', e.message); }

// Migrate existing DBs — ignore errors if columns already exist
['my_profile TEXT', 'full_name TEXT', 'post_owner TEXT', 'action_date DATETIME'].forEach(col => {
  try { db.exec(`ALTER TABLE instagram_actions ADD COLUMN ${col}`); } catch (_) {}
});
// Per-user list of detected Instagram accounts (scanned by the extension from
// IG's "Switch accounts" modal). Stored as a JSON array on the users row.
try { db.exec('ALTER TABLE users ADD COLUMN instagram_accounts TEXT'); } catch (_) {}
// Older deployments created instagram_action_campaigns without as_account.
try { db.exec('ALTER TABLE instagram_action_campaigns ADD COLUMN as_account TEXT'); } catch (_) {}
// Manual follower-count trigger flag — Monday sets it, extension consumes it.
try { db.exec('ALTER TABLE users ADD COLUMN instagram_follower_trigger_at DATETIME'); } catch (_) {}
// Per-user extension tab visibility (JSON array of allowed section names).
// NULL or empty array = all tabs visible (backward-compatible default).
try { db.exec('ALTER TABLE users ADD COLUMN instagram_extension_tabs TEXT'); } catch (_) {}

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
  // Accept a client-provided id so dual-write to prod+staging uses the
  // SAME id on both, otherwise prod's actions wouldn't link to its own
  // campaign rows. INSERT OR IGNORE makes the second write idempotent.
  var id = b.id || uuidv4();
  db.prepare(`
    INSERT OR IGNORE INTO instagram_actions
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
  const { id: providedId, type, notes } = req.body;
  if (!type) return res.status(400).json({ error: 'type required' });
  // Same idempotency as /actions — accept client-provided id so dual-write
  // to prod+staging produces matching rows on both backends.
  const id = providedId || uuidv4();
  db.prepare(`INSERT OR IGNORE INTO instagram_campaigns (id,user_id,type,notes) VALUES (?,?,?,?)`)
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

  // Who followed you back — for each "follow" action, check if the same
  // username later appears as a "new_follower" event. Gives conversion data.
  const conversion = db.prepare(`
    SELECT
      f.username,
      f.created_at AS followed_at,
      f.full_name,
      f.follower_count,
      (SELECT MIN(nf.created_at)
         FROM instagram_actions nf
         WHERE nf.user_id = f.user_id
           AND LOWER(nf.username) = LOWER(f.username)
           AND nf.type = 'new_follower'
           AND nf.created_at >= f.created_at
      ) AS followed_back_at
    FROM instagram_actions f
    WHERE f.user_id = ?
      AND f.type = 'follow'
      AND f.username IS NOT NULL
      AND datetime(f.created_at) >= ${since}
    ORDER BY f.created_at DESC
    LIMIT 100
  `).all(uid);

  // Best posts by follower conversion — for each post we engaged with,
  // count unique users we touched and how many of them later followed.
  const bestPosts = db.prepare(`
    SELECT
      a.post_url,
      a.post_owner,
      COUNT(DISTINCT a.username) AS engaged_users,
      COUNT(DISTINCT CASE
        WHEN EXISTS (
          SELECT 1 FROM instagram_actions nf
          WHERE nf.user_id = a.user_id
            AND LOWER(nf.username) = LOWER(a.username)
            AND nf.type = 'new_follower'
            AND nf.created_at >= a.created_at
        ) THEN a.username
      END) AS converted
    FROM instagram_actions a
    WHERE a.user_id = ?
      AND a.post_url IS NOT NULL
      AND a.username IS NOT NULL
      AND a.type IN ('like', 'comment', 'reply', 'follow')
      AND datetime(a.created_at) >= ${since}
    GROUP BY a.post_url
    HAVING engaged_users > 0
    ORDER BY converted DESC, engaged_users DESC
    LIMIT 20
  `).all(uid);

  res.json({ total, byType, follows, newFollowers, followBack, daily, topUsers, conversion, bestPosts });
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
  // No transaction wrapper — our db wrapper doesn't expose .transaction().
  // For 5–25 rows the perf impact of individual auto-commits is negligible.
  let inserted = 0;
  for (const p of posts) {
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
    inserted++;
  }
  res.json({ ok: true, count: inserted });
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

// ── Scheduled action campaigns (likes + replies orchestration) ───────────────
// Monday creates a campaign with N atomic queue items (one per post × action
// type). The extension's background alarm picks the oldest pending campaign,
// claims rows for the IG account it can run as, opens up to `concurrency`
// tabs in parallel, runs likes/replies, marks rows done. After all of an
// account's rows are done, switches accounts (respecting cooldown).

// Monday creates a campaign (starts as 'draft' — items added separately,
// then explicitly Sent to transition into the run queue).
router.post('/action-campaigns', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const { name, as_account, concurrency, start_at, items, free_text } = req.body || {};
  if (!as_account) return res.status(400).json({ error: 'as_account required' });
  const cid = uuidv4();
  const conc = Math.max(1, Math.min(6, parseInt(concurrency, 10) || 6));
  const cleanedAcct = String(as_account).trim().replace(/^@/, '').toLowerCase();
  // Auto-format name if not supplied: "@account YYYY-MM-DD HH:mm — free_text"
  let finalName = name && name.trim();
  if (!finalName) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    finalName = `@${cleanedAcct} ${stamp}` + (free_text ? ` — ${String(free_text).trim()}` : '');
  }
  db.prepare(`
    INSERT INTO instagram_action_campaigns
      (id, user_id, name, as_account, status, total_requested, concurrency, start_at)
    VALUES (?, ?, ?, ?, 'draft', 0, ?, ?)
  `).run(cid, uid, finalName, cleanedAcct, conc, start_at || null);

  // Optionally seed with items if the caller passed any. Enforce the 6-item cap.
  if (Array.isArray(items) && items.length > 0) {
    if (items.length > 6) return res.status(400).json({ error: 'A campaign can hold at most 6 items.' });
    const insertItem = db.prepare(`
      INSERT INTO instagram_action_queue
        (id, campaign_id, user_id, as_account, post_url, action_type, count_requested, reply_source, reply_texts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let total = 0;
    for (const it of items) {
      const actionType = it.action_type === 'reply' ? 'reply' : 'like';
      const count = Math.max(1, parseInt(it.count, 10) || 1);
      total += count;
      insertItem.run(
        uuidv4(), cid, uid, cleanedAcct,
        String(it.post_url || ''),
        actionType, count,
        actionType === 'reply' ? (it.reply_source || 'default') : null,
        actionType === 'reply' && Array.isArray(it.reply_texts) ? JSON.stringify(it.reply_texts) : null
      );
    }
    db.prepare('UPDATE instagram_action_campaigns SET total_requested = ? WHERE id = ?').run(total, cid);
  }
  const row = db.prepare('SELECT * FROM instagram_action_campaigns WHERE id = ?').get(cid);
  res.json(row);
});

// Monday lists this user's action campaigns. Includes item count + the
// as_account derived from any of the campaign's items so the UI can display
// the target IG account on the list page.
router.get('/action-campaigns', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const rows = db.prepare(`
    SELECT c.*,
           (SELECT COUNT(*) FROM instagram_action_queue q WHERE q.campaign_id = c.id) AS items_count,
           COALESCE(c.as_account,
                    (SELECT q.as_account FROM instagram_action_queue q WHERE q.campaign_id = c.id LIMIT 1)
           ) AS as_account
    FROM instagram_action_campaigns c
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC LIMIT 100
  `).all(uid);
  res.json(rows);
});

// Add a single item to an existing campaign (draft or pending/running).
// Enforces the per-campaign 6-item cap.
router.post('/action-campaigns/:id/items', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const cid = req.params.id;
  const campaign = db.prepare('SELECT * FROM instagram_action_campaigns WHERE id = ? AND user_id = ?').get(cid, uid);
  if (!campaign) return res.status(404).json({ error: 'not found' });
  if (campaign.status === 'completed' || campaign.status === 'cancelled') {
    return res.status(400).json({ error: 'Cannot add items to a completed or cancelled campaign.' });
  }
  const current = db.prepare('SELECT COUNT(*) AS n FROM instagram_action_queue WHERE campaign_id = ?').get(cid);
  if ((current?.n || 0) >= 6) return res.status(400).json({ error: 'Campaign already has 6 items (max).' });

  const { post_url, action_type, count, reply_source, reply_texts, as_account } = req.body || {};
  if (!post_url) return res.status(400).json({ error: 'post_url required' });
  // Campaign-level as_account is the source of truth. Fall back to existing
  // items (for legacy campaigns without the column) and finally the body.
  const existing = db.prepare('SELECT as_account FROM instagram_action_queue WHERE campaign_id = ? LIMIT 1').get(cid);
  const acct = campaign.as_account
    || existing?.as_account
    || (as_account && String(as_account).trim().replace(/^@/, '').toLowerCase());
  if (!acct) return res.status(400).json({ error: 'as_account required for the first item' });

  const at = action_type === 'reply' ? 'reply' : 'like';
  const cnt = Math.max(1, parseInt(count, 10) || 1);
  const itemId = uuidv4();
  db.prepare(`
    INSERT INTO instagram_action_queue
      (id, campaign_id, user_id, as_account, post_url, action_type, count_requested, reply_source, reply_texts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    itemId, cid, uid, acct, String(post_url),
    at, cnt,
    at === 'reply' ? (reply_source || 'default') : null,
    at === 'reply' && Array.isArray(reply_texts) ? JSON.stringify(reply_texts) : null
  );

  // Refresh campaign totals
  const stats = db.prepare(`
    SELECT SUM(count_requested) AS req FROM instagram_action_queue WHERE campaign_id = ?
  `).get(cid);
  db.prepare('UPDATE instagram_action_campaigns SET total_requested = ? WHERE id = ?').run(stats?.req || 0, cid);

  res.json(db.prepare('SELECT * FROM instagram_action_queue WHERE id = ?').get(itemId));
});

// Edit an item's count_requested (only allowed while it's still pending —
// once claimed/running/completed, edits are rejected).
router.patch('/action-campaigns/:id/items/:itemId', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const item = db.prepare(`
    SELECT * FROM instagram_action_queue
    WHERE id = ? AND campaign_id = ? AND user_id = ?
  `).get(req.params.itemId, req.params.id, uid);
  if (!item) return res.status(404).json({ error: 'item not found' });
  if (item.status !== 'pending') {
    return res.status(400).json({ error: `Cannot edit item with status '${item.status}'.` });
  }
  const cnt = Math.max(1, parseInt(req.body?.count_requested, 10) || 1);
  db.prepare(`UPDATE instagram_action_queue SET count_requested = ? WHERE id = ?`).run(cnt, item.id);

  const stats = db.prepare(`
    SELECT SUM(count_requested) AS req FROM instagram_action_queue WHERE campaign_id = ?
  `).get(req.params.id);
  db.prepare('UPDATE instagram_action_campaigns SET total_requested = ? WHERE id = ?').run(stats?.req || 0, req.params.id);

  res.json({ ok: true });
});

// Remove an item (only if it's pending).
router.delete('/action-campaigns/:id/items/:itemId', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const item = db.prepare(`
    SELECT * FROM instagram_action_queue
    WHERE id = ? AND campaign_id = ? AND user_id = ?
  `).get(req.params.itemId, req.params.id, uid);
  if (!item) return res.status(404).json({ error: 'item not found' });
  if (item.status !== 'pending') {
    return res.status(400).json({ error: `Cannot remove item with status '${item.status}'.` });
  }
  db.prepare('DELETE FROM instagram_action_queue WHERE id = ?').run(item.id);

  const stats = db.prepare(`
    SELECT SUM(count_requested) AS req FROM instagram_action_queue WHERE campaign_id = ?
  `).get(req.params.id);
  db.prepare('UPDATE instagram_action_campaigns SET total_requested = ? WHERE id = ?').run(stats?.req || 0, req.params.id);

  res.json({ ok: true });
});

// Patch editable campaign fields (start_at, name, concurrency) — useful when
// the user wants to schedule the campaign for a future time after creating it
// or rename it. Allowed in any status except completed/cancelled.
router.patch('/action-campaigns/:id', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const campaign = db.prepare('SELECT * FROM instagram_action_campaigns WHERE id = ? AND user_id = ?').get(req.params.id, uid);
  if (!campaign) return res.status(404).json({ error: 'not found' });
  if (campaign.status === 'completed' || campaign.status === 'cancelled') {
    return res.status(400).json({ error: `Cannot edit a ${campaign.status} campaign.` });
  }
  const { start_at, name, concurrency } = req.body || {};
  const fields = [];
  const params = [];
  if (start_at !== undefined) { fields.push('start_at = ?'); params.push(start_at || null); }
  if (name !== undefined) { fields.push('name = ?'); params.push(String(name).slice(0, 200) || null); }
  if (concurrency !== undefined) {
    const c = Math.max(1, Math.min(6, parseInt(concurrency, 10) || 6));
    fields.push('concurrency = ?'); params.push(c);
  }
  if (fields.length === 0) return res.json({ ok: true });
  params.push(req.params.id);
  db.prepare(`UPDATE instagram_action_campaigns SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

// Send a draft campaign — transitions to 'pending' so the extension picks it
// up on its next poll cycle. Refuses if the campaign has no items.
router.post('/action-campaigns/:id/send', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const campaign = db.prepare('SELECT * FROM instagram_action_campaigns WHERE id = ? AND user_id = ?').get(req.params.id, uid);
  if (!campaign) return res.status(404).json({ error: 'not found' });
  if (campaign.status !== 'draft') return res.status(400).json({ error: `Campaign is not a draft (status=${campaign.status}).` });
  const items = db.prepare('SELECT COUNT(*) AS n FROM instagram_action_queue WHERE campaign_id = ?').get(req.params.id);
  if ((items?.n || 0) === 0) return res.status(400).json({ error: 'Cannot send a campaign with no items.' });
  db.prepare(`UPDATE instagram_action_campaigns SET status = 'pending' WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// Delete a campaign + its items entirely. Allowed in any status.
router.delete('/action-campaigns/:id', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const r = db.prepare('DELETE FROM instagram_action_campaigns WHERE id = ? AND user_id = ?').run(req.params.id, uid);
  if (r.changes === 0) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM instagram_action_queue WHERE campaign_id = ? AND user_id = ?').run(req.params.id, uid);
  res.json({ ok: true });
});

// Monday: campaign detail + per-action breakdown
router.get('/action-campaigns/:id', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const campaign = db.prepare(`
    SELECT * FROM instagram_action_campaigns WHERE id = ? AND user_id = ?
  `).get(req.params.id, uid);
  if (!campaign) return res.status(404).json({ error: 'not found' });
  const items = db.prepare(`
    SELECT * FROM instagram_action_queue
    WHERE campaign_id = ? ORDER BY created_at ASC
  `).all(req.params.id);
  res.json({ campaign, items });
});

// Monday: cancel campaign — pending items get skipped; in-flight ones finish
router.post('/action-campaigns/:id/cancel', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  db.prepare(`
    UPDATE instagram_action_campaigns
    SET status = 'cancelled', ended_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(req.params.id, uid);
  db.prepare(`
    UPDATE instagram_action_queue
    SET status = 'cancelled'
    WHERE campaign_id = ? AND status = 'pending'
  `).run(req.params.id);
  res.json({ ok: true });
});

// Monday: resume paused campaign
router.post('/action-campaigns/:id/resume', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  db.prepare(`
    UPDATE instagram_action_campaigns
    SET status = 'pending', consecutive_failures = 0, error_message = NULL
    WHERE id = ? AND user_id = ? AND status IN ('paused', 'failed')
  `).run(req.params.id, uid);
  res.json({ ok: true });
});

// Extension: list IG accounts that have pending action-queue items for this user.
// Lets the extension know which accounts it should consider switching to.
router.get('/action-queue/pending-accounts', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  // Order accounts by the created_at of their oldest eligible pending
  // campaign — strict FIFO across accounts. If @A's oldest campaign was
  // created before @B's oldest, the extension switches to @A first.
  const rows = db.prepare(`
    SELECT q.as_account, MIN(c.created_at) AS oldest_campaign
    FROM instagram_action_queue q
    JOIN instagram_action_campaigns c ON c.id = q.campaign_id
    WHERE q.user_id = ?
      AND q.status = 'pending'
      AND c.status IN ('pending', 'running')
      AND (c.start_at IS NULL OR datetime(c.start_at) <= datetime('now'))
    GROUP BY q.as_account
    ORDER BY oldest_campaign ASC
  `).all(uid);
  res.json(rows.map(r => r.as_account));
});

// Extension: claim the next batch of pending actions for a given account.
// Atomically transitions up to N rows from 'pending' to 'claimed' and returns
// them so the background can dispatch them across multiple tabs.
router.get('/action-queue/pending', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const acct = String(req.query.as_account || '').trim().replace(/^@/, '').toLowerCase();
  const limit = Math.max(1, Math.min(6, parseInt(req.query.limit, 10) || 1));
  if (!acct) return res.status(400).json({ error: 'as_account required' });

  // Find the oldest eligible campaign for this user+account combo so we don't
  // interleave campaigns. We pick at most `limit` items, all from the same
  // campaign, and atomically claim them.
  const campaign = db.prepare(`
    SELECT c.* FROM instagram_action_campaigns c
    WHERE c.user_id = ?
      AND c.status IN ('pending', 'running')
      AND (c.start_at IS NULL OR datetime(c.start_at) <= datetime('now'))
      AND EXISTS (
        SELECT 1 FROM instagram_action_queue q
        WHERE q.campaign_id = c.id
          AND q.user_id = c.user_id
          AND q.as_account = ?
          AND q.status = 'pending'
      )
    ORDER BY c.created_at ASC LIMIT 1
  `).get(uid, acct);

  if (!campaign) return res.json({ campaign: null, items: [] });

  // Mark campaign as running if it wasn't already
  if (campaign.status === 'pending') {
    db.prepare(`
      UPDATE instagram_action_campaigns
      SET status = 'running', started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
      WHERE id = ? AND status = 'pending'
    `).run(campaign.id);
  }

  // Claim up to `limit` rows one-by-one (atomic via the WHERE status='pending').
  // The shared db wrapper doesn't expose transactions, so we just loop.
  const claimed = [];
  for (let i = 0; i < limit; i++) {
    const row = db.prepare(`
      SELECT id FROM instagram_action_queue
      WHERE campaign_id = ? AND user_id = ? AND as_account = ? AND status = 'pending'
      ORDER BY created_at ASC LIMIT 1
    `).get(campaign.id, uid, acct);
    if (!row) break;
    const claim = db.prepare(`
      UPDATE instagram_action_queue
      SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'
    `).run(row.id);
    if (claim.changes > 0) {
      claimed.push(db.prepare('SELECT * FROM instagram_action_queue WHERE id = ?').get(row.id));
    }
  }
  res.json({ campaign, items: claimed });
});

// Extension: report progress / completion on a queue item.
// Body: { status, count_done, error_message }
router.patch('/action-queue/:id', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const { status, count_done, error_message } = req.body || {};
  const isTerminal = status === 'completed' || status === 'failed' || status === 'cancelled';

  const item = db.prepare('SELECT * FROM instagram_action_queue WHERE id = ? AND user_id = ?').get(req.params.id, uid);
  if (!item) return res.status(404).json({ error: 'not found' });

  db.prepare(`
    UPDATE instagram_action_queue
    SET status = COALESCE(?, status),
        count_done = COALESCE(?, count_done),
        error_message = COALESCE(?, error_message),
        started_at = COALESCE(started_at, CASE WHEN ? = 'running' THEN CURRENT_TIMESTAMP ELSE NULL END),
        completed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE completed_at END
    WHERE id = ? AND user_id = ?
  `).run(
    status || null,
    Number.isFinite(count_done) ? count_done : null,
    error_message || null,
    status || null,
    isTerminal ? 1 : 0,
    req.params.id, uid
  );

  // Roll up campaign-level counters and consecutive_failures tracking.
  if (isTerminal) {
    const camp = db.prepare('SELECT * FROM instagram_action_campaigns WHERE id = ?').get(item.campaign_id);
    if (camp) {
      const stats = db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status IN ('pending', 'claimed', 'running') THEN 1 ELSE 0 END) AS remaining
        FROM instagram_action_queue WHERE campaign_id = ?
      `).get(camp.id);
      const totalCompletedCount = Number.isFinite(count_done) ? count_done : 0;
      const newCompleted = (camp.total_completed || 0) + totalCompletedCount;
      const newFails = status === 'failed' ? (camp.consecutive_failures || 0) + 1 : 0;
      let newStatus = camp.status;
      let newEnded = null;
      if (stats.remaining === 0) {
        newStatus = 'completed';
        newEnded = 1;
      } else if (newFails >= 3) {
        newStatus = 'paused';
      }
      db.prepare(`
        UPDATE instagram_action_campaigns
        SET total_completed = ?,
            consecutive_failures = ?,
            status = ?,
            ended_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE ended_at END,
            error_message = CASE WHEN ? = 'paused' THEN '3 consecutive failures — likely rate-limited by Instagram. Resume manually.' ELSE error_message END
        WHERE id = ?
      `).run(newCompleted, newFails, newStatus, newEnded ? 1 : 0, newStatus, camp.id);
    }
  }
  res.json({ ok: true });
});

// ── Daily follower count tracking ────────────────────────────────────────────
// Extension scrapes the public profile page of each managed account once a
// day, reads the follower count from the og:description meta tag, and POSTs
// it here. Monday reads the time series back to show trends + day-over-day
// deltas in the Followers tab.

// Extension uploads a single follower count for a profile
router.post('/follower-counts', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const { my_profile, follower_count } = req.body || {};
  if (!my_profile || !Number.isFinite(Number(follower_count))) {
    return res.status(400).json({ error: 'my_profile and follower_count (number) required' });
  }
  const cleaned = String(my_profile).trim().replace(/^@/, '').toLowerCase();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO instagram_follower_counts (id, user_id, my_profile, follower_count)
    VALUES (?, ?, ?, ?)
  `).run(id, uid, cleaned, Math.round(Number(follower_count)));
  res.json({ id });
});

// Monday reads the time series. Supports:
//   ?my_profile=X     — filter to a single profile (otherwise: all profiles)
//   ?aggregate=day|month — bucket by day or month; default = day
//   ?limit=N          — how many buckets to return; default = 60
router.get('/follower-counts', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const aggregate = req.query.aggregate === 'month' ? 'month' : 'day';
  const limit = Math.max(1, Math.min(365, parseInt(req.query.limit, 10) || 60));
  const profileFilter = req.query.my_profile
    ? String(req.query.my_profile).trim().replace(/^@/, '').toLowerCase()
    : null;

  // SQLite strftime: %Y-%m-%d for day, %Y-%m for month. Use the LATEST count
  // in each bucket so multiple scrapes per day collapse to the most recent.
  const bucketExpr = aggregate === 'month'
    ? `strftime('%Y-%m', captured_at)`
    : `strftime('%Y-%m-%d', captured_at)`;

  // Per (profile, bucket) take the latest follower_count.
  const rows = db.prepare(`
    SELECT my_profile,
           ${bucketExpr} AS bucket,
           follower_count
    FROM (
      SELECT my_profile, captured_at, follower_count,
             ROW_NUMBER() OVER (
               PARTITION BY my_profile, ${bucketExpr}
               ORDER BY captured_at DESC
             ) AS rn
      FROM instagram_follower_counts
      WHERE user_id = ?
        ${profileFilter ? 'AND my_profile = ?' : ''}
    )
    WHERE rn = 1
    ORDER BY my_profile ASC, bucket DESC
    LIMIT ?
  `).all(...(profileFilter ? [uid, profileFilter, limit] : [uid, limit]));

  // Compute delta from previous bucket (same profile) and shape the response.
  // Group by profile so the frontend can show one block per profile.
  const byProfile = {};
  for (const r of rows) {
    (byProfile[r.my_profile] ??= []).push(r);
  }
  const out = Object.entries(byProfile).map(([profile, list]) => {
    // list is currently DESC; reverse to ASC for delta calc
    const asc = [...list].reverse();
    const series = asc.map((row, i) => ({
      bucket: row.bucket,
      follower_count: row.follower_count,
      delta: i === 0 ? null : row.follower_count - asc[i - 1].follower_count,
    }));
    // Return DESC for display
    return { my_profile: profile, points: series.reverse() };
  });
  // Sort profiles by latest count desc for stable display
  out.sort((a, b) => (b.points[0]?.follower_count || 0) - (a.points[0]?.follower_count || 0));
  res.json(out);
});

// Monday calls this to force the extension to scrape follower counts on its
// next 2-minute poll, instead of waiting for the daily cycle.
router.post('/follower-counts/trigger', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  db.prepare('UPDATE users SET instagram_follower_trigger_at = CURRENT_TIMESTAMP WHERE id = ?').run(uid);
  res.json({ ok: true });
});

// Extension polls this on every alarm tick. If a trigger is pending, returns
// should_run=true AND atomically clears the flag so we don't run twice.
router.get('/follower-counts/should-trigger', authenticateFlexible, (req, res) => {
  const uid = targetUser(req);
  const row = db.prepare('SELECT instagram_follower_trigger_at FROM users WHERE id = ?').get(uid);
  if (!row?.instagram_follower_trigger_at) return res.json({ should_run: false });
  const result = db.prepare(`
    UPDATE users SET instagram_follower_trigger_at = NULL
    WHERE id = ? AND instagram_follower_trigger_at IS NOT NULL
  `).run(uid);
  res.json({ should_run: result.changes > 0 });
});

// ── AI caption generator (Groq) ──────────────────────────────────────────────
// Uses Groq's vision model when the user uploaded an image so the caption is
// actually about the picture. For video uploads we fall back to a text-only
// model (Groq doesn't accept raw video) and rely on the topic/comments the
// user typed. Requires GROQ_API_KEY in backend/.env.
const fetchFn = (typeof fetch === 'function') ? fetch : require('node-fetch');
router.post('/ai-caption', authenticateFlexible, async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY is not set on the server.' });

  const { topic, tone, include_hashtags, comments, image_b64, mime_type } = req.body || {};
  const isImage = !!(mime_type && /^image\//i.test(mime_type) && image_b64);
  // Groq vision model — check https://console.groq.com/docs/models for current.
  // Llama 4 Scout is the current vision-capable model after the 3.2-vision
  // family was decommissioned.
  const model = isImage ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'llama-3.1-8b-instant';

  let prompt = `Write a short, engaging Instagram caption${isImage ? ' for this image' : ''}.`;
  if (topic) prompt += ` Topic: "${String(topic).slice(0, 500)}".`;
  if (tone) prompt += ` Tone: ${tone}.`;
  if (comments) prompt += ` Additional notes from the user: "${String(comments).slice(0, 500)}".`;
  prompt += include_hashtags
    ? ' Include 3–5 relevant hashtags at the end.'
    : ' Do not include any hashtags.';
  prompt += ' Keep the whole caption under 220 characters. Return only the caption text — no quotes, no preamble.';

  const messages = isImage
    ? [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mime_type};base64,${image_b64}` } },
        ],
      }]
    : [{ role: 'user', content: prompt }];

  try {
    const r = await fetchFn('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, max_tokens: 250, messages }),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return res.status(502).json({ error: `Groq HTTP ${r.status}: ${text.slice(0, 300)}` });
    }
    const data = await r.json();
    const caption = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!caption) return res.status(502).json({ error: 'Groq returned an empty caption.' });
    res.json({ caption, used_vision: isImage });
  } catch (e) {
    res.status(502).json({ error: e?.message || 'Groq fetch failed' });
  }
});

// ── Extension tab visibility per user ────────────────────────────────────────
// Permissions live in users.permissions (the existing JSON column managed
// from the admin User Management page) using nested dotted keys:
//   marketing                            → enables the Marketing module
//   marketing.instagram                  → enables Instagram inside Marketing
//   marketing.instagram.engagement       → per-tab visibility (and so on)
// Absent keys default to "enabled" — only an explicit `false` disables.
// Elevated roles (super_admin / admin) always see everything.
const VALID_EXT_TABS = ['engagement', 'messaging', 'insights', 'accounts', 'schedule', 'sync', 'pages'];

router.get('/extension/permissions', authenticateFlexible, (req, res) => {
  const uid = req.user.id;
  const row = db.prepare('SELECT permissions, role FROM users WHERE id = ?').get(uid);
  // Elevated users always see every tab
  if (row?.role === 'super_admin' || row?.role === 'admin') {
    return res.json({ allowed_tabs: null });
  }
  let perms = {};
  try { perms = JSON.parse(row?.permissions || '{}'); } catch (_) {}
  // Marketing or Instagram module disabled → no popup tabs visible
  if (perms.marketing === false || perms['marketing.instagram'] === false) {
    return res.json({ allowed_tabs: [] });
  }
  // Per-tab: only explicit `false` hides a tab. Absent = visible.
  const allowed = VALID_EXT_TABS.filter(t => perms[`marketing.instagram.${t}`] !== false);
  // If everything's allowed, return null so the popup keeps its "show all" path
  res.json({ allowed_tabs: allowed.length === VALID_EXT_TABS.length ? null : allowed });
});

// ── System health / QA dashboard ─────────────────────────────────────────────
// Per-user health summary — aggregates status indicators for every
// Instagram-side feature so the user can spot regressions and stuck schedules
// at a glance. Each block returns the current counts + a derived `status`
// (ok / late / failing / unknown) the UI uses to pick a color. Read-only.
router.get('/admin/health', authenticateFlexible, (req, res) => {
  const uid = req.user.id;

  // ── Daily follower counts ──────────────────────────────────────────────
  const fcLast = db.prepare(`
    SELECT MAX(captured_at) AS last_at,
           (SELECT COUNT(DISTINCT my_profile) FROM instagram_follower_counts WHERE user_id = ?) AS profiles_tracked
    FROM instagram_follower_counts WHERE user_id = ?
  `).get(uid, uid);
  const fcAgeMs = fcLast?.last_at ? (Date.now() - new Date(fcLast.last_at).getTime()) : null;
  const followerCounts = {
    last_capture_at: fcLast?.last_at || null,
    profiles_tracked: fcLast?.profiles_tracked || 0,
    status: !fcLast?.last_at ? 'unknown'
          : fcAgeMs < 26 * 3600 * 1000 ? 'ok'
          : fcAgeMs < 72 * 3600 * 1000 ? 'late'
          : 'failing',
  };

  // ── Scheduled posts ─────────────────────────────────────────────────────
  const spByStatus = db.prepare(`
    SELECT status, COUNT(*) AS n FROM instagram_scheduled_posts
    WHERE user_id = ? GROUP BY status
  `).all(uid);
  const spOverdue = db.prepare(`
    SELECT COUNT(*) AS n FROM instagram_scheduled_posts
    WHERE user_id = ? AND status IN ('scheduled', 'claimed')
      AND datetime(scheduled_at) < datetime('now', '-15 minutes')
  `).get(uid)?.n || 0;
  const scheduledPosts = {
    by_status: Object.fromEntries(spByStatus.map(r => [r.status, r.n])),
    overdue: spOverdue,
    status: spOverdue > 0 ? 'late'
          : (spByStatus.find(r => r.status === 'failed')?.n || 0) > 0 ? 'failing'
          : 'ok',
  };

  // ── Action batches (formerly Campaigns) ────────────────────────────────
  const abByStatus = db.prepare(`
    SELECT status, COUNT(*) AS n FROM instagram_action_campaigns
    WHERE user_id = ? GROUP BY status
  `).all(uid);
  const abStalledRunning = db.prepare(`
    SELECT COUNT(*) AS n FROM instagram_action_campaigns
    WHERE user_id = ? AND status = 'running'
      AND datetime(started_at) < datetime('now', '-1 hour')
  `).get(uid)?.n || 0;
  const actionBatches = {
    by_status: Object.fromEntries(abByStatus.map(r => [r.status, r.n])),
    stalled_running: abStalledRunning,
    status: abStalledRunning > 0 ? 'late'
          : (abByStatus.find(r => r.status === 'paused')?.n || 0) > 0 ? 'failing'
          : 'ok',
  };

  // ── Scrape jobs ────────────────────────────────────────────────────────
  const sjByStatus = db.prepare(`
    SELECT status, COUNT(*) AS n FROM instagram_scrape_jobs
    WHERE user_id = ? GROUP BY status
  `).all(uid);
  const sjStalledRunning = db.prepare(`
    SELECT COUNT(*) AS n FROM instagram_scrape_jobs
    WHERE user_id = ? AND status = 'running'
      AND datetime(started_at) < datetime('now', '-15 minutes')
  `).get(uid)?.n || 0;
  const scrapeJobs = {
    by_status: Object.fromEntries(sjByStatus.map(r => [r.status, r.n])),
    stalled_running: sjStalledRunning,
    status: sjStalledRunning > 0 ? 'late'
          : (sjByStatus.find(r => r.status === 'failed')?.n || 0) > 0 ? 'failing'
          : 'ok',
  };

  // ── Extension activity (proxy: how recent any action was logged) ───────
  const extLastAction = db.prepare(`
    SELECT MAX(created_at) AS last_at FROM instagram_actions WHERE user_id = ?
  `).get(uid)?.last_at;
  const ext24h = db.prepare(`
    SELECT COUNT(*) AS n FROM instagram_actions
    WHERE user_id = ? AND datetime(created_at) >= datetime('now', '-1 day')
  `).get(uid)?.n || 0;
  const extAgeMs = extLastAction ? (Date.now() - new Date(extLastAction).getTime()) : null;
  const extensionActivity = {
    last_action_at: extLastAction || null,
    actions_last_24h: ext24h,
    status: !extLastAction ? 'unknown'
          : extAgeMs < 24 * 3600 * 1000 ? 'ok'
          : extAgeMs < 7 * 24 * 3600 * 1000 ? 'late'
          : 'failing',
  };

  // ── This user's own permissions ────────────────────────────────────────
  // Read the current user's permissions JSON and surface which Instagram
  // extension tabs they're allowed to see.
  const userRow = db.prepare('SELECT permissions, role FROM users WHERE id = ?').get(uid);
  let userPerms = {};
  try { userPerms = JSON.parse(userRow?.permissions || '{}'); } catch (_) {}
  const isElevated = userRow?.role === 'super_admin' || userRow?.role === 'admin';
  const igTabs = ['engagement', 'messaging', 'insights', 'accounts', 'schedule', 'sync', 'pages'];
  const tabsAllowed = isElevated
    ? igTabs.length
    : (userPerms.marketing === false || userPerms['marketing.instagram'] === false)
      ? 1 // only Sync
      : igTabs.filter(t => userPerms[`marketing.instagram.${t}`] !== false).length;
  const permissions = {
    role: userRow?.role || 'user',
    tabs_allowed: tabsAllowed,
    total_tabs: igTabs.length,
    status: 'ok',
  };

  // ── IG accounts configured ─────────────────────────────────────────────
  const acctRow = db.prepare('SELECT instagram_accounts FROM users WHERE id = ?').get(uid);
  let accountsCount = 0;
  try { accountsCount = JSON.parse(acctRow?.instagram_accounts || '[]').length; } catch (_) {}
  const accounts = {
    count: accountsCount,
    status: accountsCount > 0 ? 'ok' : 'unknown',
  };

  res.json({
    generated_at: new Date().toISOString(),
    follower_counts: followerCounts,
    scheduled_posts: scheduledPosts,
    action_batches: actionBatches,
    scrape_jobs: scrapeJobs,
    extension_activity: extensionActivity,
    permissions,
    accounts,
  });
});

module.exports = router;
