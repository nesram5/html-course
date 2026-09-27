#!/bin/sh
# Daily PostgreSQL backup of Plaza (E8-S5). Runs in the `backup` service of
# infra/app/docker-compose.yml (postgres image, so pg_dump matches the server version).
#
#   BACKUP_HOUR       hour of the day (UTC, 0-23) of the daily dump; default 3
#   BACKUP_KEEP_DAYS  dumps older than this are deleted; default 14
#   BACKUP_ON_START   "1" also dumps right after the container starts
#   PGHOST, PGUSER, PGPASSWORD, PGDATABASE  connection (libpq variables)
#
# Dumps: /backups/bululu-YYYYMMDD-HHMMSS.dump (pg_dump custom format, restore with pg_restore;
# see docs/runbook.md). Copy them off the VM too (provider snapshots or rclone).
# The dumps hold the whole database (e-mails, names, chat, feedback): readable by their owner
# only (umask 077, folder 700).
set -eu
umask 077

BACKUP_HOUR="${BACKUP_HOUR:-3}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
DIR=/backups

dump() {
  file="$DIR/bululu-$(date -u +%Y%m%d-%H%M%S).dump"
  if pg_dump --format=custom --no-owner --file="$file.partial"; then
    mv "$file.partial" "$file"
    echo "backup: wrote $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.partial"
    echo "backup: pg_dump FAILED" >&2
    return 1
  fi
  find "$DIR" -name 'bululu-*.dump' -mtime +"$BACKUP_KEEP_DAYS" -print -delete
}

mkdir -p "$DIR"
chmod 700 "$DIR"
if [ "${BACKUP_ON_START:-0}" = "1" ]; then dump || true; fi

last_day=""
while true; do
  hour=$(date -u +%H | sed 's/^0//')
  today=$(date -u +%Y%m%d)
  if [ "${hour:-0}" -eq "$BACKUP_HOUR" ] && [ "$today" != "$last_day" ]; then
    if dump; then last_day="$today"; fi
  fi
  sleep 60
done
