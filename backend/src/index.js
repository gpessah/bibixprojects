const path = require('path');
// Use __dirname so dotenv always finds backend/.env regardless of cwd (Passenger quirk)
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');

const app = express();

// In production the Express server serves both API and the built React app,
// so CORS is only needed in local development (Vite dev server on a different port).
if (process.env.NODE_ENV !== 'production') {
  app.use(cors());
}

app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/workspaces', require('./routes/workspaces'));
app.use('/api/boards', require('./routes/boards'));
app.use('/api/boards/:boardId/members', require('./routes/boardMembers'));
app.use('/api/boards/:boardId/import', require('./routes/boardImport'));
app.use('/api/columns', require('./routes/columns'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/items', require('./routes/items'));
app.use('/api/updates', require('./routes/updates'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/push', require('./routes/push'));
app.use('/api/automations', require('./routes/automations'));
app.use('/api/search', require('./routes/search'));

const attachmentsRouter = require('./routes/attachments');
app.use('/api/items/:itemId/attachments', attachmentsRouter);
app.use('/api/uploads', express.static(attachmentsRouter.UPLOADS_DIR));

app.use('/api/telegram', require('./routes/telegramApi'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/bibixbot', require('./routes/bibixbot'));
app.use('/api/events',      require('./routes/events'));
app.use('/api/scheduling',  require('./routes/scheduling'));
app.use('/api/crm',         require('./routes/crm'));
app.use('/api/invoices',    require('./routes/invoices'));

// Start Telegram bot (only if TELEGRAM_BOT_TOKEN is set)
const tgBot = require('./bot/telegram');

// Webhook endpoint — only active in production (when TELEGRAM_WEBHOOK_URL is set)
if (tgBot.enabled && process.env.TELEGRAM_WEBHOOK_URL && process.env.TELEGRAM_BOT_TOKEN) {
  const whPath = `/api/tgwh/${process.env.TELEGRAM_BOT_TOKEN}`;
  app.post(whPath, (req, res) => {
    tgBot.bot.processUpdate(req.body);
    res.sendStatus(200);
  });
  console.log('[Telegram] Webhook endpoint active at', whPath);
}

const fetch = require('node-fetch');
const SETUP_SECRET = process.env.SETUP_SECRET || 'bibix-setup-2026';

app.get('/api/health', (req, res) => res.json({ status: 'ok', pid: process.pid, v: 2 }));

app.get('/api/ping', (req, res) => res.json({ ok: true, pid: process.pid }));

app.get('/api/wh-info', async (req, res) => {
  if (req.query.secret !== SETUP_SECRET) return res.status(403).json({ error: 'Forbidden' });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (!token) return res.json({ error: 'No token', webhookUrl, pid: process.pid });
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const data = await r.json();
    res.json({ pid: process.pid, webhookUrl, telegramInfo: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ensure push_sent column exists (reminders are now sent via cron/send-reminders.js)
const db = require('./db/database');
try { db.exec('ALTER TABLE bot_reminders ADD COLUMN push_sent INTEGER DEFAULT 0'); } catch (_) {}

// ── Serve PWA mobile app ──────────────────────────────────────────────────────
const PWA_DIR = path.join(__dirname, '../../pwa');
app.use('/app', express.static(PWA_DIR));
app.get('/app', (req, res) => res.redirect('/app/'));

// ── Serve built React frontend in production ──────────────────────────────────
const FRONTEND_DIST = path.join(__dirname, '../public');
app.use(express.static(FRONTEND_DIST));
// SPA fallback — any non-API route returns index.html so React Router works
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
