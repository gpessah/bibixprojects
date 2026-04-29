const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const db        = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── DB tables (also created in telegram.js — safe to repeat with IF NOT EXISTS) ─
db.exec(`
  CREATE TABLE IF NOT EXISTS bot_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS bot_reminders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    remind_at DATETIME NOT NULL,
    sent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS bot_habits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    send_time TEXT DEFAULT '09:00',
    active INTEGER DEFAULT 1,
    last_notified_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS bot_time_blocks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 25,
    scheduled_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS bot_settings (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', authenticate, (req, res) => {
  const uid = req.user.id;
  const notes          = db.prepare('SELECT COUNT(*) as n FROM bot_notes WHERE user_id = ?').get(uid).n;
  const pendingReminders = db.prepare("SELECT COUNT(*) as n FROM bot_reminders WHERE user_id = ? AND sent = 0").get(uid).n;
  const activeHabits   = db.prepare('SELECT COUNT(*) as n FROM bot_habits WHERE user_id = ? AND active = 1').get(uid).n;
  const completedBlocks = db.prepare('SELECT COUNT(*) as n FROM bot_time_blocks WHERE user_id = ? AND completed_at IS NOT NULL').get(uid).n;
  const telegram       = db.prepare('SELECT username FROM telegram_links WHERE user_id = ?').get(uid);
  res.json({ notes, pendingReminders, activeHabits, completedBlocks, telegramLinked: !!telegram, telegramUsername: telegram?.username || null });
});

// ── Notes ─────────────────────────────────────────────────────────────────────
router.get('/notes', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM bot_notes WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id));
});

router.post('/notes', authenticate, (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  const id = uuidv4();
  db.prepare('INSERT INTO bot_notes (id, user_id, content) VALUES (?,?,?)').run(id, req.user.id, content.trim());
  res.json(db.prepare('SELECT * FROM bot_notes WHERE id = ?').get(id));
});

router.delete('/notes/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM bot_notes WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ── Reminders ─────────────────────────────────────────────────────────────────
router.get('/reminders', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM bot_reminders WHERE user_id = ? ORDER BY remind_at ASC').all(req.user.id));
});

router.post('/reminders', authenticate, (req, res) => {
  const { content, remind_at } = req.body;
  if (!content?.trim() || !remind_at) return res.status(400).json({ error: 'content and remind_at required' });
  const id = uuidv4();
  db.prepare('INSERT INTO bot_reminders (id, user_id, content, remind_at) VALUES (?,?,?,?)').run(id, req.user.id, content.trim(), remind_at);
  res.json(db.prepare('SELECT * FROM bot_reminders WHERE id = ?').get(id));
});

router.delete('/reminders/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM bot_reminders WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ── Habits ────────────────────────────────────────────────────────────────────
router.get('/habits', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM bot_habits WHERE user_id = ? ORDER BY created_at ASC').all(req.user.id));
});

router.post('/habits', authenticate, (req, res) => {
  const { title, description, send_time } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  const id = uuidv4();
  db.prepare('INSERT INTO bot_habits (id, user_id, title, description, send_time) VALUES (?,?,?,?,?)').run(id, req.user.id, title.trim(), description?.trim() || null, send_time || '09:00');
  res.json(db.prepare('SELECT * FROM bot_habits WHERE id = ?').get(id));
});

router.put('/habits/:id', authenticate, (req, res) => {
  const { title, description, send_time, active } = req.body;
  if (!db.prepare('SELECT id FROM bot_habits WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE bot_habits SET
    title = COALESCE(?, title),
    description = CASE WHEN ? IS NOT NULL THEN ? ELSE description END,
    send_time = COALESCE(?, send_time),
    active = CASE WHEN ? IS NOT NULL THEN ? ELSE active END
    WHERE id = ?`)
    .run(title || null, description !== undefined ? 1 : null, description !== undefined ? (description || null) : null, send_time || null, active !== undefined ? 1 : null, active !== undefined ? (active ? 1 : 0) : null, req.params.id);
  res.json(db.prepare('SELECT * FROM bot_habits WHERE id = ?').get(req.params.id));
});

router.delete('/habits/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM bot_habits WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ── Time Blocks ───────────────────────────────────────────────────────────────
router.get('/time-blocks', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM bot_time_blocks WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id));
});

router.post('/time-blocks', authenticate, (req, res) => {
  const { title, duration_minutes } = req.body;
  if (!title?.trim() || !duration_minutes) return res.status(400).json({ error: 'title and duration_minutes required' });
  const id = uuidv4();
  db.prepare("INSERT INTO bot_time_blocks (id, user_id, title, duration_minutes, scheduled_at) VALUES (?,?,?,?,datetime('now'))").run(id, req.user.id, title.trim(), parseInt(duration_minutes));
  res.json(db.prepare('SELECT * FROM bot_time_blocks WHERE id = ?').get(id));
});

router.put('/time-blocks/:id/complete', authenticate, (req, res) => {
  if (!db.prepare('SELECT id FROM bot_time_blocks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE bot_time_blocks SET completed_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json(db.prepare('SELECT * FROM bot_time_blocks WHERE id = ?').get(req.params.id));
});

router.delete('/time-blocks/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM bot_time_blocks WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ── User Settings (timezone, etc.) ────────────────────────────────────────────
router.get('/settings', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM bot_settings WHERE user_id = ?').get(req.user.id);
  res.json({ timezone: row?.timezone || 'UTC' });
});

router.put('/settings', authenticate, (req, res) => {
  const { timezone } = req.body;
  if (!timezone) return res.status(400).json({ error: 'timezone required' });
  // Validate the timezone string
  try { Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch {
    return res.status(400).json({ error: 'Invalid timezone' });
  }
  db.prepare('INSERT OR REPLACE INTO bot_settings (user_id, timezone) VALUES (?,?)').run(req.user.id, timezone);
  res.json({ timezone });
});

// ── AI settings (read-only — keys come from .env) ─────────────────────────────
router.get('/ai-settings', authenticate, (_req, res) => {
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasGrok   = !!process.env.GROK_API_KEY;
  res.json({
    openaiConfigured: hasOpenAI,
    grokConfigured:   hasGrok,
    // True if any AI provider is ready
    aiEnabled:        hasOpenAI || hasGrok,
    // Which features each provider supports
    features: {
      chat:        hasGrok || hasOpenAI,
      tldr:        hasGrok || hasOpenAI,
      ocr:         hasGrok || hasOpenAI,
      image:       hasOpenAI,
      tts:         hasOpenAI,
      transcribe:  hasOpenAI,
    },
    provider: hasGrok && hasOpenAI ? 'both' : hasGrok ? 'grok' : hasOpenAI ? 'openai' : 'none',
  });
});

module.exports = router;
