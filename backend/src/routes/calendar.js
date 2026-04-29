const express = require('express');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'monday-secret-key-change-in-prod';
const APP_URL    = process.env.APP_URL || 'http://localhost:3000';

// ── DB setup ─────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS calendar_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TEXT,
    calendar_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// ── Google helpers ────────────────────────────────────────────────────────────
function makeOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

async function getGoogleClient(conn) {
  const auth = makeOAuth2Client();
  auth.setCredentials({
    access_token:  conn.access_token,
    refresh_token: conn.refresh_token,
    expiry_date:   conn.expires_at ? new Date(conn.expires_at).getTime() : null,
  });
  auth.on('tokens', (tokens) => {
    db.prepare('UPDATE calendar_connections SET access_token=?, expires_at=? WHERE id=?')
      .run(tokens.access_token, tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null, conn.id);
  });
  return auth;
}

// ── Microsoft helpers ─────────────────────────────────────────────────────────
const MS_SCOPES = ['Calendars.ReadWrite', 'User.Read', 'offline_access'];

function getMsAuthUrl(state) {
  const clientId    = process.env.MS_CLIENT_ID;
  const redirectUri = encodeURIComponent(process.env.MS_REDIRECT_URI || 'http://localhost:3001/api/calendar/microsoft/callback');
  const scope       = encodeURIComponent(MS_SCOPES.join(' '));
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}&response_mode=query&state=${state}`;
}

async function getMsTokens(code) {
  const fetch = require('node-fetch');
  const params = new URLSearchParams({
    client_id:     process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    code,
    redirect_uri:  process.env.MS_REDIRECT_URI || 'http://localhost:3001/api/calendar/microsoft/callback',
    grant_type:    'authorization_code',
  });
  const res  = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', { method: 'POST', body: params });
  return res.json();
}

async function refreshMsToken(conn) {
  const fetch = require('node-fetch');
  const params = new URLSearchParams({
    client_id:     process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    refresh_token: conn.refresh_token,
    grant_type:    'refresh_token',
    scope:         MS_SCOPES.join(' '),
  });
  const res  = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', { method: 'POST', body: params });
  const data = await res.json();
  if (data.access_token) {
    const expires = new Date(Date.now() + data.expires_in * 1000).toISOString();
    db.prepare('UPDATE calendar_connections SET access_token=?, refresh_token=?, expires_at=? WHERE id=?')
      .run(data.access_token, data.refresh_token || conn.refresh_token, expires, conn.id);
    return data.access_token;
  }
  throw new Error('Failed to refresh Microsoft token');
}

async function msGraphRequest(conn, path, method = 'GET', body = null) {
  const fetch  = require('node-fetch');
  let token    = conn.access_token;

  // Refresh if expired
  if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
    token = await refreshMsToken(conn);
  }

  const opts = { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, opts);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Microsoft Graph error');
  }
  if (method === 'DELETE') return null;
  return res.json();
}

// ── Status ────────────────────────────────────────────────────────────────────
router.get('/status', authenticate, (req, res) => {
  const conns = db.prepare('SELECT id, provider, calendar_email, created_at FROM calendar_connections WHERE user_id = ? ORDER BY created_at').all(req.user.id);
  const google    = conns.filter(c => c.provider === 'google');
  const microsoft = conns.filter(c => c.provider === 'microsoft');
  res.json({ google, microsoft });
});

// ── Google: initiate OAuth ────────────────────────────────────────────────────
router.get('/google/auth', authenticate, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google Calendar not configured' });
  const auth  = makeOAuth2Client();
  const state = jwt.sign({ userId: req.user.id }, JWT_SECRET, { expiresIn: '10m' });
  const url   = auth.generateAuthUrl({
    access_type: 'offline', prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/userinfo.email'],
    state,
  });
  res.json({ url });
});

// ── Google: OAuth callback ────────────────────────────────────────────────────
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${APP_URL}/settings?calendar=error&msg=${error}`);

  let userId;
  try { userId = jwt.verify(state, JWT_SECRET).userId; }
  catch { return res.redirect(`${APP_URL}/settings?calendar=error&msg=invalid_state`); }

  try {
    const auth = makeOAuth2Client();
    const { tokens } = await auth.getToken(code);
    auth.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth });
    const { data: profile } = await oauth2.userinfo.get();

    // Check if this Google account already connected for this user
    const existing = db.prepare("SELECT id FROM calendar_connections WHERE user_id=? AND provider='google' AND calendar_email=?").get(userId, profile.email);
    if (existing) {
      db.prepare('UPDATE calendar_connections SET access_token=?, refresh_token=?, expires_at=? WHERE id=?')
        .run(tokens.access_token, tokens.refresh_token || null, tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null, existing.id);
    } else {
      db.prepare('INSERT INTO calendar_connections (id,user_id,provider,access_token,refresh_token,expires_at,calendar_email) VALUES (?,?,?,?,?,?,?)')
        .run(uuidv4(), userId, 'google', tokens.access_token, tokens.refresh_token || null, tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null, profile.email);
    }
    res.redirect(`${APP_URL}/settings?calendar=connected`);
  } catch (err) {
    console.error('[Calendar] Google callback error:', err.message);
    res.redirect(`${APP_URL}/settings?calendar=error&msg=token_exchange_failed`);
  }
});

