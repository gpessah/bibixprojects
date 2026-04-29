const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`CREATE TABLE IF NOT EXISTS crm_fields (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  field_key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'text',
  options TEXT NOT NULL DEFAULT '[]',
  required INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  field_group TEXT NOT NULL DEFAULT 'general',
  list_visible INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS crm_contacts (
  id TEXT PRIMARY KEY,
  contact_num INTEGER,
  created_by TEXT,
  assigned_to TEXT,
  team_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  contact_data TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS crm_teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS crm_team_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, user_id)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS crm_comments (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS crm_activities (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS crm_forms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  fields TEXT NOT NULL DEFAULT '[]',
  settings TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS crm_api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  active INTEGER NOT NULL DEFAULT 1
)`);

// Migrations (safe to run repeatedly)
try { db.exec("ALTER TABLE crm_contacts ADD COLUMN assigned_to TEXT"); } catch {}
try { db.exec("ALTER TABLE crm_contacts ADD COLUMN team_id TEXT"); } catch {}
try { db.exec("ALTER TABLE crm_contacts ADD COLUMN contact_num INTEGER"); } catch {}
try { db.exec("ALTER TABLE crm_fields ADD COLUMN field_group TEXT NOT NULL DEFAULT 'general'"); } catch {}
try { db.exec("ALTER TABLE crm_fields ADD COLUMN list_visible INTEGER NOT NULL DEFAULT 1"); } catch {}

// ── Field Seeding ─────────────────────────────────────────────────────────────

