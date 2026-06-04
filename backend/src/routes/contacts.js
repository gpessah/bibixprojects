// LinkedIn contact-enrichment routes — backed by Hunter.io.
//
// Endpoints:
//   POST   /api/contacts/find-email   — find email for a LinkedIn profile
//   GET    /api/contacts              — list user's saved contacts
//   DELETE /api/contacts/:id          — remove a saved contact
//   POST   /api/contacts/:id/to-crm   — copy a saved contact into crm_contacts
//
// All endpoints require auth. The lookup endpoint caches results in
// linkedin_contacts so repeat lookups on the same profile don't burn Hunter
// credits.

const express = require('express');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const HUNTER_BASE = 'https://api.hunter.io/v2';

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS linkedin_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  linkedin_url TEXT,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  headline TEXT,
  company TEXT,
  company_domain TEXT,
  email TEXT,
  email_confidence INTEGER,
  email_sources INTEGER DEFAULT 0,
  phone TEXT,
  position TEXT,
  raw_json TEXT,
  saved_to_crm INTEGER DEFAULT 0,
  crm_contact_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_lc_user ON linkedin_contacts(user_id)`); } catch (_) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_lc_url ON linkedin_contacts(user_id, linkedin_url)`); } catch (_) {}

// ── Find email via Hunter.io ──────────────────────────────────────────────────
router.post('/find-email', authenticate, async (req, res) => {
  const HUNTER_KEY = process.env.HUNTER_API_KEY;
  if (!HUNTER_KEY) {
    return res.status(500).json({
      error: 'HUNTER_API_KEY is not set in backend/.env on the server',
    });
  }
  const { firstName, lastName, company, domain, linkedinUrl, headline } = req.body || {};
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'firstName and lastName required' });
  }
  if (!company && !domain) {
    return res.status(400).json({ error: 'company or domain required' });
  }

  // Cache hit: same user already looked this LinkedIn URL up
  if (linkedinUrl) {
    const cached = db.prepare(
      `SELECT * FROM linkedin_contacts WHERE user_id = ? AND linkedin_url = ? AND email IS NOT NULL ORDER BY created_at DESC LIMIT 1`
    ).get(req.user.id, linkedinUrl);
    if (cached) {
      return res.json({ ok: true, data: {
        email: cached.email,
        score: cached.email_confidence,
        domain: cached.company_domain,
        first_name: cached.first_name,
        last_name: cached.last_name,
        position: cached.position,
        cached: true,
        contactId: cached.id,
      }});
    }
  }

  const params = new URLSearchParams({
    api_key: HUNTER_KEY,
    first_name: firstName,
    last_name: lastName,
  });
  if (domain) params.append('domain', domain);
  else if (company) params.append('company', company);

  try {
    const r = await fetch(`${HUNTER_BASE}/email-finder?${params.toString()}`);
    const data = await r.json();
    if (data.errors && data.errors.length) {
      return res.status(400).json({ error: data.errors[0].details || data.errors[0].id || 'Hunter API error' });
    }
    const found = data.data || {};

    // Save the lookup (whether or not an email was returned)
    const info = db.prepare(`INSERT INTO linkedin_contacts
      (user_id, linkedin_url, first_name, last_name, full_name, headline,
       company, company_domain, email, email_confidence, email_sources, position, raw_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        req.user.id, linkedinUrl || null,
        firstName, lastName, `${firstName} ${lastName}`.trim(), headline || null,
        company || null, found.domain || domain || null,
        found.email || null, found.score || null,
        (found.sources || []).length, found.position || null,
        JSON.stringify(found)
      );

    res.json({ ok: true, data: Object.assign({ contactId: info.lastInsertRowid }, found) });
  } catch (e) {
    console.error('[contacts/find-email] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Save a candidate (no email lookup needed) ─────────────────────────────────
router.post('/save-candidate', authenticate, (req, res) => {
  const { firstName, lastName, fullName, company, position, headline, linkedinUrl, email, phone } = req.body || {};
  const name = (fullName || `${firstName || ''} ${lastName || ''}`).trim();
  if (!name) return res.status(400).json({ error: 'Full name required' });
  if (!linkedinUrl) return res.status(400).json({ error: 'LinkedIn URL required' });

  // Upsert by (user_id, linkedin_url)
  const existing = db.prepare(
    `SELECT id FROM linkedin_contacts WHERE user_id = ? AND linkedin_url = ?`
  ).get(req.user.id, linkedinUrl);

  if (existing) {
    db.prepare(`UPDATE linkedin_contacts
      SET first_name = COALESCE(?, first_name),
          last_name  = COALESCE(?, last_name),
          full_name  = COALESCE(?, full_name),
          company    = COALESCE(?, company),
          position   = COALESCE(?, position),
          headline   = COALESCE(?, headline),
          email      = COALESCE(?, email),
          phone      = COALESCE(?, phone)
      WHERE id = ?`).run(
      firstName || null, lastName || null, name,
      company || null, position || null, headline || null,
      email || null, phone || null, existing.id);
    return res.json({ ok: true, data: { id: existing.id, updated: true } });
  }

  const info = db.prepare(`INSERT INTO linkedin_contacts
    (user_id, linkedin_url, first_name, last_name, full_name, company, position, headline, email, phone)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    req.user.id, linkedinUrl,
    firstName || null, lastName || null, name,
    company || null, position || null, headline || null,
    email || null, phone || null
  );
  res.json({ ok: true, data: { id: info.lastInsertRowid, created: true } });
});

// ── List saved contacts ───────────────────────────────────────────────────────
router.get('/', authenticate, (req, res) => {
  const rows = db.prepare(
    `SELECT id, linkedin_url, first_name, last_name, full_name, headline, company,
            company_domain, email, email_confidence, phone, position, saved_to_crm, crm_contact_id, created_at
       FROM linkedin_contacts
      WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 500`
  ).all(req.user.id);
  res.json({ ok: true, data: rows });
});

// ── Delete a saved contact ────────────────────────────────────────────────────
router.delete('/:id', authenticate, (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`DELETE FROM linkedin_contacts WHERE id = ? AND user_id = ?`).run(id, req.user.id);
  res.json({ ok: true });
});

// ── Copy a saved contact into the existing CRM (crm_contacts) ────────────────
router.post('/:id/to-crm', authenticate, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(`SELECT * FROM linkedin_contacts WHERE id = ? AND user_id = ?`).get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'not found' });

  // Compose a CRM-compatible payload. crm_contacts stores all custom fields in
  // a JSON "contact_data" blob — we keep the field keys generic so any field
  // mapping configured by the user picks them up.
  const contactData = {
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    full_name: row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    email: row.email || '',
    phone: row.phone || '',
    company: row.company || '',
    company_domain: row.company_domain || '',
    position: row.position || '',
    headline: row.headline || '',
    linkedin_url: row.linkedin_url || '',
  };

  const crmId = uuidv4();
  // contact_num is auto-assigned (sequential). Get next.
  const maxNum = db.prepare(`SELECT COALESCE(MAX(contact_num), 0) + 1 AS n FROM crm_contacts`).get().n;
  db.prepare(`INSERT INTO crm_contacts (id, contact_num, created_by, source, contact_data) VALUES (?,?,?,?,?)`)
    .run(crmId, maxNum, req.user.id, 'linkedin', JSON.stringify(contactData));

  db.prepare(`UPDATE linkedin_contacts SET saved_to_crm = 1, crm_contact_id = ? WHERE id = ?`).run(crmId, id);
  res.json({ ok: true, data: { crmContactId: crmId, contactNum: maxNum } });
});

module.exports = router;
