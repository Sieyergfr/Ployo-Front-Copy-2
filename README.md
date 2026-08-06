# Ployo Frontend

Digitale Personalakte für kleine und mittlere Unternehmen: Mitarbeiterverwaltung, Schicht- und Urlaubsplanung, Krankmeldungen, Dokumente und Erinnerungen — mandantenfähig (Multi-Tenant) auf Basis von Next.js 16.

## Stack

- **Next.js 16** (App Router, Server Actions, `proxy.ts` statt Middleware)
- **better-auth** (E-Mail/Passwort, Google/Apple optional, Rate-Limiting)
- **Prisma** (SQLite in Entwicklung; für Produktion PostgreSQL vorgesehen)
- **S3-kompatibler Objektspeicher** (OVH Frankfurt) für HR-Dokumente
- **Tailwind CSS 4**

## Lokale Entwicklung

```bash
npm install
cp .env.example .env       # Werte eintragen (siehe Kommentare in der Datei)
npm run db:push            # Schema in die lokale SQLite-DB übertragen
npm run dev
```

Ohne SMTP-Konfiguration werden E-Mails (Passwort-Reset, Einladungen) im Dev-Modus in die Server-Konsole geloggt; E-Mail-Verifizierung ist dann deaktiviert.

## Wichtige Skripte

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktions-Build |
| `npm run lint` | ESLint |
| `npm test` | Unit-Tests (Vitest) |
| `npm run test:watch` | Tests im Watch-Modus |
| `npm run db:generate` | Prisma Client generieren |
| `npm run db:migrate` | Migration erstellen/anwenden (Entwicklung) |
| `npm run db:push` | Schema ohne Migration synchronisieren |

## Betrieb

- **Health-Check:** `GET /api/health`
- **Retention-/Aufräumjob:** `GET /api/cron/cleanup` mit Header `Authorization: Bearer $CRON_SECRET` — täglich per externem Scheduler aufrufen (löscht abgelaufene Sessions, alte Audit-Logs gemäß Mandanten-Einstellung, endgültig zu löschende Dateien inkl. S3-Objekt).
- **Datenexport (eigenes Konto):** `GET /api/me/export`

## Architektur-Notizen

- Autorisierung läuft zentral über `lib/tenant-access.ts` (`requireTenantAccess`) — jede tenant-bezogene DB-Operation muss dort durch.
- Datei-Zugriffe werden zusätzlich über ACLs (`lib/file-access.ts`) geprüft; Downloads laufen über kurzlebige signierte S3-URLs.
- Eigene API-Routen sind über `lib/rate-limit.ts` gedrosselt (prozesslokal); die Auth-Endpunkte über das Rate-Limit von better-auth.
- Für LAN-Tests (Handy im eigenen WLAN) `DEV_LAN_ORIGINS` und `DEV_LAN_HOSTS` in der `.env` setzen — im Repository stehen keine IPs.
- Offene Aufgaben: **`To-Do-Offen.md`** (aktueller Stand, offen wie erledigt). `TODO-USER.md` listet die Punkte, die Zugangsdaten oder Entscheidungen brauchen; `To-Do-All.md` ist das ursprüngliche Analyse-Protokoll.
