#!/usr/bin/env bash
# One-shot, run on the NameHero server as the app user:
#   1. print server/runtime/deploy state,
#   2. profile the production /instagram/stats queries on a COPY of the DB,
#   3. apply the safe immediate fix (index + ANALYZE) to prod and staging,
#   4. restart the workers and time the endpoints,
#   5. test whether better-sqlite3 (native driver) installs on this host.
# Usage: bash backend/scripts/fix-stats-now.sh
set -u
PROD=$HOME/bibixprojects
STG=$HOME/bibixprojects-staging
ADMIN_UID=fdf8ad75-9f96-4950-971c-41a2c6b7522a
HERE=$(cd "$(dirname "$0")" && pwd)
hr() { printf '\n=== %s ===\n' "$*"; }

hr "server / runtime"
hostname -f 2>/dev/null
echo "SSH_CONNECTION=${SSH_CONNECTION:-<none>}"
(netstat -tln 2>/dev/null || ss -tln 2>/dev/null) | awk '{print $4}' | grep -E ':(22|2200|2222|22022|21098)$' | sort -u
node -v; npm -v
cat /etc/redhat-release 2>/dev/null
ldd --version 2>/dev/null | head -1
sqlite3 --version | cut -c1-30
for t in gcc g++ make python3; do printf '%s: ' "$t"; command -v "$t" || echo missing; done

hr "deployed commits"
for d in "$PROD" "$STG"; do
  echo "-- $d"
  git -C "$d" log -1 --format='%h %ci %s'
  echo "branch: $(git -C "$d" branch --show-current)"
  git -C "$d" status --short | head -3
done

hr "lsnode workers (before)"
ps -eo pid,etime,pcpu,rss,args | grep '[l]snode:'

hr "DB state"
for d in "$PROD" "$STG"; do
  DB=$d/backend/data/monday.db
  echo "-- $DB"
  sqlite3 "$DB" "PRAGMA journal_mode; PRAGMA integrity_check;" | head -3
  ls -la "$DB-wal" "$DB-shm" "$DB.lock" 2>/dev/null
  sqlite3 "$DB" "SELECT 'actions', COUNT(*), MAX(created_at) FROM instagram_actions;"
  sqlite3 "$DB" "SELECT 'stat1 rows', COUNT(*) FROM sqlite_stat1;" 2>&1 | head -1
  echo "username indexes: $(sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='instagram_actions' AND name LIKE '%username%';" | tr '\n' ' ')"
  sqlite3 "$DB" "SELECT 'created_at formats', length(created_at), substr(created_at,11,1), COUNT(*) FROM instagram_actions GROUP BY 2,3;"
done

hr "profile prod queries on a COPY (live DB untouched)"
cp "$PROD/backend/data/monday.db" /tmp/bibix_prof.db
node "$HERE/profile-stats.js" /tmp/bibix_prof.db "$PROD/backend/node_modules/node-sqlite3-wasm" "$ADMIN_UID" 30 2>&1 \
  | grep -v 'growth \|inbound got_\|inbound new_' | tail -60
rm -f /tmp/bibix_prof.db; rmdir /tmp/bibix_prof.db.lock 2>/dev/null

hr "APPLY FIX: index + ANALYZE (workers stopped for a few seconds)"
for d in "$PROD" "$STG"; do
  DB=$d/backend/data/monday.db
  echo "-- $d"
  pkill -9 -f "lsnode:$d/backend" 2>/dev/null; sleep 2
  if pgrep -f "lsnode:$d/backend" >/dev/null; then echo "!! worker still alive, skipping $d"; continue; fi
  mkdir -p "$d/backend/data/backups"
  cp "$DB" "$d/backend/data/backups/monday.db.prefix.$(date +%Y%m%d_%H%M%S)"
  rm -rf "$DB.lock"
  sqlite3 "$DB" "CREATE INDEX IF NOT EXISTS idx_ig_actions_user_username_created ON instagram_actions(user_id, username, created_at); ANALYZE; PRAGMA integrity_check;"
  echo "indexes now: $(sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='instagram_actions';" | tr '\n' ' ')"
done

hr "restart + timings"
for u in https://bibix.ailabstech.com https://staging.bibix.ailabstech.com; do
  curl -s -o /dev/null -w "$u/api/health  ->  HTTP %{http_code} in %{time_total}s\n" --max-time 60 "$u/api/health"
done
TOKEN=$(sqlite3 "$PROD/backend/data/monday.db" "SELECT instagram_api_token FROM users WHERE id='$ADMIN_UID'")
curl -s -o /tmp/stats.json -w "prod /stats (admin, 30d)   ->  HTTP %{http_code} in %{time_total}s, %{size_download} bytes\n" --max-time 120 \
  -H "Authorization: Bearer $TOKEN" "https://bibix.ailabstech.com/api/instagram/stats?days=30&bust=$(date +%s)"
head -c 200 /tmp/stats.json; echo
curl -s -o /dev/null -w "prod /actions?limit=2000    ->  HTTP %{http_code} in %{time_total}s\n" --max-time 120 \
  -H "Authorization: Bearer $TOKEN" "https://bibix.ailabstech.com/api/instagram/actions?limit=2000"
rm -f /tmp/stats.json
hr "lsnode workers (after)"
ps -eo pid,etime,pcpu,rss,args | grep '[l]snode:'

hr "better-sqlite3 install test (scratch dir, does not touch the apps)"
NV=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "$NV" -ge 22 ]; then BSV=latest; elif [ "$NV" -ge 18 ]; then BSV=11; else BSV=9; fi
echo "node major $NV -> better-sqlite3@$BSV"
rm -rf "$HOME/bs3test" && mkdir -p "$HOME/bs3test" && cd "$HOME/bs3test" \
  && npm init -y >/dev/null 2>&1 \
  && (timeout 300 npm install "better-sqlite3@$BSV" 2>&1 | tail -5)
node -e "const D=require('better-sqlite3');const d=new D(':memory:');console.log('BETTER_SQLITE3_OK',JSON.stringify(d.prepare('select sqlite_version() v').get()))" 2>&1 | tail -3
cd "$HOME"
hr "done"
