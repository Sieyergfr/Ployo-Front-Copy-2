# API-Dokumentation — Ployo (vollständig)

Stand: 2026-08-16. Ersetzt `API-Dokumentation-Mitarbeiter-App.md` und `Schichtplaner-API.md` (Inhalt beider Dateien ist hier vollständig aufgegangen, own scope wird nicht mehr separat gepflegt). Diese Datei ist **selbstständig lesbar** — kein Zugriff auf den restlichen Code des Repos nötig, um die API zu konsumieren.

**Umfang:** wirklich jedes Feature der App — Auth, Mitarbeiter-Self-Service, Schichtplanung (lesen + Manager-Schreibrechte + Vorlagen + Wunschfrei), Mitarbeiterverwaltung, Teams, Standorte, Urlaub/Krankheit (Admin-Seite), zentrale Personalakte-Dateien, Rollen/Berechtigungen, Einstellungen, Einladungen, Abrechnung/Billing, Erinnerungen, Audit-Log, Konto-Verwaltung. Einzige bewusst nicht gebaute Funktion: **Schichttausch** (auf Wunsch komplett aus dem Scope genommen, kein Endpunkt, kein Datenmodell).

## Inhaltsverzeichnis

0. [Konventionen](#0-konventionen)
1. [Auth-Flow](#1-auth-flow-apiauth)
2. [Tenant-Auflösung](#2-tenant-auflösung--account-noch-nicht-verknüpft)
3. [Mitarbeiter-Self-Service](#3-mitarbeiter-self-service-apime)
4. [Schichtplanung](#4-schichtplanung)
5. [Mitarbeiterverwaltung (Admin)](#5-mitarbeiterverwaltung-admin-apitenantstenantemployees)
6. [Teams (Admin)](#6-teams-admin-apitenantstenantteams)
7. [Standorte (Admin)](#7-standorte-admin-apitenantstenantlocations)
8. [Urlaub — Admin](#8-urlaub--admin-apitenantstenantvacation-requests)
9. [Krankheit — Admin](#9-krankheit--admin-apitenantstenantsickness-reports)
10. [Zentrale Dateien/Personalakte](#10-zentrale-dateienpersonalakte-apitenantstenantfiles)
11. [Rollen/Berechtigungen](#11-rollenberechtigungen-apitenantstenantroles)
12. [Einstellungen + Einladungen](#12-einstellungen--einladungen)
13. [Abrechnung/Billing](#13-abrechnungbilling-apitenantstenantbilling)
14. [Erinnerungen](#14-erinnerungen-apitenantstenantreminders)
15. [Audit-Log](#15-audit-log-apitenantstenantaudit)
16. [Konto + Avatar](#16-konto--avatar-apimeaccount-apimeavatar)
17. [Bekannte Lücken](#17-bekannte-lücken-bewusst-nicht-gebaut)

---

## 0. Konventionen

- **Base-URL:** `BETTER_AUTH_URL` (Prod) bzw. LAN-IP des Dev-Rechners, Port 3000 (Dev — siehe `DEV_LAN_ORIGINS`/`DEV_LAN_HOSTS` in `.env`).
- **Zwei Routen-Familien:**
  - `/api/me/*` — Konto-/Self-Service-bezogen, **kein** Tenant im Pfad (Tenant kommt, wo nötig, als Query-Param `?tenant=<slug>`). Auch die drei Manager-Schreibrouten für Schichten leben hier (Bestandsschutz, historisch zuerst gebaut).
  - `/api/tenants/[tenant]/*` — alle übrigen Admin-/Manager-Ressourcen, `tenant` (= `tenantSlug`, z. B. `"acme-gmbh"`, nicht die interne `tenantId`) sitzt im Pfad.
- **Content-Type:** `application/json` für alle Bodies (Auth-Endpunkte akzeptieren zusätzlich `application/x-www-form-urlencoded`); Datei-Uploads als `multipart/form-data` (überall vermerkt).
- **Auth-Transport:** Session-**Cookie**, kein Bearer-Token. Der eingerichtete `expoClient()` (better-auth Expo-Plugin) verwaltet das automatisch über `expo-secure-store`. Für eigene `fetch`-Aufrufe: `authClient.getCookie()` liefert den Cookie-String für den `Cookie`-Header.
- **Fehlerform (Auth-Endpunkte, Abschnitt 1):** `4xx` mit JSON-Body `{ code: string, message: string }` (better-auth `APIError`).
- **Fehlerform (alle anderen Endpunkte, Abschnitt 2–16):** einheitlich `{ error: string }`.

| Status | Bedeutung |
|---|---|
| 400 | Pflichtfeld fehlt/ungültig |
| 401 | nicht angemeldet |
| 402 | Plan-/Abo-Limit erreicht (z. B. Mitarbeiterlimit) |
| 403 | keine Berechtigung, bzw. 2FA vom Mandanten erzwungen und noch nicht erfüllt |
| 404 | Ressource nicht gefunden |
| 409 | Konflikt (z. B. Konto bereits verknüpft, Rolle noch in Benutzung) |
| 429 | Rate-Limit überschritten (`Retry-After`-Header gesetzt) |
| 503 | Stripe serverseitig nicht konfiguriert (nur Billing-Endpunkte) |

Rate-Limits sind serverseitig pro Nutzer und **pro Endpunkt einzeln** gezählt (nicht über eine Route-Familie zusammengefasst) — bei jedem Endpunkt unten separat vermerkt.

---

## 1. Auth-Flow (`/api/auth/...`)

### Registrierung & Login

| Endpunkt | Methode | Auth nötig | Request-Body | Erfolgsantwort (200) |
|---|---|---|---|---|
| `/sign-up/email` | POST | nein | `{ name, email, password, callbackURL?, rememberMe? }` | `{ token, user }` — legt sofort Session an, sofern keine E-Mail-Verifizierung erzwungen ist |
| `/sign-in/email` | POST | nein | `{ email, password, callbackURL?, rememberMe? }` | **Ohne 2FA:** `{ redirect: false, token, url: null, user }`. **Mit aktivem 2FA:** `{ twoFactorRedirect: true, twoFactorMethods: ["totp"] }` — noch **keine** Session, ein kurzlebiges Cookie (10 Min.) trägt den Pending-Zustand bis zum Verify-Call. Der `expoClient()` speichert dieses Cookie automatisch mit. |
| `/two-factor/verify-totp` | POST | nein (2FA-Pending-Cookie erforderlich) | `{ code, trustDevice? }` | `{ token, user }` — Session wird jetzt erst angelegt |
| `/two-factor/verify-backup-code` | POST | nein (2FA-Pending-Cookie erforderlich) | `{ code, trustDevice? }` | `{ token, user, session }` |
| `/sign-out` | POST | ja | — | `{ success: true }` |

Fehler bei `/sign-in/email` u. a.: `401 INVALID_EMAIL_OR_PASSWORD`, `403 EMAIL_NOT_VERIFIED` (nur falls E-Mail-Versand konfiguriert ist). Rate-Limits (aus `lib/auth.ts`): `/sign-in/email` 10/60s, `/sign-up/email` 5/60s, `/two-factor/verify-*` 5/300s.

**2FA-Erstverifizierung** läuft über denselben `/two-factor/verify-totp`-Aufruf — der Server erkennt am fehlenden `session.session`, ob es sich um Login oder Enable handelt.

**Registrierung erfordert `terms: true` im Body** (AGB-Zustimmung, serverseitig per Hook erzwungen) — ohne dieses Feld `400 { code: "BAD_REQUEST", message: "Den Nutzungsbedingungen muss zugestimmt werden." }`. Bei erfolgreicher Zustimmung wird `User.termsAcceptedAt` gesetzt (Compliance-Audit-Trail).

### Passwort

| Endpunkt | Methode | Auth nötig | Request-Body | Erfolgsantwort |
|---|---|---|---|---|
| `/request-password-reset` | POST | nein | `{ email, redirectTo? }` | `{ status: true, message }` — immer 200, unabhängig davon ob die E-Mail existiert (Timing-Schutz) |
| `/reset-password` | POST | nein | `{ newPassword, token }` (Token aus dem E-Mail-Link, z. B. via Deep Link `ployo://reset-password?token=...`) | `{ status: true }` |
| `/change-password` | POST | ja | `{ currentPassword, newPassword, revokeOtherSessions? }` | `{ token: string \| null, user }` |

`redirectTo` unterliegt dem Origin-Check gegen `trustedOrigins` — `ployo://` ist dort bereits eingetragen.

### Konto & Zwei-Faktor (better-auth-Endpunkte — für Namen/Passwort/Löschung außerhalb von better-auth siehe Abschnitt 16)

| Endpunkt | Methode | Auth nötig | Request-Body | Erfolgsantwort |
|---|---|---|---|---|
| `/update-user` | POST | ja | `{ name?, image? }` (kein `email` — dafür `/change-email`) | `{ status: true }` |
| `/get-session` | GET | ja | — | `{ session, user } \| null` |
| `/two-factor/enable` | POST | ja | `{ password }` (bzw. leer falls `allowPasswordless`) | `{ totpURI, backupCodes: string[] }` |
| `/two-factor/disable` | POST | ja | `{ password }` | `{ status: true }` |
| `/two-factor/get-totp-uri` | POST | ja | `{ password }` | `{ totpURI }` |
| `/list-sessions` | GET | ja | — | `Session[]` — aktive Geräte/Sitzungen |
| `/revoke-other-sessions` | POST | ja | — | `{ status: true }` |

`User`-Objekt (überall gleich): `{ id, name, email, emailVerified, image, twoFactorEnabled, createdAt, updatedAt }`.

Social Login (Google/Apple, `/sign-in/social`) ist serverseitig konfiguriert, hier bewusst nicht vertieft.

---

## 2. Tenant-Auflösung & "Account noch nicht verknüpft"

#### `GET /api/tenants`
Liste der Betriebe, denen der eingeloggte Nutzer angehört.
- Auth: Session-Cookie, sonst `401`.
- Response `200`: `{ tenants: [{ id, slug, name, industry, primaryColor, logoUrl, role }] }` — `role` ist `OWNER|ADMIN|HR|EMPLOYEE`.

*(`POST /api/tenants` legt einen neuen Betrieb an — Onboarding, nicht Teil dieser Doku. `GET /api/tenants/slug?slug=` prüft Verfügbarkeit einer Arbeitsbereich-URL.)*

#### `GET /api/tenants/[tenant]/export`
Vollständiger GDPR-Datenexport des Mandanten (nur `settings:read`+`canViewAudit` o. Ä. — Admin-Funktion, Details siehe Route selbst).

#### `GET /api/avatar/[userId]`
- Auth: Session-Cookie, sonst `401` (leerer Body).
- Kein Tenant-/Owner-Check — jeder eingeloggte Nutzer kann jedes Avatar-Bild per User-ID laden (bewusst, da nicht sensibel).
- Response: rohe Bilddaten (kein JSON), `content-type` vom S3-Objekt, `cache-control: private, max-age=86400`; `404` (leer) falls kein Avatar gesetzt.

Ein `User` (Login) ist **nicht zwingend 1:1** mit einem `TenantEmployee` (Personalakte) verknüpft:

1. Nach Login → `GET /api/tenants` → Tenant wählen/auto-selektieren.
2. Für Mitarbeiter-Self-Service-Funktionen prüft der Server zusätzlich, ob es zum eingeloggten `userId` **innerhalb dieses Tenants** einen `TenantEmployee`-Datensatz gibt. Gibt es keinen: `409 { error: "Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden." }`.
3. In diesem Fall: `POST /api/me/employee-link` (Abschnitt 3) — entweder eine neue Personalakte anlegen (`mode: "create"`) oder eine bestehende, noch nicht verknüpfte übernehmen (`mode: "link"`).

---

## 3. Mitarbeiter-Self-Service (`/api/me/*`)

Alle Endpunkte in diesem Abschnitt: Auth = Session-Cookie (sonst `401`), Fehlerform `{ error }`. `tenant` überall Query-Param mit dem `tenantSlug`.

#### `GET /api/me/overview?tenant=<slug>`
Dashboard-Screen in einem Aufruf: Personalakte-Übersicht + aktuelle Woche.
```json
{
  "employee": { "id", "name", "initials", "role", "location", "team", "status",
                "startDate", "vacationRemaining", "vacationTotal", "vacationTaken" } | null,
  "vacationRequests": [{ "id", "startDate", "endDate", "days", "status", "note" }],
  "sicknessReports": [{ "id", "startDate", "endDate", "status", "note" }],
  "documents": [{ "id", "name", "documentType", "updatedAt" }],
  "infoRequests": [{ "id", "title", "message", "requestedBy", "requestedAt", "dueAt",
                      "fileRequested", "status" ("open"|"uploaded"|"review"|"cancelled"),
                      "responseMessage", "respondedAt", "hasResponseFile" }],
  "profileFields": { "birthDate", "birthPlace", "nationality", "maritalStatus", "phone",
                      "privateAddress": {"street","houseNumber","postalCode","city","careOf","country"},
                      "taxId", "socialSecurityNumber", "healthInsurance", "iban",
                      "emergencyContacts": [{"id", "..."}] } | null,
  "profileCompleteness": { "percent", "filledCount", "totalCount", "missingLabels": [] } | null,
  "currentWeek": { "label", "range", "days": [{ "id", "weekday", "date", "isWeekend",
                    "shifts": [{ "id", "startTime", "endTime", "time", "location", "note" }] }] } | null
}
```
`employee: null` ⇒ Account noch nicht verknüpft (Abschnitt 2). `documents` enthält **keine** Download-URL — dafür `GET /api/me/documents/[fileId]/download`. Rate-Limit 60/60s.

#### `POST /api/me/vacation-requests`
Quick Action "Urlaub beantragen" (eigener Antrag). Body: `{ tenant, startDate, endDate, note? }` (`YYYY-MM-DD`). `201`: `{ request: { id, key, startDate, endDate, days, status: "pending", note, ... } }`. `400` bei Datum in der Vergangenheit/Ende vor Start. Rate-Limit 20/Stunde. Löst eine Manager-Benachrichtigung aus.

#### `POST /api/me/sickness-reports`
Quick Action "Krankheit melden" (eigene Meldung). Body: `{ tenant, startDate, endDate?, note?, attachmentFileId? }`. `attachmentFileId` optional — zuerst `POST /api/me/documents` mit `documentType: "Krankmeldung"`, die zurückgegebene `id` hier mitschicken (verlinkt automatisch, `certificateStatus` wird `"received"`). `201`: `{ report: {...} }`. Rate-Limit 20/Stunde.

#### `POST /api/me/documents`
Quick Action "Datei hochladen" / Personalakte-Upload. **`multipart/form-data`**, Felder: `tenant`, `file`, `documentType` (nur `"Krankmeldung"` oder `"Sonstiges"` — HR-reservierte Typen wie "Vertrag" sind über Self-Service nicht setzbar), `description?`. Limits: 15 MB, erlaubte Endungen `pdf, png, jpg, jpeg, webp, heic, doc, docx, xls, xlsx, ppt, pptx, txt, csv, zip`. `201`: `{ document: { id, name, documentType, updatedAt } }`. Rate-Limit 10/Stunde.

#### `PATCH /api/me/info-requests/[requestId]`
Eigene Info-Anfrage beantworten. **`multipart/form-data`**, Felder: `tenant` (Pflicht), `message?`, `file?`. `file` ist Pflicht, sobald die Anfrage `fileRequested: true` hat (sonst `400 "Bitte eine Datei hochladen."`). Status danach: `"uploaded"` mit Datei, sonst `"review"` (Admin muss reine Textantwort noch sichten). `409` falls Anfrage bereits `"cancelled"`. `404` falls nicht gefunden/nicht die eigene. `200 { "infoRequest": {...} }`. Rate-Limit 20/Stunde.

#### `GET /api/me/documents/[fileId]/download?tenant=<slug>`
Signierte, 5 Minuten gültige S3-Download-URL für ein **eigenes** Dokument (harte Eigentümer-Prüfung). `200`: `{ url }`. `404` falls nicht gefunden/nicht eigenes. Rate-Limit 60/60s.

#### `PATCH /api/me/profile`
Eigene Personalakte-Felder aktualisieren (Partial-Update). Body: `{ tenant, ...Partial<profileFields wie in /overview> }`. `name`/`email` **nicht** änderbar (HR-only). `200 { status: true }`. Rate-Limit 30/Stunde.

#### `POST /api/me/employee-link`
Account-Verknüpfung (Abschnitt 2). Body entweder:
- `{ tenant, mode: "create", firstName, lastName, email }` → legt neue Personalakte an und verknüpft sie, `201 { employee }`
- `{ tenant, mode: "link", employeeId }` → übernimmt eine bestehende, noch nicht verknüpfte Personalakte, `200 { status: true }`

`409` falls Konto bereits verknüpft bzw. Ziel-Personalakte schon an ein anderes Konto gebunden. `402` falls Mitarbeiterlimit erreicht (nur `mode: "create"`).

#### `DELETE /api/me/employee-link?tenant=<slug>`
Eigene Verknüpfung aufheben. `200 { status: true }`.

#### `GET /api/me/preferences` / `PATCH /api/me/preferences`
Sprache/Zeitzone/Datumsformat + persönliche Benachrichtigungs-Toggles. **Kein** `tenant`-Parameter — kontoweit.
```json
{ "preferences": { "language", "timezone", "startPage", "dateFormat",
                    "notifyVacationEvents": true, "notifyShiftEvents": true, "pushEnabled": true } }
```
`PATCH` ist Partial-Update; nicht gesendete Booleans bleiben unverändert (nicht `true` zurückgesetzt). Rate-Limit 30/Stunde (nur PATCH).

#### `GET /api/me/notifications-feed?tenant=<slug>&unreadOnly=true` / `POST .../[id]/read` / `POST .../read-all`
Persistierter In-App-Posteingang (Urlaubs-Entscheidungen, eigene Schicht-Änderungen). `200`: `{ notifications: [{ id, category: "vacation"|"shift"|"system", title, detail, read, createdAt }] }`, neueste zuerst, max. 50 (`limit`-Query, Obergrenze 100). Rate-Limit 120/60s (GET). `read`/`read-all`: `200 { status: true }`, `404` bei `read` falls nicht gefunden/nicht eigene.

#### `GET /api/me/notifications?tenant=<slug>` — **Namensverwirrung vermeiden**
Das ist der **admin-seitige** Feed (pending Urlaubsanträge, fällige Fristen, Schichtkonflikte — live berechnet, kein Read-Status), **nicht** derselbe wie `notifications-feed` oben. Beide existieren parallel.

#### `POST /api/me/push-subscriptions` / `DELETE ...?token=<token>`
Geräte-Token registrieren/entfernen. Body `{ token, platform? }` (`"ios"`/`"android"`, Default `"ios"`). `201`/`200 { status: true }`. **Wichtig:** Registrierung persistiert nur — tatsächlicher Push-Versand ist ein No-Op (Abschnitt 17).

#### `GET /api/me/time-tracking?tenant=<slug>` / `POST /api/me/time-tracking` — Stempeluhr
Zeiterfassung (nur wenn der Mandant sie aktiviert hat, `TenantSettings.timeTrackingEnabled`). Kein Bereichsrecht nötig — jedes Mitglied mit verknüpfter Personalakte (sonst `409`).
- `GET` → `200 { status }` mit `{ enabled, settings: { breaksEnabled, autoBreakDeduction, clockInMode: "always"|"shift", clockInLeadMinutes }, state: "off"|"working"|"break", canClockIn, showClock, openEntry, currentBreakStartAt, clockableShift, nextShift, today: { date, workedMinutes, breakMinutes }, timeZone, serverTime }`. **`showClock: false`** heißt: Stempeluhr ausblenden (Modus „nur rund um Schichten" ohne veröffentlichte Schicht, die läuft oder innerhalb von `clockInLeadMinutes` beginnt). Rate-Limit 120/60s.
- `POST` Body `{ tenant, action: "clockIn"|"clockOut"|"breakStart"|"breakEnd" }` → `200 { status }` (neuer Status). Den Zeitpunkt setzt **der Server**. Fehler (`{ error }`): `403` Zeiterfassung aus, `409` „Sie sind bereits eingestempelt." / „Sie sind nicht eingestempelt." / „Die Pause läuft bereits." / „Es läuft gerade keine Pause." / „Pausen werden in diesem Betrieb nicht gestempelt." / „Einstempeln ist nur kurz vor oder während einer geplanten Schicht möglich.", `400` ungültige Aktion. Ausstempeln ist immer möglich und beendet eine laufende Pause mit. Rate-Limit 30/60s.

#### `GET /api/me/time-entries?tenant=<slug>&period=week|month&date=YYYY-MM-DD` (oder `&from=&to=`)
„Meine Zeiten" — tageweise Soll (veröffentlichte Schichten) vs. Ist (gestempelt). `200 { entries: { from, to, previous, next, today, timeZone, autoBreakDeduction, days: [{ date, entries: [TimeEntry], shifts: [TimeShift], workedMinutes, breakMinutes, plannedMinutes }], totals: { workedMinutes, breakMinutes, plannedMinutes, entryCount } } }`. `TimeEntry`: `{ id, date, clockInAt, clockOutAt, clockInTime, clockOutTime, breaks[], grossMinutes, clockedBreakMinutes, breakMinutes, breakDeducted, workedMinutes, isOpen, autoClosed, corrected, breakMinutesOverride, note, source: "app"|"web"|"manual", shift }` — `*Time` sind bereits Ortszeit („HH:MM"). `from`/`to` max. 93 Tage, sonst `400`. Korrekturen/Nachträge macht die Verwaltung im Web (Bereich `timeTracking`), nicht über die App.

**Push:** `entityType: "time-tracking"` — Erinnerung 5 Min. nach Schichtbeginn (nicht eingestempelt) bzw. -ende (noch eingestempelt) und „automatisch ausgestempelt". Cron: `GET /api/cron/time-tracking` alle 5 Minuten (Bearer `CRON_SECRET`).

#### `GET /api/me/export`
GDPR-Datenexport des **eigenen** Kontos (nicht des Mandanten — dafür Abschnitt 2). Rate-Limit 5/Stunde. `200`: Datei-Download, JSON `{ exportedAt, account, memberships, sessions, linkedEmployeeRecords, hinweis }` — HR-Personalakte-Daten **nicht** enthalten.

---

## 4. Schichtplanung

Enthält sowohl die reinen Lese-Endpunkte (jedes Tenant-Mitglied) als auch Manager-Schreibrechte für einzelne Schichten (`/api/me/team-shifts*`, Bestandsschutz — historisch zuerst gebaut, s. Konventionen) und die neuen Admin-Endpunkte für Vorlagen und Wunschfrei (`/api/tenants/[tenant]/*`).

### 4.1 Rollenprüfung & Zubehör

`GET /api/me/permissions?tenant=<slug>` → `200`:
```json
{
  "role": "OWNER" | "ADMIN" | "HR" | "EMPLOYEE",
  "roleName": "Standortleitung" | null,
  "isManager": true,
  "permissions": {
    "employees": "admin", "payroll": "none", "locations": "admin", "teams": "admin",
    "files": "admin", "vacation": "admin", "sickness": "admin", "shifts": "admin",
    "reminders": "admin", "audit": "admin", "roles": "admin", "settings": "admin"
  },
  "scopes": { "employees": "all", "payroll": "own", "…": "… (alle zwölf Bereiche)" },
  "canDelete": { "employees": true, "payroll": false, "…": "… (alle zwölf Bereiche)" },
  "canUploadFiles": { "employees": true, "…": "… (alle zwölf Bereiche)" },
  "canViewAudit": { "employees": true, "…": "… (alle zwölf Bereiche)" }
}
```
Immer alle zwölf Bereiche, nicht vergebene explizit `"none"`/`false`. Schreib-UI für Schichten nur zeigen, wenn `permissions.shifts` `"write"`/`"admin"` ist. `canDelete`/`canUploadFiles`/`canViewAudit` sind pro Bereich *separate* Flags, unabhängig vom allgemeinen Level (s. lib/tenant-access.ts) — z. B. `permissions.employees === "admin"` sagt nichts über `canDelete.employees` aus. Vor jedem Lösch-/Upload-/Audit-Button den passenden Flag für den jeweiligen Bereich prüfen, sonst liefert die Route trotzdem `403` (s. 4.3). `scopes.<bereich>` (`"own"` | `"team"` | `"assigned"` | `"all"`) zeigt, auf welchen Ausschnitt der Server Listen für diesen Bereich still filtert (Tenant-Manager immer `"all"`) — UI sollte das kenntlich machen (z. B. "nur eigene/Team-Einträge"), sonst wirkt eine leere/kurze Liste wie ein Bug statt wie erwartetem Scoping. Rate-Limit 60/60s.

`GET /api/me/employees?tenant=<slug>` → `200`: `{ "employees": [{ "id", "name", "location", "team", "role", "weeklyHours" }] }`. Für das Zuweisungs-Dropdown. Nur `shifts`-Leserecht nötig. Rate-Limit 60/60s.

`GET /api/me/locations?tenant=<slug>` → `200`: `{ "locations": [{ "id", "key", "name", "kind", "status", "accentClassName" }] }`. `accentClassName` = rohe Tailwind-Klasse (z. B. `"bg-[#C9622A]"`). Rate-Limit 60/60s.

### 4.2 Lesen

`GET /api/me/shifts?tenant=<slug>&year=&week=` — eigene Schichten. `year`/`week` **beide zusammen** oder beide weglassen (nur eins gesetzt wird ignoriert → laufende Woche). `200`: `{ "plan": { "label", "range", "days": [{ "id", "weekday", "date", "isWeekend", "shifts": [{ "id", "startTime", "endTime", "time", "location", "note" }] }] } | null }`. `plan: null` ⇒ nicht verknüpft. Rein lesend, kein `dbId`. Rate-Limit 120/60s.

`GET /api/me/team-shifts?tenant=<slug>&year=&week=` — "Alle Schichten". `year`/`week` hier **unabhängig voneinander** optional (anders als oben!). Own/team/all-Scope automatisch je nach Rolle, ohne Leserecht `403`. `200`:
```json
{ "plan": { "label", "range", "conflictCount": 1, "minStaffing": 3,
  "days": [{ "id": "2026-08-10", "weekday": "Mo", "date": "10.08", "isWeekend": false,
    "staffedCount": 2, "understaffed": false,
    "shifts": [{
      "id": "10-08-08-00-anna-mueller", "dbId": "clx9f...",
      "startTime": "08:00", "endTime": "16:00", "breakMinutes": 30,
      "employeeId": "cle...", "locationId": "cll...", "locationAccentClassName": "bg-[#C9622A]",
      "time": "08:00-16:00", "assignee": "Anna Müller", "location": "Berlin", "team": "Service",
      "conflict": false, "note": ""
    }]
  }]
} }
```
**Wichtigster Fallstrick:** `id` ist ein Anzeige-Key, **nicht** die Datenbank-ID. Für `PATCH`/`DELETE` unten immer **`dbId`** verwenden. Rate-Limit 120/60s.

### 4.3 Schreiben — einzelne Schichten (nur Manager, `permissions.shifts` `write`/`admin`)

`POST /api/me/team-shifts` — Schicht anlegen. Body:
```json
{ "tenant": "acme-gmbh", "date": "2026-08-17", "startTime": "08:00", "endTime": "16:00",
  "breakMinutes": 30, "employeeId": "cle...", "locationId": "cll...", "team": "Service", "note": "..." }
```
Pflicht: `tenant`, `date` (`YYYY-MM-DD`), `startTime`/`endTime` (`HH:MM`) — sonst `400`. `employeeId` leer ⇒ unbesetzt; **ungültige** `employeeId` wird still auf unbesetzt zurückgesetzt (kein Fehler). `locationId` ungültig ⇒ `404 { error: "Standort nicht gefunden." }`. `201`: `{ "shift": { "id", "key", "date", "weekday", "startTime", "endTime", "breakMinutes", "team", "note", "conflict", "tenantId", "employeeId", "locationId", "createdAt", "updatedAt" } }` — hier ist `id` die **echte DB-ID** (Gegensatz zu 4.2!). Fehlt das Recht: `403 { error: "Keine Berechtigung zum Bearbeiten von Schichten." }`. Rate-Limit 120/60s.

`PATCH /api/me/team-shifts/[shiftId]` — `shiftId` = `dbId` aus 4.2 bzw. `id` aus der `POST`-Antwort. Gleiches Body-Schema, **kein Partial-Update** (immer vollständigen neuen Stand senden). `200 { status: true }`. `404` falls unbekannt. Rate-Limit 120/60s.

`DELETE /api/me/team-shifts/[shiftId]?tenant=<slug>` — eigenständiges Lösch-Recht (`canDelete`-Flag, nicht dasselbe wie Anlegen/Ändern). `200 { status: true }`. `403 { error: "FORBIDDEN" }` falls Recht fehlt. `404` falls unbekannt. Rate-Limit 120/60s.

Bei (neuer) Mitarbeiterzuordnung wird bei allen drei Operationen automatisch eine Benachrichtigung ausgelöst (landet in `GET /api/me/notifications-feed`).

### 4.4 Schicht-Vorlagen (`/api/tenants/[tenant]/shift-templates`)

`GET /shift-templates` → `200 { "templates": [{ "id", "name", "entries": [{ "weekday", "startTime", "endTime", "breakMinutes", "team", "locationId" }] }] }`. Auth: `shifts:read`. Rate-Limit 60/60s.

`POST /shift-templates` — aktuell angezeigte Woche als Vorlage speichern. Body: `{ "year", "week", "name" }` (alle Pflicht). Auth: `shifts:write`. `400 { error: "Diese Woche enthält keine Schichten, aus denen eine Vorlage erstellt werden kann." }` falls Zielwoche leer ist. `409` bei Namenskollision (Vorlagenname ist pro Mandant eindeutig). `201 { "template": {...} }`. Rate-Limit 30/Stunde.

`PATCH /shift-templates/[templateId]` — Name + Einträge direkt bearbeiten, **voller Ersatz** der Einträge. Body: `{ "name", "entries": [{ "weekday": "Mo".."So", "startTime", "endTime", "breakMinutes", "team", "locationId" }] }`. `400` falls Name leer, `409` bei Namenskollision, `404` falls Vorlage/verwendeter Standort unbekannt. Auth: `shifts:write`. `200 { "template": {...} }`. Rate-Limit 30/Stunde.

`DELETE /shift-templates/[templateId]` — Auth: `shifts:read` + `canDelete`-Flag, sonst `403 FORBIDDEN`. `200 { status: true }`. Rate-Limit 30/Stunde.

`POST /shift-templates/[templateId]/apply` — legt für jeden Vorlagen-Eintrag eine neue, **unbesetzte** Schicht in der Zielwoche an (Mitarbeiterzuordnung wird bewusst nicht übernommen). Body: `{ "year", "week" }`. `200 { "created": <Anzahl> }`. Auth: `shifts:write`. Rate-Limit 30/Stunde.

### 4.5 Wunschfrei (`/api/tenants/[tenant]/wish-free-requests`)

`GET /wish-free-requests?dates=2026-08-17,2026-08-18` — `dates` optional (kommagetrennt). **Keine** own/team-Scope-Filterung — immer mandantenweit (bestehendes Verhalten). `200 { "requests": [{ "id", "dbId", "employeeId", "employeeName", "role", "location", "date", "dateLabel", "status", "reason", "rejectReason" }] }`. Auth: `shifts:read`. Rate-Limit 60/60s.

`POST /wish-free-requests` — Body: `{ "employeeId", "date", "reason?" }` (`employeeId`/`date` Pflicht). **Wird sofort als `"approved"` angelegt** (kein Pending-Zustand auf diesem admin-initiierten Pfad, anders als bei Urlaub). `201 { "request": {...} }`. Auth: `requireShiftManager` (Rolle OWNER/ADMIN/HR oder `shifts:write`/`admin`). Rate-Limit 60/Stunde.

`POST /wish-free-requests/[requestId]/approve` — `200 { status: true }`. `POST .../reject` — Body optional `{ "rejectReason" }`. Beide: Auth `requireShiftManager`, Rate-Limit 60/Stunde.

**Nicht verfügbar:** Kein Update/Delete für Wunschfrei-Anfragen (nur Anlegen + Entscheiden existiert in der zugrundeliegenden Logik).

---

## 5. Mitarbeiterverwaltung (Admin, `/api/tenants/[tenant]/employees`)

`employeeHandle` in allen Pfaden unten ist der sprechende `key` (nicht die DB-`id`) — dieselbe Konvention wie die Web-Dashboard-URLs. Mutations-Routen lösen intern auf die DB-`id` auf. Sensible Felder (Geburtsdatum/-ort, Steuer-ID, IBAN, Krankenkasse, Privatadresse) erscheinen redaktiert als `"•••"`, sofern der Aufrufer kein `payroll:read` im passenden Scope hat.

`GET /employees` → `200 { "employees": [Employee[]] }` — vollständige Personalakte-DTOs (own/team/all-Scope automatisch je nach Rolle). Auth: `employees:read`. Rate-Limit 60/60s.

`POST /employees` — neue Personalakte. Body (alle optional außer mind. eins von `firstName`/`lastName`/`email`): `{ firstName?, lastName?, name?, email?, phone?, employeeNumber?, location?, team?, role?, startDate?, contract?, weeklyHours?, status?, birthDate?, birthPlace?, nationality?, maritalStatus?, privateAddress?, address?, taxId?, socialSecurityNumber?, healthInsurance?, iban?, vacationRemaining?, vacationTotal?, vacationTaken?, contractType?, entryDate?, exitDate?, fixedTerm?, probation?, noticePeriod?, position?, department?, supervisor?, workLocation?, parties?, collectiveAgreement?, compensation?, workingTime?, vacation?, contractDetailsSubmitted?, emergencyContacts? }`. `400` falls weder Name noch E-Mail gesetzt. `404`-artige Fehler bei unbekanntem `location`/`team`/`role`-Freitext (`` Unbekannter Standort: "...". ``). `402` bei erreichtem Mitarbeiterlimit (Stripe-Plan). `201 { "employee": {...} }`. Auth: `requireEmployeeManager` (Rolle OWNER/ADMIN/HR oder `employees:write`). Rate-Limit 30/Stunde.

`GET /employees/[employeeHandle]` → `200 { "employee": {...} }`, `404` falls unbekannt. Auth: `employees:read`. Rate-Limit 60/60s.

`PATCH /employees/[employeeHandle]` — Partial-Update, gleiches Feld-Set wie `POST`, nur veränderte Felder senden. `200 { "employee": {...} }`. Auth: `requireEmployeeManager` + `employees:write`. Rate-Limit 60/Stunde.

`DELETE /employees/[employeeHandle]` — vollständiger, GDPR-artiger Kaskaden-Löschvorgang (Verträge, Team-/Standort-Mitgliedschaften, Dateien inkl. S3-Objekte, Personalakte selbst). `200 { status: true }`. Auth: `employees:write`. Rate-Limit 30/Stunde.

`POST /employees/[employeeHandle]/invite` — Einladung an die hinterlegte E-Mail-Adresse (Rolle immer `EMPLOYEE`). `400` falls keine E-Mail hinterlegt. `201 { "invitation": {...} }`. Auth: `requireEmployeeManager`. Rate-Limit 20/Stunde.

`GET /info-requests` → alle Info-Anfragen des Mandanten, mitarbeiterübergreifend, inkl. Status (own/team/all-Scope wie bei `employees`). Sortierung: offene zuerst, je Status neueste zuerst. `200 { "infoRequests": [{ "id", "title", "message"?, "requestedBy", "requestedAt", "dueAt", "fileRequested", "status" ("open"|"uploaded"|"review"|"cancelled"), "responseMessage"?, "respondedAt"?, "hasResponseFile", "employeeId", "employeeKey", "employeeInitials", "employeeName", "location", "team" }] }`. Auth: `employees:read`. Rate-Limit 60/60s.

`POST /employees/[employeeHandle]/info-requests` — Informationsanfrage stellen (z. B. "bitte Adresse aktualisieren"). Body: `{ "title" (Pflicht), "message"?, "dueAt"? ("YYYY-MM-DD"), "fileRequested"? }`. `400` falls `title` leer. `201 { "infoRequest": {...} }`. Auth: `requireEmployeeManager`. Rate-Limit 30/Stunde.

`PATCH /info-requests/[requestId]` — Status manuell setzen, z. B. stornieren oder eine offline erhaltene Antwort nachtragen. Body: `{ "status" (Pflicht, einer von `open`/`uploaded`/`review`/`cancelled`) }`. `400` bei ungültigem Status, `404` falls unbekannt. `200 { "infoRequest": {...} }`. Auth: `requireEmployeeManager`. Rate-Limit 60/Stunde.

`DELETE /info-requests/[requestId]` — endgültig löschen (eine ggf. verknüpfte Antwortdatei bleibt in der Personalakte erhalten). `200 { status: true }`. `404` falls unbekannt. Auth: `requireEmployeeManager`. Rate-Limit 30/Stunde.

### 5.1 Verträge (Auth: Bereich `payroll`, nicht `employees`)

`GET /employees/[employeeHandle]/contracts` → `200 { "contracts": [...] }` (own/team/all-Scope über `payroll`). Auth: `payroll:read`. Rate-Limit 60/60s.

`POST /employees/[employeeHandle]/contracts` — **`multipart/form-data`**, PDF-Pflicht. Felder: `title` (Pflicht), `startDate` (Pflicht), `file` (Pflicht, PDF), `contractType?` (Default `"Arbeitsvertrag"`), `status?` (`draft`|`active`|`terminated`|`expired`|`inactive`, Default `draft`), `endDate?`, `probationEndDate?`, `noticePeriod?`, `position?`, `department?`, `workLocation?`, `weeklyHours?`, `compensation?`, `vacationDays?` (Zahl ≥ 0), `notes?`. `201 { "contract": {...} }`. Auth: `payroll:write`. Rate-Limit 20/Stunde.

`PATCH /employees/[employeeHandle]/contracts/[contractId]` — Statuswechsel. Body: `{ "status" (Pflicht, einer der 5 Werte), "terminationDate"?, "terminationReason"? }`. **Bei `status: "terminated"` sind `terminationDate` und `terminationReason` Pflicht** (route-seitig erzwungen, wie im Dashboard). `200 { "contract": {...} }`. Auth: `payroll:write`. Rate-Limit 60/Stunde.

### 5.2 Gehaltsabrechnungen

`GET /employees/[employeeHandle]/payroll-statements` — Abrechnungen eines Mitarbeiters. `200 { "statements": [{ "id", "period", "issuedAt" (`YYYY-MM-DD`), "gross", "net", "status": "available"|"corrected", "fileId", "fileName", "createdAt" }] }`. `gross`/`net` sind Freitext (leerer String = nicht erfasst), keine Zahlen. `fileId` verweist auf das Dateien-Modul (Download über `/files/[fileId]/signed-url`). Auth: `payroll:read` inkl. Scope + Datei-ACL — wie bei `GET .../contracts`; ohne ACL-Treffer bleibt die Liste leer, statt einen Download anzubieten, den die Signed-URL-Route anschließend mit `403` verweigert. Rate-Limit 60/60s.

`POST /employees/[employeeHandle]/payroll-statements` — **`multipart/form-data`**. Felder: `period` (Pflicht, z. B. `"Januar 2026"`), `file` (Pflicht, PDF), `gross?`, `net?`. `201 { "statement": {...} }` — gleiche Form wie die `GET`-Liste. Auth: `payroll:write`. Rate-Limit 20/Stunde.

---

## 6. Teams (Admin, `/api/tenants/[tenant]/teams`)

`teamHandle` = `key`, wie bei Employees. Team-Mitglieder-`memberId` ist eine eigenständige DB-ID (nicht die Mitarbeiter-ID).

`GET /teams` → `200 { "teams": [...] }`. Auth: `teams:read` (own/team-Scope nicht unterstützt — nur `all`/`assigned`, s. u.). Rate-Limit 60/60s.

`POST /teams` — Body: `{ "name" (Pflicht), "description"?, "locations"?: string[], "colorClassName"? (Default `"bg-[#C9622A]"`), "leadEmployeeId"? }`. `400` falls `name` leer. Fehler bei unbekannter Farbe/unbekannten Standortnamen. `201 { "team": {...} }`. Auth: `requireTeamManager` (`teams:write`). Rate-Limit 30/Stunde.

`GET /teams/[teamHandle]` → `200 { "team": {...} }`, `404` falls unbekannt. Rate-Limit 60/60s.

`PATCH /teams/[teamHandle]` — Body: `{ "name" (Pflicht), "locations"?: string[], "colorClassName"? }`. **Kein** `description`/`leadEmployeeId` beim Update (nur bei Anlage setzbar). Bei Umbenennung werden alle Mitarbeiter-Datensätze mit diesem Teamnamen mitgezogen. `200 { "team": {...} }`. Auth: `requireTeamManager`. Rate-Limit 60/Stunde.

`DELETE /teams/[teamHandle]` — Auth: `teams:read` + `canDelete`-Flag, sonst `403 FORBIDDEN`. `200 { status: true }`. Rate-Limit 30/Stunde.

`GET /teams/[teamHandle]/assignable-employees` → `200 { "employees": [...] }` — Mitarbeiter, die diesem Team noch nicht angehören (für den "Mitglied hinzufügen"-Dialog). Rate-Limit 60/60s.

`POST /teams/[teamHandle]/lead` — Team-Leitung setzen. Body: `{ "memberId" }`. `404 TEAM_MEMBER_NOT_FOUND` falls unbekannt. `200 { status: true }`. Auth: `requireTeamManager`. Rate-Limit 30/Stunde.

`POST /teams/[teamHandle]/members` — Mitglied hinzufügen. Body: `{ "employeeId" (DB-`dbId`, aus `assignable-employees`), "role"? }`. `404 EMPLOYEE_NOT_FOUND`/`TEAM_NOT_FOUND`. `201 { status: true }`. Auth: `requireTeamManager`. Rate-Limit 60/Stunde.

`PATCH /teams/[teamHandle]/members/[memberId]` — Body: `{ "role" (Pflicht), "isLead"? }`. `404 TEAM_MEMBER_NOT_FOUND`. `200 { status: true }`. Auth: `requireTeamManager`. Rate-Limit 60/Stunde.

`DELETE /teams/[teamHandle]/members/[memberId]` — `404 TEAM_MEMBER_NOT_FOUND`, `400 TEAM_LEAD_CANNOT_BE_REMOVED` falls Mitglied aktuell Leitung ist (zuerst neue Leitung setzen). `200 { status: true }`. Auth: `requireTeamManager`. Rate-Limit 60/Stunde.

---

## 7. Standorte (Admin, `/api/tenants/[tenant]/locations`)

`locationHandle` = `key`.

`GET /locations` → `200 { "locations": [...] }` (nur `all`/`assigned`-Scope sinnvoll). Auth: `locations:read`. Rate-Limit 60/60s.

`POST /locations` — Body: `{ "name" (Pflicht), "kind"? (Default `"Standort"`), "status"? (Default `"active"`), "address": { "street", "houseNumber", "postalCode", "city", "careOf"?, "country"? } (**Pflicht, vollständig**), "leadEmployeeId"?, "email"?, "accentClassName"? (Default `"bg-ink"`) }`. Fehler bei ungültiger E-Mail/unbekanntem `kind`/unbekannter Farbe/unvollständiger Adresse. `201 { "location": {...} }`. Auth: `requireLocationManager` (`locations:write`). Rate-Limit 30/Stunde.

`GET /locations/[locationHandle]` → `200 { "location": {...} }`, `404` falls unbekannt. Rate-Limit 60/60s.

`PATCH /locations/[locationHandle]` — **echtes Partial-Update**: nicht mitgeschickte Felder werden serverseitig mit dem aktuellen Stand aufgefüllt (die zugrundeliegende Funktion selbst erwartet den vollständigen Datensatz inkl. Kennzahlen). Body (alles optional): `{ "name", "kind", "status", "address", "employeeCount", "activeToday", "shiftCount", "openPositions", "utilization", "utilizationCaption", "leadName", "leadInitials", "leadPhone", "leadEmail", "accentClassName" }`. `200 { "location": {...} }`. Auth: `requireLocationManager`. Rate-Limit 60/Stunde.

`DELETE /locations/[locationHandle]` — Auth: `locations:read` + `canDelete`, sonst `403 FORBIDDEN`. `200 { status: true }`. Rate-Limit 30/Stunde.

`POST /locations/[locationHandle]/employees` — Mitarbeiter zuordnen. Body: `{ "employeeIds": string[] }` (DB-`dbId`s). `400` falls leer. `200 { "location": {...} }` (mit aktualisierten Kennzahlen). Auth: `requireLocationManager`. Rate-Limit 30/Stunde.

---

## 8. Urlaub — Admin (`/api/tenants/[tenant]/vacation-requests`)

Für den eigenen Antrag als Mitarbeiter: `POST /api/me/vacation-requests` (Abschnitt 3). Dieser Abschnitt ist die Manager-Sicht auf **alle** Anträge im eigenen Scope.

`GET /vacation-requests` → `200 { "requests": [{ "id", "dbId", "key", "employeeId", "initials", "name", "location", "team", "startDate", "endDate", "startDateIso", "endDateIso", "days", "note", "status" }] }` (own/team/all-Scope). Auth: `vacation:read`. Rate-Limit 60/60s.

`POST /vacation-requests` — Antrag im Namen eines Mitarbeiters anlegen (z. B. telefonisch gemeldet). Body: `{ "employeeId" (Pflicht, DB-Id), "startDate", "endDate" (Pflicht), "note"? }`. `400` bei Datum in der Vergangenheit/Ende vor Start. `201 { "request": {...} }`. Auth: `requireVacationManager`. Rate-Limit 60/Stunde. **Kein Audit-Log-Eintrag auf diesem Pfad** (bestehende Lücke in der zugrundeliegenden Logik, nicht API-spezifisch).

`PATCH /vacation-requests/[requestId]` — Datum/Notiz korrigieren, **ändert nicht den Status** (dafür `/approve`, `/reject`). Body: `{ "startDate", "endDate" (Pflicht), "note"? }`. Vergangene Daten sind hier erlaubt (Korrektur bestehender Anträge). `200 { status: true }`. Auth: `requireVacationManager`. Rate-Limit 60/Stunde.

`DELETE /vacation-requests/[requestId]` — Auth: `vacation:read` + `canDelete`. `200 { status: true }`. Rate-Limit 30/Stunde.

`POST /vacation-requests/[requestId]/approve` bzw. `/reject` — `200 { status: true }`. Löst eine Benachrichtigung an den Mitarbeiter aus + Audit-Log-Eintrag. Auth: `requireVacationManager`. Rate-Limit 60/Stunde.

---

## 9. Krankheit — Admin (`/api/tenants/[tenant]/sickness-reports`)

Für die eigene Meldung: `POST /api/me/sickness-reports` (Abschnitt 3).

`GET /sickness-reports` → Krankheits-Dashboard, own/team/all-Scope:
```json
{
  "metrics": [{ "label", "value", "caption" }],
  "current": [{ "id", "initials", "name", "location", "since", "days", "startDateIso", "endDateIso", "certificateStatus", "note" }],
  "chart": [...],
  "history": [{ "id", "initials", "name", "location", "startDate", "endDate", "days" }]
}
```
6-Monats-Fenster, `history` auf 30 Einträge begrenzt. Auth: `sickness:read`. Rate-Limit 60/60s.

`POST /sickness-reports` — Meldung im Namen eines Mitarbeiters. Body: `{ "employeeId" (Pflicht, key oder DB-Id), "startDate" (Pflicht), "endDate"?, "certificateStatus"? (`pending`|`received`|`not-required`, Default `pending`), "reportChannel"? (`phone`|`email`|`app`|`manager`, Default `app`), "note"? }`. `404 EMPLOYEE_NOT_FOUND`, `400 INVALID_SICKNESS_DATES`. `201 { "report": {...} }`. Auth: `sickness:write`. Rate-Limit 60/Stunde.

`PATCH /sickness-reports/[reportId]` — Datum/Attest-Status/Notiz, **ändert nicht** offen/geschlossen (dafür `/close`). Body: `{ "startDate" (Pflicht), "endDate"?, "certificateStatus"?, "note"? }`. Nicht gesendete `certificateStatus`/`note` bleiben unverändert. `200 { "report": {...} }`. Auth: `sickness:write`. Rate-Limit 60/Stunde.

`POST /sickness-reports/[reportId]/close` — Body optional `{ "endDate"? }` (Default: heute). `200 { "report": {...} }`. Auth: `sickness:read` + `canDelete`. Rate-Limit 60/Stunde.

---

## 10. Zentrale Dateien/Personalakte (`/api/tenants/[tenant]/files`)

Das eigenständige "Dateien"-Modul (zentrale HR-Ablage) — **nicht** dasselbe wie die an Mitarbeiter/Standort/Team gehängten Dokumente (die stecken in den jeweiligen Detail-Antworten, z. B. `employee.files`) oder die Self-Service-Uploads (Abschnitt 3). Upload-Limits identisch zu Self-Service: 15 MB, `pdf, png, jpg, jpeg, webp, heic, doc, docx, xls, xlsx, ppt, pptx, txt, csv, zip`.

`GET /files?path=a/b` — `path` (Query, `/`-getrennt) navigiert Unterordner. `200`: `{ activeFile, activeFolder, currentFolderPath, folderOptions, folders, files, metrics, uploadOptions, visibleFiles }` (Dashboard-Format: `slug` statt `id`, `size`/`updatedAt` bereits als Anzeigetext). Nur eigene Uploads sichtbar bei `files`-Scope `own`/`team`. Auth: `files:read`. Rate-Limit 60/60s.

`GET /files?ownerType=employee|location|team&ownerId=<id>` — flache Liste der an diesen Eigentümer gehängten Dokumente, also der Dateien, die `POST /files` mit denselben Parametern anlegt. Nötig, weil der `path`-Zweig oben ausdrücklich nur die zentrale Ablage zeigt (`employeeId`/`locationId`/`teamId` alle `null`) — vorher wurden `ownerType`/`ownerId` beim Lesen still ignoriert. `200 { "files": [{ "id", "name", "documentType", "description?", "folder", "sizeBytes", "mimeType", "updatedAt" (ISO), "version" }] }`. `400` bei unbekanntem `ownerType` bzw. fehlender `ownerId`. Auth: `files:read` **und** Leserecht im Fachbereich des Eigentümers (`employees`/`locations`/`teams`), dazu Datei-ACL und der `files`-Scope auf den Uploader. `ownerType=tenant` verhält sich wie ohne Parameter.

`POST /files` — **`multipart/form-data`**. Pflicht: `file`. Optional: `ownerType?` (`tenant`|`employee`|`location`|`team`, Default `tenant`), `ownerId?`, `folderSlug?`, `folderName?`, `ownerName?`, `documentType?` (Default `"Sonstiges"`), `validFrom?`, `expiresAt?`, `reminderAt?`, `description?`, `tags?` (kommagetrennt), `assignedEmployeeId?`, `assignedLocationId?`, `accessRoleIds?`/`accessUserIds?` (mehrfach im FormData, ACL-Einschränkung). `201 { "file": {...} }`. Auth: `files:write` — bei `ownerType` `employee`/`location`/`team` zusätzlich das `canUploadFiles`-Flag des jeweiligen Bereichs. Rate-Limit 20/Stunde.

`POST /files/folders` — Body: `{ "name" (Pflicht), "ownerType"?, "ownerId"?, "parentPath"?, "ownerName"?, "locked"? }`. Reaktiviert einen inaktiven Ordner mit gleichem Pfad statt Duplikat anzulegen. `201 { "folder": {...} }`. Auth: wie `POST /files`. Rate-Limit 30/Stunde.

`POST /files/[fileId]/versions` — **`multipart/form-data`**, Feld `file` Pflicht. Neue Version, alte wird `status: "replaced"`. `201 { "file": {...} }`. Auth: `files:write` (Basis-Check, **kein** zusätzlicher Owner-Area-Check anders als beim Erst-Upload). Rate-Limit 20/Stunde.

`DELETE /files/[fileId]` — Soft-Delete (`status: "deleted"`, physisches Löschen später per Cron). `200 { "file": {...} }`. Auth: `files:write`. Rate-Limit 30/Stunde.

`GET /files/[fileId]/signed-url?version=&disposition=inline|attachment` — signierte, 5 Min. gültige URL. `200 { "url" }`. `404` falls Datei/Version fehlt, `403 FORBIDDEN` falls Datei-ACL nicht erfüllt. Auth: nur `files:read` + ACL (schwächer als Schreib-Operationen). Rate-Limit 60/60s.

---

## 11. Rollen/Berechtigungen (`/api/tenants/[tenant]/roles`)

`GET /roles` **und** `GET /roles/[roleId]` erfordern `roles:admin` (nicht nur `read` — bewusst so in der zugrundeliegenden Logik).

`GET /roles` → `200 { "roles": [{ "id", "name", "description", "isSystem", "permissions": {...}, "scopes": {...}, "canDelete": {...}, "canUploadFiles": {...}, "canEditFiles": {...}, "canViewFiles": {...}, "canViewAudit": {...}, "shiftsLevel": {...}, "members": <Anzahl> }] }` — jede Capability-Map ist `Record<Bereich-Id, Wert>`. Rate-Limit 60/60s.

`GET /api/permission-config` (nicht Tenant-gebunden, statisch) → `200 { "areas": PermissionArea[], "levels": ["none","read","write","admin"], "scopes": ["own","team","all","assigned"] }` — für den Rollen-Editor: die zwölf gültigen Bereiche mit Label/Beschreibung/`supportsScope`/`fileRelevant`/`supportsAssignedScope`. Nur Session-Pflicht, sonst keine Prüfung (reine Konstanten). Kein Rate-Limit.

`POST /roles` — Body: `{ "name" (Pflicht), "description"?, "permissions"?: Record<Bereich, Level>, "scopes"?: Record<Bereich, Scope>, "canDelete"?/"canUploadFiles"?/"canEditFiles"?/"canViewFiles"?/"canViewAudit"?: Record<Bereich, boolean>, "shiftsLevel"?: Record<Bereich, Level|null> }` — nicht angegebene Bereiche fallen auf `none`/`all`/`false` zurück. `201 { "role": {...} }`. Auth: `requireRoleManager` (`roles:admin`). Rate-Limit 30/Stunde.

`PATCH /roles/[roleId]` — gleiches Body-Schema wie `POST`, **voller Ersatz** der Berechtigungsmatrix. `404 ROLE_NOT_FOUND`. `200 { status: true }`. Rate-Limit 30/Stunde.

`DELETE /roles/[roleId]` — `404 ROLE_NOT_FOUND`, `400 SYSTEM_ROLE` (die 4 vorinstallierten Rollen sind nicht löschbar), `409 ROLE_IN_USE` (noch Mitglieder zugewiesen). `200 { status: true }`. Auth: `roles:read` + `canDelete`. Rate-Limit 30/Stunde.

---

## 12. Einstellungen + Einladungen

`GET /api/tenants/[tenant]/settings` → `200 { "tenant": { ...Tenant-Felder, "invitations": [...] }, "settings": { ...TenantSettings, "companyAddress": {...} } }`. Auth: `settings:read`. Rate-Limit 60/60s.

`GET /api/tenants/[tenant]/notification-settings` → `200 { "preferences": { "inAppNotifications", "deadlineAlerts", "absenceAlerts", "shiftAlerts" } }` — bewusst über `employees:read` statt `settings:read` gegated (jedes Mitglied darf sehen, ob Alerts aktiv sind). Rate-Limit 60/60s.

`PATCH /api/tenants/[tenant]/settings/profile` — Body: `{ "name" (Pflicht), "slug" (Pflicht, ändert die Tenant-URL!), "country"?, "timezone"?, "size"?, "industry"?, "contactEmail"?, "logoUrl"?, "primaryColor"?, "plan"?, "billingCycle"? }`. Fehler bei reservierter/vergebener `slug`. `200 { "tenant": {...} }`. Auth: `requireSettingsManager` (Rolle OWNER/ADMIN oder `settings:write`/`admin`). Rate-Limit 30/Stunde.

`PATCH /api/tenants/[tenant]/settings/defaults` — Body (alles optional): `{ "companyAddress", "taxId", "defaultLocationId", "weekStart", "workHours", "vacationDays", "employeeNumberRequired", "employeeNumberPrefix", "employeeNumberSuffix", "archiveFormerEmployees" }`. `200 { "settings": {...} }`. Auth: `requireSettingsManager`. Rate-Limit 30/Stunde.

`PATCH /api/tenants/[tenant]/settings/notifications` — Body: `{ "mailNotifications"?, "inAppNotifications"?, "mobilePush"?, "deadlineAlerts"?, "absenceAlerts"?, "shiftAlerts"?, "digestTime"? }`. **Kein Partial-Update** — nicht gesendete Booleans werden `false` (zugrundeliegende Funktion nutzt `Boolean(undefined)`), also immer den vollständigen gewünschten Zustand senden. `200 { "settings": {...} }`. Auth: `requireSettingsManager`. Rate-Limit 30/Stunde.

`PATCH /api/tenants/[tenant]/settings/security` — Body: `{ "twoFactorRequired"?, "sessionTimeout"?, "auditRetentionMonths"? }` — echtes Partial-Update. `200 { "settings": {...} }`. Auth: `requireSettingsManager`. Rate-Limit 30/Stunde.

`GET /api/tenants/[tenant]/invitations` → `200 { "invitations": [...] }`. `POST` — Body: `{ "email" (Pflicht), "role"? }` (nur `"ADMIN"`/`"HR"` werden übernommen, sonst `"EMPLOYEE"`). Erneutes Einladen derselben E-Mail-Adresse aktualisiert die bestehende Einladung (kein `409`). `201 { "invitation": {...} }`. Auth: `requireSettingsManager`. Rate-Limit 20/Stunde (POST) / 60/60s (GET).

`DELETE /api/tenants/[tenant]/invitations/[invitationId]` → `200 { status: true }`. Auth: `requireSettingsManager`. Rate-Limit 30/Stunde.

---

## 13. Abrechnung/Billing (`/api/tenants/[tenant]/billing`)

Der tatsächliche Abo-Zustand (`plan`, `stripeSubscriptionStatus`, ...) wird ausschließlich über den Stripe-Webhook synchronisiert — diese Endpunkte lesen nur bzw. starten einen Stripe-Checkout-/Portal-Flow.

`GET /billing` → `200 { "plan", "billingCycle", "employeeLimit", "hasStripeCustomer", "hasSubscription", "subscriptionStatus", "subscriptionHealthy", "currentPeriodEnd", "cancelAtPeriodEnd" }`. Auth: `settings:read`. Rate-Limit 60/60s.

`POST /billing/checkout` — startet eine Stripe-Checkout-Session für den **ersten** Vertragsabschluss (schlägt fehl, falls bereits ein gesundes Abo existiert — dafür `/portal`). Body: `{ "plan"? (`starter`|`professional`|`business`, Default `professional`), "billingCycle"? (`monthly`|`yearly`, Default `monthly`), "successUrl"?, "cancelUrl"? }` (URLs Default: Tenant-Dashboard-Startseite). `200 { "url" }` — JSON statt Redirect, App navigiert selbst dorthin. `503 STRIPE_NOT_CONFIGURED` falls Stripe serverseitig nicht eingerichtet. Auth: `requireSettingsManager`. Rate-Limit 10/Stunde.

`POST /billing/portal` — Stripe-Billing-Portal-Session (Zahlungsmethode ändern, Rechnungen einsehen, kündigen). Body optional: `{ "returnUrl"?, "intent"?: "switch-plan" }` (`switch-plan` springt direkt in den Plan-Wechsel-Flow, braucht ein bestehendes Abo). `200 { "url" }`. Auth: `requireSettingsManager`. Rate-Limit 20/Stunde.

---

## 14. Erinnerungen (`/api/tenants/[tenant]/reminders`)

`TenantReminder` ist tenant-/team-weit, **nicht** einem einzelnen Mitarbeiter zuordenbar (kein `employeeId`-Feld) — daher separat von Benachrichtigungen (Abschnitt 3).

`GET /reminders` → `200 { "reminders": [{ "id", "daysLeft", "title", "subject", "category", "priority", "dueDate", "status", "notes", "linkedFiles": string[], "createdByName", "teamId", "teamName" }] }` — nur **offene** (own/team/all-Scope). Auth: `reminders:read`. Rate-Limit 60/60s.

`POST /reminders` — Body: `{ "title" (Pflicht), "dueDate" (Pflicht), "priority"? (`urgent`|`important`|`normal`, Default `normal`), "subject"?, "category"? (Default `"Allgemein"`), "notes"?, "linkedFiles"?: string[], "teamId"? }`. `400` falls Titel/Fälligkeit fehlen. `201 { "reminder": {...} }`. Auth: `reminders:write`. Rate-Limit 60/Stunde.

`PATCH /reminders/[reminderId]` — gleiches Schema **ohne** `teamId` (nach Anlage nicht mehr änderbar). `404` falls unbekannt. `200 { "reminder": {...} }`. Auth: `reminders:write`. Rate-Limit 60/Stunde.

`POST /reminders/[reminderId]/complete` — als erledigt markieren. **Kein `404`** bei unbekannter Id (zugrundeliegende Funktion nutzt `updateMany`, no-opt still) — Antwort bleibt trotzdem `200 { status: true }`. Auth: `reminders:read` + `canDelete`. Rate-Limit 60/Stunde.

**Nicht verfügbar:** kein Delete-Endpunkt (existiert in der zugrundeliegenden Logik nicht — nur create/update/complete).

---

## 15. Audit-Log (`/api/tenants/[tenant]/audit`)

Es gibt **keine** mandantenweite Audit-Log-Übersicht — nur pro Entität abrufbar.

`GET /audit?area=<Bereich>&entityType=<Typ>&entityId=<Id>&take=25` — `area` muss einer der zwölf Berechtigungsbereiche sein (bestimmt die Zugriffsprüfung), `entityType`/`entityId` Pflicht (z. B. `area=vacation&entityType=vacation&entityId=clx...`), `take` optional (Default 25, keine Cursor-Pagination). `200 { "entries": [{ "id", "actor", "action", "source", "timestamp", "ipAddress"?, "detail"? }] }` — **leeres Array statt `403`**, falls der Bereich zwar lesbar ist, aber `canViewAudit` fehlt. Auth: `<area>:read`. Rate-Limit 60/60s.

---

## 16. Konto + Avatar (`/api/me/account*`, `/api/me/avatar`)

Kontoweit, **nicht** Tenant-gebunden (kein `tenant`-Parameter).

`GET /api/me/account` → `200 { "name", "email", "emailVerified", "twoFactorEnabled", "image", "memberships": [{ "role", "tenant": { "name", "slug" } }], "sessionCount" }` — `memberships` über **alle** Mandanten hinweg. Rate-Limit 60/60s.

`PATCH /api/me/account` — Body: `{ "name" (Pflicht, min. 2 Zeichen, max. 120) }`. `200 { status: true }`. Rate-Limit 20/Stunde.

`POST /api/me/account/password` — Body: `{ "currentPassword" (Pflicht), "newPassword" (Pflicht, min. 12 Zeichen), "revokeOtherSessions"? }`. Bewusst vage Fehlermeldung bei falschem `currentPassword` (`400`, kein Enumeration-Leak). `200 { status: true }`. Rate-Limit 10/Stunde.

`GET /api/me/account/deletion` → `200 { "scheduledDeletionAt": string | null }`. Rate-Limit 30/60s.

`POST /api/me/account/deletion` — Konto zur Löschung vormerken (30 Tage Karenzzeit). Body: `{ "password" (Pflicht) }`. `409` falls alleinige/r Inhaber/in eines Mandanten (zuerst Inhaberschaft übertragen oder Mandant löschen). `400` bei falschem Passwort. Meldet alle anderen Sitzungen ab. `200 { "scheduledDeletionAt" }`. Rate-Limit 5/Stunde.

`DELETE /api/me/account/deletion` — Löschung stornieren. `200 { status: true }`. Rate-Limit 20/Stunde.

`POST /api/me/avatar` — **`multipart/form-data`**, Feld `avatar` Pflicht. **Eigene, engere Limits** (anders als HR-Dateien): max. 2 MB, nur JPEG/PNG/WebP. `200 { "image": "/api/avatar/[userId]?v=..." }` — direkt über `GET /api/avatar/[userId]` (Abschnitt 2) abrufbar. Rate-Limit 10/Stunde.

---

## 17. Bekannte Lücken (bewusst nicht gebaut)

| Thema | Status | Warum |
|---|---|---|
| **Schichttausch** | Entfernt | Auf Wunsch komplett aus dem Scope genommen — kein Endpunkt, kein Datenmodell. |
| **Push-Zustellung** | Registrierung fertig, Versand fehlt | `POST /api/me/push-subscriptions` speichert Geräte-Tokens; der eigentliche Versand über FCM/APNs ist ein No-Op (`lib/notifications/dispatch.ts`) — fehlende Provider-Zugangsdaten. |
| **"Geleistete Stunden"** | Nicht gebaut | Kein Zeiterfassungsmodul im Schema. |
| **Erinnerung als persönliche Benachrichtigung** | Nicht gebaut | `TenantReminder` ist tenant-/team-weit, keine `employeeId`-Zuordnung möglich. |
| **Wunschfrei: Update/Delete** | Nicht gebaut | Nur create + approve/reject existiert in der zugrundeliegenden Logik. |
| **Erinnerungen: Delete** | Nicht gebaut | Nur create/update/complete existiert. |
| **Audit-Log: mandantenweite Übersicht** | Nicht gebaut | Nur pro-Entität abrufbar, keine "alle Logs"-Abfrage in der zugrundeliegenden Logik. |
| **Admin-erstellte Urlaubsanträge & Wunschfrei: kein Audit-Eintrag** | Bestehende Lücke | `createTenantVacationRequest` (Admin-Pfad) und beide Wunschfrei-Funktionen protokollieren nicht ins Audit-Log — anders als die übrigen Mutationen. Nicht API-spezifisch, liegt in der zugrundeliegenden Logik. |

Alles oben ist code-verifiziert (`tsc`, `eslint`, `npm run test` grün) — noch **nicht committed**, noch **nicht deployed** (Build + PM2-Neustart auf dem geteilten Live-System steht aus).
