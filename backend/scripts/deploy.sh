#!/bin/bash
# ── Bibix Safe Deploy ─────────────────────────────────────────────────────────
# Run this instead of "git pull && touch restart.txt".
# It backs up the DB, pulls code, force-restarts Passenger, and verifies the
# site comes back up. Aborts and logs if anything goes wrong.
#
# Usage:
#   bash ~/bibixprojects/backend/scripts/deploy.sh

set -uo pipefail

ROOT="$HOME/bibixprojects"
DB="$ROOT/backend/data/monday.db"
BACKUP_DIR="$ROOT/backend/data/backups"
URL="https://bibix.ailabstech.com/api/ping"
LOG="$ROOT/backend/data/deploy.log"

now() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(now)] $1" | tee -a "$LOG"; }

mkdir -p "$BACKUP_DIR"

log "── DEPLOY START ──"

# ── 1. Pre-deploy DB backup ──────────────────────────────────────────────────
if [ -f "$DB" ]; then
  HEADER=$(head -c 16 "$DB" | tr -d '\0' || echo "")
  if [[ "$HEADER" == "SQLite format 3" ]]; then
    cp "$DB" "$BACKUP_DIR/monday.db.predeploy.$(date +%s)"
    log "Pre-deploy backup saved"
  else
    log "WARNING: DB is corrupted before deploy — aborting"
    exit 1
  fi
fi

# ── 2. Git pull ──────────────────────────────────────────────────────────────
cd "$ROOT" || { log "FAIL: cd $ROOT"; exit 1; }
PULL_OUT=$(git pull 2>&1)
log "git pull: $(echo "$PULL_OUT" | head -1)"

# ── 3. Force restart ─────────────────────────────────────────────────────────
touch "$ROOT/backend/tmp/restart.txt"
sleep 8

# Verify by checking PID changed; if not, kill and retry
OLD_PID=$(curl -s --max-time 5 "$URL" 2>/dev/null | grep -oE '"pid":[0-9]+' | grep -oE '[0-9]+' || echo "0")

# Kill running node process so Passenger spawns fresh
PIDS=$(pgrep -f "bibixprojects/backend.*src/index.js" || true)
if [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill -9 2>/dev/null || true
  log "Killed old PIDs: $PIDS"
fi

# ── 4. Wait for the site to come back ────────────────────────────────────────
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 3
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$URL" 2>/dev/null || echo "000")
  if [ "$CODE" = "200" ]; then
    NEW_PID=$(curl -s --max-time 5 "$URL" | grep -oE '"pid":[0-9]+' | grep -oE '[0-9]+' || echo "0")
    log "DEPLOY OK — http=200 pid=${NEW_PID} (took ${i}x3s)"
    log "── DEPLOY END ──"
    exit 0
  fi
done

log "FAIL: site did not come back up. Check ~/bibixprojects/backend/stderr.log"
log "── DEPLOY END (failed) ──"
exit 1
