# To-Do-All — Vollständige Restanten-Liste

Ergebnis einer Komplett-Analyse des Projekts (Stand: 02.08.2026).

> **⚠️ Dieses Dokument ist der Analyse-Stand VOR der Umsetzung.**
> Ein großer Teil ist inzwischen erledigt. **Die aktuelle Liste des Offenen
> steht in [To-Do-Offen.md](To-Do-Offen.md)** — dort auch eine Zusammenfassung
> des Umgesetzten. Dieses Dokument bleibt als Befund-Protokoll erhalten.
>
> Korrektur zum ursprünglichen Befund: Die Aussage „ESLint sauber" war falsch.
> ESLint meldete bereits damals einen **Fehler** in `Navigation.tsx`
> (setState im Effect), die CI war also rot. Das ist inzwischen behoben.

Ergänzt `TODO-USER.md` (Benutzer-/Infrastruktur-Aufgaben) um alle im Code gefundenen Lücken.

Legende: 🔴 Blocker · 🟠 Wichtig · 🟡 Mittel · ⚪ Niedrig

---

## 1. 🔴 Blocker vor Livegang (Infrastruktur & Entscheidungen)

Details in `TODO-USER.md` — hier nur die Kurzliste mit Fundstellen:

| # | Aufgabe | Wo |
|---|---------|-----|
| 1.1 | SMTP-Zugangsdaten besorgen (Versand-Code ist fertig) | `.env`: `SMTP_HOST/PORT/USER/PASSWORD/FROM`; Code: `lib/email.ts` |
| 1.2 | PostgreSQL bereitstellen + Provider umstellen | `prisma/schema.prisma:6` (`provider = "sqlite"`), `lib/auth.ts:112` (`prismaAdapter … provider: "sqlite"`) |
| 1.3 | Migrations-Historie neu aufsetzen (SQLite-Dialekt + Drift durch `db push`) | `prisma/migrations/` (18 Migrationen, Stand ≠ Schema) |
| 1.4 | Produktions-Secrets setzen: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CRON_SECRET`; **S3-Keys rotieren** (liegen im Klartext in lokaler `.env`) | `.env` / Secret-Store des Hosters; Startup-Checks: `lib/auth.ts:18-33` |
| 1.5 | S3-Bucket `hr-documents`: serverseitige Verschlüsselung + Versionierung aktivieren | OVH-Panel |
| 1.6 | Cron-Scheduler einrichten: täglich `GET /api/cron/cleanup` mit `Authorization: Bearer $CRON_SECRET` | `app/api/cron/cleanup/route.ts` |
| 1.7 | Billing entscheiden (Stripe o. ä.) — aktuell reine Anzeige ohne Zahlung | siehe Punkt 3.6 |
| 1.8 | Domain, Hosting (EU + AVV), HTTPS, DNS | `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS` |
| 1.9 | DB-Backups + Restore-Test beim Anbieter | extern |

---

## 2. 🔴/🟠 UI-Attrappen — sieht fertig aus, speichert aber nichts

Der gefährlichste Befund-Typ: Buttons/Formulare, die „Wird gespeichert…" anzeigen und dann **nichts persistieren**. Vor Launch entweder anbinden oder entfernen/deaktivieren.

- **2.1 🔴 „Info anfragen" (Mitarbeiterakte)** — Formular schließt nach `setTimeout(350ms)`, es wird nichts gespeichert und keine Mail versendet.
  Wo: `components/EmployeeInfoRequestButton.tsx:19-26` (Fake-Submit), Anzeige der (immer leeren) Anfragen: `app/(dashboard)/u/[tenant]/employees/[employeeId]/page.tsx:195`
- **2.2 🔴 Urlaubsantrag-Detail-Drawer „Speichern"** — editierbare Felder (Zeitraum etc.) + Fake-Speichern-Button; Änderungen gehen verloren. (Genehmigen/Ablehnen über `AbsenceActionButtons` funktioniert dagegen echt.)
  Wo: `components/ActionDrawers.tsx:761-851` (`VacationDrawerButton`), Fake-Footer: `components/ActionDrawers.tsx:118-149` (`DrawerFooter`)
- **2.3 🔴 Krankmeldungs-Drawer „Speichern"** — gleicher Fake-Footer.
  Wo: `components/ActionDrawers.tsx:678-757` (`SicknessDrawerButton`)
- **2.4 🟠 Schicht-Einstellungen / Schichtvorlagen** — Presets (Früh/Tag/Spät) leben nur im `useState`, Fake-Speichern; nach Reload alles weg.
  Wo: `components/ActionDrawers.tsx:853-1330` (`ShiftSettingsDrawerButton`), DB-Modell dafür fehlt komplett
- **2.5 🔴 Krankmeldungen können nie bearbeitet/geschlossen werden** — es existiert nur `createTenantSicknessReport`; die Schema-Felder `status`, `closedAt`, `certificateStatus` (AU eingegangen?) werden nach dem Anlegen **nie** aktualisiert. Kein Update-, Schließen-, Korrektur- oder Lösch-Flow.
  Wo: `lib/sickness.ts:62` (einzige Schreibfunktion), `prisma/schema.prisma:355-376` (`TenantSicknessReport`), `app/(dashboard)/u/[tenant]/krankheit/actions.ts` (nur Create-Action)

---

## 3. 🟠 Einstellungs-Schalter ohne Funktion (gespeichert, aber nirgends ausgewertet)

Alle folgenden Werte werden im Einstellungs-Drawer (`components/Navigation.tsx`) angezeigt, über `app/(dashboard)/u/[tenant]/einstellungen/actions.ts` gespeichert (`lib/settings-service.ts`) — aber **keine einzige Stelle im Code liest sie zur Durchsetzung**. Irreführend gegenüber Kunden: Funktion bauen oder Schalter ausblenden.

| Setting (Schema: `prisma/schema.prisma:147-173`) | Versprochene Funktion | Status |
|---|---|---|
| `mailNotifications` | E-Mail-Benachrichtigungen | kein Versand-Code vorhanden |
| `inAppNotifications` | In-App-Hinweise | `/api/me/notifications` ignoriert das Flag |
| `mobilePush` | Push aufs Handy | keinerlei Push-Infrastruktur |
| `deadlineAlerts` | Frist-Warnungen (Dokumente/Erinnerungen) | kein Trigger/Job |
| `absenceAlerts` | Abwesenheits-Warnungen | nicht ausgewertet |
| `shiftAlerts` | Schicht-Warnungen | nicht ausgewertet |
| `digestTime` | Wochen-Digest | kein Digest-Job |
| `billingNotifications` | Rechnungs-Mails | wird **nirgends** gelesen (einziges Feld ganz ohne Referenz) |
| `sessionTimeout` | automatische Abmeldung | Session-Dauer kommt fix von better-auth |
| `twoFactorRequired` | 2FA-Pflicht | 2FA existiert nicht (Beschreibungstext noch in `components/Navigation.tsx:497`) |
| `employeeNumberRequired` | Personalnummer-Pflicht | Nummer wird immer auto-generiert, Flag ignoriert (`lib/employee-service.ts:588-589`) |
| `archiveFormerEmployees` | Ehemalige archivieren | Löschen ist **hart** inkl. S3-Purge (`lib/employee-service.ts:881-893`); Archiv-Status/-Flow fehlt |

Tatsächlich genutzt werden nur: `auditRetentionMonths` (Cron-Cleanup), `weekStart` (`lib/shift-service.ts`), `vacationDays` (`lib/contract-service.ts`, `employees/actions.ts`).

---

## 4. 🟠 Fehlende Features (Produktentscheidung → dann bauen)

- **4.1 Mitarbeiter-Self-Service** — Verknüpfung Konto↔Akte ist vorbereitet (`TenantEmployee.userId`, `prisma/schema.prisma:300`; wird beim Einladungs-Annehmen per E-Mail-Abgleich gesetzt, `lib/invitation-service.ts`). Aber: keine einzige Self-Service-Ansicht (eigene Urlaubsanträge, Krankmeldung, eigene Dokumente/Abrechnungen).
  ⚠️ Folgeproblem: Ein eingeladener `EMPLOYEE` ohne zugewiesene Rolle bekommt auf praktisch **allen** Tenant-Seiten `FORBIDDEN` (`lib/tenant-access.ts:64`) und landet auf der Fehlerseite — es gibt keine sinnvolle Lande-Ansicht für normale Mitarbeiter.
- **4.2 Benachrichtigungs-/E-Mail-System** — außer Auth-Mails (Reset/Verify/Einladung) wird nie eine Mail versendet. Keine Erinnerungs-Fälligkeit, keine Urlaubs-Entscheidung-Mail, kein Digest. `/api/me/notifications` aggregiert nur live beim Abruf (`app/api/me/notifications/route.ts`), nichts wird gespeichert oder zugestellt.
- **4.3 Konto-Verwaltung (UI fehlt komplett)** — kein Passwort ändern, keine E-Mail-Änderung, kein Name/Avatar bearbeiten, kein „Konto löschen" (Server-seitig aktiviert: `lib/auth.ts:128-131`, aber `deleteUser`/`changePassword`/`updateUser` werden in keiner Komponente aufgerufen).
- **4.4 2FA** — nicht vorhanden (Entscheidung: better-auth `twoFactor`-Plugin, TOTP).
- **4.5 Feldverschlüsselung sensibler Daten** — `iban`, `socialSecurityNumber`, `taxId`, `healthInsurance` liegen im Klartext (`prisma/schema.prisma:309-312`). Key-Management entscheiden (env-Key vs. KMS).
- **4.6 Billing/Stripe** — `plan`/`billingCycle` reine Anzeige (`components/Navigation.tsx:631, 878-879`; `einstellungen/actions.ts:47-48, 179-180, 237-238`). Kein Checkout, keine Webhooks, kein Feature-Gating, keine Plan-Limits (z. B. max. Mitarbeiter).
- **4.7 Lohnabrechnungen (Payroll)** — nur Demo-Typen; `payrollStatementsJson` wird bei Anlage leer initialisiert und nie befüllt (`lib/employee-service.ts:632`). Kein Upload-/Zuordnungs-Flow. Permission-Area `payroll` existiert bereits (`lib/tenant-access.ts:5`).
- **4.8 E-Mail-Verifizierungs-Redirect** — Registrierung leitet direkt weiter (`components/auth/RegisterForm.tsx:54,75`); sobald SMTP aktiv ist (Verifizierungspflicht!), sollte auf `/confirm?email=…` geleitet werden (`app/(auth)/confirm/page.tsx` existiert schon).
- **4.9 Google/Apple-Login** — Code fertig (`lib/auth.ts:74-101`), Buttons deaktiviert bis Credentials da sind (`components/auth/LoginForm.tsx:98, 258, 281`).
- **4.10 Tenant-Datenexport** — `/api/me/export` exportiert nur das eigene Konto. DSGVO-tauglicher Export ganzer Personalakten (Betroffenenauskunft durch HR, CSV/JSON) fehlt.

---

## 5. 🔴 Rechtstexte — Platzhalter füllen (Anwalt/DSB)

- **5.1 Impressum** `app/(legal)/impressum/page.tsx` — Platzhalter Zeilen 17-62: Firmenname/Rechtsform, Anschrift, Geschäftsführung, Telefon, E-Mail, Registergericht, HRB, USt-IdNr., Verantwortliche(r)
- **5.2 Datenschutzerklärung** `app/(legal)/datenschutz/page.tsx` — Zeilen 20, 33, 78, 90, 116, 120: Verantwortlicher, Log-Speicherdauer, Hosting-Anbieter, E-Mail-Dienstleister, Datenschutz-Kontakt, Stand-Datum
- **5.3 AGB** `app/(legal)/agb/page.tsx` — Zeilen 19, 32, 39, 44, 60, 65, 72, 76: Firmenname, SLA, Laufzeit/Kündigung, Preise, Backup/Export-Regelungen, Haftung, Gerichtsstand, Stand-Datum
- **5.4 Dokumente (kein Code):** AVV-Vorlage für Kunden (Ployo = Auftragsverarbeiter!), AVV mit OVH + Hoster, Verarbeitungsverzeichnis (Art. 30), TOM-Dokument, DSFA-Prüfung (Gesundheitsdaten → sehr wahrscheinlich nötig)

---

## 6. 🟠 Demo-/Beispieldaten & toter Code entfernen

Die Seiten nutzen inzwischen echte DB-Services — aber die alten Demo-Datensätze liegen noch als tote Exporte im Bundle (Risiko bei versehentlichem Re-Import, enthalten realistische Fake-Personendaten):

- **6.1** `lib/employees.ts:146-451` — Demo-Defaults: Dokumente, Dateien, Notfallkontakte („Clara Wagner"), Lohnabrechnungen mit Gehältern, Info-Anfragen, Schichten, Timeline; `makeEmployee` mit Fake-IBAN `DE89 3704…`, Fake-SV-Nummer, Fake-Steuer-ID
- **6.2** `lib/employees.ts:452-638` — `export const employees` (14 Demo-Mitarbeiter) + `getEmployeeById:649`; **behalten**: Typen + `employeeStatusConfig:640`
- **6.3** `lib/locations.ts:105-352` — `defaultTeam/defaultActivity/defaultFiles/defaultShiftPlan` + `export const locations:251` (Demo-Standorte), `locationMetrics:354`, `getLocationById:382`; **behalten**: Typen (+ ggf. Metrik-Helfer prüfen)
- **6.4** `lib/teams.ts:25-271` — `export const teams:25`, `teamMetrics:217`, `teamAssignableEmployees:246`, `getTeamById:273`; **behalten**: Typen
- **6.5** `tailwind.config.js` — Datei ist komplett auskommentiert (Tailwind 4 wird über `app/globals.css` konfiguriert) → löschen
- **6.6** Magic String `"noch nicht hochgeladen"` als Sentinel zwischen Service und Seite gekoppelt — `lib/employee-service.ts:318` ↔ `app/(dashboard)/u/[tenant]/employees/[employeeId]/page.tsx:581, 606` → Konstante/Flag daraus machen

---

## 7. 🟡 Code-Qualität & technische Schulden

- **7.1 Keine Eingabe-Validierungsschicht** — `zod` ist nicht installiert (`package.json`); alle ~35 Server Actions validieren per Hand (`formString`-Trimmen), z. B. `app/(dashboard)/u/[tenant]/employees/actions.ts`, `krankheit/actions.ts:12-16`. → Zod-Schemas pro Action.
- **7.2 Fehler-UX: Actions werfen Errors** statt strukturierte Rückgaben — `useActionState` wird **nirgends** verwendet; Nutzer sehen bei Validierungsfehlern die generische Fehlerseite (`app/error.tsx`) statt Feld-Fehlern.
- **7.3 Legacy-JSON-Spalten bereinigen** —
  `TenantLocation`: `teamJson`, `activityJson`, `fileFoldersJson`, `filesJson`, `shiftPlanJson` (`prisma/schema.prisma:279-283`);
  `TenantEmployee`: `documentsJson`, `fileFoldersJson`, `filesJson`, `emergencyContactsJson`, `payrollStatementsJson`, `infoRequestsJson`, `shiftsJson`, `timelineJson`, `contractDetailsJson` (`prisma/schema.prisma:327-335`) → in echte Tabellen normalisieren oder streichen.
- **7.4 Denormalisierte Strings statt Relationen** — `TenantEmployee.location/team/role` sind Freitext (`prisma/schema.prisma:313-315`); `TenantTeamMember` kopiert `name/location/role/contract` (`prisma/schema.prisma:241-259`); `TenantLocation.lead*`-Felder ebenso. Umbenennungen laufen auseinander (kein Update-Propagieren).
- **7.5 Audit-Logging unvollständig** — `recordTenantAudit` fehlt in: `lib/role-service.ts`, `lib/team-service.ts`, `lib/location-service.ts`, `lib/contract-service.ts`, `lib/shift-service.ts`, `lib/wish-free-service.ts`, `lib/reminders.ts`. (Abgedeckt: employee, invitation, settings, sickness, vacation, storage.)
- **7.6 Race-Condition Personalnummer** — `nextEmployeeNumber` prüft+vergibt ohne Constraint (`lib/employee-service.ts:533-545`); nach Postgres-Umzug: Unique-Constraint `(tenantId, employeeNumber)` + Retry.
- **7.7 Keine Pagination** — Mitarbeiterliste lädt alle Datensätze (`app/(dashboard)/u/[tenant]/employees/page.tsx:102` → `getEmployeesForTenant`); ebenso Dateien-/Urlaubslisten. Ab ein paar hundert Mitarbeitern spürbar.
- **7.8 Dashboard-Layout lädt zu viel** — bei jedem Request volle Settings inkl. Adresse für **alle** Tenants des Users (`app/(dashboard)/layout.tsx:55-97`); schlankere Select-Query / Laden erst beim Öffnen des Drawers.
- **7.9 Persönliche Dev-LAN-IPs im Repo** — `192.168.178.50/.46` in `next.config.ts:41` und `lib/auth.ts:40-41` → in env-Variable auslagern.
- **7.10 CSP nachschärfen** — `connect-src https:` und `img-src https:` erlauben jede Domain (`next.config.ts:10-13`); nach Festlegung der S3-/Asset-Domains auf konkrete Hosts einschränken.
- **7.11 Session-Cookie-Namen hardcodiert** — `proxy.ts:11-14`; bricht still, falls better-auth das Cookie-Prefix ändert.
- **7.12 Kosmetik** — `package.json` heißt noch `"frontend"`, Version `0.1.0`.

---

## 8. 🟠 Tests & CI

- **8.1 Es existiert kein einziger Test** — keine Test-Library in `package.json`, keine `*.test.*`-Dateien. Prioritäre Kandidaten (Sicherheitsrelevanz): `lib/tenant-access.ts`, `lib/file-access.ts`, `lib/invitation-service.ts`, `lib/employee-service.ts`. Empfehlung: Vitest (Unit) + ein Playwright-Smoke-Test (Login → Dashboard → Mitarbeiter anlegen).
- **8.2 CI minimal** — `.github/workflows/ci.yml` macht nur Lint + Build. Ergänzen: Test-Step, `prisma migrate diff`-Drift-Check (aktuell Drift, siehe 1.3).
- **8.3 Kein Dependabot/Renovate** — Sicherheitsupdates (better-auth, Next, Prisma) laufen manuell.

---

## 9. 🟠 Betrieb & Monitoring

- **9.1 Error-Tracking fehlt** — kein Sentry (`@sentry/nextjs` nicht installiert); `app/error.tsx`/`app/global-error.tsx` loggen nur in die Konsole. Benötigt: Sentry-Konto (EU) + DSN.
- **9.2 Kein Rate-Limit auf eigenen APIs** — better-auth limitiert nur Auth-Endpunkte (`lib/auth.ts:114-126`); `/api/me/*`, `/api/tenants*` sind ungedrosselt.
- **9.3 Strukturiertes Logging** — nur `console.*`; für Produktion mindestens Request-IDs/JSON-Logs erwägen.
- ✅ Vorhanden: Health-Check mit DB-Ping (`app/api/health/route.ts`), Retention-Cron (`app/api/cron/cleanup/route.ts`), Datenexport eigenes Konto (`app/api/me/export/route.ts`), Security-Header/CSP (`next.config.ts`), robots/sitemap, 404/Error-Pages.

---

## 10. Empfohlene Reihenfolge

1. **UI-Attrappen entschärfen** (Abschnitt 2) — entweder anbinden oder ausbauen; besonders 2.1-2.3 wirken auf Kunden wie Datenverlust.
2. **Wirkungslose Settings ausblenden oder umsetzen** (Abschnitt 3).
3. **Infrastruktur-Blocker** parallel erledigen (Abschnitt 1: SMTP, Postgres, Secrets, Cron, Rechtstexte).
4. **Krankmeldungs-Lifecycle** bauen (2.5: schließen/korrigieren/AU-Status).
5. **Validierung + Fehler-UX** (7.1/7.2) — reduziert Support-Aufwand ab Tag 1.
6. **Demo-Daten löschen** (Abschnitt 6) — schnell erledigt, senkt Risiko.
7. Danach: Self-Service, Benachrichtigungen, Billing, 2FA, Tests (Abschnitte 4/8).
