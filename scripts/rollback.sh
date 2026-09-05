#!/usr/bin/env bash
set -euo pipefail

# Rollt auf den letzten Build zurück, den scripts/deploy.sh unter
# .next.backup gesichert hat, und lädt PM2 neu. Nur manuell aufrufen —
# z. B. wenn ein Fehler erst nach einem bereits erfolgreichen
# `scripts/deploy.sh`-Lauf auffällt.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$APP_DIR/.next"
BACKUP_DIR="$APP_DIR/.next.backup"
PM2_APP_NAME="${PM2_APP_NAME:-ployo}"

cd "$APP_DIR"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "Kein Backup unter $BACKUP_DIR gefunden (scripts/deploy.sh legt es beim nächsten Lauf an) — nichts zu tun."
  exit 1
fi

echo "==> Ersetze $BUILD_DIR durch das Backup aus $BACKUP_DIR"
rm -rf "$BUILD_DIR"
mv "$BACKUP_DIR" "$BUILD_DIR"

echo "==> pm2 reload $PM2_APP_NAME"
pm2 reload "$PM2_APP_NAME"

echo "==> Rollback abgeschlossen."