// ── Microsoft: initiate OAuth ─────────────────────────────────────────────────
router.get('/microsoft/auth', authenticate, (req, res) => {
  if (!process.env.MS_CLIENT_ID) return res.status(503).json({ error: 'Microsoft Calendar not configured' });
  const state = jwt.sign({ userId: req.user.id }, JWT_SECRET, { expiresIn: '10m' });
  res.json({ url: getMsAuthUrl(state) });
});

// ── Microsoft: OAuth callback ─────────────────────────────────────────────────
router.get('/microsoft/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${APP_URL}/settings?calendar=error&msg=${error}`);

  let userId;
  try { userId = jwt.verify(state, JWT_SECRET).userId; }
  catch { return res.redirect(`${APP_URL}/settings?calendar=error&msg=invalid_state`); }

  try {
    const tokens = await getMsTokens(code);
    if (tokens.error) throw new Error(tokens.error_description);

    // Get Microsoft profile
    const fetch   = require('node-fetch');
    const profRes = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = await profRes.json();
    const email   = profile.mail || profile.userPrincipalName;
    const expires = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const existing = db.prepare("SELECT id FROM calendar_connections WHERE user_id=? AND provider='microsoft' AND calendar_email=?").get(userId, email);
    if (existing) {
      db.prepare('UPDATE calendar_connections SET access_token=?, refresh_token=?, expires_at=? WHERE id=?')
        .run(tokens.access_token, tokens.refresh_token || null, expires, existing.id);
    } else {
      db.prepare('INSERT INTO calendar_connections (id,user_id,provider,access_token,refresh_token,expires_at,calendar_email) VALUES (?,?,?,?,?,?,?)')
        .run(uuidv4(), userId, 'microsoft', tokens.access_token, tokens.refresh_token || null, expires, email);
    }
    res.redirect(`${APP_URL}/settings?calendar=connected`);
  } catch (err) {
    console.error('[Calendar] Microsoft callback error:', err.message);
    res.redirect(`${APP_URL}/settings?calendar=error&msg=${encodeURIComponent(err.message)}`);
  }
});

// ── All user's board tasks that have a date value ─────────────────────────────
router.get('/board-tasks', authenticate, (req, res) => {
  const { start, end } = req.query; // YYYY-MM-DD strings
  try {
    const tasks = db.prepare(`
      SELECT
        i.id, i.name, i.board_id, i.group_id,
        b.name as board_name, b.icon as board_icon,
        iv.value as date_value
      FROM item_values iv
      JOIN board_columns c ON iv.column_id = c.id AND c.type = 'date'
      JOIN items i ON iv.item_id = i.id AND i.parent_item_id IS NULL
      JOIN groups g ON i.group_id = g.id
      JOIN boards b ON g.board_id = b.id
      WHERE (
        b.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = ?)
        OR b.id IN (SELECT board_id FROM board_members WHERE user_id = ?)
      )
      AND iv.value IS NOT NULL AND iv.value != ''
      AND substr(iv.value, 1, 10) >= ? AND substr(iv.value, 1, 10) <= ?
      ORDER BY iv.value ASC
    `).all(req.user.id, req.user.id, start, end);
    res.json(tasks);
  } catch (err) {
    console.error('[Calendar] board-tasks error:', err.message);
    res.json([]);
  }
});