function seedField(key, name, type, options, required, position, group, listVisible) {
  const exists = db.prepare('SELECT id FROM crm_fields WHERE field_key=?').get(key);
  if (!exists) {
    db.prepare(`INSERT INTO crm_fields
      (id,name,field_key,type,options,required,position,field_group,list_visible)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(uuidv4(), name, key, type, JSON.stringify(options || []),
        required ? 1 : 0, position, group, listVisible ? 1 : 0);
  }
}

// General fields
[
  ['first_name', 'First Name', 'text', [], true, 1, true],
  ['last_name', 'Last Name', 'text', [], false, 2, true],
  ['email', 'Email', 'email', [], false, 3, true],
  ['phone', 'Phone', 'phone', [], false, 4, true],
  ['second_phone', 'Second Phone', 'phone', [], false, 5, false],
  ['country', 'Country', 'text', [], false, 6, true],
  ['language', 'Language', 'text', [], false, 7, false],
  ['contact_status', 'Status', 'select', ['Registered', 'Active', 'Inactive', 'Banned'], false, 8, true],
  ['kyc_status', 'KYC Status', 'select', ['No KYC', 'Pending', 'Approved', 'Rejected'], false, 9, true],
  ['contact_source', 'Source', 'text', [], false, 10, true],
  ['affiliate', 'Affiliate', 'text', [], false, 11, true],
  ['referring_affiliate', 'Referring Affiliate', 'text', [], false, 12, true],
  ['registration_notes', 'Registration Notes', 'textarea', [], false, 13, false],
  ['date_of_birth', 'Date of Birth', 'date', [], false, 14, false],
  ['skype', 'Skype', 'text', [], false, 15, false],
  ['marketing_type', 'Marketing Type', 'text', [], false, 16, false],
  ['is_problematic', 'Problematic', 'boolean', [], false, 17, false],
  ['is_bonus_abuser', 'Is Bonus Abuser', 'boolean', [], false, 18, false],
  ['bonus_abuser_reason', 'Bonus Abuser Reason', 'text', [], false, 19, false],
  ['investments', 'Investments', 'text', [], false, 20, false],
  ['id_passport', 'ID/Passport Number', 'text', [], false, 21, false],
].forEach(([key, name, type, opts, req, pos, lv]) => seedField(key, name, type, opts, req, pos, 'general', lv));

// Tracking fields
[
  ['marketing_link_id', 'Marketing Link Id', 'text', [], false, 1, false],
  ['marketing_link', 'Marketing Link', 'url', [], false, 2, false],
  ['referrer', 'Referrer', 'text', [], false, 3, false],
  ['utm_campaign', 'UTM Campaign', 'text', [], false, 4, true],
  ['utm_content', 'UTM Content', 'text', [], false, 5, false],
  ['utm_medium', 'UTM Medium', 'text', [], false, 6, false],
  ['utm_source', 'UTM Source', 'text', [], false, 7, false],
  ['utm_term', 'UTM Term', 'text', [], false, 8, false],
  ['cellxpert_cxd', 'Cellxpert CXD', 'text', [], false, 9, false],
  ['full_link', 'Full Link', 'url', [], false, 10, false],
].forEach(([key, name, type, opts, req, pos, lv]) => seedField(key, name, type, opts, req, pos, 'tracking', lv));

// Sales fields
[
  ['sales_desk', 'Sales Desk', 'text', [], false, 1, false],
  ['sales_rep', 'Sales Rep', 'text', [], false, 2, false],
  ['internal_sales_status', 'Internal Sales Status', 'select', ['New', 'Interested', 'Not Interested', 'Follow Up', 'Converted', 'Lost'], false, 3, true],
  ['client_potential', 'Client Potential', 'select', ['High', 'Medium', 'Low'], false, 4, false],
  ['audit_status', 'Audit Status', 'text', [], false, 5, false],
].forEach(([key, name, type, opts, req, pos, lv]) => seedField(key, name, type, opts, req, pos, 'sales', lv));

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseField(row) {
  return {
    ...row,
    options: JSON.parse(row.options || '[]'),
    required: !!row.required,
    list_visible: !!row.list_visible,
  };
}

function parseContact(row) {
  return { ...row, values: JSON.parse(row.contact_data || '{}') };
}

function parseForm(row) {
  return {
    ...row,
    fields: JSON.parse(row.fields || '[]'),
    settings: JSON.parse(row.settings || '{}'),
    active: !!row.active,
  };
}

function getUser(userId) {
  if (!userId) return null;
  return db.prepare('SELECT id, name, email, avatar_color FROM users WHERE id=?').get(userId) || null;
}

function enrichContact(contact) {
  return { ...contact, assigned_user: getUser(contact.assigned_to) };
}

function logActivity(contactId, userId, type, description) {
  db.prepare('INSERT INTO crm_activities (id,contact_id,user_id,type,description) VALUES (?,?,?,?,?)')
    .run(uuidv4(), contactId, userId, type, description || null);
}

function getContactScope(userId) {
  const dbUser = db.prepare('SELECT role FROM users WHERE id=?').get(userId);
  if (dbUser && dbUser.role === 'admin') return 'all';

  const memberships = db.prepare('SELECT role, team_id FROM crm_team_members WHERE user_id=?').all(userId);
  if (memberships.length === 0) return 'all';

  const leaderTeams = memberships.filter(m => m.role === 'leader').map(m => m.team_id);
  if (leaderTeams.length > 0) return { type: 'leader', teams: leaderTeams, userId };

  return { type: 'operator', userId };
}

// ── Fields ────────────────────────────────────────────────────────────────────

router.get('/fields', authenticate, (req, res) => {
  const rows = db.prepare('SELECT * FROM crm_fields ORDER BY field_group, position, created_at').all();
  res.json(rows.map(parseField));
});

router.post('/fields', authenticate, (req, res) => {
  const { name, type = 'text', options = [], required = false, field_group = 'general' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const field_key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now();
  const maxPos = db.prepare('SELECT COALESCE(MAX(position),0) as m FROM crm_fields WHERE field_group=?').get(field_group).m;
  const id = uuidv4();

  db.prepare('INSERT INTO crm_fields (id,name,field_key,type,options,required,position,field_group,list_visible) VALUES (?,?,?,?,?,?,?,?,1)')
    .run(id, name, field_key, type, JSON.stringify(options), required ? 1 : 0, maxPos + 1, field_group);

  res.json(parseField(db.prepare('SELECT * FROM crm_fields WHERE id=?').get(id)));
});

router.put('/fields/:id', authenticate, (req, res) => {
  const { name, options, required, position, field_group, list_visible } = req.body;
  const row = db.prepare('SELECT * FROM crm_fields WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  db.prepare(`UPDATE crm_fields SET
    name         = COALESCE(?, name),
    options      = COALESCE(?, options),
    required     = COALESCE(?, required),
    position     = COALESCE(?, position),
    field_group  = COALESCE(?, field_group),
    list_visible = COALESCE(?, list_visible)
    WHERE id = ?`)
    .run(
      name || null,
      options !== undefined ? JSON.stringify(options) : null,
      required !== undefined ? (required ? 1 : 0) : null,
      position ?? null,
      field_group || null,
      list_visible !== undefined ? (list_visible ? 1 : 0) : null,
      req.params.id,
    );

  res.json(parseField(db.prepare('SELECT * FROM crm_fields WHERE id=?').get(req.params.id)));
});

router.delete('/fields/:id', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM crm_fields WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  try {
    db.exec('BEGIN');
    const contacts = db.prepare('SELECT id, contact_data FROM crm_contacts').all();
    const upd = db.prepare('UPDATE crm_contacts SET contact_data=? WHERE id=?');
    for (const c of contacts) {
      const vals = JSON.parse(c.contact_data || '{}');
      delete vals[row.field_key];
      upd.run(JSON.stringify(vals), c.id);
    }
    db.prepare('DELETE FROM crm_fields WHERE id=?').run(req.params.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }

  res.json({ success: true });
});

// ── Contacts ──────────────────────────────────────────────────────────────────

router.get('/contacts', authenticate, (req, res) => {
  const { search = '', sort = 'created_at', dir = 'desc', page = '1', limit = '50' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const scope = getContactScope(req.user.id);
  let rows;
  if (scope === 'all') {
    rows = db.prepare('SELECT * FROM crm_contacts ORDER BY created_at DESC').all();
  } else if (scope.type === 'leader') {
    const ph = scope.teams.map(() => '?').join(',');
    rows = db.prepare(`SELECT * FROM crm_contacts WHERE team_id IN (${ph}) OR assigned_to=? ORDER BY created_at DESC`)
      .all([...scope.teams, scope.userId]);
  } else {
    rows = db.prepare('SELECT * FROM crm_contacts WHERE assigned_to=? ORDER BY created_at DESC').all(scope.userId);
  }

  let contacts = rows.map(r => enrichContact(parseContact(r)));

  if (search) {
    const q = search.toLowerCase();
    contacts = contacts.filter(c =>
      Object.values(c.values).some(v => String(v || '').toLowerCase().includes(q)) ||
      (c.assigned_user?.name || '').toLowerCase().includes(q)
    );
  }

  const filters = req.query.filter || {};
  for (const [key, val] of Object.entries(filters)) {
    if (val) contacts = contacts.filter(c =>
      String(c.values[key] || '').toLowerCase().includes(String(val).toLowerCase()));
  }

  if (sort === 'created_at' || sort === 'updated_at') {
    if (dir === 'asc') contacts.sort((a, b) => a[sort].localeCompare(b[sort]));
  } else {
    contacts.sort((a, b) => {
      const av = String(a.values[sort] || '');
      const bv = String(b.values[sort] || '');
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }

  const total = contacts.length;
  res.json({ contacts: contacts.slice(offset, offset + parseInt(limit)), total, page: parseInt(page), limit: parseInt(limit) });
});

router.get('/contacts/:id', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM crm_contacts WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(enrichContact(parseContact(row)));
});

router.post('/contacts', authenticate, (req, res) => {
  const { values = {}, assigned_to, team_id } = req.body;
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO crm_contacts (id,created_by,assigned_to,team_id,source,contact_data,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, req.user.id, assigned_to || null, team_id || null, 'manual', JSON.stringify(values), now, now);

  logActivity(id, req.user.id, 'created', 'Contact created');

  res.json(enrichContact(parseContact(db.prepare('SELECT * FROM crm_contacts WHERE id=?').get(id))));
});

router.put('/contacts/:id', authenticate, (req, res) => {
  const { values, assigned_to, team_id } = req.body;
  const row = db.prepare('SELECT * FROM crm_contacts WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const now = new Date().toISOString();

  if (values !== undefined) {
    const merged = { ...JSON.parse(row.contact_data || '{}'), ...values };
    db.prepare('UPDATE crm_contacts SET contact_data=?, updated_at=? WHERE id=?').run(JSON.stringify(merged), now, req.params.id);
    logActivity(req.params.id, req.user.id, 'updated', 'Contact information updated');
  }

  if (assigned_to !== undefined) {
    const newUser = getUser(assigned_to);
    db.prepare('UPDATE crm_contacts SET assigned_to=?, updated_at=? WHERE id=?').run(assigned_to || null, now, req.params.id);
    logActivity(req.params.id, req.user.id, 'assigned',
      assigned_to ? `Assigned to ${newUser?.name || 'user'}` : 'Unassigned');
  }

  if (team_id !== undefined) {
    db.prepare('UPDATE crm_contacts SET team_id=?, updated_at=? WHERE id=?').run(team_id || null, now, req.params.id);
  }

  res.json(enrichContact(parseContact(db.prepare('SELECT * FROM crm_contacts WHERE id=?').get(req.params.id))));
});

router.delete('/contacts/:id', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM crm_contacts WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM crm_contacts WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Comments ──────────────────────────────────────────────────────────────────

router.get('/contacts/:id/comments', authenticate, (req, res) => {
  const rows = db.prepare('SELECT * FROM crm_comments WHERE contact_id=? ORDER BY created_at ASC').all(req.params.id);
  res.json(rows.map(r => ({ ...r, author: getUser(r.user_id) })));
});

router.post('/contacts/:id/comments', authenticate, (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });

  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO crm_comments (id,contact_id,user_id,content,created_at) VALUES (?,?,?,?,?)')
    .run(id, req.params.id, req.user.id, content.trim(), now);

  logActivity(req.params.id, req.user.id, 'comment_added', 'Added a comment');

  const row = db.prepare('SELECT * FROM crm_comments WHERE id=?').get(id);
  res.json({ ...row, author: getUser(req.user.id) });
});

router.delete('/contacts/:contactId/comments/:commentId', authenticate, (req, res) => {
  db.prepare('DELETE FROM crm_comments WHERE id=? AND contact_id=?').run(req.params.commentId, req.params.contactId);
  res.json({ success: true });
});

// ── Activities ────────────────────────────────────────────────────────────────

router.get('/contacts/:id/activities', authenticate, (req, res) => {
  const rows = db.prepare('SELECT * FROM crm_activities WHERE contact_id=? ORDER BY created_at DESC').all(req.params.id);
  res.json(rows.map(r => ({ ...r, author: getUser(r.user_id) })));
});

// ── Teams ─────────────────────────────────────────────────────────────────────

function enrichTeam(team) {
  const members = db.prepare(`
    SELECT ctm.id, ctm.team_id, ctm.user_id, ctm.role, u.name, u.email, u.avatar_color
    FROM crm_team_members ctm
    JOIN users u ON u.id = ctm.user_id
    WHERE ctm.team_id = ?
    ORDER BY ctm.role, u.name
  `).all(team.id);
  return { ...team, members };
}

router.get('/teams', authenticate, (req, res) => {
  const teams = db.prepare('SELECT * FROM crm_teams ORDER BY created_at DESC').all();
  res.json(teams.map(enrichTeam));
});

router.post('/teams', authenticate, (req, res) => {
  const { name, description = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const id = uuidv4();
  db.prepare('INSERT INTO crm_teams (id,name,description,created_by) VALUES (?,?,?,?)')
    .run(id, name, description, req.user.id);

  res.json(enrichTeam(db.prepare('SELECT * FROM crm_teams WHERE id=?').get(id)));
});

router.put('/teams/:id', authenticate, (req, res) => {
  const { name, description } = req.body;
  const row = db.prepare('SELECT * FROM crm_teams WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  db.prepare('UPDATE crm_teams SET name=COALESCE(?,name), description=COALESCE(?,description) WHERE id=?')
    .run(name || null, description ?? null, req.params.id);

  res.json(enrichTeam(db.prepare('SELECT * FROM crm_teams WHERE id=?').get(req.params.id)));
});

router.delete('/teams/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM crm_teams WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

router.post('/teams/:id/members', authenticate, (req, res) => {
  const { user_id, role = 'operator' } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  const validRoles = ['leader', 'operator', 'readonly'];
  const memberRole = validRoles.includes(role) ? role : 'operator';

  try {
    db.prepare('INSERT INTO crm_team_members (id,team_id,user_id,role) VALUES (?,?,?,?)')
      .run(uuidv4(), req.params.id, user_id, memberRole);
  } catch {
    db.prepare('UPDATE crm_team_members SET role=? WHERE team_id=? AND user_id=?')
      .run(memberRole, req.params.id, user_id);
  }

  res.json(enrichTeam(db.prepare('SELECT * FROM crm_teams WHERE id=?').get(req.params.id)));
});

router.delete('/teams/:id/members/:userId', authenticate, (req, res) => {
  db.prepare('DELETE FROM crm_team_members WHERE team_id=? AND user_id=?').run(req.params.id, req.params.userId);
  res.json(enrichTeam(db.prepare('SELECT * FROM crm_teams WHERE id=?').get(req.params.id)));
});

// ── Users (for CRM assignment) ────────────────────────────────────────────────

router.get('/users', authenticate, (req, res) => {
  const users = db.prepare('SELECT id, name, email, avatar_color FROM users ORDER BY name').all();
  res.json(users);
});

// ── Forms ─────────────────────────────────────────────────────────────────────

router.get('/forms', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM crm_forms ORDER BY created_at DESC').all().map(parseForm));
});

router.post('/forms', authenticate, (req, res) => {
  const { name, description = '', fields = [], settings = {} } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO crm_forms (id,name,description,fields,settings,active,created_by) VALUES (?,?,?,?,?,1,?)')
    .run(id, name, description, JSON.stringify(fields), JSON.stringify(settings), req.user.id);
  res.json(parseForm(db.prepare('SELECT * FROM crm_forms WHERE id=?').get(id)));
});

router.put('/forms/:id', authenticate, (req, res) => {
  const { name, description, fields, settings, active } = req.body;
  const row = db.prepare('SELECT * FROM crm_forms WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  db.prepare(`UPDATE crm_forms SET
    name        = COALESCE(?, name),
    description = COALESCE(?, description),
    fields      = COALESCE(?, fields),
    settings    = COALESCE(?, settings),
    active      = COALESCE(?, active)
    WHERE id = ?`)
    .run(
      name || null, description ?? null,
      fields !== undefined ? JSON.stringify(fields) : null,
      settings !== undefined ? JSON.stringify(settings) : null,
      active !== undefined ? (active ? 1 : 0) : null,
      req.params.id,
    );

  res.json(parseForm(db.prepare('SELECT * FROM crm_forms WHERE id=?').get(req.params.id)));
});

router.delete('/forms/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM crm_forms WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ── Public form endpoints (no auth) ───────────────────────────────────────────

router.get('/forms/:id/public', (req, res) => {
  const form = db.prepare('SELECT * FROM crm_forms WHERE id=? AND active=1').get(req.params.id);
  if (!form) return res.status(404).json({ error: 'Form not found' });

  const parsed = parseForm(form);
  const fieldDefs = db.prepare('SELECT * FROM crm_fields ORDER BY position').all().map(parseField);
  const formFields = parsed.fields.map(key => fieldDefs.find(f => f.field_key === key)).filter(Boolean);

  // Include hidden_fields so the public form renderer can read URL params and
  // inject them into the submission payload without showing them to the visitor.
  res.json({
    form: {
      id: form.id,
      name: form.name,
      description: form.description,
      settings: parsed.settings,
    },
    fields: formFields,
    hidden_fields: parsed.settings.hidden_fields ?? [],
  });
});

router.post('/forms/:id/submit', (req, res) => {
  const form = db.prepare('SELECT * FROM crm_forms WHERE id=? AND active=1').get(req.params.id);
  if (!form) return res.status(404).json({ error: 'Form not found' });

  const { values = {} } = req.body;
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare('INSERT INTO crm_contacts (id,created_by,source,contact_data,created_at,updated_at) VALUES (?,NULL,?,?,?,?)')
    .run(id, `form:${req.params.id}`, JSON.stringify(values), now, now);

  const settings = JSON.parse(form.settings || '{}');
  res.json({ success: true, contact_id: id, redirect_url: settings.redirect_url || null });
});

// ── Reports ───────────────────────────────────────────────────────────────────

router.get('/reports', authenticate, (req, res) => {
  const { groupBy, from, to } = req.query;

  let contacts = db.prepare('SELECT * FROM crm_contacts').all().map(parseContact);

  if (from) contacts = contacts.filter(c => c.created_at >= from);
  if (to)   contacts = contacts.filter(c => c.created_at <= to + 'T23:59:59');

  const total = contacts.length;

  let byValue = [];
  if (groupBy) {
    const counts = {};
    for (const c of contacts) {
      const v = String(c.values[groupBy] || '(none)');
      counts[v] = (counts[v] || 0) + 1;
    }
    byValue = Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }

  const overTime = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    overTime.push({ date: dateStr, count: contacts.filter(c => c.created_at.startsWith(dateStr)).length });
  }

  const sourceMap = {};
  for (const c of contacts) {
    const src = c.source?.startsWith('form:') ? 'Form' : 'Manual';
    sourceMap[src] = (sourceMap[src] || 0) + 1;
  }
  const bySource = Object.entries(sourceMap).map(([label, count]) => ({ label, count }));

  res.json({ total, byValue, overTime, bySource });
});

// ── API Keys ──────────────────────────────────────────────────────────────────

router.get('/api-keys', authenticate, (req, res) => {
  const keys = db.prepare('SELECT id, name, api_key, created_by, created_at, last_used_at, active FROM crm_api_keys ORDER BY created_at DESC').all();
  // Mask middle of key for display
  res.json(keys.map(k => ({
    ...k,
    api_key_masked: k.api_key.slice(0, 12) + '••••••••••••' + k.api_key.slice(-4),
    api_key_full: k.api_key,
    active: !!k.active,
  })));
});

router.post('/api-keys', authenticate, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const id = uuidv4();
  const rawKey = 'bx_' + crypto.randomBytes(28).toString('hex');

  db.prepare('INSERT INTO crm_api_keys (id,name,api_key,created_by) VALUES (?,?,?,?)')
    .run(id, name.trim(), rawKey, req.user.id);

  const row = db.prepare('SELECT * FROM crm_api_keys WHERE id=?').get(id);
  res.json({ ...row, api_key_full: rawKey, active: true });
});

router.delete('/api-keys/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM crm_api_keys WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

router.patch('/api-keys/:id', authenticate, (req, res) => {
  const { active } = req.body;
  db.prepare('UPDATE crm_api_keys SET active=? WHERE id=?').run(active ? 1 : 0, req.params.id);
  const row = db.prepare('SELECT * FROM crm_api_keys WHERE id=?').get(req.params.id);
  res.json({ ...row, active: !!row.active });
});

// ── Lead Ingestion (API-key authenticated) ────────────────────────────────────

router.post('/ingest', (req, res) => {
  // Accept key from Authorization header OR x-api-key header OR body
  const authHeader = req.headers['authorization'] || '';
  const headerKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const apiKeyValue = headerKey || req.headers['x-api-key'] || req.body?.api_key;

  if (!apiKeyValue) return res.status(401).json({ error: 'API key required. Pass as Authorization: Bearer <key> or X-Api-Key header.' });

  const keyRow = db.prepare("SELECT * FROM crm_api_keys WHERE api_key=? AND active=1").get(apiKeyValue);
  if (!keyRow) return res.status(401).json({ error: 'Invalid or inactive API key.' });

  // Update last_used_at
  db.prepare('UPDATE crm_api_keys SET last_used_at=? WHERE id=?').run(new Date().toISOString(), keyRow.id);

  const { values = {}, assigned_to, team_id, source = 'api' } = req.body;

  // Flatten top-level fields into values if passed directly (convenience)
  const knownMeta = new Set(['api_key', 'values', 'assigned_to', 'team_id', 'source']);
  const flatValues = { ...values };
  for (const [k, v] of Object.entries(req.body)) {
    if (!knownMeta.has(k)) flatValues[k] = String(v);
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO crm_contacts (id,created_by,assigned_to,team_id,source,contact_data,created_at,updated_at) VALUES (?,NULL,?,?,?,?,?,?)')
    .run(id, assigned_to || null, team_id || null, source, JSON.stringify(flatValues), now, now);

  logActivity(id, keyRow.created_by, 'created', `Contact created via API (key: ${keyRow.name})`);

  res.json({ success: true, contact_id: id });
});

module.exports = router;
