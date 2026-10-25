#!/usr/bin/env bash
set -euo pipefail

# Release des Dashboard-Umbaus (alle Migrationen M1–M8 auf einmal, siehe
# Dashboard-Umbau-Plan.md Abschnitt 3 und 5). Bewusst NICHT automatisch
# verdrahtet — nur manuell auf dem Server ausführen, nach `git pull`.
#
# Ablauf:
#   1. Vorprüfung: sauberer Arbeitsstand, DATABASE_URL vorhanden, ausstehende
#      Migrationen ermitteln (`prisma migrate status`).
#   2. Sicherheitsprüfung: jede ausstehende Migration wird auf destruktive
#      Befehle durchsucht (DROP, TRUNCATE, DELETE, RENAME, Typwechsel, …).
#      Fund ⇒ Abbruch. Der Umbau ist rein additiv geplant.
#   3. Backup der Live-DB (pg_dump, gzip) nach $BACKUP_DIR, mit Integritätsprüfung.
#   4. Probelauf: das Backup wird in eine Wegwerf-Datenbank eingespielt und
#      die Migrationen dort zuerst angewendet. Schlägt das fehl, bleibt die
#      Live-DB unberührt. (Überspringen: SKIP_REHEARSAL=1)
#   5. Nach Rückfrage: `prisma migrate deploy` + `prisma generate` auf Live,
#      dann scripts/deploy.sh (Build in eigenes Release-Verzeichnis, atomarer
#      Wechsel, pm2 reload).
#
# Optionen:
#   --dry-run   nur Schritte 1, 2 und 4 (mit temporärem Dump), keine Änderung an Live
#   --yes       keine Rückfrage vor Schritt 5
#
# Rückweg: Die Migrationen sind additiv — der vorherige Code läuft auch mit
# dem neuen Schema. Für den Code reicht scripts/rollback.sh. Das Backup aus
# Schritt 3 ist nur für den Notfall (Wiederherstellung: gunzip -c <datei> | psql "$DATABASE_URL").

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ployo}"
DRY_RUN=0
ASSUME_YES=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --yes) ASSUME_YES=1 ;;
    *) echo "Unbekannte Option: $arg" >&2; exit 2 ;;
  esac
done

cd "$APP_DIR"

if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  # Nur DATABASE_URL aus .env übernehmen, nichts sonst exportieren.
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "!! DATABASE_URL fehlt (weder Umgebung noch .env)." >&2
  exit 1
fi

