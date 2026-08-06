# To-Do-Offen — was noch fehlt

Stand: 02.08.2026. Gegenstück zu `To-Do-All.md` (Gesamtanalyse).
Hier steht **nur noch das Offene** — alles Erledigte ist in `To-Do-All.md`
abgehakt und unten in „Was bereits erledigt ist" zusammengefasst.

Verifikationsstand nach den Änderungen:
`npx tsc --noEmit` → 0 Fehler · `npm run lint` → sauber ·
`npm test` → 27 Tests grün · `npm run build` → erfolgreich.

Legende: 🔴 Blocker · 🟠 Wichtig · 🟡 Mittel · ⚪ Niedrig
Kennzeichnung: **[DU]** = braucht dich (Zugang/Vertrag/Entscheidung) ·
**[CODE]** = kann direkt umgesetzt werden.

---

## 1. 🔴 Blocker vor dem Livegang — **[DU]**

Diese Punkte kann niemand für dich erledigen, weil Zugangsdaten, Verträge oder
Produktentscheidungen fehlen. Details stehen unverändert in `TODO-USER.md`.

### 1.1 SMTP-Zugangsdaten besorgen
Der Versand-Code ist fertig ([lib/email.ts](lib/email.ts)). Es fehlen nur die
Zugangsdaten eines Providers (Resend, Postmark, Brevo, Amazon SES — **EU-Region
wählen und AVV abschließen**).
- Setzen: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- Sobald `SMTP_HOST` + `SMTP_FROM` gesetzt sind, aktivieren sich automatisch:
  Passwort-Reset, **E-Mail-Verifizierungspflicht**, Einladungs-Mails und die
  neue Weiterleitung auf `/confirm` nach der Registrierung.

