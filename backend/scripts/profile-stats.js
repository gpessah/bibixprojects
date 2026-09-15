#!/usr/bin/env node
// Bibix /stats profiler. Runs the production dashboard queries against a COPY
// of monday.db and times each one, then times candidate rewrites.
// usage: node bibix_profile.js <db-copy> <node-sqlite3-wasm dir> <user_id> [days]
const path = require('path');
const [, , dbPath, wasmPath, uid, daysArg] = process.argv;
if (!dbPath || !wasmPath || !uid) {
  console.error('usage: node bibix_profile.js <db-copy> <node-sqlite3-wasm dir> <user_id> [days]');
  process.exit(1);
}
const { Database } = require(path.resolve(wasmPath));
const days = parseInt(daysArg, 10) || 30;
const db = new Database(dbPath);

const INBOUND_TYPE_ALIASES = {
  new_follower:     ['new_follower'],
  got_like_post:    ['received_like_post', 'got_like_post'],
  got_like_reel:    ['received_like_reel', 'got_like_reel'],
  got_like_comment: ['received_like_comment', 'got_like_comment'],
  got_comment:      ['received_comment', 'got_comment'],
  got_reply:        ['received_reply', 'got_reply'],
  got_mention:      ['received_mention', 'got_mention'],
};
const ALL_INBOUND_TYPES = Object.values(INBOUND_TYPE_ALIASES).flat();
const ph = (arr) => arr.map(() => '?').join(',');
const all = (sql, p = []) => db.all(sql, p);
const get = (sql, p = []) => db.get(sql, p);

const results = [];
function time(label, fn) {
  const s = process.hrtime.bigint();
  let out, err;
  try { out = fn(); } catch (e) { err = e; }
  const ms = Number(process.hrtime.bigint() - s) / 1e6;
  const n = Array.isArray(out) ? out.length : (out == null ? 0 : 1);
  results.push({ label, ms });
  console.log(`${ms.toFixed(1).padStart(9)} ms ${String(n).padStart(5)} rows  ${label}${err ? '   ERROR: ' + err.message : ''}`);
  return out;
}

console.log('sqlite', get('SELECT sqlite_version() v').v, '| days', days, '| uid', uid);
console.log('rows for uid      :', get('SELECT COUNT(*) n FROM instagram_actions WHERE user_id = ?', [uid]).n);
console.log('rows in window    :', get(`SELECT COUNT(*) n FROM instagram_actions WHERE user_id = ? AND datetime(created_at) >= datetime('now', '-${days} days')`, [uid]).n);
console.log('distinct usernames:', get('SELECT COUNT(DISTINCT username) n FROM instagram_actions WHERE user_id = ?', [uid]).n);
console.log('created_at formats:', JSON.stringify(all('SELECT length(created_at) len, substr(created_at,11,1) sep, COUNT(*) n FROM instagram_actions GROUP BY 1,2')));
console.log('types (uid)       :', JSON.stringify(all('SELECT type, COUNT(*) n FROM instagram_actions WHERE user_id = ? GROUP BY type ORDER BY n DESC', [uid])));
console.log('sqlite_stat1 rows :', (() => { try { return get('SELECT COUNT(*) n FROM sqlite_stat1').n; } catch { return 'none'; } })());
console.log('indexes           :', all("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='instagram_actions'").map(r => r.name).join(', '));
console.log('');

