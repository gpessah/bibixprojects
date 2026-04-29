const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── DB setup ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS scheduling_availability (
    user_id TEXT PRIMARY KEY,
    timezone TEXT DEFAULT 'UTC',
    buffer_minutes INTEGER DEFAULT 0,
    monday_start TEXT, monday_end TEXT,
    tuesday_start TEXT, tuesday_end TEXT,
    wednesday_start TEXT, wednesday_end TEXT,
    thursday_start TEXT, thursday_end TEXT,
    friday_start TEXT, friday_end TEXT,
    saturday_start TEXT, saturday_end TEXT,
    sunday_start TEXT, sunday_end TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS scheduling_event_types (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    description TEXT,
    color TEXT DEFAULT '#0073ea',
    location TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS scheduling_bookings (
    id TEXT PRIMARY KEY,
    event_type_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    guest_name TEXT NOT NULL,
    guest_email TEXT NOT NULL,
    guest_notes TEXT,
    guest_phone TEXT,
    guest_whatsapp TEXT,
    guest_telegram TEXT,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    guest_timezone TEXT DEFAULT 'UTC',
    status TEXT DEFAULT 'confirmed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_type_id) REFERENCES scheduling_event_types(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Migration: add new contact columns to existing tables
['guest_phone', 'guest_whatsapp', 'guest_telegram'].forEach(col => {
  try { db.exec(`ALTER TABLE scheduling_bookings ADD COLUMN ${col} TEXT`); } catch {}
});

// ── Timezone helpers ──────────────────────────────────────────────────────────

function getPartsInTZ(date, timezone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type) => parseInt(parts.find(p => p.type === type).value, 10);
  return {
    year:   get('year'),
    month:  get('month'),
    day:    get('day'),
    hour:   get('hour'),
    minute: get('minute'),
  };
}

function localToUTC(dateStr, timeStr, timezone) {
  // Parse YYYY-MM-DD and HH:MM
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute]     = timeStr.split(':').map(Number);

  // First estimate: assume the local wall-clock maps directly to UTC
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Two-iteration convergence to handle DST offsets
  for (let i = 0; i < 2; i++) {
    const parts  = getPartsInTZ(guess, timezone);
    const diffMs =
      (hour   - parts.hour)   * 60 * 60 * 1000 +
      (minute - parts.minute) *      60 * 1000  +
      (day    - parts.day)    * 24 * 60 * 60 * 1000;
    guess = new Date(guess.getTime() + diffMs);
  }

  return guess;
}

// ── Slot generation ───────────────────────────────────────────────────────────

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function generateSlots(dateStr, avail, bookings, durationMin, bufferMin, timezone) {
  // Determine local day-of-week for the given date in the host's timezone.
  // We treat noon UTC on that date as a safe representative instant — enough
  // to determine the calendar day in any timezone within ±12 h of UTC.
  const [y, m, d] = dateStr.split('-').map(Number);
  const noonUTC   = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const parts     = getPartsInTZ(noonUTC, timezone);

  // Reconstruct a local Date to read getDay() from the actual local calendar day
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dayName   = DAY_NAMES[localDate.getUTCDay()];

  const startStr = avail ? avail[`${dayName}_start`] : null;
  const endStr   = avail ? avail[`${dayName}_end`]   : null;

  if (!startStr || !endStr) return [];

  const windowStart = localToUTC(dateStr, startStr, timezone);
  const windowEnd   = localToUTC(dateStr, endStr,   timezone);

  if (windowEnd <= windowStart) return [];

  const now          = new Date();
  const graceCutoff  = new Date(now.getTime() + 30 * 60 * 1000);
  const stepMs       = durationMin * 60 * 1000;
  const bufferMs     = bufferMin   * 60 * 1000;
  const slotSpanMs   = stepMs + bufferMs;

  const slots = [];
  let cursor  = windowStart.getTime();
  const end   = windowEnd.getTime();

  while (cursor + stepMs <= end) {
    const slotStart = new Date(cursor);
    const slotEnd   = new Date(cursor + stepMs);

    // Skip slots in the past (with grace period)
    if (slotEnd <= graceCutoff) {
      cursor += stepMs;
      continue;
    }

    // Check overlap with existing bookings (including buffer on each side)
    const slotStartMs = slotStart.getTime();
    const slotEndMs   = slotEnd.getTime();

    const overlaps = bookings.some(b => {
      const bStart = new Date(b.start_time).getTime();
      const bEnd   = new Date(b.end_time).getTime();
      // Expand booked block by buffer on each side
      const bStartBuf = bStart - bufferMs;
      const bEndBuf   = bEnd   + bufferMs;
      return slotStartMs < bEndBuf && slotEndMs > bStartBuf;
    });

    if (!overlaps) {
      slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
    }

    cursor += stepMs;
  }

  return slots;
}

// ── Private routes ────────────────────────────────────────────────────────────

// GET /availability
router.get('/availability', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM scheduling_availability WHERE user_id = ?').get(req.user.id);
  if (row) return res.json(row);

  // Return a default shape when no row exists yet
  res.json({
    user_id:        req.user.id,
    timezone:       'UTC',
    buffer_minutes: 0,
    monday_start:    null, monday_end:    null,
    tuesday_start:   null, tuesday_end:   null,
    wednesday_start: null, wednesday_end: null,
    thursday_start:  null, thursday_end:  null,
    friday_start:    null, friday_end:    null,
    saturday_start:  null, saturday_end:  null,
    sunday_start:    null, sunday_end:    null,
  });
});

