#!/usr/bin/env bash
set -euo pipefail

# Manuelles Deploy-Skript mit automatischem Rollback bei Build-Fehlschlag.
# Bewusst NICHT automatisch verdrahtet (kein Hook/Cron) — nur auf Zuruf
# ausführen, z. B. nach `git pull`.
#
# Ablauf:
#   1. Sichert den aktuellen .next-Ordner nach .next.backup
#   2. Baut neu (npm run build)
#   3. Bei Erfolg: pm2 reload <App-Name> (Default: "ployo")
#   4. Bei Fehler: .next.backup wird automatisch zurückgespielt, der
#      laufende PM2-Prozess bleibt währenddessen auf dem alten Build aktiv
#      (er wird nie gestoppt, nur bei Erfolg neu geladen)
#
# Fällt dir ein Fehler erst NACH einem erfolgreichen Reload auf, hilft
# stattdessen scripts/rollback.sh — das Backup bleibt danach bewusst liegen.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$APP_DIR/.next"
BACKUP_DIR="$APP_DIR/.next.backup"
PM2_APP_NAME="${PM2_APP_NAME:-ployo}"

cd "$APP_DIR"

if [ -d "$BUILD_DIR" ]; then
  echo "==> Sichere aktuellen Build nach $BACKUP_DIR"
  rm -rf "$BACKUP_DIR"
  cp -a "$BUILD_DIR" "$BACKUP_DIR"
fi

echo "==> npm run build"
if ! npm run build; then
  echo "!! Build fehlgeschlagen — stelle vorherigen Build wieder her."
  if [ -d "$BACKUP_DIR" ]; then
    rm -rf "$BUILD_DIR"
    mv "$BACKUP_DIR" "$BUILD_DIR"
    echo "==> Vorheriger Build wiederhergestellt, PM2 unverändert (läuft weiter mit dem alten Build)."
  fi
  exit 1
fi

echo "==> pm2 reload $PM2_APP_NAME"
pm2 reload "$PM2_APP_NAME"

echo "==> Fertig. Vorheriger Build liegt zur Sicherheit weiter unter $BACKUP_DIR (scripts/rollback.sh nutzt ihn bei Bedarf)."