export DATABASE_URL
# Für pg_dump/psql: Prismas `schema=`-Parameter verstehen die Tools nicht,
# libpq-Parameter wie `host=` (Unix-Socket) müssen dagegen erhalten bleiben.
strip_prisma_params() {
  local url="$1" base query
  base="${url%%\?*}"

  if [ "$base" = "$url" ]; then
    printf '%s' "$url"
    return
  fi

  query="$(printf '%s' "${url#*\?}" | tr '&' '\n' | grep -vE '^(schema|connection_limit|pool_timeout|pgbouncer)=' | paste -sd '&' - || true)"
  printf '%s%s' "$base" "${query:+?$query}"
}

PG_URL="$(strip_prisma_params "$DATABASE_URL")"

echo "==> 1. Vorprüfung"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "!! Arbeitsverzeichnis hat uncommittete Änderungen — bitte erst klären." >&2
  git status --short --untracked-files=no
  exit 1
fi

echo "    Commit: $(git log --oneline -1)"

status_output="$(npx prisma migrate status 2>&1 || true)"
pending="$(printf '%s\n' "$status_output" | sed -n '/have not yet been applied/,/^$/p' | grep -E '^[0-9]{14}_' || true)"

if [ -z "$pending" ]; then
  echo "    Keine ausstehenden Migrationen."
else
  echo "    Ausstehende Migrationen:"
  printf '      %s\n' $pending
fi

if printf '%s\n' "$status_output" | grep -qiE 'failed|drift|not found locally'; then
  echo "!! prisma migrate status meldet ein Problem:" >&2
  printf '%s\n' "$status_output" >&2
  exit 1
fi

echo "==> 2. Sicherheitsprüfung der Migrationen"

destructive_pattern='(^|[^A-Z_])(DROP[[:space:]]+(TABLE|COLUMN|INDEX|CONSTRAINT|TYPE|SCHEMA)|TRUNCATE|DELETE[[:space:]]+FROM|RENAME[[:space:]]+(TO|COLUMN)|ALTER[[:space:]]+COLUMN[^;]*[[:space:]]TYPE[[:space:]]|SET[[:space:]]+NOT[[:space:]]+NULL)'

for migration in $pending; do
  file="prisma/migrations/$migration/migration.sql"

  if [ ! -f "$file" ]; then
    echo "!! $file fehlt." >&2
    exit 1
  fi

  # Kommentare ignorieren, Großschreibung vereinheitlichen.
  hits="$(grep -v '^[[:space:]]*--' "$file" | tr '[:lower:]' '[:upper:]' | grep -nE "$destructive_pattern" || true)"

  if [ -n "$hits" ]; then
    echo "!! $migration enthält möglicherweise destruktive Befehle — Abbruch:" >&2
    printf '%s\n' "$hits" >&2
    exit 1
  fi

  echo "    ok  $migration (nur additive Änderungen)"
done

if [ "$DRY_RUN" -eq 1 ]; then
  DUMP_FILE="$(mktemp -t ployo-release-XXXXXX.sql.gz)"
  trap 'rm -f "$DUMP_FILE"' EXIT
  echo "==> 3. (Dry-Run) Temporärer Dump nach $DUMP_FILE"
else
  mkdir -p "$BACKUP_DIR"
  DUMP_FILE="$BACKUP_DIR/ployo-before-dashboard-umbau-$(date +%Y%m%d%H%M%S).sql.gz"
  echo "==> 3. Backup der Live-DB nach $DUMP_FILE"
fi

pg_dump --no-owner --no-privileges "$PG_URL" | gzip > "$DUMP_FILE"
gzip -t "$DUMP_FILE"

if [ ! -s "$DUMP_FILE" ]; then
  echo "!! Backup ist leer — Abbruch." >&2
  exit 1
fi

echo "    $(du -h "$DUMP_FILE" | cut -f1) gesichert, Integrität geprüft."

if [ -n "$pending" ] && [ "${SKIP_REHEARSAL:-0}" != "1" ]; then
  echo "==> 4. Probelauf auf einer Wegwerf-Datenbank"
  rehearsal_db="ployo_release_check_$(date +%s)"
  # Datenbankname in den URLs austauschen, Abfrage-Parameter beibehalten.
  with_db() {
    local url="$1" db="$2" base query=""
    base="${url%%\?*}"
    [ "$base" != "$url" ] && query="?${url#*\?}"
    printf '%s/%s%s' "${base%/*}" "$db" "$query"
  }
  admin_url="$(with_db "$PG_URL" postgres)"

  psql "$admin_url" -v ON_ERROR_STOP=1 -qc "CREATE DATABASE \"$rehearsal_db\"" >/dev/null
  cleanup_rehearsal() {
    psql "$admin_url" -qc "DROP DATABASE IF EXISTS \"$rehearsal_db\"" >/dev/null 2>&1 || true
  }
  trap 'cleanup_rehearsal; if [ "$DRY_RUN" -eq 1 ]; then rm -f "$DUMP_FILE"; fi' EXIT

  gunzip -c "$DUMP_FILE" | psql "$(with_db "$PG_URL" "$rehearsal_db")" -v ON_ERROR_STOP=1 -q >/dev/null
  DATABASE_URL="$(with_db "$DATABASE_URL" "$rehearsal_db")" npx prisma migrate deploy
  echo "    Probelauf erfolgreich — die Live-DB ist bisher unverändert."
else
  echo "==> 4. Probelauf übersprungen"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "==> Dry-Run fertig. Keine Änderung an der Live-DB oder am laufenden Release."
  exit 0
fi

if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "==> 5. Migrationen auf Live anwenden und neuen Release ausrollen? [ja/NEIN] " answer

  if [ "$answer" != "ja" ]; then
    echo "Abgebrochen. Backup bleibt unter $DUMP_FILE."
    exit 1
  fi
fi

echo "==> 5. Migrationen auf Live anwenden"
npx prisma migrate deploy
npx prisma generate

echo "==> Neuen Release bauen und ausrollen (scripts/deploy.sh)"
"$APP_DIR/scripts/deploy.sh"

echo "==> Fertig."
echo "    Backup:   $DUMP_FILE"
echo "    Rollback: scripts/rollback.sh (Code; Schema ist abwärtskompatibel)"