function prodSet(tag) {
  const t0 = process.hrtime.bigint();
  const baseWhere = `user_id = ? AND datetime(created_at) >= datetime('now', '-${days} days')`;
  const bp = [uid];
  time(`${tag} total`, () => get(`SELECT COUNT(*) n FROM instagram_actions WHERE ${baseWhere}`, bp));
  time(`${tag} byType`, () => all(`SELECT type, COUNT(*) n FROM instagram_actions WHERE ${baseWhere} GROUP BY type`, bp));
  time(`${tag} newFollowers`, () => get(`SELECT COUNT(*) n FROM instagram_actions WHERE ${baseWhere} AND type = 'new_follower'`, bp));
  time(`${tag} daily`, () => all(`SELECT date(created_at) day, type, COUNT(*) n FROM instagram_actions WHERE ${baseWhere} GROUP BY day, type ORDER BY day ASC`, bp));
  time(`${tag} topUsers`, () => all(`SELECT username, COUNT(*) n FROM instagram_actions WHERE ${baseWhere} AND username IS NOT NULL GROUP BY username ORDER BY n DESC LIMIT 10`, bp));
  for (const [canon, aliases] of Object.entries(INBOUND_TYPE_ALIASES)) {
    time(`${tag} inbound ${canon}`, () => get(`SELECT COUNT(*) n FROM instagram_actions WHERE ${baseWhere} AND type IN (${ph(aliases)})`, [...bp, ...aliases]));
  }
  for (const sent of ['follow', 'like', 'comment', 'comment_reply']) {
    time(`${tag} funnel.sent ${sent}`, () => get(`SELECT COUNT(DISTINCT username) n FROM instagram_actions WHERE ${baseWhere} AND type = ? AND username IS NOT NULL`, [...bp, sent]));
    time(`${tag} funnel.returned ${sent} (EXISTS, unbounded)`, () => get(`
      SELECT COUNT(DISTINCT a.username) n FROM instagram_actions a
      WHERE a.user_id = ? AND a.type = ? AND a.username IS NOT NULL
        AND EXISTS (SELECT 1 FROM instagram_actions b
                    WHERE b.user_id = a.user_id AND b.username = a.username
                      AND b.type IN (${ph(ALL_INBOUND_TYPES)}) AND b.created_at >= a.created_at)`,
      [uid, sent, ...ALL_INBOUND_TYPES]));
  }
  const periodStart = `datetime('now', '-${days} days')`;
  const profiles = (time(`${tag} follower profiles`, () => all('SELECT DISTINCT my_profile FROM instagram_follower_counts WHERE user_id = ?', [uid])) || [])
    .map(r => r.my_profile).filter(Boolean);
  for (const p of profiles) {
    time(`${tag} growth cur ${p}`, () => get(`SELECT follower_count FROM instagram_follower_counts WHERE user_id = ? AND my_profile = ? AND datetime(captured_at) >= ${periodStart} ORDER BY captured_at DESC LIMIT 1`, [uid, p]));
    time(`${tag} growth prev ${p}`, () => get(`SELECT follower_count FROM instagram_follower_counts WHERE user_id = ? AND my_profile = ? AND datetime(captured_at) < ${periodStart} ORDER BY captured_at DESC LIMIT 1`, [uid, p]));
    time(`${tag} growth series ${p}`, () => all(`SELECT date(captured_at) day, follower_count FROM instagram_follower_counts WHERE user_id = ? AND my_profile = ? AND datetime(captured_at) >= ${periodStart} ORDER BY captured_at ASC`, [uid, p]));
  }
  time(`${tag} attribution (correlated LEFT JOIN, LIMIT 500)`, () => all(`
    SELECT nf.username follower, nf.type inbound_type, nf.created_at followed_at, a.type attributed_type, a.created_at attributed_at
    FROM instagram_actions nf
    LEFT JOIN instagram_actions a ON a.id = (
      SELECT inner_a.id FROM instagram_actions inner_a
      WHERE inner_a.user_id = nf.user_id AND inner_a.username = nf.username
        AND (inner_a.my_profile = nf.my_profile OR inner_a.my_profile IS NULL OR nf.my_profile IS NULL)
        AND inner_a.type IN ('like','comment','comment_reply','reply','follow')
        AND datetime(inner_a.created_at) <= datetime(nf.created_at)
      ORDER BY inner_a.created_at DESC LIMIT 1)
    WHERE nf.user_id = ? AND (nf.type = 'new_follower' OR nf.type LIKE 'received_%')
      AND datetime(nf.created_at) >= datetime('now', '-${days} days')
    ORDER BY nf.created_at DESC LIMIT 500`, [uid]));
  const queue = time(`${tag} queue items`, () => all(`
    SELECT q.id, q.campaign_id, q.post_url, q.action_type, q.as_account, q.count_requested, q.count_done, q.status,
           COALESCE(q.completed_at, q.claimed_at, q.started_at) action_date, q.claimed_at
    FROM instagram_action_queue q
    WHERE q.user_id = ? AND (q.completed_at IS NOT NULL OR q.count_done > 0)
      AND datetime(COALESCE(q.completed_at, q.claimed_at, q.started_at)) >= datetime('now', '-${days} days')
    ORDER BY action_date DESC LIMIT 100`, [uid])) || [];
  const s = process.hrtime.bigint();
  for (const q of queue) {
    const targets = all(`SELECT DISTINCT username FROM instagram_actions WHERE user_id = ? AND campaign_id IS NOT NULL AND campaign_id = ? AND post_url = ? AND type = ? AND username IS NOT NULL`,
      [uid, q.campaign_id, q.post_url, q.action_type]).map(r => r.username).slice(0, 900);
    if (targets.length) {
      all(`SELECT username, created_at FROM instagram_actions WHERE user_id = ? AND type = 'new_follower' AND username IN (${ph(targets)}) AND datetime(created_at) > datetime(?)`,
        [uid, ...targets, q.claimed_at || q.action_date]);
    }
  }
  const perfMs = Number(process.hrtime.bigint() - s) / 1e6;
  results.push({ label: `${tag} campaign perf loop (${queue.length} items)`, ms: perfMs });
  console.log(`${perfMs.toFixed(1).padStart(9)} ms       rows  ${tag} campaign perf loop (${queue.length} items)`);
  const total = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`\n==> ${tag} TOTAL: ${(total / 1000).toFixed(2)} s\n`);
  return total;
}

