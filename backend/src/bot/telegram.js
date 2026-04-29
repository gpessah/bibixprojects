const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const fetch   = require('node-fetch');
const db      = require('../db/database');
const { emit: sseEmit } = require('../sse');

// ── AI provider setup — supports OpenAI and Grok (xAI) ───────────────────────
// Grok is OpenAI-API-compatible; just uses a different base URL + models.
// Priority: GROK_API_KEY for text/vision, OPENAI_API_KEY for image/TTS/transcription.
let openai     = null;  // OpenAI client (image gen, TTS, Whisper)
let grokClient = null;  // Grok client (chat, vision/OCR)
let aiProvider = 'none';

try {
  const { OpenAI } = require('openai');

  if (process.env.GROK_API_KEY) {
    grokClient = new OpenAI({ apiKey: process.env.GROK_API_KEY, baseURL: 'https://api.x.ai/v1' });
    aiProvider = 'grok';
    console.log('[AI] Grok (xAI) client ready');
  }
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    if (aiProvider === 'none') aiProvider = 'openai';
    console.log('[AI] OpenAI client ready');
  }
} catch (e) {
  console.warn('[AI] AI package load failed:', e.message);
}

// Which client to use for chat/text tasks — Grok takes priority, else OpenAI
function chatClient()    { return grokClient || openai; }
function aiEnabled()     { return !!(grokClient || openai); }

// Model selection based on active provider
function chatModel()     { return grokClient ? 'grok-3-mini-fast' : 'gpt-4o-mini'; }
function visionModel()   { return grokClient ? 'grok-2-vision-1212' : 'gpt-4o'; }

// These features require OpenAI specifically (Grok doesn't support them yet)
function canGenerateImage()   { return !!openai; }
function canTTS()             { return !!openai; }
function canTranscribe()      { return !!openai; }

// Download a Telegram file to a temp path and return it
async function downloadTelegramFile(bot, fileId) {
  const fileInfo = await bot.getFile(fileId);
  const fileUrl  = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
  const res      = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const ext    = path.extname(fileInfo.file_path) || '.bin';
  const tmpPath = path.join(os.tmpdir(), `tgfile_${Date.now()}${ext}`);
  const buf    = await res.buffer();
  fs.writeFileSync(tmpPath, buf);
  return tmpPath;
}

// ── DB tables ────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS telegram_links (
    user_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL UNIQUE,
    username TEXT,
    default_board_id TEXT,
    default_group_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS telegram_link_codes (
    code TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
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

// ── Session state ────────────────────────────────────────────────────────────
const sessions  = new Map();
const getSession   = (id) => { if (!sessions.has(id)) sessions.set(id, { step: 'idle' }); return sessions.get(id); };
const clearSession = (id) => sessions.set(id, { step: 'idle' });

// ── DB helpers ───────────────────────────────────────────────────────────────
function getBoardsForUser(userId) {
  return db.prepare(`
    SELECT DISTINCT b.id, b.name, b.icon FROM boards b
    JOIN workspace_members wm ON b.workspace_id = wm.workspace_id
    WHERE wm.user_id = ?
    UNION
    SELECT b.id, b.name, b.icon FROM boards b
    JOIN board_members bm ON b.id = bm.board_id
    WHERE bm.user_id = ?
    ORDER BY b.name
  `).all(userId, userId);
}

function getWorkspacesForUser(userId) {
  return db.prepare(`
    SELECT w.id, w.name FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE wm.user_id = ?
    ORDER BY w.name
  `).all(userId);
}

function getBoardsForWorkspace(userId, workspaceId) {
  return db.prepare(`
    SELECT DISTINCT b.id, b.name, b.icon FROM boards b
    WHERE b.workspace_id = ?
    AND (
      EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = ? AND wm.user_id = ?)
      OR EXISTS (SELECT 1 FROM board_members bm WHERE bm.board_id = b.id AND bm.user_id = ?)
    )
    ORDER BY b.name
  `).all(workspaceId, workspaceId, userId, userId);
}

function getGroupsForBoard(boardId) {
  return db.prepare('SELECT id, name FROM groups WHERE board_id = ? ORDER BY position').all(boardId);
}

function getColumnsForBoard(boardId) {
  return db.prepare(
    "SELECT * FROM board_columns WHERE board_id = ? AND type NOT IN ('attachments','timeline') ORDER BY position"
  ).all(boardId);
}

function createTask(userId, boardId, groupId, taskName) {
  const maxPos = db.prepare('SELECT COALESCE(MAX(position),0) as m FROM items WHERE group_id = ?').get(groupId).m;
  const id = uuidv4();
  db.prepare('INSERT INTO items (id, group_id, board_id, name, position, created_by) VALUES (?,?,?,?,?,?)')
    .run(id, groupId, boardId, taskName, maxPos + 1, userId);
  return id;
}

function setDefaultStatus(itemId, boardId) {
  const columns = db.prepare("SELECT * FROM board_columns WHERE board_id = ? AND type IN ('status','priority') ORDER BY position").all(boardId);
  for (const col of columns) {
    let opts = [];
    try { opts = JSON.parse(col.settings || '{}').options || []; } catch {}
    const newOpt = opts.find(o => o.label.toLowerCase() === 'new') || opts[0];
    if (newOpt) db.prepare('INSERT OR REPLACE INTO item_values (id, item_id, column_id, value) VALUES (?,?,?,?)').run(uuidv4(), itemId, col.id, newOpt.label);
  }
}

function setColumnValue(itemId, columnId, value) {
  db.prepare('INSERT OR REPLACE INTO item_values (id, item_id, column_id, value) VALUES (?,?,?,?)').run(uuidv4(), itemId, columnId, value);
}

// Notify any open browser tabs that a board has changed
function notifyBoardUpdated(userId, boardId) {
  try { sseEmit(userId, 'board_updated', { boardId }); } catch {}
}

// ── Time parser for /remind ──────────────────────────────────────────────────
function parseReminderTime(parts) {
  // parts[0] is the time token, possibly parts[1] too (for "tomorrow HH:MM")
  const tok = parts[0].toLowerCase();
  const now  = new Date();

  const minMatch  = tok.match(/^(\d+)m$/);
  if (minMatch)  return { date: new Date(now.getTime() + parseInt(minMatch[1])  * 60000),  skip: 1 };

  const hourMatch = tok.match(/^(\d+)h$/);
  if (hourMatch) return { date: new Date(now.getTime() + parseInt(hourMatch[1]) * 3600000), skip: 1 };

  const dayMatch  = tok.match(/^(\d+)d$/);
  if (dayMatch)  return { date: new Date(now.getTime() + parseInt(dayMatch[1])  * 86400000), skip: 1 };

  const timeMatch = tok.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const t = new Date(now);
    t.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    return { date: t, skip: 1 };
  }

  if (tok === 'tomorrow' && parts[1]) {
    const t2 = parts[1].toLowerCase();
    const tm = t2.match(/^(\d{1,2}):?(\d{2})?(am|pm)?$/);
    if (tm) {
      let h = parseInt(tm[1]), m = parseInt(tm[2] || '0');
      const ap = tm[3];
      if (ap === 'pm' && h !== 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      t.setHours(h, m, 0, 0);
      return { date: t, skip: 2 };
    }
  }

  return null;
}

// ── Keyboards ────────────────────────────────────────────────────────────────
const boardKeyboard     = (boards)      => ({ inline_keyboard: [...boards.map(b => [{ text: `${b.icon || '📋'} ${b.name}`, callback_data: `b:${b.id}` }]), [{ text: '⬅️ Back to Menu', callback_data: 'menu:back' }]] });
const groupKeyboard     = (groups)      => ({ inline_keyboard: [...groups.map(g => [{ text: g.name, callback_data: `g:${g.id}` }]), [{ text: '⬅️ Back to Menu', callback_data: 'menu:back' }]] });
const workspaceKeyboard = (workspaces)  => ({ inline_keyboard: [...workspaces.map(w => [{ text: `🏢 ${w.name}`, callback_data: `ws:${w.id}` }]), [{ text: '⬅️ Back to Menu', callback_data: 'menu:back' }]] });

// ── Timezone list & keyboard ──────────────────────────────────────────────────
const TIMEZONES = [
  { label: '🌍 UTC',             tz: 'UTC' },
  { label: '🗽 New York (ET)',   tz: 'America/New_York' },
  { label: '🌆 Chicago (CT)',    tz: 'America/Chicago' },
  { label: '🏔️ Denver (MT)',    tz: 'America/Denver' },
  { label: '🌉 Los Angeles (PT)',tz: 'America/Los_Angeles' },
  { label: '🎸 Mexico City',    tz: 'America/Mexico_City' },
  { label: '🌎 São Paulo',      tz: 'America/Sao_Paulo' },
  { label: '🇬🇧 London (GMT)',  tz: 'Europe/London' },
  { label: '🗼 Paris (CET)',    tz: 'Europe/Paris' },
  { label: '🕌 Istanbul',       tz: 'Europe/Istanbul' },
  { label: '🌙 Moscow',         tz: 'Europe/Moscow' },
  { label: '🕌 Dubai',          tz: 'Asia/Dubai' },
  { label: '🇮🇳 Mumbai',        tz: 'Asia/Kolkata' },
  { label: '🌏 Singapore',      tz: 'Asia/Singapore' },
  { label: '🗾 Tokyo',          tz: 'Asia/Tokyo' },
  { label: '🦘 Sydney',         tz: 'Australia/Sydney' },
];

const timezoneKeyboard = () => {
  const rows = [];
  for (let i = 0; i < TIMEZONES.length; i += 2) {
    rows.push(TIMEZONES.slice(i, i + 2).map(t => ({ text: t.label, callback_data: `tz:${t.tz}` })));
  }
  rows.push([{ text: '⬅️ Back to Menu', callback_data: 'menu:back' }]);
  return { inline_keyboard: rows };
};

const menuKeyboard = () => ({ inline_keyboard: [
  [{ text: '📝 New Note',       callback_data: 'menu:note'      }, { text: '⏰ Set Reminder',   callback_data: 'menu:remind'    }],
  [{ text: '🎯 My Habits',      callback_data: 'menu:habits'    }, { text: '⏱️ Focus Session',  callback_data: 'menu:focus'     }],
  [{ text: '📋 Create Task',    callback_data: 'menu:task'      }, { text: '🔄 Change Board',   callback_data: 'menu:boards'    }],
  [{ text: '🔔 My Reminders',   callback_data: 'menu:reminders' }, { text: '🌍 Timezone',       callback_data: 'menu:timezone'  }],
  ...(aiEnabled() ? [[{ text: '🤖 AI Tools',   callback_data: 'menu:ai'        }]] : []),
  [{ text: '❓ Help',           callback_data: 'menu:help'      }],
]});

const aiMenuKeyboard = () => ({ inline_keyboard: [
  [{ text: '💬 Ask GPT',        callback_data: 'ai:gpt'         }, { text: '📋 TL;DR Summary',  callback_data: 'ai:tldr'        }],
  [{ text: '🖼️ Create Image',   callback_data: 'ai:image'       }, { text: '🔊 Text to Speech', callback_data: 'ai:tts'         }],
  [{ text: '🎤 Transcribe',     callback_data: 'ai:transcribe'  }, { text: '🔍 OCR (photo→text)',callback_data: 'ai:ocr'         }],
  [{ text: '⬅️ Back to Menu',   callback_data: 'menu:back'      }],
]});

const focusDurKeyboard = () => ({ inline_keyboard: [
  [{ text: '⏱ 15 min', callback_data: 'focus_dur:15' }, { text: '⏱ 25 min', callback_data: 'focus_dur:25' }, { text: '⏱ 45 min', callback_data: 'focus_dur:45' }],
  [{ text: '⏱ 60 min', callback_data: 'focus_dur:60' }, { text: '⏱ 90 min', callback_data: 'focus_dur:90' }],
  [{ text: '⬅️ Back to Menu', callback_data: 'menu:back' }],
]});

// ── Reminder wizard keyboards ─────────────────────────────────────────────────
const remindTimeKeyboard = () => ({ inline_keyboard: [
  [{ text: '8:00 AM',  callback_data: 'rtime:08:00' }, { text: '9:00 AM',  callback_data: 'rtime:09:00' }, { text: '10:00 AM', callback_data: 'rtime:10:00' }],
  [{ text: '12:00 PM', callback_data: 'rtime:12:00' }, { text: '2:00 PM',  callback_data: 'rtime:14:00' }, { text: '5:00 PM',  callback_data: 'rtime:17:00' }],
  [{ text: '6:00 PM',  callback_data: 'rtime:18:00' }, { text: '8:00 PM',  callback_data: 'rtime:20:00' }, { text: '✏️ Custom', callback_data: 'rtime:custom' }],
  [{ text: '⬅️ Back to Menu', callback_data: 'menu:back' }],
]});

function remindDateKeyboard(timezone = 'UTC') {
  // Build "today" in the user's timezone, then iterate forward
  const todayParts = getPartsInTZ(new Date(), timezone);
  const todayUTC   = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayUTC.getTime() + i * 86400000);
    const yyyy = d.getUTCFullYear();
    const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd   = String(d.getUTCDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const label = i === 0
      ? `Today · ${d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })}`
      : i === 1
      ? `Tomorrow · ${d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })}`
      : d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
    days.push({ text: label, callback_data: `rdate:${dateStr}` });
  }
  const rows = [];
  for (let i = 0; i < days.length; i += 2) rows.push(days.slice(i, i + 2));
  rows.push([{ text: '⬅️ Back to time', callback_data: 'remind_back_time' }]);
  return { inline_keyboard: rows };
}

