const { Database: WasmDatabase } = require('node-sqlite3-wasm');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/monday.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

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