function candidates(tag) {
  const t0 = process.hrtime.bigint();
  // UTC 'YYYY-MM-DD HH:MM:SS' — same text format the app writes, so a plain
  // string comparison is index-friendly and equivalent to datetime() compare.
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const bw = 'user_id = ? AND created_at >= ?';
  const bp = [uid, since];
  time(`${tag} total (created_at >= ?)`, () => get(`SELECT COUNT(*) n FROM instagram_actions WHERE ${bw}`, bp));
  time(`${tag} daily+byType one pass`, () => all(`SELECT date(created_at) day, type, COUNT(*) n FROM instagram_actions WHERE ${bw} GROUP BY day, type`, bp));
  time(`${tag} topUsers`, () => all(`SELECT username, COUNT(*) n FROM instagram_actions WHERE ${bw} AND username IS NOT NULL GROUP BY username ORDER BY n DESC LIMIT 10`, bp));
  time(`${tag} inbound counts one pass`, () => all(`SELECT type, COUNT(*) n FROM instagram_actions WHERE ${bw} AND type IN (${ph(ALL_INBOUND_TYPES)}) GROUP BY type`, [...bp, ...ALL_INBOUND_TYPES]));
  for (const sent of ['follow', 'like', 'comment', 'comment_reply']) {
    time(`${tag} funnel.returned ${sent} (EXISTS, window-bounded)`, () => get(`
      SELECT COUNT(DISTINCT a.username) n FROM instagram_actions a
      WHERE a.user_id = ? AND a.type = ? AND a.username IS NOT NULL AND a.created_at >= ?
        AND EXISTS (SELECT 1 FROM instagram_actions b
                    WHERE b.user_id = a.user_id AND b.username = a.username
                      AND b.type IN (${ph(ALL_INBOUND_TYPES)}) AND b.created_at >= a.created_at)`,
      [uid, sent, since, ...ALL_INBOUND_TYPES]));
  }
  time(`${tag} funnel all-4 one query (window-bounded)`, () => all(`
    SELECT a.type, COUNT(DISTINCT a.username) sent,
           COUNT(DISTINCT CASE WHEN EXISTS (
             SELECT 1 FROM instagram_actions b
             WHERE b.user_id = a.user_id AND b.username = a.username
               AND b.type IN (${ph(ALL_INBOUND_TYPES)}) AND b.created_at >= a.created_at
           ) THEN a.username END) returned
    FROM instagram_actions a
    WHERE a.user_id = ? AND a.created_at >= ? AND a.username IS NOT NULL
      AND a.type IN ('follow','like','comment','comment_reply')
    GROUP BY a.type`, [...ALL_INBOUND_TYPES, uid, since]));
  time(`${tag} attribution (plain created_at compare)`, () => all(`
    SELECT nf.username follower, nf.type inbound_type, nf.created_at followed_at, a.type attributed_type, a.created_at attributed_at
    FROM instagram_actions nf
    LEFT JOIN instagram_actions a ON a.id = (
      SELECT inner_a.id FROM instagram_actions inner_a
      WHERE inner_a.user_id = nf.user_id AND inner_a.username = nf.username
        AND (inner_a.my_profile = nf.my_profile OR inner_a.my_profile IS NULL OR nf.my_profile IS NULL)
        AND inner_a.type IN ('like','comment','comment_reply','reply','follow')
        AND inner_a.created_at <= nf.created_at
      ORDER BY inner_a.created_at DESC LIMIT 1)
    WHERE nf.user_id = ? AND (nf.type = 'new_follower' OR nf.type LIKE 'received_%') AND nf.created_at >= ?
    ORDER BY nf.created_at DESC LIMIT 500`, [uid, since]));
  const total = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`\n==> ${tag} TOTAL: ${(total / 1000).toFixed(2)} s\n`);
  return total;
}