// PUT /availability
router.put('/availability', authenticate, (req, res) => {
  const {
    timezone       = 'UTC',
    buffer_minutes = 0,
    monday_start,    monday_end,
    tuesday_start,   tuesday_end,
    wednesday_start, wednesday_end,
    thursday_start,  thursday_end,
    friday_start,    friday_end,
    saturday_start,  saturday_end,
    sunday_start,    sunday_end,
  } = req.body;

  db.prepare(`
    INSERT INTO scheduling_availability (
      user_id, timezone, buffer_minutes,
      monday_start, monday_end,
      tuesday_start, tuesday_end,
      wednesday_start, wednesday_end,
      thursday_start, thursday_end,
      friday_start, friday_end,
      saturday_start, saturday_end,
      sunday_start, sunday_end
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      timezone        = excluded.timezone,
      buffer_minutes  = excluded.buffer_minutes,
      monday_start    = excluded.monday_start,
      monday_end      = excluded.monday_end,
      tuesday_start   = excluded.tuesday_start,
      tuesday_end     = excluded.tuesday_end,
      wednesday_start = excluded.wednesday_start,
      wednesday_end   = excluded.wednesday_end,
      thursday_start  = excluded.thursday_start,
      thursday_end    = excluded.thursday_end,
      friday_start    = excluded.friday_start,
      friday_end      = excluded.friday_end,
      saturday_start  = excluded.saturday_start,
      saturday_end    = excluded.saturday_end,
      sunday_start    = excluded.sunday_start,
      sunday_end      = excluded.sunday_end
  `).run(
    req.user.id, timezone, buffer_minutes,
    monday_start    ?? null, monday_end    ?? null,
    tuesday_start   ?? null, tuesday_end   ?? null,
    wednesday_start ?? null, wednesday_end ?? null,
    thursday_start  ?? null, thursday_end  ?? null,
    friday_start    ?? null, friday_end    ?? null,
    saturday_start  ?? null, saturday_end  ?? null,
    sunday_start    ?? null, sunday_end    ?? null,
  );

  const updated = db.prepare('SELECT * FROM scheduling_availability WHERE user_id = ?').get(req.user.id);
  res.json(updated);
});

// GET /event-types
router.get('/event-types', authenticate, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM scheduling_event_types WHERE user_id = ? ORDER BY created_at ASC'
  ).all(req.user.id);
  res.json(rows);
});

// POST /event-types
router.post('/event-types', authenticate, (req, res) => {
  const { name, duration_minutes = 30, description, color = '#0073ea', location } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO scheduling_event_types (id, user_id, name, duration_minutes, description, color, location)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, name, duration_minutes, description ?? null, color, location ?? null);

  const created = db.prepare('SELECT * FROM scheduling_event_types WHERE id = ?').get(id);
  res.status(201).json(created);
});

