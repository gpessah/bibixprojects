#!/bin/bash
# ── Bibix Staging Deploy ──────────────────────────────────────────────────────
# Usage: bash ~/bibixprojects-staging/backend/scripts/staging-deploy.sh

set -uo pipefail

ROOT="$HOME/bibixprojects-staging"
URL="https://staging.bibix.ailabstech.com/api/ping"
LOG="$ROOT/backend/data/deploy.log"

now() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(now)] $1" | tee -a "$LOG"; }

mkdir -p "$(dirname "$LOG")"

log "── STAGING DEPLOY START ──"

cd "$ROOT" || { log "FAIL: cd $ROOT"; exit 1; }
PULL_OUT=$(git pull 2>&1)
log "git pull: $(echo "$PULL_OUT" | head -1)"

touch "$ROOT/backend/tmp/restart.txt"
sleep 5

PIDS=$(pgrep -f "bibixprojects-staging/backend.*src/index.js" || true)
if [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill -9 2>/dev/null || true
  log "Killed old PIDs: $PIDS"
fi

for i in 1 2 3 4 5 6 7 8; do
  sleep 3
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$URL" 2>/dev/null || echo "000")
  if [ "$CODE" = "200" ]; then
    log "STAGING OK — http=200 (took ${i}x3s)"
    log "── STAGING DEPLOY END ──"
    exit 0
  fi
done

log "FAIL: staging did not come back up"
log "── STAGING DEPLOY END (failed) ──"
exit 1
