const { Database: WasmDatabase } = require('node-sqlite3-wasm');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/monday.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// ── Startup backup — copy DB before opening so restarts never destroy data ───
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
try {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, `monday.db.${stamp}`));
    // Keep only the 10 most recent startup backups
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('monday.db.'))
      .sort()
      .reverse();
    files.slice(10).forEach(f => { try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {} });
  }
} catch (e) { console.warn('[DB] Backup warning:', e.message); }

// node-sqlite3-wasm creates a lock directory; clean it up on startup
// so crashed/killed processes don't leave a stale lock
const LOCK_PATH = DB_PATH + '.lock';
try { fs.rmSync(LOCK_PATH, { recursive: true, force: true }); } catch {}

const rawDb = new WasmDatabase(DB_PATH);
rawDb.exec('PRAGMA foreign_keys = ON');
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
rawDb.exec(schema);

// Migrations — add update_id to attachments
try { rawDb.exec("ALTER TABLE attachments ADD COLUMN update_id TEXT"); } catch {}

// Clean up orphaned item_values from deleted columns
rawDb.exec('DELETE FROM item_values WHERE column_id NOT IN (SELECT id FROM board_columns)');

// Migrations — safe to run repeatedly
const migrations = [
  "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'",
  "ALTER TABLE workspace_members ADD COLUMN access TEXT NOT NULL DEFAULT 'edit'",
  "ALTER TABLE items ADD COLUMN parent_item_id TEXT",
  "ALTER TABLE board_columns ADD COLUMN width INTEGER NOT NULL DEFAULT 140",
  "ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '{}'",
  // super_admin role: no schema change needed — role column already TEXT
  // This migration is a no-op placeholder to document the new valid value
];
for (const m of migrations) {
  try { rawDb.exec(m); } catch { /* column already exists */ }
}

// Compatibility shim: node-sqlite3-wasm requires array params,
// but our routes use better-sqlite3's spread-arg style.
function wrapStmt(stmt) {
  const toArray = (args) => {
    if (args.length === 0) return [];
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    return args;
  };
  return {
    run: (...args) => stmt.run(toArray(args)),
    get: (...args) => stmt.get(toArray(args)),
    all: (...args) => stmt.all(toArray(args)),
  };
}

const db = {
  prepare: (sql) => wrapStmt(rawDb.prepare(sql)),
  exec: (sql) => rawDb.exec(sql),
  pragma: (s) => rawDb.exec(`PRAGMA ${s}`),
};

module.exports = db;
