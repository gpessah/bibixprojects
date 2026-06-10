// ─────────────────────────────────────────────────────────────────────────────
// BibixBI — Business Intelligence module
//
// Google Sheets → snapshots in SQLite → formula/aggregation engine → dashboards
// of customizable widgets (tables, charts, KPIs, pivots, …) plus manual-input
// datasets that feed calculations.
//
// Mirrors the conventions in calendar.js: inline DDL, JWT-state OAuth, the
// db.prepare(...).run/get/all shim, and the authenticate middleware.
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const engine = require('../services/biEngine');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'monday-secret-key-change-in-prod';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

const SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

// ── Schema ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS bi_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TEXT,
    google_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bi_datasources (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    name TEXT NOT NULL,
    spreadsheet_id TEXT NOT NULL,
    spreadsheet_name TEXT,
    sheet_name TEXT,
    cell_range TEXT,
    refresh_interval_minutes INTEGER NOT NULL DEFAULT 60,
    auto_sync INTEGER NOT NULL DEFAULT 1,
    last_synced_at TEXT,
    last_error TEXT,
    row_count INTEGER DEFAULT 0,
    column_meta TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (connection_id) REFERENCES bi_connections(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bi_datasource_rows (
    id TEXT PRIMARY KEY,
    datasource_id TEXT NOT NULL,
    row_index INTEGER NOT NULL,
    data TEXT NOT NULL,
    FOREIGN KEY (datasource_id) REFERENCES bi_datasources(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_bi_rows_ds ON bi_datasource_rows(datasource_id);

  CREATE TABLE IF NOT EXISTS bi_sync_history (
    id TEXT PRIMARY KEY,
    datasource_id TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    row_count INTEGER,
    metrics TEXT,
    FOREIGN KEY (datasource_id) REFERENCES bi_datasources(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_bi_hist_ds ON bi_sync_history(datasource_id);

  CREATE TABLE IF NOT EXISTS bi_manual_datasets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    columns TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bi_manual_rows (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    row_index INTEGER NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (dataset_id) REFERENCES bi_manual_datasets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bi_metrics (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    expression TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bi_dashboards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    workspace_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    theme TEXT DEFAULT '{}',
    layout TEXT DEFAULT '{}',
    is_template INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bi_widgets (
    id TEXT PRIMARY KEY,
    dashboard_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT,
    source_type TEXT DEFAULT 'none',
    source_id TEXT,
    config TEXT DEFAULT '{}',
    layout TEXT DEFAULT '{}',
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dashboard_id) REFERENCES bi_dashboards(id) ON DELETE CASCADE
  );
`);

// biSync requires this module's tables to exist; require after DDL.
const biSync = require('../services/biSync');

// ── helpers ───────────────────────────────────────────────────────────────────
const J = (v, fallback) => { try { return JSON.parse(v); } catch { return fallback; } };

function ownDatasource(id, userId) {
  return db.prepare('SELECT * FROM bi_datasources WHERE id=? AND user_id=?').get(id, userId);
}
function ownDashboard(id, userId) {
  return db.prepare('SELECT * FROM bi_dashboards WHERE id=? AND (user_id=? OR is_template=1)').get(id, userId);
}

// Load rows + column list for a source. Used by /query and previews.
function resolveSource(userId, sourceType, sourceId) {
  if (sourceType === 'datasource') {
    const ds = ownDatasource(sourceId, userId);
    if (!ds) return null;
    const rows = db.prepare('SELECT data FROM bi_datasource_rows WHERE datasource_id=? ORDER BY row_index')
      .all(sourceId).map((r) => J(r.data, {}));
    return { rows, columns: J(ds.column_meta, []), meta: ds };
  }
  if (sourceType === 'manual') {
    const dataset = db.prepare('SELECT * FROM bi_manual_datasets WHERE id=? AND user_id=?').get(sourceId, userId);
    if (!dataset) return null;
    const rows = db.prepare('SELECT data FROM bi_manual_rows WHERE dataset_id=? ORDER BY row_index')
      .all(sourceId).map((r) => J(r.data, {}));
    return { rows, columns: J(dataset.columns, []), meta: dataset };
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// Connections + Google OAuth
// ════════════════════════════════════════════════════════════════════════════
router.get('/connections', authenticate, (req, res) => {
  const conns = db.prepare('SELECT id, google_email, created_at FROM bi_connections WHERE user_id=? ORDER BY created_at')
    .all(req.user.id);
  res.json(conns);
});

router.get('/google/auth', authenticate, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google not configured' });
  const auth = biSync.makeOAuth2Client();
  const state = jwt.sign({ userId: req.user.id, scope: 'bi' }, JWT_SECRET, { expiresIn: '10m' });
  const url = auth.generateAuthUrl({
    access_type: 'offline', prompt: 'consent', scope: SHEETS_SCOPES, state,
  });
  res.json({ url });
});

router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${APP_URL}/bi?bi=error&msg=${error}`);

  let userId;
  try { userId = jwt.verify(state, JWT_SECRET).userId; }
  catch { return res.redirect(`${APP_URL}/bi?bi=error&msg=invalid_state`); }

  try {
    const auth = biSync.makeOAuth2Client();
    const { tokens } = await auth.getToken(code);
    auth.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth });
    const { data: profile } = await oauth2.userinfo.get();

    const existing = db.prepare('SELECT id FROM bi_connections WHERE user_id=? AND google_email=?')
      .get(userId, profile.email);
    if (existing) {
      db.prepare('UPDATE bi_connections SET access_token=?, refresh_token=?, expires_at=? WHERE id=?')
        .run(tokens.access_token, tokens.refresh_token || null,
          tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null, existing.id);
    } else {
      db.prepare('INSERT INTO bi_connections (id,user_id,access_token,refresh_token,expires_at,google_email) VALUES (?,?,?,?,?,?)')
        .run(uuidv4(), userId, tokens.access_token, tokens.refresh_token || null,
          tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null, profile.email);
    }
    res.redirect(`${APP_URL}/bi?bi=connected`);
  } catch (err) {
    console.error('[BI] OAuth callback error:', err.message);
    res.redirect(`${APP_URL}/bi?bi=error&msg=token_exchange_failed`);
  }
});

router.delete('/connections/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM bi_connections WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ── Sheet picker (Drive + Sheets metadata) ─────────────────────────────────────
router.get('/connections/:id/spreadsheets', authenticate, async (req, res) => {
  const conn = db.prepare('SELECT * FROM bi_connections WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });
  try {
    const auth = biSync.getGoogleClient(conn);
    const drive = google.drive({ version: 'v3', auth });
    const q = req.query.q ? ` and name contains '${String(req.query.q).replace(/'/g, "\\'")}'` : '';
    const { data } = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.spreadsheet' and trashed=false${q}`,
      fields: 'files(id,name,modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 50,
    });
    res.json(data.files || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/connections/:id/spreadsheets/:sheetId/tabs', authenticate, async (req, res) => {
  const conn = db.prepare('SELECT * FROM bi_connections WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });
  try {
    const auth = biSync.getGoogleClient(conn);
    const sheets = google.sheets({ version: 'v4', auth });
    const { data } = await sheets.spreadsheets.get({
      spreadsheetId: req.params.sheetId,
      fields: 'properties.title,sheets.properties(title,gridProperties)',
    });
    res.json({
      title: data.properties?.title,
      tabs: (data.sheets || []).map((s) => ({
        title: s.properties.title,
        rows: s.properties.gridProperties?.rowCount,
        cols: s.properties.gridProperties?.columnCount,
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// Datasources
// ════════════════════════════════════════════════════════════════════════════
router.get('/datasources', authenticate, (req, res) => {
  const list = db.prepare(`
    SELECT d.*, c.google_email
    FROM bi_datasources d JOIN bi_connections c ON d.connection_id = c.id
    WHERE d.user_id=? ORDER BY d.created_at DESC
  `).all(req.user.id);
  res.json(list.map((d) => ({ ...d, column_meta: J(d.column_meta, []) })));
});

router.post('/datasources', authenticate, async (req, res) => {
  const { connection_id, name, spreadsheet_id, spreadsheet_name, sheet_name, cell_range,
    refresh_interval_minutes, auto_sync } = req.body;
  const conn = db.prepare('SELECT id FROM bi_connections WHERE id=? AND user_id=?').get(connection_id, req.user.id);
  if (!conn) return res.status(400).json({ error: 'Invalid connection' });
  if (!spreadsheet_id) return res.status(400).json({ error: 'spreadsheet_id required' });

  const id = uuidv4();
  db.prepare(`INSERT INTO bi_datasources
    (id,user_id,connection_id,name,spreadsheet_id,spreadsheet_name,sheet_name,cell_range,refresh_interval_minutes,auto_sync)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.id, connection_id, name || spreadsheet_name || 'Untitled', spreadsheet_id,
      spreadsheet_name || null, sheet_name || null, cell_range || null,
      refresh_interval_minutes ?? 60, auto_sync === false ? 0 : 1);

  const result = await biSync.syncDatasourceSafe(id);
  const ds = db.prepare('SELECT * FROM bi_datasources WHERE id=?').get(id);
  res.json({ ...ds, column_meta: J(ds.column_meta, []), syncResult: result });
});

router.patch('/datasources/:id', authenticate, (req, res) => {
  const ds = ownDatasource(req.params.id, req.user.id);
  if (!ds) return res.status(404).json({ error: 'Not found' });
  const fields = ['name', 'sheet_name', 'cell_range', 'refresh_interval_minutes', 'auto_sync'];
  const sets = [], vals = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f}=?`);
      vals.push(f === 'auto_sync' ? (req.body[f] ? 1 : 0) : req.body[f]);
    }
  }
  if (sets.length) { vals.push(req.params.id); db.prepare(`UPDATE bi_datasources SET ${sets.join(',')} WHERE id=?`).run(...vals); }
  res.json({ success: true });
});

router.delete('/datasources/:id', authenticate, (req, res) => {
  const ds = ownDatasource(req.params.id, req.user.id);
  if (!ds) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM bi_datasources WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

router.post('/datasources/:id/refresh', authenticate, async (req, res) => {
  const ds = ownDatasource(req.params.id, req.user.id);
  if (!ds) return res.status(404).json({ error: 'Not found' });
  const result = await biSync.syncDatasourceSafe(req.params.id);
  if (result.error) return res.status(502).json(result);
  const updated = db.prepare('SELECT * FROM bi_datasources WHERE id=?').get(req.params.id);
  res.json({ ...result, datasource: { ...updated, column_meta: J(updated.column_meta, []) } });
});

router.get('/datasources/:id/rows', authenticate, (req, res) => {
  const ds = ownDatasource(req.params.id, req.user.id);
  if (!ds) return res.status(404).json({ error: 'Not found' });
  const limit = Math.min(Number(req.query.limit) || 500, 5000);
  const rows = db.prepare('SELECT data FROM bi_datasource_rows WHERE datasource_id=? ORDER BY row_index LIMIT ?')
    .all(req.params.id, limit).map((r) => J(r.data, {}));
  res.json({ rows, columns: J(ds.column_meta, []), total: ds.row_count });
});

router.get('/datasources/:id/history', authenticate, (req, res) => {
  const ds = ownDatasource(req.params.id, req.user.id);
  if (!ds) return res.status(404).json({ error: 'Not found' });
  const hist = db.prepare('SELECT synced_at, row_count, metrics FROM bi_sync_history WHERE datasource_id=? ORDER BY synced_at')
    .all(req.params.id).map((h) => ({ synced_at: h.synced_at, row_count: h.row_count, metrics: J(h.metrics, {}) }));
  res.json(hist);
});

// ════════════════════════════════════════════════════════════════════════════
// Manual datasets (editable grids that feed calculations)
// ════════════════════════════════════════════════════════════════════════════
router.get('/manual-datasets', authenticate, (req, res) => {
  const list = db.prepare('SELECT * FROM bi_manual_datasets WHERE user_id=? ORDER BY created_at DESC').all(req.user.id);
  res.json(list.map((d) => ({ ...d, columns: J(d.columns, []) })));
});

router.post('/manual-datasets', authenticate, (req, res) => {
  const { name, columns } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO bi_manual_datasets (id,user_id,name,columns) VALUES (?,?,?,?)')
    .run(id, req.user.id, name || 'Manual data', JSON.stringify(columns || []));
  const d = db.prepare('SELECT * FROM bi_manual_datasets WHERE id=?').get(id);
  res.json({ ...d, columns: J(d.columns, []) });
});

router.patch('/manual-datasets/:id', authenticate, (req, res) => {
  const d = db.prepare('SELECT * FROM bi_manual_datasets WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  const name = req.body.name ?? d.name;
  const columns = req.body.columns !== undefined ? JSON.stringify(req.body.columns) : d.columns;
  db.prepare('UPDATE bi_manual_datasets SET name=?, columns=? WHERE id=?').run(name, columns, req.params.id);
  res.json({ success: true });
});

router.delete('/manual-datasets/:id', authenticate, (req, res) => {
  const d = db.prepare('SELECT id FROM bi_manual_datasets WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM bi_manual_datasets WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

router.get('/manual-datasets/:id/rows', authenticate, (req, res) => {
  const d = db.prepare('SELECT * FROM bi_manual_datasets WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  const rows = db.prepare('SELECT data FROM bi_manual_rows WHERE dataset_id=? ORDER BY row_index')
    .all(req.params.id).map((r) => J(r.data, {}));
  res.json({ rows, columns: J(d.columns, []) });
});

// Bulk replace all rows (the grid saves the whole sheet at once).
router.put('/manual-datasets/:id/rows', authenticate, (req, res) => {
  const d = db.prepare('SELECT id FROM bi_manual_datasets WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM bi_manual_rows WHERE dataset_id=?').run(req.params.id);
    const ins = db.prepare('INSERT INTO bi_manual_rows (id,dataset_id,row_index,data) VALUES (?,?,?,?)');
    rows.forEach((r, i) => ins.run(uuidv4(), req.params.id, i, JSON.stringify(r)));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ error: e.message }); }
  res.json({ success: true, count: rows.length });
});

// ════════════════════════════════════════════════════════════════════════════
// Named metrics (reusable formulas)
// ════════════════════════════════════════════════════════════════════════════
router.get('/metrics', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM bi_metrics WHERE user_id=? ORDER BY created_at DESC').all(req.user.id));
});
router.post('/metrics', authenticate, (req, res) => {
  const { name, expression, description } = req.body;
  if (!name || !expression) return res.status(400).json({ error: 'name and expression required' });
  const id = uuidv4();
  db.prepare('INSERT INTO bi_metrics (id,user_id,name,expression,description) VALUES (?,?,?,?,?)')
    .run(id, req.user.id, name, expression, description || null);
  res.json(db.prepare('SELECT * FROM bi_metrics WHERE id=?').get(id));
});
router.patch('/metrics/:id', authenticate, (req, res) => {
  const m = db.prepare('SELECT * FROM bi_metrics WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE bi_metrics SET name=?, expression=?, description=? WHERE id=?')
    .run(req.body.name ?? m.name, req.body.expression ?? m.expression, req.body.description ?? m.description, req.params.id);
  res.json({ success: true });
});
router.delete('/metrics/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM bi_metrics WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
// Dashboards + widgets
// ════════════════════════════════════════════════════════════════════════════
const { TEMPLATES } = require('../services/biTemplates');

router.get('/templates', authenticate, (req, res) => {
  res.json(TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, theme: t.theme, widgetCount: t.widgets.length })));
});

function serializeDashboard(d) {
  const widgets = db.prepare('SELECT * FROM bi_widgets WHERE dashboard_id=? ORDER BY position').all(d.id)
    .map((w) => ({ ...w, config: J(w.config, {}), layout: J(w.layout, {}) }));
  return { ...d, theme: J(d.theme, {}), layout: J(d.layout, {}), widgets };
}

router.get('/dashboards', authenticate, (req, res) => {
  const list = db.prepare('SELECT * FROM bi_dashboards WHERE user_id=? ORDER BY updated_at DESC').all(req.user.id);
  res.json(list.map((d) => ({ ...d, theme: J(d.theme, {}), layout: J(d.layout, {}) })));
});

router.get('/dashboards/:id', authenticate, (req, res) => {
  const d = ownDashboard(req.params.id, req.user.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(serializeDashboard(d));
});

router.post('/dashboards', authenticate, (req, res) => {
  const { name, description, theme, templateId } = req.body;
  const id = uuidv4();
  const tpl = templateId ? TEMPLATES.find((t) => t.id === templateId) : null;

  db.prepare('INSERT INTO bi_dashboards (id,user_id,name,description,theme,layout) VALUES (?,?,?,?,?,?)')
    .run(id, req.user.id, name || tpl?.name || 'New dashboard', description || tpl?.description || null,
      JSON.stringify(theme || tpl?.theme || {}), JSON.stringify({}));

  if (tpl) {
    const ins = db.prepare('INSERT INTO bi_widgets (id,dashboard_id,type,title,source_type,source_id,config,layout,position) VALUES (?,?,?,?,?,?,?,?,?)');
    tpl.widgets.forEach((w, i) => ins.run(uuidv4(), id, w.type, w.title || null, w.source_type || 'none', null,
      JSON.stringify(w.config || {}), JSON.stringify(w.layout || {}), i));
  }
  res.json(serializeDashboard(db.prepare('SELECT * FROM bi_dashboards WHERE id=?').get(id)));
});

router.patch('/dashboards/:id', authenticate, (req, res) => {
  const d = db.prepare('SELECT * FROM bi_dashboards WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  const name = req.body.name ?? d.name;
  const description = req.body.description ?? d.description;
  const theme = req.body.theme !== undefined ? JSON.stringify(req.body.theme) : d.theme;
  const layout = req.body.layout !== undefined ? JSON.stringify(req.body.layout) : d.layout;
  db.prepare('UPDATE bi_dashboards SET name=?, description=?, theme=?, layout=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(name, description, theme, layout, req.params.id);
  res.json({ success: true });
});

router.delete('/dashboards/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM bi_dashboards WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

router.post('/dashboards/:id/duplicate', authenticate, (req, res) => {
  const d = ownDashboard(req.params.id, req.user.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  const newId = uuidv4();
  db.prepare('INSERT INTO bi_dashboards (id,user_id,name,description,theme,layout) VALUES (?,?,?,?,?,?)')
    .run(newId, req.user.id, `${d.name} (copy)`, d.description, d.theme, d.layout);
  const widgets = db.prepare('SELECT * FROM bi_widgets WHERE dashboard_id=?').all(req.params.id);
  const ins = db.prepare('INSERT INTO bi_widgets (id,dashboard_id,type,title,source_type,source_id,config,layout,position) VALUES (?,?,?,?,?,?,?,?,?)');
  widgets.forEach((w) => ins.run(uuidv4(), newId, w.type, w.title, w.source_type, w.source_id, w.config, w.layout, w.position));
  res.json(serializeDashboard(db.prepare('SELECT * FROM bi_dashboards WHERE id=?').get(newId)));
});

// ── Widgets ─────────────────────────────────────────────────────────────────
function ownDashboardForEdit(dashId, userId) {
  return db.prepare('SELECT * FROM bi_dashboards WHERE id=? AND user_id=?').get(dashId, userId);
}

router.post('/dashboards/:id/widgets', authenticate, (req, res) => {
  const d = ownDashboardForEdit(req.params.id, req.user.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  const { type, title, source_type, source_id, config, layout } = req.body;
  const id = uuidv4();
  const pos = (db.prepare('SELECT MAX(position) m FROM bi_widgets WHERE dashboard_id=?').get(req.params.id)?.m ?? -1) + 1;
  db.prepare('INSERT INTO bi_widgets (id,dashboard_id,type,title,source_type,source_id,config,layout,position) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, req.params.id, type || 'table', title || null, source_type || 'none', source_id || null,
      JSON.stringify(config || {}), JSON.stringify(layout || { x: 0, y: 0, w: 6, h: 4 }), pos);
  const w = db.prepare('SELECT * FROM bi_widgets WHERE id=?').get(id);
  res.json({ ...w, config: J(w.config, {}), layout: J(w.layout, {}) });
});

router.patch('/widgets/:id', authenticate, (req, res) => {
  const w = db.prepare(`SELECT w.* FROM bi_widgets w JOIN bi_dashboards d ON w.dashboard_id=d.id
    WHERE w.id=? AND d.user_id=?`).get(req.params.id, req.user.id);
  if (!w) return res.status(404).json({ error: 'Not found' });
  const fields = {
    type: req.body.type ?? w.type,
    title: req.body.title ?? w.title,
    source_type: req.body.source_type ?? w.source_type,
    source_id: req.body.source_id !== undefined ? req.body.source_id : w.source_id,
    config: req.body.config !== undefined ? JSON.stringify(req.body.config) : w.config,
    layout: req.body.layout !== undefined ? JSON.stringify(req.body.layout) : w.layout,
  };
  db.prepare('UPDATE bi_widgets SET type=?, title=?, source_type=?, source_id=?, config=?, layout=? WHERE id=?')
    .run(fields.type, fields.title, fields.source_type, fields.source_id, fields.config, fields.layout, req.params.id);
  res.json({ success: true });
});

router.delete('/widgets/:id', authenticate, (req, res) => {
  const w = db.prepare(`SELECT w.id FROM bi_widgets w JOIN bi_dashboards d ON w.dashboard_id=d.id
    WHERE w.id=? AND d.user_id=?`).get(req.params.id, req.user.id);
  if (!w) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM bi_widgets WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Bulk-save widget positions/sizes after drag/resize.
router.patch('/dashboards/:id/widgets/layout', authenticate, (req, res) => {
  const d = ownDashboardForEdit(req.params.id, req.user.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  const updates = Array.isArray(req.body.layouts) ? req.body.layouts : [];
  const stmt = db.prepare('UPDATE bi_widgets SET layout=?, position=? WHERE id=? AND dashboard_id=?');
  updates.forEach((u, i) => stmt.run(JSON.stringify(u.layout || {}), u.position ?? i, u.id, req.params.id));
  db.prepare('UPDATE bi_dashboards SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
// Query engine endpoint — powers every data widget
// body: { source:{type,id}, config:{computed,filters,groupBy,aggregations,sort,limit},
//         scalars?:{}, metrics?:[ids], kpi?:{field,fn,compareToPrevious} }
// ════════════════════════════════════════════════════════════════════════════
router.post('/query', authenticate, (req, res) => {
  const { source, config = {}, metrics, kpi } = req.body;
  if (!source || !source.type) return res.status(400).json({ error: 'source required' });

  const resolved = resolveSource(req.user.id, source.type, source.id);
  if (!resolved) return res.status(404).json({ error: 'Source not found' });

  // Build scalar scope: named metrics + any caller-supplied scalars.
  const scalars = { ...(config.scalars || {}) };
  if (Array.isArray(metrics) && metrics.length) {
    const rows = db.prepare(`SELECT name, expression FROM bi_metrics WHERE user_id=? AND id IN (${metrics.map(() => '?').join(',')})`)
      .all(req.user.id, ...metrics);
    for (const m of rows) scalars[m.name] = engine.evalScalar(m.expression, scalars);
  }

  try {
    // KPI: single aggregated value, optionally compared to the previous sync snapshot.
    if (kpi && kpi.field) {
      const agg = engine.runQuery(resolved.rows, {
        computed: config.computed, filters: config.filters, scalars,
        aggregations: [{ name: 'value', fn: kpi.fn || 'sum', field: kpi.field }],
      });
      const value = agg[0]?.value ?? 0;
      let previous = null, delta = null;
      if (kpi.compareToPrevious && source.type === 'datasource') {
        const hist = db.prepare('SELECT metrics FROM bi_sync_history WHERE datasource_id=? ORDER BY synced_at DESC LIMIT 2')
          .all(source.id).map((h) => J(h.metrics, {}));
        if (hist[1] && hist[1][kpi.field] !== undefined) {
          previous = hist[1][kpi.field];
          delta = previous ? ((value - previous) / Math.abs(previous)) * 100 : null;
        }
      }
      return res.json({ kpi: true, value, previous, delta });
    }

    const result = engine.runQuery(resolved.rows, { ...config, scalars });
    res.json({ rows: result, columns: resolved.columns, scalars });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
module.exports.startScheduler = biSync.startScheduler;
