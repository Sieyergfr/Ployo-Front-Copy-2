#!/usr/bin/env bash
set -euo pipefail

# Manuelles Deploy-Skript mit automatischem Rollback bei Build-Fehlschlag.
# Bewusst NICHT automatisch verdrahtet (kein Hook/Cron) — nur auf Zuruf
# ausführen, z. B. nach `git pull`.
#
# Baut in ein EIGENES, zeitgestempeltes Release-Verzeichnis unter
# .next-releases/ (über NEXT_BUILD_DIR, siehe next.config.ts) statt direkt in
# den von PM2 aktiv bedienten .next-Ordner — der laufende Prozess liest
# währenddessen unverändert vom alten Release weiter (Audit-Finding M15: der
# vorherige Build-in-den-aktiven-Ordner-Ansatz konnte einem mitten im Build
# eintreffenden Request fehlende/halb geschriebene Chunk-Dateien ausliefern).
# `.next` ist dafür ein Symlink auf das jeweils aktive Release-Verzeichnis;
# das Umschalten auf einen neuen Release ist ein einzelner atomarer
# rename(2)-Aufruf (mv).
#
# Ablauf:
#   1. Einmalige Migration, falls .next noch ein echter Ordner ist (Altstand):
#      wird unverändert nach .next-releases/bootstrap-<Zeitstempel>
#      verschoben, .next wird zum Symlink darauf — PM2 sieht keinen Unterschied.
#   2. Baut neu in .next-releases/<Zeitstempel> (aktiver Build bleibt unberührt)
#   3. Bei Erfolg: .next atomar auf den neuen Release umgehängt, dann
#      `pm2 reload <App-Name>` (Default: "ployo"); alte Releases bis auf die
#      letzten drei aufgeräumt
#   4. Bei Fehler: der fehlgeschlagene Release-Ordner wird gelöscht, .next
#      zeigt unverändert auf den vorherigen, weiterhin laufenden Release —
#      PM2 wird in diesem Fall nie berührt
#
# Fällt dir ein Fehler erst NACH einem erfolgreichen Reload auf, hilft
# stattdessen scripts/rollback.sh — die letzten drei Releases bleiben dafür
# unter .next-releases/ liegen.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASES_DIR="$APP_DIR/.next-releases"
CURRENT_LINK="$APP_DIR/.next"
PM2_APP_NAME="${PM2_APP_NAME:-ployo}"
KEEP_RELEASES=3

cd "$APP_DIR"
mkdir -p "$RELEASES_DIR"

if [ -d "$CURRENT_LINK" ] && [ ! -L "$CURRENT_LINK" ]; then
  echo "==> Einmalige Migration: bestehender .next-Ordner wird unverändert nach $RELEASES_DIR übernommen."
  bootstrap_release="$RELEASES_DIR/bootstrap-$(date +%Y%m%d%H%M%S)"
  mv "$CURRENT_LINK" "$bootstrap_release"
  ln -s "$bootstrap_release" "$CURRENT_LINK"
fi

RELEASE_NAME="$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_NAME"
# Relativ zu APP_DIR (siehe `cd "$APP_DIR"` oben) statt eines absoluten
# Pfades: Next löst `distDir` intern über `path.join(<Projektwurzel>,
# config.distDir)` auf. Node behandelt ein absolutes zweites Argument bei
# `path.join` NICHT wie `path.resolve` (kein automatischer Wechsel des
# Basispfades), sondern hängt es als weiteres Segment an — ein absoluter
# NEXT_BUILD_DIR landete dadurch tatsächlich unter
# "$APP_DIR$RELEASE_DIR" (doppelter Projektpfad), nicht unter $RELEASE_DIR
# selbst. Das Skript prüfte das erwartete Ziel bisher nicht, bevor es den
# Symlink umgehängt hat (Audit-Finding R07/M15).
RELEASE_DIR_RELATIVE=".next-releases/$RELEASE_NAME"

echo "==> Baue neuen Release nach $RELEASE_DIR (aktiver Build bleibt währenddessen unberührt)"
if ! NEXT_BUILD_DIR="$RELEASE_DIR_RELATIVE" npm run build; then
  echo "!! Build fehlgeschlagen — laufender Release bleibt unverändert aktiv, PM2 nicht berührt."
  rm -rf "$RELEASE_DIR"
  exit 1
fi

# Baut auf derselben Annahme wie oben auf: nur ein tatsächlich unter
# $RELEASE_DIR vorhandener BUILD_ID-Marker gilt als gültiger, vollständiger
# Build. Ohne diese Prüfung hätte ein (erneuter) Pfad-/Konfigurationsfehler
# stillschweigend den Symlink auf ein leeres oder unvollständiges
# Verzeichnis umgehängt.
if [ ! -f "$RELEASE_DIR/BUILD_ID" ]; then
  echo "!! Build lieferte kein gültiges Ergebnis unter $RELEASE_DIR (BUILD_ID fehlt) — laufender Release bleibt unverändert aktiv, PM2 nicht berührt."
  rm -rf "$RELEASE_DIR"
  exit 1
fi

echo "==> Schalte .next atomar auf den neuen Release um"
ln -sfn "$RELEASE_DIR" "$APP_DIR/.next.tmp"
mv -Tf "$APP_DIR/.next.tmp" "$CURRENT_LINK"

echo "==> pm2 reload $PM2_APP_NAME"
pm2 reload "$PM2_APP_NAME"

echo "==> Räume alte Releases auf (letzte $KEEP_RELEASES behalten)"
# shellcheck disable=SC2012
ls -1dt "$RELEASES_DIR"/*/ 2>/dev/null | tail -n "+$((KEEP_RELEASES + 1))" | xargs -r rm -rf

echo "==> Fertig. Aktiver Release: $RELEASE_DIR"
