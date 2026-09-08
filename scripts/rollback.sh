#!/usr/bin/env bash
set -euo pipefail

# Rollt auf den vorherigen Release zurück, den scripts/deploy.sh unter
# .next-releases/ behalten hat, und lädt PM2 neu. Nur manuell aufrufen —
# z. B. wenn ein Fehler erst nach einem bereits erfolgreichen
# `scripts/deploy.sh`-Lauf auffällt.
#
# .next ist ein Symlink auf das jeweils aktive Release-Verzeichnis (siehe
# scripts/deploy.sh) — das Zurückrollen ist deshalb wie das Deployen selbst
# ein einzelner atomarer Symlink-Wechsel, kein Kopieren/Verschieben von
# Build-Ausgaben.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASES_DIR="$APP_DIR/.next-releases"
CURRENT_LINK="$APP_DIR/.next"
PM2_APP_NAME="${PM2_APP_NAME:-ployo}"

cd "$APP_DIR"

if [ ! -L "$CURRENT_LINK" ]; then
  echo "$CURRENT_LINK ist (noch) kein Release-Symlink — scripts/deploy.sh einmal laufen lassen, bevor ein Rollback möglich ist."
  exit 1
fi

current_release="$(readlink -f "$CURRENT_LINK")"
# Neueste zuerst; das erste Release, das NICHT der aktuell aktive ist, ist
# der gewünschte Rollback-Ziel-Release.
previous_release="$(ls -1dt "$RELEASES_DIR"/*/ 2>/dev/null | sed 's:/$::' | grep -vF -- "$current_release" | head -n 1 || true)"

if [ -z "$previous_release" ]; then
  echo "Kein vorheriger Release unter $RELEASES_DIR gefunden — nichts zum Zurückrollen."
  exit 1
fi

echo "==> Aktueller Release: $current_release"
echo "==> Schalte .next atomar zurück auf: $previous_release"
ln -sfn "$previous_release" "$APP_DIR/.next.tmp"
mv -Tf "$APP_DIR/.next.tmp" "$CURRENT_LINK"

echo "==> pm2 reload $PM2_APP_NAME"
pm2 reload "$PM2_APP_NAME"

echo "==> Rollback abgeschlossen."
