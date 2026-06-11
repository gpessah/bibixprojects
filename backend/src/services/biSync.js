// ─────────────────────────────────────────────────────────────────────────────
// BI sync service
//
// Pulls rows from connected Google Sheets into bi_datasource_rows (snapshot,
// replaced each sync) and appends a row to bi_sync_history (counts + per-numeric
// aggregates) so widgets can chart trends over time.
//
// Two entry points:
//   • syncDatasource(id)  — refresh one datasource now (used by manual "Refresh")
//   • startScheduler()    — setInterval loop that refreshes datasources whose
//                           refresh_interval has elapsed (the scheduled half of
//                           the hybrid sync model)
// ─────────────────────────────────────────────────────────────────────────────
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const db = require('../db/database');
const { toNumber } = require('./biEngine');

const GSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

// Parse a CSV/Excel/TSV/ODS file buffer (via the xlsx lib, which reads them all)
// into the same { headers, rows, columns } shape as Google Sheets values.
function parseWorkbook(buf, sheetName) {
  const wb = XLSX.read(buf, { type: 'buffer', raw: true, cellDates: true });
  const pick = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const ws = pick ? wb.Sheets[pick] : null;
  const values = ws ? XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false }) : [];
  // Date cells come back as Date objects → normalise to YYYY-MM-DD strings.
  const norm = values.map((row) => (Array.isArray(row) ? row.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c)) : row));
  const parsed = parseValues(norm);
  parsed.sheetName = pick || null;
  parsed.sheetNames = wb.SheetNames || [];
  return parsed;
}

// List sheet/tab names inside an Excel workbook buffer (CSV → single sheet).
function workbookSheetNames(buf) {
  try { return XLSX.read(buf, { type: 'buffer', bookSheets: true }).SheetNames || []; }
  catch { return []; }
}

// BI needs its OWN redirect URI (distinct from the Calendar integration's
// GOOGLE_REDIRECT_URI), since the OAuth callback path differs. Callers pass the
// BI callback URL for the auth/token-exchange steps; refresh calls don't care.
function makeOAuth2Client(redirectUri) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || process.env.GOOGLE_BI_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI
  );
}

// Build an authed client for a bi_connections row; persist refreshed tokens.
function getGoogleClient(conn) {
  const auth = makeOAuth2Client();
  auth.setCredentials({
    access_token:  conn.access_token,
    refresh_token: conn.refresh_token,
    expiry_date:   conn.expires_at ? new Date(conn.expires_at).getTime() : null,
  });
  auth.on('tokens', (tokens) => {
    try {
      db.prepare('UPDATE bi_connections SET access_token=?, expires_at=? WHERE id=?')
        .run(
          tokens.access_token,
          tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : conn.expires_at,
          conn.id
        );
    } catch (e) { /* ignore */ }
  });
  return auth;
}

// Turn a 2-D values array (first row = headers) into row objects + column meta.
function parseValues(values) {
  if (!values || !values.length) return { headers: [], rows: [], columns: [] };

  const rawHeaders = values[0] || [];
  const seen = {};
  const headers = rawHeaders.map((h, i) => {
    let name = String(h ?? '').trim() || `Column_${i + 1}`;
    if (seen[name] !== undefined) { seen[name]++; name = `${name}_${seen[name]}`; }
    else seen[name] = 0;
    return name;
  });

  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const arr = values[r] || [];
    // skip fully empty rows
    if (!arr.some((c) => c !== '' && c !== null && c !== undefined)) continue;
    const obj = {};
    headers.forEach((h, i) => { obj[h] = arr[i] !== undefined ? arr[i] : ''; });
    rows.push(obj);
  }

  // infer column types by sampling
  const columns = headers.map((h) => {
    let num = 0, total = 0, looksDate = 0;
    for (const row of rows.slice(0, 50)) {
      const v = row[h];
      if (v === '' || v === null || v === undefined) continue;
      total++;
      if (toNumber(v) !== null) num++;
      if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) looksDate++;
    }
    let type = 'text';
    if (total > 0 && looksDate / total > 0.7) type = 'date';
    else if (total > 0 && num / total > 0.7) type = 'number';
    return { name: h, type };
  });

  return { headers, rows, columns };
}

// Resolve the A1 range string for the Sheets API.
function resolveRange(ds) {
  const tab = ds.sheet_name ? `'${ds.sheet_name}'` : null;
  if (tab && ds.cell_range) return `${tab}!${ds.cell_range}`;
  if (tab) return tab;
  if (ds.cell_range) return ds.cell_range;
  return undefined; // whole first sheet
}

