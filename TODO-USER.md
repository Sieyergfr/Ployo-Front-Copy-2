# TODO — Benötigt deine Mitwirkung

Diese Punkte kann Claude nicht allein erledigen, weil Zugangsdaten, Verträge,
Infrastruktur oder Produktentscheidungen von dir fehlen. Sortiert nach
Priorität. (Stand: 01.08.2026)

> **Hinweis (02.08.2026):** Der Abschnitt „Offene Entwicklungsaufgaben" am Ende
> ist weitgehend abgearbeitet. Aktueller Gesamtstand — offen wie erledigt —
> steht in [To-Do-Offen.md](To-Do-Offen.md).

## 🔴 Blocker vor dem Livegang

### 1. SMTP-Zugangsdaten besorgen (E-Mail-Versand)
Die komplette E-Mail-Infrastruktur ist fertig (`lib/email.ts`) — es fehlen nur
die Zugangsdaten eines Providers (z. B. Resend, Postmark, Brevo, Amazon SES —
**EU-Region wählen und AVV abschließen**).
- In `.env` bzw. Produktions-Umgebung setzen: `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- Sobald `SMTP_HOST` + `SMTP_FROM` gesetzt sind, aktivieren sich automatisch:
  Passwort-Reset-Mails, **E-Mail-Verifizierungspflicht** bei Registrierung und
  Einladungs-Mails.

### 2. PostgreSQL-Datenbank bereitstellen
SQLite ist nur für die Entwicklung geeignet. Benötigt: eine gemanagte
Postgres-Instanz (EU-Region, z. B. OVH, Hetzner, Neon, Supabase) inkl. AVV.
Danach:
1. `DATABASE_URL` auf die Postgres-URL setzen
2. In `prisma/schema.prisma` den `datasource`-Provider auf `postgresql` ändern
3. In `lib/auth.ts` beim `prismaAdapter` den Provider auf `postgresql` ändern
4. Migrations-Historie neu aufsetzen (die bestehende ist SQLite-Dialekt und
   hat Drift): Ordner `prisma/migrations` leeren, dann
   `npx prisma migrate dev --name init`
5. Automatische **Backups + Restore-Test** beim DB-Anbieter aktivieren

### 3. Produktions-Secrets setzen & rotieren
- `BETTER_AUTH_SECRET`: starkes Secret generieren (`openssl rand -base64 32`).
  Die App startet in Produktion jetzt bewusst **nicht** mehr ohne.
- `BETTER_AUTH_URL`: öffentliche `https://`-Domain (Pflicht, sonst Startfehler).
- `CRON_SECRET`: Secret für den Aufräum-Job generieren.
- **S3-Keys rotieren:** Die aktuellen OVH-S3-Zugangsdaten liegen im Klartext in
  der lokalen `.env`. Vor dem Launch im OVH-Panel neue Keys erzeugen, alte
  deaktivieren, neue nur im Secret-Store des Hosters hinterlegen.
- Im OVH-Panel für den Bucket `hr-documents`: serverseitige Verschlüsselung
  und Versionierung aktivieren.

### 4. Rechtstexte finalisieren (Anwalt/Datenschutzbeauftragte)
Die Seiten `/impressum`, `/datenschutz`, `/agb` existieren jetzt als
Struktur-Vorlagen mit `[PLATZHALTERN]`:
- `app/(legal)/impressum/page.tsx` — Firmendaten, Register, USt-IdNr. eintragen
- `app/(legal)/datenschutz/page.tsx` — Hoster, Mail-Provider, Fristen eintragen,
  juristisch prüfen lassen
- `app/(legal)/agb/page.tsx` — Laufzeit, Preise, Haftung, SLA ergänzen
Zusätzlich (Dokumente, kein Code):
- **AVV-Vorlage für eure Kunden** (Ployo ist Auftragsverarbeiter für
  Beschäftigtendaten!)
- AVV mit OVH und dem künftigen Hosting-Anbieter abschließen
- Verzeichnis von Verarbeitungstätigkeiten (Art. 30) + TOM-Dokument
- Prüfen, ob eine DSFA nötig ist (Gesundheitsdaten von Beschäftigten → sehr
  wahrscheinlich ja)