function formatTime12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12    = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// ── Timezone helpers ──────────────────────────────────────────────────────────
function getPartsInTZ(date, timezone) {
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', hour12: false,
    });
    const p = {};
    for (const part of f.formatToParts(date)) p[part.type] = parseInt(part.value);
    if (p.hour === 24) p.hour = 0;
    return p;
  } catch { return getPartsInTZ(date, 'UTC'); }
}

function localToUTC(dateStr, timeStr, timezone) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes]   = timeStr.split(':').map(Number);
  let guess = Date.UTC(year, month - 1, day, hours, minutes, 0);
  for (let i = 0; i < 2; i++) {
    const p = getPartsInTZ(new Date(guess), timezone);
    const guessInTZ = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += Date.UTC(year, month - 1, day, hours, minutes) - guessInTZ;
  }
  return new Date(guess);
}

function getCurrentTimeInTZ(timezone) {
  try {
    const p = getPartsInTZ(new Date(), timezone);
    return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  } catch { return getCurrentTimeInTZ('UTC'); }
}

function getCurrentDateInTZ(timezone) {
  try {
    const p = getPartsInTZ(new Date(), timezone);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  } catch { return getCurrentDateInTZ('UTC'); }
}

function formatDateInTZ(isoString, timezone) {
  try {
    return new Date(isoString).toLocaleString('en-US', {
      timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return new Date(isoString).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
}

function getUserTimezone(userId) {
  try {
    const row = db.prepare('SELECT timezone FROM bot_settings WHERE user_id = ?').get(userId);
    return row?.timezone || 'UTC';
  } catch { return 'UTC'; }
}

// Date picker for task date columns — shows relative shortcuts + 7-day calendar
function columnDateKeyboard(colId, timezone = 'UTC') {
  const todayParts = getPartsInTZ(new Date(), timezone);
  const todayUTC   = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day));

  const shortcuts = [
    { label: 'Today',     offset: 0 },
    { label: 'Tomorrow',  offset: 1 },
    { label: 'In 3 days', offset: 3 },
    { label: 'Next week', offset: 7 },
    { label: 'In 2 weeks',offset: 14 },
    { label: 'In 1 month',offset: 30 },
  ];

  // Build shortcut rows (2 per row)
  const rows = [];
  for (let i = 0; i < shortcuts.length; i += 2) {
    rows.push(shortcuts.slice(i, i + 2).map(s => {
      const d    = new Date(todayUTC.getTime() + s.offset * 86400000);
      const yyyy = d.getUTCFullYear();
      const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd   = String(d.getUTCDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const dayLabel = s.offset === 0 ? `📅 Today (${mm}/${dd})`
                     : s.offset === 1 ? `📅 Tomorrow (${mm}/${dd})`
                     : `📅 ${s.label} (${mm}/${dd})`;
      return { text: dayLabel, callback_data: `coldate:${colId}:${dateStr}` };
    }));
  }

  // Calendar row: next 7 days, each with weekday label
  const calRow1 = [], calRow2 = [];
  for (let i = 0; i < 7; i++) {
    const d    = new Date(todayUTC.getTime() + i * 86400000);
    const yyyy = d.getUTCFullYear();
    const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd   = String(d.getUTCDate()).padStart(2, '0');
    const dateStr  = `${yyyy}-${mm}-${dd}`;
    const weekday  = d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' });
    const btn = { text: `${weekday}\n${mm}/${dd}`, callback_data: `coldate:${colId}:${dateStr}` };
    (i < 4 ? calRow1 : calRow2).push(btn);
  }
  rows.push(calRow1);
  rows.push(calRow2);

  rows.push([
    { text: '✏️ Type a date',    callback_data: `coldate_custom:${colId}` },
    { text: '⬅️ Back to columns', callback_data: 'col_back' },
  ]);
  return { inline_keyboard: rows };
}

function columnListKeyboard(columns, filled) {
  const rows = columns.map(col => [{ text: `${filled.has(col.id) ? '✅ ' : ''}${col.name} (${col.type})`, callback_data: `col:${col.id}` }]);
  rows.push([{ text: '✅ Done — save task', callback_data: 'done' }]);
  return { inline_keyboard: rows };
}

function columnOptionsKeyboard(col) {
  let opts = [];
  try { opts = JSON.parse(col.settings || '{}').options || []; } catch {}
  const rows = opts.map(o => [{ text: o.label, callback_data: `colval:${col.id}:${o.label}` }]);
  rows.push([{ text: '⬅️ Back to columns', callback_data: 'col_back' }]);
  return { inline_keyboard: rows };
}

const checkboxKeyboard = (colId) => ({ inline_keyboard: [
  [{ text: '✅ Yes', callback_data: `colval:${colId}:true` }, { text: '❌ No', callback_data: `colval:${colId}:false` }],
  [{ text: '⬅️ Back to columns', callback_data: 'col_back' }],
]});

function sendColumnMenu(bot, chatId, session, msgId = null) {
  const text = `📝 *Task created!*\n\n*${session.pendingTask}*\n📋 ${session.boardName} › ${session.groupName}\n\nWant to fill in any column? Tap one or press *Done*.`;
  const opts = { parse_mode: 'Markdown', reply_markup: columnListKeyboard(session.columns, session.filled) };
  if (msgId) return bot.editMessageText(text, { chat_id: chatId, message_id: msgId, ...opts });
  return bot.sendMessage(chatId, text, opts);
}

// ── Token check ──────────────────────────────────────────────────────────────
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.log('[Telegram] TELEGRAM_BOT_TOKEN not set — bot disabled');
  module.exports = { enabled: false };
} else {
  const bot = new TelegramBot(token, { polling: true });

  // ── /start ────────────────────────────────────────────────────────────────
  bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const code   = match[1]?.trim();

    if (!code) {
      const existing = db.prepare('SELECT user_id FROM telegram_links WHERE chat_id = ?').get(String(chatId));
      if (existing) {
        bot.sendMessage(chatId, '✅ Your account is already linked!\n\nJust send me a task name to add it to your board.\n\n/help — all commands');
      } else {
        bot.sendMessage(chatId, '👋 Welcome to *BibixBot!*\n\nGo to *Settings* in the app → *Telegram Integration* → click *Generate Link Code*, then send it here.', { parse_mode: 'Markdown' });
      }
      return;
    }

    const record = db.prepare("SELECT * FROM telegram_link_codes WHERE code = ? AND expires_at > datetime('now')").get(code);
    if (!record) { bot.sendMessage(chatId, '❌ That code is invalid or has expired. Please generate a new one in Settings.'); return; }

    db.prepare('DELETE FROM telegram_link_codes WHERE code = ?').run(code);
    db.prepare('INSERT OR REPLACE INTO telegram_links (user_id, chat_id, username) VALUES (?,?,?)').run(record.user_id, String(chatId), msg.from?.username || null);

    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(record.user_id);
    bot.sendMessage(chatId,
      `✅ *Account linked!* Welcome, ${user?.name || 'there'}! 🎉\n\nI'm BibixBot — your Bibix Projects assistant.\n\n/menu — open the feature menu\n/help — all commands`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── /help ─────────────────────────────────────────────────────────────────
  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, [
      '*BibixBot Commands*',
      '',
      '📱 /menu — open the full feature menu',
      '',
      '📋 *Tasks*',
      '/task [name] — create a task on your board',
      '/task — pick a name interactively',
      '/boards — change your default board',
      '',
      '📝 *Notes*',
      '/note [text] — save a quick note',
      '/notes — see your last 5 notes',
      '',
      '⏰ *Reminders*',
      '/remind — set a reminder (step-by-step)',
      '/remind [title] — pre-fill title, then pick time & date',
      '/reminders — list pending reminders',
      '',
      '🎯 *Habits*',
      '/habits — list your active habits',
      '(Add habits in the BibixBot dashboard)',
      '',
      '⏱️ *Focus Sessions*',
      '/focus [minutes] [title] — start a timer',
      '  e.g. /focus 25 deep work',
      '  Default duration: 25 min',
      '',
      '🌍 *Timezone*',
      '/timezone — set your timezone',
      '(default: UTC — change so times match your location)',
      '',
      ...(aiEnabled() ? [
        '🤖 *AI Tools* (OpenAI)',
        '/ask [question] — ask ChatGPT anything',
        '/tldr [text] — summarize long text',
        '/image [prompt] — generate an image (DALL-E 3)',
        '/tts [text] — convert text to speech audio',
        '/transcribe — transcribe a voice message (Whisper)',
        '/ocr — extract text from a photo (GPT-4 Vision)',
        '',
      ] : []),
      '/cancel — cancel current action',
    ].join('\n'), { parse_mode: 'Markdown' });
  });

  // ── /boards ───────────────────────────────────────────────────────────────
  bot.onText(/\/boards/, (msg) => {
    const chatId = msg.chat.id;
    const link   = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked yet. Use /start with your code from Settings.'); return; }
    const boards = getBoardsForUser(link.user_id);
    if (!boards.length) { bot.sendMessage(chatId, "You don't have any boards yet."); return; }
    clearSession(chatId);
    getSession(chatId).step = 'choose_board_default';
    bot.sendMessage(chatId, '📋 *Select your default board:*', { parse_mode: 'Markdown', reply_markup: boardKeyboard(boards) });
  });

  // ── /cancel ───────────────────────────────────────────────────────────────
  bot.onText(/\/cancel/, (msg) => { clearSession(msg.chat.id); bot.sendMessage(msg.chat.id, '✅ Cancelled.'); });

  // ── /task [name] — explicit task creation ────────────────────────────────
  bot.onText(/\/task(?:\s+(.+))?/s, (msg, match) => {
    const chatId   = msg.chat.id;
    const link     = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked. Use /start with your code from Settings.'); return; }
    clearSession(chatId);
    const session  = getSession(chatId);
    const taskName = match[1]?.trim();

    const proceed = (name) => {
      session.pendingTask = name;
      // Always show workspace selection first
      const workspaces = getWorkspacesForUser(link.user_id);
      if (!workspaces.length) { bot.sendMessage(chatId, "You don't have any workspaces yet."); return; }
      if (workspaces.length === 1) {
        // Only one workspace — skip to board selection
        const boards = getBoardsForWorkspace(link.user_id, workspaces[0].id);
        if (!boards.length) { bot.sendMessage(chatId, "No boards in your workspace yet. Create one in the app first."); return; }
        session.step        = 'choose_board';
        session.workspaceId = workspaces[0].id;
        bot.sendMessage(chatId, `📋 *Which board for "${name}"?*`, { parse_mode: 'Markdown', reply_markup: boardKeyboard(boards) });
      } else {
        session.step = 'choose_workspace';
        bot.sendMessage(chatId, `🏢 *Which workspace for "${name}"?*`, { parse_mode: 'Markdown', reply_markup: workspaceKeyboard(workspaces) });
      }
    };

    if (taskName) {
      proceed(taskName);
    } else {
      // Ask for the task name
      session.step = 'awaiting_task_name';
      bot.sendMessage(chatId, '📋 *Create Task*\n\nWhat\'s the task name?', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel' }]] },
      });
    }
  });

  // ── /menu ─────────────────────────────────────────────────────────────────
  bot.onText(/\/menu/, (msg) => {
    const chatId = msg.chat.id;
    const link   = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked yet. Use /start with your link code from Settings.'); return; }
    clearSession(chatId);
    bot.sendMessage(chatId, '🤖 *BibixBot Menu*\n\nWhat would you like to do?', { parse_mode: 'Markdown', reply_markup: menuKeyboard() });
  });

  // ── /note [content] ───────────────────────────────────────────────────────
  bot.onText(/\/note (.+)/s, (msg, match) => {
    const chatId = msg.chat.id;
    const link   = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked. Use /start with your link code.'); return; }
    const content = match[1].trim();
    db.prepare('INSERT INTO bot_notes (id, user_id, content) VALUES (?,?,?)').run(uuidv4(), link.user_id, content);
    bot.sendMessage(chatId, `📝 *Note saved!*\n\n${content}`, { parse_mode: 'Markdown' });
  });

  // ── /notes ────────────────────────────────────────────────────────────────
  bot.onText(/\/notes$/, (msg) => {
    const chatId = msg.chat.id;
    const link   = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked.'); return; }
    const notes  = db.prepare('SELECT * FROM bot_notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 5').all(link.user_id);
    if (!notes.length) { bot.sendMessage(chatId, '📝 No notes yet.\n\nUse /note [text] to save one.'); return; }
    const text = notes.map((n, i) => `${i + 1}. ${n.content}`).join('\n\n');
    bot.sendMessage(chatId, `📝 *Your latest notes:*\n\n${text}\n\n_View all in the BibixBot dashboard._`, { parse_mode: 'Markdown' });
  });

  // ── /remind → interactive wizard ─────────────────────────────────────────
  bot.onText(/\/remind(?:\s+(.+))?/s, (msg, match) => {
    const chatId   = msg.chat.id;
    const link     = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked.'); return; }

    clearSession(chatId);
    const session   = getSession(chatId);
    const preTitle  = match[1]?.trim() || null;

    if (preTitle) {
      // Title already provided — jump straight to time picker
      session.step        = 'remind_time';
      session.remindTitle = preTitle;
      bot.sendMessage(chatId, `⏰ *New Reminder*\n\n📝 _"${preTitle}"_\n\n🕐 At what time?`, { parse_mode: 'Markdown', reply_markup: remindTimeKeyboard() })
        .then(m => { session.remindKbMsgId = m.message_id; });
    } else {
      // Ask for title
      session.step = 'remind_title';
      bot.sendMessage(chatId, '⏰ *New Reminder*\n\n📝 What should I remind you about?', { parse_mode: 'Markdown' })
        .then(m => { session.remindKbMsgId = m.message_id; });
    }
  });

  // ── /reminders ────────────────────────────────────────────────────────────
  bot.onText(/\/reminders$/, (msg) => {
    const chatId    = msg.chat.id;
    const link      = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked.'); return; }
    const reminders = db.prepare("SELECT * FROM bot_reminders WHERE user_id = ? AND sent = 0 ORDER BY remind_at ASC LIMIT 5").all(link.user_id);
    if (!reminders.length) { bot.sendMessage(chatId, '⏰ No pending reminders.\n\nUse /remind or tap ⏰ in /menu to set one.'); return; }
    const tz   = getUserTimezone(link.user_id);
    const text = reminders.map((r, i) => {
      const when = formatDateInTZ(r.remind_at, tz);
      return `${i + 1}. ${r.content}\n   📅 ${when}`;
    }).join('\n\n');
    bot.sendMessage(chatId, `⏰ *Pending reminders:*\n\n${text}`, { parse_mode: 'Markdown' });
  });

  // ── /habits ───────────────────────────────────────────────────────────────
  bot.onText(/\/habits$/, (msg) => {
    const chatId  = msg.chat.id;
    const link    = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked.'); return; }
    const habits  = db.prepare('SELECT * FROM bot_habits WHERE user_id = ? AND active = 1 ORDER BY send_time').all(link.user_id);
    if (!habits.length) { bot.sendMessage(chatId, '🎯 No active habits yet.\n\nAdd habits in the *BibixBot* dashboard in the app.', { parse_mode: 'Markdown' }); return; }
    const text = habits.map((h, i) => `${i + 1}. ${h.title}${h.description ? ` — ${h.description}` : ''}\n   🕐 Daily at ${h.send_time}`).join('\n\n');
    bot.sendMessage(chatId, `🎯 *Your active habits:*\n\n${text}`, { parse_mode: 'Markdown' });
  });

  // ── /timezone ─────────────────────────────────────────────────────────────
  bot.onText(/\/timezone/, (msg) => {
    const chatId = msg.chat.id;
    const link   = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked. Use /start with your link code from Settings.'); return; }
    const tz     = getUserTimezone(link.user_id);
    const tzInfo = TIMEZONES.find(t => t.tz === tz);
    bot.sendMessage(chatId,
      `🌍 *Set your Timezone*\n\nCurrent: *${tzInfo?.label || tz}*\n\nAll reminder times and daily habit schedules use your timezone:`,
      { parse_mode: 'Markdown', reply_markup: timezoneKeyboard() }
    );
  });

  // ── /ask [question] — GPT chat ───────────────────────────────────────────
  bot.onText(/\/ask(?:\s+(.+))?/s, async (msg, match) => {
    const chatId = msg.chat.id;
    const link   = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked.'); return; }
    if (!aiEnabled()) { bot.sendMessage(chatId, '🔒 AI features require an OpenAI API key to be configured on the server.'); return; }
    const question = match[1]?.trim();
    if (!question) {
      clearSession(chatId);
      getSession(chatId).step = 'awaiting_gpt_question';
      bot.sendMessage(chatId, '💬 *Ask GPT*\n\nWhat\'s your question?', { parse_mode: 'Markdown' });
      return;
    }
    const providerName = grokClient ? 'Grok' : 'GPT';
    const thinking = await bot.sendMessage(chatId, `🤔 ${providerName} is thinking…`);
    try {
      const res = await chatClient().chat.completions.create({
        model: chatModel(),
        messages: [{ role: 'user', content: question }],
        max_tokens: 1000,
      });
      const answer = res.choices[0].message.content.trim();
      await bot.editMessageText(`💬 *${providerName} Answer*\n\n${answer}`, { chat_id: chatId, message_id: thinking.message_id, parse_mode: 'Markdown' });
    } catch (e) {
      bot.editMessageText(`❌ ${providerName} error: ${e.message}`, { chat_id: chatId, message_id: thinking.message_id });
    }
  });

  // ── /tldr [text] — summarize ──────────────────────────────────────────────
  bot.onText(/\/tldr(?:\s+(.+))?/s, async (msg, match) => {
    const chatId = msg.chat.id;
    const link   = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked.'); return; }
    if (!aiEnabled()) { bot.sendMessage(chatId, '🔒 AI features require an OpenAI API key.'); return; }
    const text = match[1]?.trim();
    if (!text) {
      clearSession(chatId);
      getSession(chatId).step = 'awaiting_tldr_text';
      bot.sendMessage(chatId, '📋 *TL;DR*\n\nSend me the text you want summarized:', { parse_mode: 'Markdown' });
      return;
    }
    const thinking = await bot.sendMessage(chatId, '📋 Summarizing…');
    try {
      const res = await chatClient().chat.completions.create({
        model: chatModel(),
        messages: [
          { role: 'system', content: 'You are a concise summarizer. Give a clear TL;DR summary using bullet points where appropriate. Be brief.' },
          { role: 'user', content: `Summarize this:\n\n${text}` },
        ],
        max_tokens: 500,
      });
      const summary = res.choices[0].message.content.trim();
      await bot.editMessageText(`📋 *TL;DR Summary*\n\n${summary}`, { chat_id: chatId, message_id: thinking.message_id, parse_mode: 'Markdown' });
    } catch (e) {
      bot.editMessageText(`❌ Error: ${e.message}`, { chat_id: chatId, message_id: thinking.message_id });
    }
  });

  // ── /image [prompt] — DALL-E 3 (OpenAI only) ─────────────────────────────
  bot.onText(/\/image(?:\s+(.+))?/s, async (msg, match) => {
    const chatId = msg.chat.id;
    const link   = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked.'); return; }
    if (!canGenerateImage()) {
      bot.sendMessage(chatId, grokClient
        ? '🔒 *Image generation* requires an OpenAI API key (DALL-E 3).\n\nGrok does not support image generation yet.\n\nAdd `OPENAI_API_KEY` to the server config to enable this feature.'
        : '🔒 Image generation requires an OpenAI API key.',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    const prompt = match[1]?.trim();
    if (!prompt) {
      clearSession(chatId);
      getSession(chatId).step = 'awaiting_image_prompt';
      bot.sendMessage(chatId, '🖼️ *Create Image*\n\nDescribe the image you want to generate:', { parse_mode: 'Markdown' });
      return;
    }
    const thinking = await bot.sendMessage(chatId, '🎨 Generating image…');
    try {
      const res = await openai.images.generate({
        model: 'dall-e-3', prompt, n: 1, size: '1024x1024', quality: 'standard',
      });
      const imageUrl = res.data[0].url;
      await bot.deleteMessage(chatId, thinking.message_id);
      await bot.sendPhoto(chatId, imageUrl, { caption: `🖼️ _"${prompt}"_`, parse_mode: 'Markdown' });
    } catch (e) {
      bot.editMessageText(`❌ Image error: ${e.message}`, { chat_id: chatId, message_id: thinking.message_id });
    }
  });

  // ── /tts [text] — Text to Speech (OpenAI only) ───────────────────────────
  bot.onText(/\/tts(?:\s+(.+))?/s, async (msg, match) => {
    const chatId = msg.chat.id;
    const link   = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked.'); return; }
    if (!canTTS()) {
      bot.sendMessage(chatId, grokClient
        ? '🔒 *Text to Speech* requires an OpenAI API key.\n\nGrok does not support TTS yet.\n\nAdd `OPENAI_API_KEY` to the server config.'
        : '🔒 TTS requires an OpenAI API key.',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    const text = match[1]?.trim();
    if (!text) {
      clearSession(chatId);
      getSession(chatId).step = 'awaiting_tts_text';
      bot.sendMessage(chatId, '🔊 *Text to Speech*\n\nSend me the text to convert to audio:', { parse_mode: 'Markdown' });
      return;
    }
    if (text.length > 4000) { bot.sendMessage(chatId, '❌ Text too long (max 4000 characters).'); return; }
    const thinking = await bot.sendMessage(chatId, '🔊 Converting to speech…');
    try {
      const res = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: text,
        response_format: 'mp3',
      });
      const tmpPath = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(tmpPath, buf);
      await bot.deleteMessage(chatId, thinking.message_id);
      await bot.sendAudio(chatId, tmpPath, { title: 'BibixBot TTS', performer: 'BibixBot' });
      fs.unlink(tmpPath, () => {});
    } catch (e) {
      bot.editMessageText(`❌ TTS error: ${e.message}`, { chat_id: chatId, message_id: thinking.message_id });
    }
  });

  // ── /transcribe — send voice message → text (OpenAI Whisper only) ───────
  bot.onText(/\/transcribe/, (msg) => {
    const chatId = msg.chat.id;
    const link   = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked.'); return; }
    if (!canTranscribe()) {
      bot.sendMessage(chatId, grokClient
        ? '🔒 *Transcription* (Whisper) requires an OpenAI API key.\n\nGrok does not support audio transcription yet.\n\nAdd `OPENAI_API_KEY` to the server config.'
        : '🔒 Transcription requires an OpenAI API key.',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    clearSession(chatId);
    getSession(chatId).step = 'awaiting_voice';
    bot.sendMessage(chatId, '🎤 *Transcribe*\n\nSend me a voice message and I\'ll convert it to text.', { parse_mode: 'Markdown' });
  });

  // ── /ocr — send photo → extract text (GPT-4 Vision or Grok Vision) ───────
  bot.onText(/\/ocr/, (msg) => {
    const chatId = msg.chat.id;
    const link   = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked.'); return; }
    if (!aiEnabled()) { bot.sendMessage(chatId, '🔒 AI features require an API key (OpenAI or Grok).'); return; }
    clearSession(chatId);
    getSession(chatId).step = 'awaiting_ocr_photo';
    bot.sendMessage(chatId, '🔍 *OCR*\n\nSend me a photo and I\'ll extract all the text from it.', { parse_mode: 'Markdown' });
  });

  // ── /focus [minutes] [title] ──────────────────────────────────────────────
  bot.onText(/\/focus(?:\s+(\d+))?(?:\s+(.+))?/, (msg, match) => {
    const chatId  = msg.chat.id;
    const link    = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) { bot.sendMessage(chatId, '❌ Not linked.'); return; }

    const minutes = parseInt(match[1] || '25');
    const title   = match[2]?.trim() || 'Focus Session';

    if (minutes < 1 || minutes > 180) { bot.sendMessage(chatId, '❌ Duration must be between 1 and 180 minutes.'); return; }

    const id = uuidv4();
    db.prepare("INSERT INTO bot_time_blocks (id, user_id, title, duration_minutes, scheduled_at) VALUES (?,?,?,?,datetime('now'))").run(id, link.user_id, title, minutes);

    bot.sendMessage(chatId, `⏱️ *Focus session started!*\n\n*${title}*\n⏳ ${minutes} minute${minutes !== 1 ? 's' : ''}\n\nStay focused! I'll notify you when it's done. 💪`, { parse_mode: 'Markdown' });

    setTimeout(() => {
      try {
        db.prepare("UPDATE bot_time_blocks SET completed_at = datetime('now') WHERE id = ?").run(id);
        bot.sendMessage(chatId, `✅ *Focus session complete!*\n\n*${title}* — ${minutes} min\n\nGreat work! Take a well-deserved break. 🎉`, { parse_mode: 'Markdown' });
      } catch (e) { console.error('[Bot] focus timeout error:', e.message); }
    }, minutes * 60000);
  });

  // ── Voice message → Whisper transcription ───────────────────────────────
  bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;
    const link   = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) return;
    if (!aiEnabled()) { bot.sendMessage(chatId, '🔒 AI features require an OpenAI API key.'); return; }
    const session = getSession(chatId);
    const isWaiting = session.step === 'awaiting_voice';
    if (!isWaiting) return; // only transcribe when explicitly requested
    clearSession(chatId);
    const thinking = await bot.sendMessage(chatId, '🎤 Transcribing…');
    try {
      const tmpPath = await downloadTelegramFile(bot, msg.voice.file_id);
      // Whisper needs a proper audio extension — rename to .ogg
      const oggPath = tmpPath.endsWith('.oga') || tmpPath.endsWith('.ogg') ? tmpPath : tmpPath + '.ogg';
      if (tmpPath !== oggPath) fs.renameSync(tmpPath, oggPath);
      const transcription = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file: fs.createReadStream(oggPath),
      });
      fs.unlink(oggPath, () => {});
      const text = transcription.text?.trim() || '(no speech detected)';
      await bot.editMessageText(`🎤 *Transcription*\n\n${text}`, { chat_id: chatId, message_id: thinking.message_id, parse_mode: 'Markdown' });
    } catch (e) {
      bot.editMessageText(`❌ Transcription error: ${e.message}`, { chat_id: chatId, message_id: thinking.message_id });
    }
  });

  // ── Photo message → GPT-4 Vision OCR ────────────────────────────────────
  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const link   = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));
    if (!link) return;
    if (!aiEnabled()) { bot.sendMessage(chatId, '🔒 AI features require an OpenAI API key.'); return; }
    const session = getSession(chatId);
    if (session.step !== 'awaiting_ocr_photo') return; // only when explicitly requested
    clearSession(chatId);
    const thinking = await bot.sendMessage(chatId, '🔍 Extracting text…');
    try {
      // Pick the largest photo
      const photo    = msg.photo[msg.photo.length - 1];
      const fileInfo = await bot.getFile(photo.file_id);
      const fileUrl  = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
      const res = await chatClient().chat.completions.create({
        model: visionModel(),
        messages: [{
          role: 'user',
          content: [
            { type: 'text',      text: 'Extract ALL text you can see in this image. Return only the extracted text, preserving structure where possible. If there is no text, say "No text found."' },
            { type: 'image_url', image_url: { url: fileUrl } },
          ],
        }],
        max_tokens: 1500,
      });
      const extracted = res.choices[0].message.content.trim();
      await bot.editMessageText(`🔍 *OCR Result*\n\n${extracted}`, { chat_id: chatId, message_id: thinking.message_id, parse_mode: 'Markdown' });
    } catch (e) {
      bot.editMessageText(`❌ OCR error: ${e.message}`, { chat_id: chatId, message_id: thinking.message_id });
    }
  });

  // ── Plain text → session handler ─────────────────────────────────────────
  bot.on('message', (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    const chatId  = msg.chat.id;
    const session = getSession(chatId);
    const link    = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));

    // ── Column value (no link needed) ──
    if (session.step === 'awaiting_column_date_custom') {
      const raw = msg.text.trim();
      // Parse several common date formats
      let parsed = null;

      // YYYY-MM-DD
      if (!parsed) { const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if (m) parsed = `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`; }
      // DD/MM/YYYY or MM/DD/YYYY — treat first segment ≤12 as DD if ambiguous, but support both
      if (!parsed) { const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) {
          const a = parseInt(m[1]), b = parseInt(m[2]), y = parseInt(m[3]);
          // If first > 12, must be DD/MM; else assume DD/MM (European default)
          const [dd, mo] = a > 12 ? [a, b] : [a, b];
          parsed = `${y}-${String(mo).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
        }
      }
      // D Month [Year] or Month D [Year] — e.g. "31 May", "May 31", "31 May 2025"
      if (!parsed) {
        const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
        const m = raw.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/i) || raw.match(/^([a-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?$/i);
        if (m) {
          let day, monthStr, year;
          if (isNaN(parseInt(m[1]))) { monthStr = m[1]; day = parseInt(m[2]); year = m[3]; }
          else                       { day = parseInt(m[1]); monthStr = m[2]; year = m[3]; }
          const mo = MONTHS[monthStr.slice(0,3).toLowerCase()];
          if (mo) {
            const y = year ? parseInt(year) : new Date().getFullYear();
            parsed = `${y}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          }
        }
      }
      // "today" / "tomorrow" shortcuts
      if (!parsed) {
        const tz  = getUserTimezone(link?.user_id);
        const tok = raw.toLowerCase();
        if (tok === 'today')    { parsed = getCurrentDateInTZ(tz); }
        if (tok === 'tomorrow') {
          const p = getPartsInTZ(new Date(), tz);
          const d = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
          parsed  = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
        }
      }

      if (!parsed) {
        bot.sendMessage(chatId, `❌ Couldn't read that date. Try:\n\`31/05/2025\`, \`May 31\`, \`2025-05-31\`, or \`tomorrow\``, { parse_mode: 'Markdown' });
        return;
      }

      const col = session.currentCol;
      setColumnValue(session.itemId, col.id, parsed);
      session.filled.add(col.id);
      session.step = 'fill_columns';
      sendColumnMenu(bot, chatId, session);
      return;
    }

    if (session.step === 'awaiting_column_value') {
      setColumnValue(session.itemId, session.currentCol.id, msg.text.trim());
      session.filled.add(session.currentCol.id);
      session.step = 'fill_columns';
      sendColumnMenu(bot, chatId, session);
      return;
    }

    if (!link) { bot.sendMessage(chatId, '❌ Not linked yet. Use /start with your code from Settings.'); return; }

    // ── AI: GPT/Grok question from menu ──────────────────────────────────────
    if (session.step === 'awaiting_gpt_question') {
      if (!aiEnabled()) { clearSession(chatId); return; }
      const question = msg.text.trim();
      const providerName = grokClient ? 'Grok' : 'GPT';
      clearSession(chatId);
      bot.sendMessage(chatId, `🤔 ${providerName} is thinking…`).then(async (thinking) => {
        try {
          const res = await chatClient().chat.completions.create({
            model: chatModel(),
            messages: [{ role: 'user', content: question }],
            max_tokens: 1000,
          });
          const answer = res.choices[0].message.content.trim();
          bot.editMessageText(`💬 *${providerName} Answer*\n\n${answer}`, { chat_id: chatId, message_id: thinking.message_id, parse_mode: 'Markdown' });
        } catch (e) {
          bot.editMessageText(`❌ ${providerName} error: ${e.message}`, { chat_id: chatId, message_id: thinking.message_id });
        }
      });
      return;
    }

    // ── AI: TL;DR text from menu ──────────────────────────────────────────────
    if (session.step === 'awaiting_tldr_text') {
      if (!aiEnabled()) { clearSession(chatId); return; }
      const text = msg.text.trim();
      clearSession(chatId);
      bot.sendMessage(chatId, '📋 Summarizing…').then(async (thinking) => {
        try {
          const res = await chatClient().chat.completions.create({
            model: chatModel(),
            messages: [
              { role: 'system', content: 'You are a concise summarizer. Give a clear TL;DR summary using bullet points where appropriate. Be brief.' },
              { role: 'user', content: `Summarize this:\n\n${text}` },
            ],
            max_tokens: 500,
          });
          const summary = res.choices[0].message.content.trim();
          bot.editMessageText(`📋 *TL;DR Summary*\n\n${summary}`, { chat_id: chatId, message_id: thinking.message_id, parse_mode: 'Markdown' });
        } catch (e) {
          bot.editMessageText(`❌ Error: ${e.message}`, { chat_id: chatId, message_id: thinking.message_id });
        }
      });
      return;
    }

    // ── AI: Image prompt from menu ────────────────────────────────────────────
    if (session.step === 'awaiting_image_prompt') {
      if (!canGenerateImage()) { clearSession(chatId); bot.sendMessage(chatId, '🔒 Image generation requires an OpenAI API key.'); return; }
      const prompt = msg.text.trim();
      clearSession(chatId);
      bot.sendMessage(chatId, '🎨 Generating image…').then(async (thinking) => {
        try {
          const res = await openai.images.generate({
            model: 'dall-e-3', prompt, n: 1, size: '1024x1024', quality: 'standard',
          });
          const imageUrl = res.data[0].url;
          bot.deleteMessage(chatId, thinking.message_id).catch(() => {});
          bot.sendPhoto(chatId, imageUrl, { caption: `🖼️ _"${prompt}"_`, parse_mode: 'Markdown' });
        } catch (e) {
          bot.editMessageText(`❌ Image error: ${e.message}`, { chat_id: chatId, message_id: thinking.message_id });
        }
      });
      return;
    }

    // ── AI: TTS text from menu ────────────────────────────────────────────────
    if (session.step === 'awaiting_tts_text') {
      if (!canTTS()) { clearSession(chatId); bot.sendMessage(chatId, '🔒 Text to Speech requires an OpenAI API key.'); return; }
      const text = msg.text.trim();
      if (text.length > 4000) { bot.sendMessage(chatId, '❌ Text too long (max 4000 characters).'); return; }
      clearSession(chatId);
      bot.sendMessage(chatId, '🔊 Converting to speech…').then(async (thinking) => {
        try {
          const res = await openai.audio.speech.create({
            model: 'tts-1', voice: 'alloy', input: text, response_format: 'mp3',
          });
          const tmpPath = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);
          fs.writeFileSync(tmpPath, Buffer.from(await res.arrayBuffer()));
          bot.deleteMessage(chatId, thinking.message_id).catch(() => {});
          bot.sendAudio(chatId, tmpPath, { title: 'BibixBot TTS', performer: 'BibixBot' })
            .then(() => fs.unlink(tmpPath, () => {}));
        } catch (e) {
          bot.editMessageText(`❌ TTS error: ${e.message}`, { chat_id: chatId, message_id: thinking.message_id });
        }
      });
      return;
    }

    // ── Save note from menu ──
    if (session.step === 'awaiting_note') {
      const content = msg.text.trim();
      db.prepare('INSERT INTO bot_notes (id, user_id, content) VALUES (?,?,?)').run(uuidv4(), link.user_id, content);
      clearSession(chatId);
      bot.sendMessage(chatId, `📝 *Note saved!*\n\n${content}\n\n_/menu for more options._`, { parse_mode: 'Markdown' });
      return;
    }

    // ── Reminder wizard step 1: receive title ────────────────────────────────
    if (session.step === 'remind_title') {
      session.remindTitle = msg.text.trim();
      session.step        = 'remind_time';
      const text = `⏰ *New Reminder*\n\nStep 2 of 3\n\n📝 _"${session.remindTitle}"_\n\n🕐 At what time?`;
      if (session.remindKbMsgId) {
        bot.editMessageText(text, { chat_id: chatId, message_id: session.remindKbMsgId, parse_mode: 'Markdown', reply_markup: remindTimeKeyboard() });
      } else {
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: remindTimeKeyboard() })
          .then(m => { session.remindKbMsgId = m.message_id; });
      }
      return;
    }

    // ── Reminder wizard: custom time text input ───────────────────────────────
    if (session.step === 'remind_time_custom') {
      const t = msg.text.trim();
      const m12 = t.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)$/i);
      const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
      let h, m, ok = false;
      if (m24) { h = parseInt(m24[1]); m = parseInt(m24[2]); ok = true; }
      else if (m12) {
        h = parseInt(m12[1]); m = parseInt(m12[2] || '0');
        const ap = m12[3].toLowerCase();
        if (ap === 'pm' && h !== 12) h += 12;
        if (ap === 'am' && h === 12) h = 0;
        ok = true;
      }
      if (!ok || h > 23 || m > 59) {
        bot.sendMessage(chatId, '❌ Couldn\'t read that. Try: `14:30`, `9:00 AM`, or `21:00`', { parse_mode: 'Markdown' });
        return;
      }
      session.remindTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      session.step       = 'remind_date';
      const tz = getUserTimezone(link?.user_id);
      const text = `⏰ *New Reminder*\n\nStep 3 of 3\n\n📝 _"${session.remindTitle}"_\n🕐 ${formatTime12h(session.remindTime)}\n\n📅 Which date?`;
      if (session.remindKbMsgId) {
        bot.editMessageText(text, { chat_id: chatId, message_id: session.remindKbMsgId, parse_mode: 'Markdown', reply_markup: remindDateKeyboard(tz) });
      } else {
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: remindDateKeyboard(tz) })
          .then(sent => { session.remindKbMsgId = sent.message_id; });
      }
      return;
    }

    // ── Task name from menu ──
    if (session.step === 'awaiting_task_name') {
      const taskName = msg.text.trim();
      if (!taskName) return;
      session.pendingTask = taskName;
      // Always show workspace selection first
      const workspaces = getWorkspacesForUser(link.user_id);
      if (!workspaces.length) { bot.sendMessage(chatId, "You don't have any workspaces yet."); clearSession(chatId); return; }
      if (workspaces.length === 1) {
        // Only one workspace — skip to board selection
        const boards = getBoardsForWorkspace(link.user_id, workspaces[0].id);
        if (!boards.length) { bot.sendMessage(chatId, "No boards in your workspace yet."); clearSession(chatId); return; }
        session.step        = 'choose_board';
        session.workspaceId = workspaces[0].id;
        bot.sendMessage(chatId, `📋 *Which board for "${taskName}"?*`, { parse_mode: 'Markdown', reply_markup: boardKeyboard(boards) });
      } else {
        session.step = 'choose_workspace';
        bot.sendMessage(chatId, `🏢 *Which workspace for "${taskName}"?*`, { parse_mode: 'Markdown', reply_markup: workspaceKeyboard(workspaces) });
      }
      return;
    }

    // Unrecognised text — give a hint instead of auto-creating a task
    bot.sendMessage(chatId,
      '💡 Not sure what to do with that.\n\n' +
      'Use /menu for all options, or:\n' +
      '• /task [name] — create a task\n' +
      '• /note [text] — save a note\n' +
      '• /ask [question] — ask AI\n' +
      '• /help — all commands',
      { parse_mode: 'Markdown' }
    );
  });

  // ── Inline keyboard callbacks ─────────────────────────────────────────────
  bot.on('callback_query', (query) => {
    const chatId  = query.message.chat.id;
    const msgId   = query.message.message_id;
    const data    = query.data;
    const session = getSession(chatId);
    bot.answerCallbackQuery(query.id);

    const link = db.prepare('SELECT * FROM telegram_links WHERE chat_id = ?').get(String(chatId));

    // ── Menu: back (reopen main menu) ────────────────────────────────────────
    if (data === 'menu:back') {
      clearSession(chatId);
      bot.editMessageText('🤖 *BibixBot Menu*\n\nWhat would you like to do?', { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: menuKeyboard() });
      return;
    }

    // ── Menu: new note ────────────────────────────────────────────────────────
    if (data === 'menu:note') {
      getSession(chatId).step = 'awaiting_note';
      bot.editMessageText('📝 *New Note*\n\nSend me your note text:', {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:back' }]] },
      });
      return;
    }

    // ── Menu: set reminder — step 1: ask title ────────────────────────────────
    if (data === 'menu:remind') {
      clearSession(chatId);
      const s = getSession(chatId);
      s.step           = 'remind_title';
      s.remindKbMsgId  = msgId;   // we'll edit THIS message throughout the wizard
      bot.editMessageText('⏰ *New Reminder*\n\nStep 1 of 3\n\n📝 What should I remind you about?', {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:back' }]] },
      });
      return;
    }

    // ── Reminder wizard: time picked ──────────────────────────────────────────
    if (data.startsWith('rtime:')) {
      const timeVal = data.slice(6);
      const tz = getUserTimezone(link?.user_id);
      if (timeVal === 'custom') {
        session.step = 'remind_time_custom';
        bot.editMessageText(
          `⏰ *New Reminder*\n\nStep 2 of 3\n\n📝 _"${session.remindTitle}"_\n\n✏️ Type the time (e.g. 14:30 or 9:00 AM):`,
          { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '⬅️ Back to time', callback_data: 'remind_back_time_pick' }]] } }
        );
      } else {
        session.remindTime = timeVal;
        session.step       = 'remind_date';
        bot.editMessageText(
          `⏰ *New Reminder*\n\nStep 3 of 3\n\n📝 _"${session.remindTitle}"_\n🕐 ${formatTime12h(timeVal)}\n\n📅 Which date?`,
          { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: remindDateKeyboard(tz) }
        );
      }
      return;
    }

    // ── Reminder wizard: date picked → save ──────────────────────────────────
    if (data.startsWith('rdate:')) {
      const dateVal  = data.slice(6);  // YYYY-MM-DD in user's timezone
      const tz       = getUserTimezone(link?.user_id);
      const remindAt = localToUTC(dateVal, session.remindTime, tz);
      db.prepare('INSERT INTO bot_reminders (id, user_id, content, remind_at) VALUES (?,?,?,?)')
        .run(uuidv4(), link?.user_id, session.remindTitle, remindAt.toISOString());
      const when = formatDateInTZ(remindAt.toISOString(), tz);
      const title = session.remindTitle;
      clearSession(chatId);
      bot.editMessageText(
        `✅ *Reminder set!*\n\n📝 "${title}"\n📅 ${when}`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '⏰ Add another', callback_data: 'menu:remind' }, { text: '🏠 Menu', callback_data: 'menu:back' }]] } }
      );
      return;
    }

    // ── Reminder wizard: back from date → time picker ─────────────────────────
    if (data === 'remind_back_time') {
      session.step = 'remind_time';
      bot.editMessageText(
        `⏰ *New Reminder*\n\nStep 2 of 3\n\n📝 _"${session.remindTitle}"_\n\n🕐 At what time?`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: remindTimeKeyboard() }
      );
      return;
    }

    // ── Reminder wizard: back from custom time → time picker ──────────────────
    if (data === 'remind_back_time_pick') {
      session.step = 'remind_time';
      bot.editMessageText(
        `⏰ *New Reminder*\n\nStep 2 of 3\n\n📝 _"${session.remindTitle}"_\n\n🕐 At what time?`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: remindTimeKeyboard() }
      );
      return;
    }

    // ── Menu: my reminders ────────────────────────────────────────────────────
    if (data === 'menu:reminders') {
      const rems = db.prepare("SELECT * FROM bot_reminders WHERE user_id = ? AND sent = 0 ORDER BY remind_at ASC LIMIT 5").all(link?.user_id);
      const tz = getUserTimezone(link?.user_id);
      const text = rems?.length
        ? `🔔 *Pending Reminders*\n\n${rems.map((r, i) => {
            const when = formatDateInTZ(r.remind_at, tz);
            return `${i + 1}. ${r.content}\n   📅 ${when}`;
          }).join('\n\n')}`
        : '🔔 *Reminders*\n\nNo pending reminders.\n\nUse ⏰ Set Reminder to add one.';
      bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:back' }]] } });
      return;
    }

    // ── Menu: habits ──────────────────────────────────────────────────────────
    if (data === 'menu:habits') {
      const habits = db.prepare('SELECT * FROM bot_habits WHERE user_id = ? AND active = 1 ORDER BY send_time').all(link?.user_id);
      const text = habits?.length
        ? `🎯 *Your Active Habits*\n\n${habits.map((h, i) => `${i + 1}. *${h.title}*${h.description ? `\n   _${h.description}_` : ''}\n   🕐 Daily at ${h.send_time}`).join('\n\n')}\n\n_Manage habits in the BibixBot dashboard._`
        : '🎯 *Habits*\n\nNo active habits yet.\n\nAdd habits in the *BibixBot* dashboard in the app.';
      bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:back' }]] } });
      return;
    }

    // ── Menu: focus session ───────────────────────────────────────────────────
    if (data === 'menu:focus') {
      bot.editMessageText('⏱️ *Focus Session*\n\nChoose your duration:', { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: focusDurKeyboard() });
      return;
    }

    if (data.startsWith('focus_dur:')) {
      const minutes = parseInt(data.slice(10));
      const id = uuidv4();
      db.prepare("INSERT INTO bot_time_blocks (id, user_id, title, duration_minutes, scheduled_at) VALUES (?,?,?,?,datetime('now'))").run(id, link?.user_id, 'Focus Session', minutes);
      bot.editMessageText(
        `⏱️ *Focus session started!*\n\n⏳ ${minutes} minute${minutes !== 1 ? 's' : ''}\n\nStay focused! I'll notify you when done. 💪`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:back' }]] } }
      );
      setTimeout(() => {
        try {
          db.prepare("UPDATE bot_time_blocks SET completed_at = datetime('now') WHERE id = ?").run(id);
          bot.sendMessage(chatId, `✅ *Focus complete!*\n\n${minutes} min done — great work! Take a break. 🎉`, { parse_mode: 'Markdown' });
        } catch (e) { console.error('[Bot] focus_dur timeout:', e.message); }
      }, minutes * 60000);
      return;
    }

    // ── Menu: create task ─────────────────────────────────────────────────────
    if (data === 'menu:task') {
      clearSession(chatId);
      getSession(chatId).step = 'awaiting_task_name';
      bot.editMessageText('📋 *Create Task*\n\nWhat\'s the task name?', {
        chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:back' }]] },
      });
      return;
    }

    // ── Menu: change board ────────────────────────────────────────────────────
    if (data === 'menu:boards') {
      const boards = getBoardsForUser(link?.user_id);
      if (!boards?.length) { bot.editMessageText("You don't have any boards yet.", { chat_id: chatId, message_id: msgId }); return; }
      clearSession(chatId);
      getSession(chatId).step = 'choose_board_default';
      bot.editMessageText('🔄 *Select your default board:*', { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: boardKeyboard(boards) });
      return;
    }

    // ── Menu: help ────────────────────────────────────────────────────────────
    if (data === 'menu:help') {
      const aiSection = aiEnabled()
        ? '\n\n🤖 *AI Tools*\n/ask — ask ChatGPT\n/tldr — summarize text\n/image — generate image\n/tts — text to speech\n/transcribe — voice → text\n/ocr — photo → text'
        : '';
      bot.editMessageText(
        `*BibixBot Commands*\n\n📋 *Tasks*\n/task [name] — create a task\n🔄 /boards — change default board\n\n📝 /note [text] — save a note\n/notes — your latest notes\n⏰ /remind — set a reminder (guided steps)\n/reminders — pending reminders\n🎯 /habits — your active habits\n⏱️ /focus [min] [title] — focus timer\n🌍 /timezone — set timezone\n📱 /menu — open this menu\n/cancel — cancel current action${aiSection}`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⬅️ Back to Menu', callback_data: 'menu:back' }]] } }
      );
      return;
    }

    // ── Menu: AI tools ────────────────────────────────────────────────────────
    if (data === 'menu:ai') {
      if (!aiEnabled()) {
        bot.editMessageText('🔒 *AI Features*\n\nAI features are not enabled. Ask your admin to add an OpenAI API key to the server configuration.', { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'menu:back' }]] } });
        return;
      }
      bot.editMessageText('🤖 *AI Tools*\n\nPowered by OpenAI — choose a feature:', { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: aiMenuKeyboard() });
      return;
    }

    // ── AI submenu actions ────────────────────────────────────────────────────
    if (data.startsWith('ai:')) {
      const aiAction = data.slice(3);
      if (!aiEnabled()) { bot.answerCallbackQuery(query.id, { text: '🔒 AI not configured', show_alert: true }); return; }
      const prompts = {
        gpt:        { step: 'awaiting_gpt_question',  text: '💬 *Ask GPT*\n\nWhat\'s your question?' },
        tldr:       { step: 'awaiting_tldr_text',     text: '📋 *TL;DR*\n\nSend the text you want summarized:' },
        image:      { step: 'awaiting_image_prompt',  text: '🖼️ *Create Image*\n\nDescribe the image to generate:' },
        tts:        { step: 'awaiting_tts_text',      text: '🔊 *Text to Speech*\n\nSend the text to convert to audio:' },
        transcribe: { step: 'awaiting_voice',         text: '🎤 *Transcribe*\n\nSend a voice message and I\'ll convert it to text.' },
        ocr:        { step: 'awaiting_ocr_photo',     text: '🔍 *OCR*\n\nSend a photo and I\'ll extract all the text from it.' },
      };
      const p = prompts[aiAction];
      if (!p) return;
      clearSession(chatId);
      getSession(chatId).step = p.step;
      bot.editMessageText(p.text, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back to AI Menu', callback_data: 'menu:ai' }]] } });
      return;
    }

    // ── Menu: timezone ────────────────────────────────────────────────────────
    if (data === 'menu:timezone') {
      const tz = getUserTimezone(link?.user_id);
      const tzInfo = TIMEZONES.find(t => t.tz === tz);
      bot.editMessageText(
        `🌍 *Set your Timezone*\n\nCurrent: *${tzInfo?.label || tz}*\n\nAll reminder times and habit schedules will use your selected timezone. Choose below:`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: timezoneKeyboard() }
      );
      return;
    }

    // ── Timezone selected ─────────────────────────────────────────────────────
    if (data.startsWith('tz:')) {
      const timezone = data.slice(3);
      const tzInfo   = TIMEZONES.find(t => t.tz === timezone);
      if (!tzInfo || !link) return;
      db.prepare('INSERT OR REPLACE INTO bot_settings (user_id, timezone) VALUES (?,?)').run(link.user_id, timezone);
      bot.editMessageText(
        `✅ *Timezone saved!*\n\nYour timezone is now set to:\n*${tzInfo.label}* \`${timezone}\`\n\nAll reminders and daily habits will fire at your local time. ⏰`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🏠 Menu', callback_data: 'menu:back' }]] } }
      );
      return;
    }

    if (data === 'cancel') { clearSession(chatId); bot.editMessageText('❌ Cancelled.', { chat_id: chatId, message_id: msgId }); return; }

    if (data === 'done') {
      notifyBoardUpdated(link?.user_id, session.boardId);
      clearSession(chatId);
      bot.editMessageText(`✅ *Task saved!*\n\n*${session.pendingTask}*\n📋 ${session.boardName} › ${session.groupName}`, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' });
      return;
    }

    if (data === 'col_back') { session.step = 'fill_columns'; sendColumnMenu(bot, chatId, session, msgId); return; }

    // ── Workspace selected (task creation flow) ───────────────────────────────
    if (data.startsWith('ws:') && session.step === 'choose_workspace') {
      const workspaceId = data.slice(3);
      const workspace   = db.prepare('SELECT name FROM workspaces WHERE id = ?').get(workspaceId);
      if (!workspace || !link) return;
      const boards = getBoardsForWorkspace(link.user_id, workspaceId);
      if (!boards.length) {
        bot.editMessageText(`That workspace has no boards yet. Create one in the app first.`, { chat_id: chatId, message_id: msgId });
        clearSession(chatId);
        return;
      }
      session.workspaceId = workspaceId;
      session.step        = 'choose_board';
      bot.editMessageText(
        `📋 *Which board for "${session.pendingTask}"?*\n🏢 _${workspace.name}_`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: boardKeyboard(boards) }
      );
      return;
    }

    if (data.startsWith('b:') && (session.step === 'choose_board' || session.step === 'choose_board_default')) {
      const boardId = data.slice(2);
      const board   = db.prepare('SELECT name, icon FROM boards WHERE id = ?').get(boardId);
      if (!board) return;
      const groups  = getGroupsForBoard(boardId);
      if (!groups.length) { bot.editMessageText('That board has no groups yet.', { chat_id: chatId, message_id: msgId }); return; }
      session.boardId   = boardId;
      session.boardName = `${board.icon || ''} ${board.name}`;
      session.step      = session.step === 'choose_board_default' ? 'choose_group_default' : 'choose_group';
      bot.editMessageText(`*${session.boardName}* — which group?`, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: groupKeyboard(groups) });
      return;
    }

    if (data.startsWith('g:') && (session.step === 'choose_group' || session.step === 'choose_group_default')) {
      const groupId = data.slice(2);
      const group   = db.prepare('SELECT name FROM groups WHERE id = ?').get(groupId);
      if (!group) return;
      db.prepare('UPDATE telegram_links SET default_board_id=?, default_group_id=? WHERE chat_id=?').run(session.boardId, groupId, String(chatId));
      if (session.step === 'choose_group_default') {
        clearSession(chatId);
        bot.editMessageText(`✅ Default set to *${session.boardName} › ${group.name}*\n\nNow just send a task name!`, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' });
        return;
      }
      const itemId  = createTask(link.user_id, session.boardId, groupId, session.pendingTask);
      setDefaultStatus(itemId, session.boardId);
      notifyBoardUpdated(link.user_id, session.boardId);
      const columns = getColumnsForBoard(session.boardId);
      Object.assign(session, { step: 'fill_columns', groupName: group.name, itemId, columns, filled: new Set() });
      sendColumnMenu(bot, chatId, session, msgId);
      return;
    }

    if (data.startsWith('col:') && session.step === 'fill_columns') {
      const colId = data.slice(4);
      const col   = session.columns.find(c => c.id === colId);
      if (!col) return;
      session.currentCol = col;
      if (col.type === 'status' || col.type === 'priority') {
        bot.editMessageText(`*${col.name}* — pick a value:`, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: columnOptionsKeyboard(col) });
      } else if (col.type === 'checkbox') {
        bot.editMessageText(`*${col.name}*`, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: checkboxKeyboard(col.id) });
      } else if (col.type === 'date') {
        const tz = getUserTimezone(link?.user_id);
        bot.editMessageText(`📅 *${col.name}* — pick a date:`, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: columnDateKeyboard(col.id, tz) });
      } else {
        session.step = 'awaiting_column_value';
        const hint = col.type === 'number' ? ' (number)' : col.type === 'link' ? ' (URL)' : '';
        bot.editMessageText(`✏️ Type the value for *${col.name}*${hint}:`, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'col_back' }]] } });
      }
      return;
    }

    if (data.startsWith('colval:') && (session.step === 'fill_columns' || session.step === 'awaiting_column_value')) {
      const parts = data.split(':');
      setColumnValue(session.itemId, parts[1], parts.slice(2).join(':'));
      session.filled.add(parts[1]);
      session.step = 'fill_columns';
      notifyBoardUpdated(link?.user_id, session.boardId);
      sendColumnMenu(bot, chatId, session, msgId);
      return;
    }

    // ── Date picker: date selected ────────────────────────────────────────────
    if (data.startsWith('coldate:')) {
      const parts  = data.split(':');  // coldate : colId : YYYY-MM-DD
      const colId  = parts[1];
      const dateVal = parts[2];
      setColumnValue(session.itemId, colId, dateVal);
      session.filled.add(colId);
      session.step = 'fill_columns';
      notifyBoardUpdated(link?.user_id, session.boardId);
      sendColumnMenu(bot, chatId, session, msgId);
      return;
    }

    // ── Date picker: custom — ask user to type ────────────────────────────────
    if (data.startsWith('coldate_custom:')) {
      const colId = data.slice('coldate_custom:'.length);
      const col   = session.columns.find(c => c.id === colId);
      session.currentCol = col;
      session.step = 'awaiting_column_date_custom';
      bot.editMessageText(
        `✏️ *${col?.name || 'Date'}* — type the date:\n\nFormats accepted:\n• \`31/05/2025\`  (DD/MM/YYYY)\n• \`05/31/2025\`  (MM/DD/YYYY)\n• \`2025-05-31\`  (YYYY-MM-DD)\n• \`31 May\` or \`May 31\``,
        { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: `col:${colId}` }]] } }
      );
      return;
    }
  });

  // ── Reminder + habit scheduler (runs every 60 seconds) ───────────────────
  setInterval(() => {
    // Due reminders
    try {
      const due = db.prepare(`
        SELECT r.*, tl.chat_id FROM bot_reminders r
        JOIN telegram_links tl ON r.user_id = tl.user_id
        WHERE r.sent = 0 AND r.remind_at <= datetime('now')
      `).all();
      for (const rem of due) {
        try {
          bot.sendMessage(rem.chat_id, `⏰ *Reminder:*\n\n${rem.content}`, { parse_mode: 'Markdown' });
          db.prepare('UPDATE bot_reminders SET sent = 1 WHERE id = ?').run(rem.id);
        } catch (e) { console.error('[Bot] reminder send error:', e.message); }
      }
    } catch (e) { console.error('[Bot] reminder check error:', e.message); }

    // Daily habit nudges (per-user timezone)
    try {
      const habits = db.prepare(`
        SELECT h.*, tl.chat_id, COALESCE(bs.timezone, 'UTC') as timezone
        FROM bot_habits h
        JOIN telegram_links tl ON h.user_id = tl.user_id
        LEFT JOIN bot_settings bs ON h.user_id = bs.user_id
        WHERE h.active = 1
      `).all();
      for (const h of habits) {
        try {
          const userTime = getCurrentTimeInTZ(h.timezone);
          const userDate = getCurrentDateInTZ(h.timezone);
          if (h.send_time === userTime && h.last_notified_date !== userDate) {
            const text = h.description ? `🎯 *Daily habit:* ${h.title}\n\n_${h.description}_` : `🎯 *Daily habit reminder:* ${h.title}`;
            bot.sendMessage(h.chat_id, text, { parse_mode: 'Markdown' });
            db.prepare('UPDATE bot_habits SET last_notified_date = ? WHERE id = ?').run(userDate, h.id);
          }
        } catch (e) { console.error('[Bot] habit send error:', e.message); }
      }
    } catch (e) { console.error('[Bot] habit check error:', e.message); }
  }, 60000);

  bot.on('polling_error', (err) => console.error('[Telegram] polling error:', err.message));

  console.log('[Telegram] Bot started (polling)');
  module.exports = { enabled: true, bot };
}
