#!/usr/bin/env bash
# ==============================================================================
# goWILD Karunadu - Automated Database Backup Script
# Usage: ./scripts/backup-db.sh
# Can be scheduled in crontab (e.g. daily at 2:00 AM):
# 0 2 * * * /var/www/html/goWILDKarunadu/goWILDKarunadu-user-api/scripts/backup-db.sh >> /var/log/gowild-backup.log 2>&1
# ==============================================================================

set -euo pipefail

# Directory where backups will be stored locally
BACKUP_DIR="${BACKUP_DIR:-/var/backups/gowild}"
DB_NAME="${DB_NAME:-goWILDKarunadu}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASSWORD:-Itwinetech@1234}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u)] Starting database backup for '${DB_NAME}'..."

# Dump and gzip
mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASS}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  "${DB_NAME}" | gzip -9 > "${BACKUP_FILE}"

echo "[$(date -u)] Backup created successfully: ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

# Retention policy: remove local backups older than 30 days
find "${BACKUP_DIR}" -name "${DB_NAME}_*.sql.gz" -type f -mtime +30 -delete
echo "[$(date -u)] Retention cleanup completed (backups older than 30 days removed)."