### 5. Cron-Scheduler einrichten
`GET /api/cron/cleanup` mit Header `Authorization: Bearer $CRON_SECRET`
**täglich** aufrufen (z. B. Vercel Cron, OVH-Cron, GitHub Actions schedule,
cron-job.org). Der Job setzt die DSGVO-Retention durch: abgelaufene Sessions,
Audit-Logs gemäß Mandanten-Einstellung, endgültiges Löschen von Dateien
(inkl. S3) nach 30 Tagen Papierkorb, abgelaufene Einladungen.

### 6. Billing entscheiden & einrichten (Stripe o. ä.)
Aktuell sind `plan`/`billingCycle` reine Anzeige ohne Zahlung. Benötigt von dir:
- Entscheidung Preismodell + Plan-Limits (z. B. max. Mitarbeiter pro Plan)
- Stripe-Konto + API-Keys (oder anderer Anbieter)
Danach kann die Integration (Checkout, Webhooks, Feature-Gating) gebaut werden.

## 🟠 Wichtig, kurz nach Launch

### 7. Monitoring/Error-Tracking
Sentry-Konto (EU-Region) anlegen und DSN bereitstellen — Integration ist dann
ein kleiner Schritt (`@sentry/nextjs`).

### 8. Domain, Hosting, HTTPS
Zieldomain + Hosting-Anbieter festlegen (inkl. AVV, EU-Standort). `BETTER_AUTH_URL`,
`BETTER_AUTH_TRUSTED_ORIGINS` und DNS entsprechend konfigurieren.

### 9. Google/Apple-Login (optional)
OAuth-Zugangsdaten anlegen (`GOOGLE_CLIENT_ID/SECRET`, Apple-Keys), sonst
bleiben die Buttons deaktiviert.

## 🟡 Produktentscheidungen (danach kann weitergebaut werden)

- **Mitarbeiter-Self-Service:** Die Verknüpfung Konto ↔ Mitarbeiterakte ist
  vorbereitet (`TenantEmployee.userId`, wird beim Annehmen einer Einladung
  automatisch per E-Mail-Abgleich gesetzt). Entscheiden: Sollen Mitarbeiter
  eigene Urlaubsanträge/Krankmeldungen stellen und eigene Dokumente sehen?
  → dann bauen wir die Self-Service-Ansichten.
- **2FA:** Die irreführenden Schalter wurden aus den Einstellungen entfernt.
  Entscheiden, ob 2FA (better-auth `twoFactor`-Plugin, TOTP) umgesetzt werden
  soll.
- **Feldverschlüsselung:** IBAN, SV-Nummer, Steuer-ID, Krankenkasse liegen
  unverschlüsselt in der DB. App-seitige Verschlüsselung braucht eine
  Key-Management-Entscheidung (env-Key vs. KMS). Empfehlung: mindestens
  verschlüsselte Produktions-DB, besser zusätzlich Feldverschlüsselung.
- **Konto-Löschung UI:** Serverseitig ist `deleteUser` aktiviert; eine
  Oberfläche („Konto löschen“ im Profil) fehlt noch — Platzierung entscheiden.

## 🔧 Offene Entwicklungsaufgaben

**Stand 02.08.2026 — erledigt:** Demo-/Sample-Daten entfernt · Audit-Logging in
Rollen-, Team-, Standort- und Contract-Service ergänzt · Test-Setup mit Vitest
(27 Tests) · Personalnummer per Unique-Constraint + Retry abgesichert ·
E-Mail-Verifizierungs-Redirect auf `/confirm`.

**Noch offen** (Details in [To-Do-Offen.md](To-Do-Offen.md)):
- Zod-Validierungsschicht für alle Server Actions
- Fehler-Rückgaben per `useActionState` statt geworfener Errors
- Legacy-JSON-Spalten im Schema bereinigen (`TenantLocation.teamJson` etc.)
- Pagination für Mitarbeiterliste, schlankere Queries im Dashboard-Layout
- Playwright-Smoke-Test und Integrationstests für `tenant-access`