function plan(label, sql, params) {
  console.log(`--- plan: ${label} ---`);
  try { console.log(all('EXPLAIN QUERY PLAN ' + sql, params).map(r => '  ' + r.detail).join('\n')); }
  catch (e) { console.log('  plan error:', e.message); }
}

const funnelSql = `
  SELECT COUNT(DISTINCT a.username) n FROM instagram_actions a
  WHERE a.user_id = ? AND a.type = ? AND a.username IS NOT NULL
    AND EXISTS (SELECT 1 FROM instagram_actions b WHERE b.user_id = a.user_id AND b.username = a.username
                AND b.type IN (${ph(ALL_INBOUND_TYPES)}) AND b.created_at >= a.created_at)`;

// The deployed funnel queries are the suspected multi-minute offenders, so the
// "before" baseline only runs the smallest one (comment) + shows the plan.
console.log('=== BEFORE (deployed prod query, smallest funnel only — may take a while) ===');
plan('funnel.returned comment (unbounded) — BEFORE', funnelSql, [uid, 'comment', ...ALL_INBOUND_TYPES]);
time('BASELINE funnel.returned comment (EXISTS, unbounded, existing indexes)', () => get(funnelSql, [uid, 'comment', ...ALL_INBOUND_TYPES]));
const beforeMs = results[results.length - 1].ms;
console.log('');

console.log('=== adding index (user_id, username, created_at) on the COPY ===');
time('CREATE INDEX idx_tmp_uuc', () => db.exec('CREATE INDEX IF NOT EXISTS idx_ig_actions_user_username_type ON instagram_actions(user_id, username, type, created_at)'));
plan('funnel.returned comment (unbounded) — AFTER index', funnelSql, [uid, 'comment', ...ALL_INBOUND_TYPES]);
time('AFTER-INDEX funnel.returned comment (EXISTS, unbounded)', () => get(funnelSql, [uid, 'comment', ...ALL_INBOUND_TYPES]));
console.log('');
const prodIdx = prodSet('PROD +idx');
const candB = candidates('CAND +idx');
console.log('=== ANALYZE on the COPY ===');
time('ANALYZE', () => db.exec('ANALYZE'));
const prodAfter = prodSet('PROD +idx+ANALYZE');
const candC = candidates('CAND +idx+ANALYZE');

console.log('=== SUMMARY ===');
console.log(`deployed funnel(comment) BEFORE index     : ${(beforeMs / 1000).toFixed(2)} s   (like/follow variants are far larger)`);
console.log(`deployed /stats queries + new index       : ${(prodIdx / 1000).toFixed(2)} s`);
console.log(`deployed /stats queries + index + ANALYZE : ${(prodAfter / 1000).toFixed(2)} s`);
console.log(`rewritten queries + new index             : ${(candB / 1000).toFixed(2)} s`);
console.log(`rewritten queries + index + ANALYZE       : ${(candC / 1000).toFixed(2)} s`);
console.log('\n=== TOP 12 SLOWEST ===');
results.sort((a, b) => b.ms - a.ms).slice(0, 12).forEach(r => console.log(`${r.ms.toFixed(0).padStart(7)} ms  ${r.label}`));
db.close();