### 1.2 PostgreSQL bereitstellen und umstellen
SQLite ist nur für die Entwicklung geeignet. Benötigt: gemanagte Postgres-Instanz
(EU-Region, z. B. OVH, Hetzner, Neon, Supabase) inkl. AVV. Danach:
1. `DATABASE_URL` auf die Postgres-URL setzen
2. In [prisma/schema.prisma:6](prisma/schema.prisma#L6) `provider` auf `postgresql`
3. In [lib/auth.ts](lib/auth.ts) beim `prismaAdapter` den Provider auf `postgresql`
4. Migrationshistorie neu aufsetzen (die bestehende ist SQLite-Dialekt **und hat
   inzwischen Drift**, siehe 3.1): `prisma/migrations` leeren, dann
   `npx prisma migrate dev --name init`
5. Automatische **Backups + Restore-Test** beim Anbieter aktivieren

### 1.3 Produktions-Secrets setzen und rotieren
- `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) — die App startet in
  Produktion bewusst nicht mehr ohne
- `BETTER_AUTH_URL` — öffentliche `https://`-Domain (Pflicht)
- `CRON_SECRET` — für den Aufräum-Job
- **S3-Keys rotieren:** Die OVH-S3-Zugangsdaten liegen im Klartext in der
  lokalen `.env`. Vor dem Launch neue Keys erzeugen, alte deaktivieren, neue nur
  im Secret-Store des Hosters hinterlegen.
- Im OVH-Panel für Bucket `hr-documents`: serverseitige Verschlüsselung und
  Versionierung aktivieren

### 1.4 Rechtstexte finalisieren (Anwalt/Datenschutzbeauftragte)
Die Seiten existieren als Struktur-Vorlagen mit `[PLATZHALTERN]`:
- [app/(legal)/impressum/page.tsx](<app/(legal)/impressum/page.tsx>) — Zeilen 17-62:
  Firmenname/Rechtsform, Anschrift, Geschäftsführung, Telefon, E-Mail,
  Registergericht, HRB, USt-IdNr.
- [app/(legal)/datenschutz/page.tsx](<app/(legal)/datenschutz/page.tsx>) — Zeilen
  20, 33, 78, 90, 116, 120: Verantwortlicher, Log-Speicherdauer, Hoster,
  Mail-Dienstleister, Datenschutz-Kontakt, Stand-Datum
- [app/(legal)/agb/page.tsx](<app/(legal)/agb/page.tsx>) — Zeilen 19, 32, 39, 44,
  60, 65, 72, 76: Firmenname, SLA, Laufzeit/Kündigung, Preise, Backup/Export,
  Haftung, Gerichtsstand, Stand-Datum

Zusätzlich als Dokumente (kein Code):
- **AVV-Vorlage für eure Kunden** (Ployo ist Auftragsverarbeiter für
  Beschäftigtendaten)
- AVV mit OVH und dem künftigen Hosting-Anbieter
- Verzeichnis von Verarbeitungstätigkeiten (Art. 30) + TOM-Dokument
- DSFA-Prüfung (Gesundheitsdaten von Beschäftigten → sehr wahrscheinlich nötig)

### 1.5 Cron-Scheduler einrichten
`GET /api/cron/cleanup` mit Header `Authorization: Bearer $CRON_SECRET`
**täglich** aufrufen (Vercel Cron, OVH-Cron, GitHub Actions schedule,
cron-job.org). Der Job setzt die DSGVO-Retention durch.

### 1.6 Domain, Hosting, HTTPS
Zieldomain und Hosting-Anbieter festlegen (EU-Standort, AVV). `BETTER_AUTH_URL`,
`BETTER_AUTH_TRUSTED_ORIGINS` und DNS entsprechend konfigurieren.

---

## 2. 🟠 Produktentscheidungen — **[DU]**, danach **[CODE]**

Bei diesen Punkten fehlt eine Entscheidung von dir; die Umsetzung ist danach
klar umrissen.

### 2.1 Billing / Zahlungsabwicklung
Der Abrechnungs-Bereich zeigt jetzt **ehrlich** an, dass keine Zahlung
angebunden ist (vorher: erfundene Stripe-Subscription mit Rechnungen).
Benötigt von dir: Preismodell + Plan-Limits (z. B. max. Mitarbeiter pro Plan)
und ein Stripe-Konto mit API-Keys. Danach umsetzbar: Checkout, Webhooks,
Feature-Gating.
Betroffen: [components/Navigation.tsx](components/Navigation.tsx) (Panel
`billing`), `Tenant.plan` / `Tenant.billingCycle`.

### 2.2 Mitarbeiter-Self-Service
Die Verknüpfung Konto ↔ Personalakte ist vorbereitet (`TenantEmployee.userId`,
wird beim Annehmen einer Einladung per E-Mail-Abgleich gesetzt).
**Entscheiden:** Sollen Mitarbeiter eigene Urlaubsanträge/Krankmeldungen stellen
und eigene Dokumente sehen?

⚠️ **Bekannte Lücke bis dahin:** Ein eingeladener `EMPLOYEE` ohne zugewiesene
Rolle bekommt auf praktisch allen Tenant-Seiten `FORBIDDEN`
([lib/tenant-access.ts:64](lib/tenant-access.ts#L64)) und landet auf der
Fehlerseite. Es gibt keine sinnvolle Lande-Ansicht für normale Mitarbeiter.
Minimallösung ohne Self-Service: eine eigene Startseite „Kein Zugriff — bitte an
HR wenden" statt der generischen Fehlerseite.

### 2.3 Benachrichtigungs-Pipeline (E-Mail, Push, Digest)
In-App-Benachrichtigungen sind jetzt wirksam (Schalter greifen). **Nicht**
umgesetzt sind: E-Mail-Benachrichtigungen, Mobile Push und der Wochen-Digest.
Die Schalter dafür sind derzeit aus der Oberfläche entfernt bzw. wirkungslos.
Benötigt: Entscheidung über Kanäle und Frequenz, danach ein Job, der auf Basis
von Fristen/Anträgen Mails über `lib/email.ts` verschickt.
Schema-Spalten sind vorhanden: `mailNotifications`, `mobilePush`, `digestTime`,
`billingNotifications` in [prisma/schema.prisma](prisma/schema.prisma).

### 2.4 2FA
Nicht vorhanden. Entscheiden, ob umgesetzt werden soll (better-auth
`twoFactor`-Plugin, TOTP). Die Spalte `twoFactorRequired` existiert, wird aber
bewusst nicht mehr überschrieben, solange es keine Oberfläche gibt.

### 2.5 Feldverschlüsselung sensibler Daten
`iban`, `socialSecurityNumber`, `taxId`, `healthInsurance` liegen im Klartext
([prisma/schema.prisma:309-312](prisma/schema.prisma#L309-L312)).
App-seitige Verschlüsselung braucht eine Key-Management-Entscheidung (env-Key
vs. KMS). Empfehlung: mindestens verschlüsselte Produktions-DB, besser
zusätzlich Feldverschlüsselung.

### 2.6 Lohnabrechnungen (Payroll)
Der Reiter „Abrechnungen" in der Personalakte existiert, wird aber nie befüllt —
`payrollStatementsJson` wird bei der Anlage leer initialisiert und es gibt keinen
Upload-/Zuordnungs-Flow. Die Berechtigungs-Area `payroll` ist bereits vorhanden.
Benötigt: Entscheidung, ob Abrechnungen hochgeladen oder aus einem Lohnsystem
importiert werden.

### 2.7 Schichtplanung: Mindestbesetzung und Pausenregel anwenden
Beide Werte werden jetzt gespeichert, aber noch nicht automatisch auf Schichten
angewendet (die Oberfläche sagt das auch so). Offen: Warnung bei
Unterbesetzung, automatische Pausenberechnung aus der Schichtlänge.
Ebenfalls offen: **Wochenpläne/Templates** — die frühere Template-Liste war eine
Attrappe ohne Funktion und wurde entfernt.

---

## 3. 🟠 Technische Schulden — **[CODE]**

### 3.1 Schema-Drift zwischen `prisma/migrations` und `schema.prisma`
Das Schema wurde per `prisma db push` weiterentwickelt (u. a. die neuen Felder
`shiftPresetsJson`, `shiftMinStaffing`, `shiftBreakRule` und der Unique-Index
`(tenantId, employeeNumber)`). Die Migrationsdateien bilden das nicht ab.
Die CI meldet die Drift jetzt als Warnung
([.github/workflows/ci.yml](.github/workflows/ci.yml)).
→ Wird mit dem Postgres-Umzug (1.2) sauber aufgelöst.

### 3.2 Keine Eingabe-Validierungsschicht (Zod)
`zod` ist nicht installiert; alle ~40 Server Actions validieren per Hand
(`formString`-Trimmen). Empfehlung: ein Zod-Schema je Action, damit
Fehlermeldungen einheitlich und Feld-genau werden.

### 3.3 Fehler-UX: Actions werfen Errors
`useActionState` wird nirgends verwendet. Bei Validierungsfehlern sieht der
Nutzer die generische Fehlerseite ([app/error.tsx](app/error.tsx)) statt eines
Feldfehlers im Formular. Betrifft alle Formulare, besonders sichtbar bei den
neuen Meldungen (z. B. „Personalnummer bereits vergeben").
Hängt eng mit 3.2 zusammen — am besten zusammen umsetzen.

### 3.4 Legacy-JSON-Spalten im Schema
Bewusst nicht angefasst, weil die Migration Datenumzug erfordert:
- `TenantLocation`: `teamJson`, `activityJson`, `fileFoldersJson`, `filesJson`,
  `shiftPlanJson` ([prisma/schema.prisma:279-283](prisma/schema.prisma#L279-L283))
- `TenantEmployee`: `documentsJson`, `fileFoldersJson`, `filesJson`,
  `emergencyContactsJson`, `payrollStatementsJson`, `infoRequestsJson`,
  `shiftsJson`, `timelineJson`, `contractDetailsJson`
→ In echte Tabellen normalisieren. **Hinweis:** Die neuen Info-Anfragen nutzen
`infoRequestsJson` mit — bei einer Normalisierung mit umziehen.

### 3.5 Denormalisierte Strings statt Relationen
`TenantEmployee.location/team/role` sind Freitext; `TenantTeamMember` kopiert
`name/location/role/contract`; `TenantLocation.lead*` ebenso. Umbenennungen
laufen dadurch auseinander. Für Employee→TeamMember gibt es bereits eine
Synchronisierung (`syncTeamMemberSnapshots`), für Standort-/Team-Namen nicht.

### 3.6 Notfallkontakte sind nur Anzeige
In der Personalakte lassen sich Notfallkontakte im Bearbeiten-Modus zwar
darstellen und es gibt einen Button „Kontakt hinzufügen", die Eingabefelder
haben aber kein `name`-Attribut und werden nicht gespeichert
([app/(dashboard)/u/[tenant]/employees/[employeeId]/page.tsx](<app/(dashboard)/u/[tenant]/employees/[employeeId]/page.tsx>),
Bereich `EmergencyContactsCard`). Entweder anbinden (analog zu den
Info-Anfragen) oder die Bearbeiten-Ansicht entfernen.

### 3.7 Hauptstandort-Auswahl in den Einstellungen ist hartcodiert
Der Select „Hauptstandort" bietet fest „Berlin / Hamburg / München" an, statt
die echten Standorte des Mandanten zu laden
([components/Navigation.tsx](components/Navigation.tsx), Panel `company`).

### 3.8 Keine Pagination
Mitarbeiterliste, Dateien- und Urlaubslisten laden immer alle Datensätze.
Ab einigen hundert Mitarbeitern spürbar.

### 3.9 Dashboard-Layout lädt zu viel
[app/(dashboard)/layout.tsx](<app/(dashboard)/layout.tsx>) lädt bei jedem Request
die vollständigen Einstellungen inkl. Adresse für **alle** Mandanten des Nutzers.
Schlankere Select-Query oder Nachladen beim Öffnen des Drawers.

### 3.10 Rate-Limit ist prozesslokal
[lib/rate-limit.ts](lib/rate-limit.ts) hält die Zähler im Speicher. Das schützt
eine Instanz, aber nicht einen Cluster. Bei mehreren Instanzen zusätzlich am
Reverse Proxy begrenzen oder auf Redis/DB umstellen.

### 3.11 Testabdeckung ausbauen
Vorhanden: 27 Unit-Tests für Datei-ACL, Storage-Key-Erzeugung,
Schichtvorlagen-Validierung und Rate-Limit.
Es fehlen: Integrationstests gegen eine Test-DB (besonders für
`requireTenantAccess` — die zentrale Autorisierungsgrenze) und ein
Playwright-Smoke-Test (Login → Dashboard → Mitarbeiter anlegen).

---

## 4. 🟠 Betrieb — **[DU]** + **[CODE]**

### 4.1 Error-Tracking fehlt
Kein Sentry installiert; [app/error.tsx](app/error.tsx) und
[app/global-error.tsx](app/global-error.tsx) loggen nur in die Konsole.
**[DU]:** Sentry-Konto (EU-Region) + DSN. **[CODE]:** Danach ist die Integration
von `@sentry/nextjs` ein kleiner Schritt.

### 4.2 Strukturiertes Logging
Aktuell nur `console.*`. Für Produktion mindestens Request-IDs und JSON-Logs
erwägen, damit Fehler zuordenbar bleiben.

### 4.3 Google/Apple-Login (optional)
Code ist fertig ([lib/auth.ts](lib/auth.ts)), die Buttons bleiben deaktiviert,
bis `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` bzw. die Apple-Keys gesetzt sind.

---

## 5. ⚪ Kleinigkeiten

- **E-Mail-Adresse ändern:** Auf der neuen Konto-Seite bewusst schreibgeschützt.
  better-auth kann `changeEmail` mit Bestätigungsmail — sinnvoll erst nach 1.1.
- **Profilbild:** Das Feld `User.image` existiert, es gibt keinen Upload.
  Der irreführende Button „Foto ändern" wurde entfernt.
- **Persönliche Einstellungen** (Sprache, Zeitzone, Startseite, Datumsformat,
  Dark Mode): Die Schalter wurden entfernt, weil nichts davon gespeichert oder
  ausgewertet wurde. Für eine echte Umsetzung fehlt eine `UserPreference`-Tabelle.
- **Integrationen** (DATEV, Kalender-Sync, REST-API): Der Bereich zeigt jetzt
  ehrlich „keine Integrationen verfügbar" statt erfundener Verbindungen.

---

## Was bereits erledigt ist

Zur Einordnung — diese Punkte aus `To-Do-All.md` sind umgesetzt und verifiziert:

**Attrappen beseitigt (waren der kritischste Befund):**
- „Info anfragen" speichert jetzt wirklich (Service, Action, Audit-Eintrag) und
  der Button ist überhaupt erst eingebunden — vorher war er toter Code
- Krankmeldungen haben einen vollständigen Lebenszyklus: bearbeiten,
  AU-Status setzen, beenden (vorher nur anlegen, `status`/`closedAt` tot)
- Urlaubs-Drawer speichert Zeitraum und Notiz statt eines 350-ms-Timers
- Schichtvorlagen werden im Mandanten gespeichert und lassen sich beim Anlegen
  einer Schicht per Klick übernehmen; die funktionslose Template-Liste ist weg
- Der Fake-Speichern-Button (`DrawerFooter`) wurde vollständig entfernt

**Ehrlichkeit in den Einstellungen:**
- Erfundene Stripe-Subscription, Rechnungen, Kreditkarte und Integrationen
  durch den tatsächlichen Stand ersetzt
- Rollen-Panel verweist auf die echte Rollenverwaltung statt Klick-Attrappen
- In-App-Benachrichtigungen und die Ereignis-Schalter greifen jetzt wirklich
- `employeeNumberRequired` wird durchgesetzt (Feld im Anlegen-Formular +
  serverseitige Prüfung)

**Echte Bugs gefunden und behoben:**
- Das Speichern der Sicherheits-Einstellungen setzte die Audit-Aufbewahrung
  wegen falscher Feldnamen **immer auf 24 Monate zurück** — betraf die einzige
  Einstellung, die tatsächlich wirksam ist (DSGVO-Retention)
- Die CI war bereits **rot** (ESLint-Fehler in `Navigation.tsx`, setState im
  Effect) — behoben, dazu alle verbliebenen Warnungen
- `tailwind.config.js` war vollständig auskommentiert, wurde aber noch von
  `globals.css` referenziert — beides bereinigt

**Neu gebaut:**
- Konto-Seite `/konto`: Anzeigename ändern, Passwort ändern (inkl. „andere
  Sitzungen abmelden"), Konto löschen mit Schutz gegen verwaiste Mandanten
- Registrierung leitet auf `/confirm`, sobald die Verifizierung aktiv ist
- Rate-Limiting für alle eigenen API-Routen
- Audit-Logging in Rollen-, Team-, Standort- und Vertrags-Service
- Vitest mit 27 Tests, CI um Test-Schritt und Drift-Prüfung erweitert,
  Dependabot eingerichtet

**Aufgeräumt:**
- Alle Demo-Datensätze (14 Fake-Mitarbeiter mit erfundener IBAN, SV-Nummer und
  Gehältern, Demo-Standorte und -Teams) entfernt
- Der hartcodierte Name „Carla Brandt" wurde in die Standort-Historie
  geschrieben — nutzt jetzt den echten Nutzernamen
- Personalnummern sind gegen Doppelvergabe abgesichert (Unique-Constraint +
  Wiederholung bei Kollision)
- Persönliche Entwickler-IPs aus dem Repository entfernt (jetzt über
  `DEV_LAN_ORIGINS`/`DEV_LAN_HOSTS`), CSP auf den konfigurierten S3-Endpoint
  eingegrenzt statt `https:` pauschal