async function fetchRows(ds, conn) {
  const auth = getGoogleClient(conn);
  const mime = ds.mime_type || '';
  const isGoogleSheet = mime === GSHEET_MIME || (!mime && ds.kind !== 'gfile');

  if (isGoogleSheet) {
    const sheets = google.sheets({ version: 'v4', auth });
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: ds.spreadsheet_id,
      range: resolveRange(ds),
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    return parseValues(resp.data.values);
  }

  // CSV / Excel / TSV stored in Drive → download the raw bytes and parse locally.
  const drive = google.drive({ version: 'v3', auth });
  const resp = await drive.files.get(
    { fileId: ds.spreadsheet_id, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  return parseWorkbook(Buffer.from(resp.data), ds.sheet_name);
}

// Compute per-numeric-column sums for the history snapshot (cheap trend metrics).
function snapshotMetrics(columns, rows) {
  const metrics = { _rowCount: rows.length };
  for (const col of columns) {
    if (col.type !== 'number') continue;
    let sum = 0;
    for (const row of rows) { const n = toNumber(row[col.name]); if (n !== null) sum += n; }
    metrics[col.name] = sum;
  }
  return metrics;
}

// Refresh a single datasource. Returns { rowCount } or throws.
async function syncDatasource(datasourceId) {
  const ds = db.prepare('SELECT * FROM bi_datasources WHERE id=?').get(datasourceId);
  if (!ds) throw new Error('Datasource not found');
  const conn = db.prepare('SELECT * FROM bi_connections WHERE id=?').get(ds.connection_id);
  if (!conn) throw new Error('Connection not found');

  const { rows, columns } = await fetchRows(ds, conn);
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM bi_datasource_rows WHERE datasource_id=?').run(datasourceId);
    const ins = db.prepare('INSERT INTO bi_datasource_rows (id, datasource_id, row_index, data) VALUES (?,?,?,?)');
    rows.forEach((row, i) => ins.run(uuidv4(), datasourceId, i, JSON.stringify(row)));
    db.prepare('UPDATE bi_datasources SET last_synced_at=?, column_meta=?, last_error=NULL, row_count=? WHERE id=?')
      .run(now, JSON.stringify(columns), rows.length, datasourceId);
    db.prepare('INSERT INTO bi_sync_history (id, datasource_id, synced_at, row_count, metrics) VALUES (?,?,?,?,?)')
      .run(uuidv4(), datasourceId, now, rows.length, JSON.stringify(snapshotMetrics(columns, rows)));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  // keep history bounded (last 500 snapshots per datasource)
  try {
    db.prepare(`DELETE FROM bi_sync_history WHERE datasource_id=? AND id NOT IN (
      SELECT id FROM bi_sync_history WHERE datasource_id=? ORDER BY synced_at DESC LIMIT 500)`)
      .run(datasourceId, datasourceId);
  } catch (e) { /* ignore */ }

  return { rowCount: rows.length, columns };
}

async function syncDatasourceSafe(datasourceId) {
  try {
    return await syncDatasource(datasourceId);
  } catch (e) {
    console.error(`[BI] sync failed (${datasourceId}):`, e.message);
    try {
      db.prepare('UPDATE bi_datasources SET last_error=?, last_synced_at=? WHERE id=?')
        .run(e.message.slice(0, 300), new Date().toISOString(), datasourceId);
    } catch (_) {}
    return { error: e.message };
  }
}

// ── Scheduler ───────────────────────────────────────────────────────────────
let timer = null;
function startScheduler(intervalMs = 60 * 1000) {
  if (timer) return;
  const tick = async () => {
    let due = [];
    try {
      const all = db.prepare(`
        SELECT id, last_synced_at, refresh_interval_minutes
        FROM bi_datasources WHERE auto_sync = 1 AND refresh_interval_minutes > 0
      `).all();
      const now = Date.now();
      due = all.filter((d) => {
        if (!d.last_synced_at) return true;
        const next = new Date(d.last_synced_at).getTime() + d.refresh_interval_minutes * 60 * 1000;
        return now >= next;
      });
    } catch (e) { return; }
    for (const d of due) {
      // sequential to avoid hammering Google rate limits
      await syncDatasourceSafe(d.id);
    }
  };
  timer = setInterval(() => { tick().catch(() => {}); }, intervalMs);
  if (timer.unref) timer.unref();
  console.log('[BI] sync scheduler started');
}

module.exports = {
  makeOAuth2Client,
  getGoogleClient,
  syncDatasource,
  syncDatasourceSafe,
  parseValues,
  parseWorkbook,
  workbookSheetNames,
  startScheduler,
  GSHEET_MIME,
};