// ── Fetch events from ALL connected calendars ─────────────────────────────────
router.get('/events', authenticate, async (req, res) => {
  const { start, end } = req.query;
  const conns  = db.prepare('SELECT * FROM calendar_connections WHERE user_id=?').all(req.user.id);
  const events = [];

  await Promise.all(conns.map(async (conn) => {
    try {
      if (conn.provider === 'google') {
        const auth = await getGoogleClient(conn);
        const cal  = google.calendar({ version: 'v3', auth });
        const { data } = await cal.events.list({ calendarId: 'primary', timeMin: start, timeMax: end, singleEvents: true, orderBy: 'startTime', maxResults: 100 });
        (data.items || []).forEach(ev => events.push({ ...ev, _provider: 'google', _accountEmail: conn.calendar_email, _connId: conn.id }));
      } else if (conn.provider === 'microsoft') {
        const startEncoded = encodeURIComponent(start);
        const endEncoded   = encodeURIComponent(end);
        const data = await msGraphRequest(conn, `/me/calendarView?startDateTime=${startEncoded}&endDateTime=${endEncoded}&$top=100&$select=id,subject,start,end,location,bodyPreview,webLink,isAllDay`);
        (data.value || []).forEach(ev => events.push({
          id:      ev.id,
          summary: ev.subject,
          start:   { dateTime: ev.isAllDay ? undefined : ev.start.dateTime, date: ev.isAllDay ? ev.start.dateTime?.split('T')[0] : undefined },
          end:     { dateTime: ev.isAllDay ? undefined : ev.end.dateTime,   date: ev.isAllDay ? ev.end.dateTime?.split('T')[0] : undefined },
          location: ev.location?.displayName,
          description: ev.bodyPreview,
          htmlLink: ev.webLink,
          _provider: 'microsoft', _accountEmail: conn.calendar_email, _connId: conn.id,
        }));
      }
    } catch (err) { console.error(`[Calendar] fetch error (${conn.provider}/${conn.calendar_email}):`, err.message); }
  }));

  events.sort((a, b) => {
    const ta = a.start?.dateTime || a.start?.date || '';
    const tb = b.start?.dateTime || b.start?.date || '';
    return ta.localeCompare(tb);
  });

  res.json(events);
});

// ── Create event (provider specified or first available) ──────────────────────
router.post('/events', authenticate, async (req, res) => {
  const { title, start, end, location, description, attendees, allDay, connId } = req.body;

  const conn = connId
    ? db.prepare('SELECT * FROM calendar_connections WHERE id=? AND user_id=?').get(connId, req.user.id)
    : db.prepare('SELECT * FROM calendar_connections WHERE user_id=? LIMIT 1').get(req.user.id);

  if (!conn) return res.status(400).json({ error: 'No calendar connected' });

  try {
    if (conn.provider === 'google') {
      const auth = await getGoogleClient(conn);
      const cal  = google.calendar({ version: 'v3', auth });
      const tz   = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const event = {
        summary: title, location, description,
        start: allDay ? { date: start.split('T')[0] } : { dateTime: start, timeZone: tz },
        end:   allDay ? { date: end.split('T')[0]   } : { dateTime: end,   timeZone: tz },
        attendees: attendees?.length ? attendees.map(e => ({ email: e })) : undefined,
        reminders: { useDefault: true },
      };
      const { data } = await cal.events.insert({ calendarId: 'primary', resource: event, sendUpdates: attendees?.length ? 'all' : 'none' });
      res.json(data);
    } else if (conn.provider === 'microsoft') {
      const body = {
        subject: title,
        location: location ? { displayName: location } : undefined,
        body: description ? { contentType: 'text', content: description } : undefined,
        start: { dateTime: start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        end:   { dateTime: end,   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        isAllDay: allDay || false,
        attendees: attendees?.length ? attendees.map(e => ({ emailAddress: { address: e }, type: 'required' })) : undefined,
      };
      const data = await msGraphRequest(conn, '/me/events', 'POST', body);
      res.json(data);
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Delete event ──────────────────────────────────────────────────────────────
router.delete('/events/:connId/:eventId', authenticate, async (req, res) => {
  const conn = db.prepare('SELECT * FROM calendar_connections WHERE id=? AND user_id=?').get(req.params.connId, req.user.id);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });
  try {
    if (conn.provider === 'google') {
      const auth = await getGoogleClient(conn);
      const cal  = google.calendar({ version: 'v3', auth });
      await cal.events.delete({ calendarId: 'primary', eventId: req.params.eventId });
    } else {
      await msGraphRequest(conn, `/me/events/${req.params.eventId}`, 'DELETE');
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Disconnect single account ─────────────────────────────────────────────────
router.delete('/disconnect/:connId', authenticate, (req, res) => {
  db.prepare('DELETE FROM calendar_connections WHERE id=? AND user_id=?').run(req.params.connId, req.user.id);
  res.json({ success: true });
});

module.exports = router;
