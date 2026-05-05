#!/bin/bash
# ── Bibix Watchdog ────────────────────────────────────────────────────────────
# Runs every 5 min via cron. Detects failures and self-heals.
#   - Pings the backend; if down, force-restarts via kill
#   - Checks DB integrity weekly (Sunday only) and alerts on corruption
#   - All actions logged with timestamps
#
# Cron entry (every 5 min):
#   */5 * * * * /bin/bash ~/bibixprojects/backend/scripts/watchdog.sh

set -uo pipefail

LOG="$HOME/bibixprojects/backend/data/watchdog.log"
URL="https://bibix.ailabstech.com/api/ping"
DB="$HOME/bibixprojects/backend/data/monday.db"
NOW="$(date '+%Y-%m-%d %H:%M:%S')"

mkdir -p "$(dirname "$LOG")"

log() { echo "[$NOW] $1" >> "$LOG"; }

# ── 1. Health check ──────────────────────────────────────────────────────────
RESP=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" --max-time 10 "$URL" || echo "000|TIMEOUT")
HTTP_CODE="${RESP%%|*}"
TIME="${RESP##*|}"

if [ "$HTTP_CODE" = "200" ]; then
  # Healthy. Log heartbeat once per hour to keep log small
  MIN=$(date '+%M')
  if [ "$MIN" = "00" ]; then
    log "OK ${HTTP_CODE} ${TIME}s"
  fi
else
  log "DOWN http=${HTTP_CODE} time=${TIME}s — attempting recovery"

  # Try touch restart first (gentle)
  touch "$HOME/bibixprojects/backend/tmp/restart.txt"
  sleep 12
  CODE2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL" || echo "000")

  if [ "$CODE2" = "200" ]; then
    log "RECOVERED via touch restart.txt"
  else
    # Force kill — Passenger will respawn
    PIDS=$(pgrep -f "bibixprojects/backend.*src/index.js" || true)
    if [ -n "$PIDS" ]; then
      log "FORCE KILL pids=${PIDS}"
      echo "$PIDS" | xargs kill -9 2>/dev/null || true
      sleep 8
    fi

    CODE3=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL" || echo "000")
    if [ "$CODE3" = "200" ]; then
      log "RECOVERED via kill -9"
    else
      log "FAILED to recover — http=${CODE3}. Manual intervention needed."
    fi
  fi
fi

# ── 2. DB integrity check (Sunday at 04:xx only) ─────────────────────────────
DOW=$(date '+%u')
HOUR=$(date '+%H')
if [ "$DOW" = "7" ] && [ "$HOUR" = "04" ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    INTEGRITY=$(sqlite3 "$DB" "PRAGMA integrity_check;" 2>&1 | head -1)
    if [ "$INTEGRITY" = "ok" ]; then
      log "DB integrity OK"
    else
      log "DB CORRUPTION DETECTED: $INTEGRITY"
      # Don't auto-fix here — too risky. Just alert.
    fi
  fi
fi

# ── 3. Rotate log if it gets large (>5 MB) ───────────────────────────────────
if [ -f "$LOG" ]; then
  SIZE=$(stat -c%s "$LOG" 2>/dev/null || stat -f%z "$LOG" 2>/dev/null || echo "0")
  if [ "$SIZE" -gt 5242880 ]; then
    mv "$LOG" "${LOG}.old"
    log "Log rotated"
  fi
fi
