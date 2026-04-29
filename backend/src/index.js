require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

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
require('./bot/telegram');

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ── Serve built React frontend in production ──────────────────────────────────
const FRONTEND_DIST = path.join(__dirname, '../public');
app.use(express.static(FRONTEND_DIST));
// SPA fallback — any non-API route returns index.html so React Router works
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
