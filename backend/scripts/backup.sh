#!/bin/bash
# ── Bibix Projects — Database Backup Script ──────────────────────────────────
# Runs via cron. Keeps:
#   - 30 daily backups  (monday.db.daily.YYYY-MM-DD)
#   - 12 weekly backups (monday.db.weekly.YYYY-WNN)
#
# Set up cron (runs daily at 3am):
#   crontab -e
#   0 3 * * * /bin/bash ~/bibixprojects/backend/scripts/backup.sh >> ~/bibixprojects/backend/data/backups/backup.log 2>&1

set -euo pipefail

DB_PATH="$HOME/bibixprojects/backend/data/monday.db"
BACKUP_DIR="$HOME/bibixprojects/backend/data/backups"
LOG_TAG="[backup $(date '+%Y-%m-%d %H:%M:%S')]"

mkdir -p "$BACKUP_DIR"

# ── Validate the DB is a real SQLite file ─────────────────────────────────────
if [ ! -f "$DB_PATH" ]; then
  echo "$LOG_TAG ERROR: DB file not found at $DB_PATH"
  exit 1
fi

HEADER=$(head -c 16 "$DB_PATH" 2>/dev/null | tr -d '\0' || echo "")
if [[ "$HEADER" != "SQLite format 3" ]]; then
  echo "$LOG_TAG ERROR: DB file is NOT a valid SQLite file (header: '$HEADER'). Skipping backup."
  exit 1
fi

DB_SIZE=$(stat -c%s "$DB_PATH" 2>/dev/null || stat -f%z "$DB_PATH" 2>/dev/null || echo "0")
if [ "$DB_SIZE" -lt 4096 ]; then
  echo "$LOG_TAG ERROR: DB file is suspiciously small (${DB_SIZE} bytes). Skipping backup."
  exit 1
fi

# Run SQLite integrity check if sqlite3 CLI is available — never back up a corrupt DB
if command -v sqlite3 >/dev/null 2>&1; then
  INTEGRITY=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>&1 | head -1)
  if [ "$INTEGRITY" != "ok" ]; then
    echo "$LOG_TAG ERROR: DB failed integrity check: $INTEGRITY. Skipping backup to avoid saving corruption."
    exit 1
  fi
fi

# ── Daily backup ──────────────────────────────────────────────────────────────
DAILY_NAME="monday.db.daily.$(date '+%Y-%m-%d')"
DAILY_PATH="$BACKUP_DIR/$DAILY_NAME"

cp "$DB_PATH" "$DAILY_PATH"
echo "$LOG_TAG Daily backup saved: $DAILY_NAME (${DB_SIZE} bytes)"

# Prune daily backups — keep last 30
ls -1 "$BACKUP_DIR"/monday.db.daily.* 2>/dev/null \
  | sort -r \
  | tail -n +31 \
  | xargs -r rm --
DAILY_COUNT=$(ls -1 "$BACKUP_DIR"/monday.db.daily.* 2>/dev/null | wc -l)
echo "$LOG_TAG Daily backups kept: $DAILY_COUNT"

# ── Weekly backup (every Sunday) ─────────────────────────────────────────────
DAY_OF_WEEK=$(date '+%u')  # 1=Mon, 7=Sun
if [ "$DAY_OF_WEEK" = "7" ]; then
  WEEK_NUM=$(date '+%Y-W%V')
  WEEKLY_NAME="monday.db.weekly.$WEEK_NUM"
  WEEKLY_PATH="$BACKUP_DIR/$WEEKLY_NAME"
  cp "$DB_PATH" "$WEEKLY_PATH"
  echo "$LOG_TAG Weekly backup saved: $WEEKLY_NAME"

  # Prune weekly backups — keep last 12
  ls -1 "$BACKUP_DIR"/monday.db.weekly.* 2>/dev/null \
    | sort -r \
    | tail -n +13 \
    | xargs -r rm --
  WEEKLY_COUNT=$(ls -1 "$BACKUP_DIR"/monday.db.weekly.* 2>/dev/null | wc -l)
  echo "$LOG_TAG Weekly backups kept: $WEEKLY_COUNT"
fi

echo "$LOG_TAG Done."