// PUT /event-types/:id
router.put('/event-types/:id', authenticate, (req, res) => {
  const eventType = db.prepare(
    'SELECT * FROM scheduling_event_types WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);
  if (!eventType) return res.status(404).json({ error: 'Event type not found' });

  const { name, duration_minutes, description, color, location, active } = req.body;

  db.prepare(`
    UPDATE scheduling_event_types SET
      name             = COALESCE(?, name),
      duration_minutes = COALESCE(?, duration_minutes),
      description      = COALESCE(?, description),
      color            = COALESCE(?, color),
      location         = COALESCE(?, location),
      active           = COALESCE(?, active)
    WHERE id = ? AND user_id = ?
  `).run(
    name             ?? null,
    duration_minutes ?? null,
    description      ?? null,
    color            ?? null,
    location         ?? null,
    active           ?? null,
    req.params.id,
    req.user.id,
  );

  const updated = db.prepare('SELECT * FROM scheduling_event_types WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /event-types/:id
router.delete('/event-types/:id', authenticate, (req, res) => {
  const eventType = db.prepare(
    'SELECT id FROM scheduling_event_types WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);
  if (!eventType) return res.status(404).json({ error: 'Event type not found' });

  db.prepare('DELETE FROM scheduling_event_types WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET /bookings
router.get('/bookings', authenticate, (req, res) => {
  const bookings = db.prepare(`
    SELECT
      b.*,
      et.name AS event_type_name
    FROM scheduling_bookings b
    JOIN scheduling_event_types et ON b.event_type_id = et.id
    WHERE b.user_id = ?
    ORDER BY b.start_time ASC
  `).all(req.user.id);
  res.json(bookings);
});

// ── Public routes ─────────────────────────────────────────────────────────────

// GET /public/:userId
router.get('/public/:userId', (req, res) => {
  const user = db.prepare(
    'SELECT id, name, avatar_color FROM users WHERE id = ?'
  ).get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const eventTypes = db.prepare(
    'SELECT * FROM scheduling_event_types WHERE user_id = ? AND active = 1 ORDER BY created_at ASC'
  ).all(req.params.userId);

  res.json({ user, eventTypes });
});

// GET /public/:userId/slots?eventTypeId=xxx&date=YYYY-MM-DD
router.get('/public/:userId/slots', (req, res) => {
  const { eventTypeId, date } = req.query;
  const { userId }            = req.params;

  if (!eventTypeId || !date) {
    return res.status(400).json({ error: 'eventTypeId and date are required' });
  }

  const eventType = db.prepare(
    'SELECT * FROM scheduling_event_types WHERE id = ? AND user_id = ? AND active = 1'
  ).get(eventTypeId, userId);
  if (!eventType) return res.status(404).json({ error: 'Event type not found' });

  const avail = db.prepare(
    'SELECT * FROM scheduling_availability WHERE user_id = ?'
  ).get(userId);

  const userTimezone = avail?.timezone || 'UTC';
  const bufferMin    = avail?.buffer_minutes || 0;

  const bookings = db.prepare(`
    SELECT start_time, end_time
    FROM scheduling_bookings
    WHERE user_id = ? AND date(start_time) = ? AND status = 'confirmed'
  `).all(userId, date);

  const slots = generateSlots(date, avail, bookings, eventType.duration_minutes, bufferMin, userTimezone);

  res.json({ slots, timezone: userTimezone });
});

// POST /public/:userId/book
router.post('/public/:userId/book', (req, res) => {
  const { userId }                                           = req.params;
  const { eventTypeId, guestName, guestEmail, guestNotes, guestPhone, guestWhatsapp, guestTelegram, startTime, guestTimezone } = req.body;

  if (!eventTypeId || !guestName || !guestEmail || !startTime) {
    return res.status(400).json({ error: 'eventTypeId, guestName, guestEmail, and startTime are required' });
  }

  // Validate event type
  const eventType = db.prepare(
    'SELECT * FROM scheduling_event_types WHERE id = ? AND user_id = ? AND active = 1'
  ).get(eventTypeId, userId);
  if (!eventType) return res.status(404).json({ error: 'Event type not found' });

  // Resolve start time and compute end time
  const start    = new Date(startTime);
  if (isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid startTime' });
  const end      = new Date(start.getTime() + eventType.duration_minutes * 60 * 1000);

  // Derive the date string in the host's timezone for slot regeneration
  const avail        = db.prepare('SELECT * FROM scheduling_availability WHERE user_id = ?').get(userId);
  const userTimezone = avail?.timezone || 'UTC';
  const bufferMin    = avail?.buffer_minutes || 0;

  const parts    = getPartsInTZ(start, userTimezone);
  const dateStr  = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;

  // Load confirmed bookings for that day
  const existingBookings = db.prepare(`
    SELECT start_time, end_time
    FROM scheduling_bookings
    WHERE user_id = ? AND date(start_time) = ? AND status = 'confirmed'
  `).all(userId, dateStr);

  // Regenerate slots to verify this slot is still available
  const validSlots = generateSlots(dateStr, avail, existingBookings, eventType.duration_minutes, bufferMin, userTimezone);
  const startISO   = start.toISOString();
  const isValid    = validSlots.some(s => s.start === startISO);
  if (!isValid) return res.status(409).json({ error: 'This time slot is no longer available' });

  // Double-booking guard: check no booking overlaps [start, end) for this host
  const startMs = start.getTime();
  const endMs   = end.getTime();
  const conflict = existingBookings.some(b => {
    const bStart = new Date(b.start_time).getTime();
    const bEnd   = new Date(b.end_time).getTime();
    return startMs < bEnd && endMs > bStart;
  });
  if (conflict) return res.status(409).json({ error: 'This time slot is no longer available' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO scheduling_bookings
      (id, event_type_id, user_id, guest_name, guest_email, guest_notes, guest_phone, guest_whatsapp, guest_telegram, start_time, end_time, guest_timezone, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')
  `).run(
    id,
    eventTypeId,
    userId,
    guestName,
    guestEmail,
    guestNotes    ?? null,
    guestPhone    ?? null,
    guestWhatsapp ?? null,
    guestTelegram ?? null,
    start.toISOString(),
    end.toISOString(),
    guestTimezone || 'UTC',
  );

  const booking = db.prepare('SELECT * FROM scheduling_bookings WHERE id = ?').get(id);
  res.status(201).json(booking);
});

module.exports = router;
