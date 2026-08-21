# Screen-Funktionsübersicht — Ployo Dashboard

Stand: 2026-08-18. Diese Datei ergänzt `API-Dokumentation-Vollstaendig.md` (die **Server**-Seite: Endpunkte, Request/Response) um die **Client**-Seite: was auf jedem Admin-Dashboard-Screen tatsächlich zu sehen und zu bedienen ist — Listenansicht, Detailseite, jeder Dialog/Drawer, jeder Button, jedes Such-/Filterfeld. Jede Aktion ist mit der zugehörigen Server-Action/API-Route (→ Abschnitt in der API-Doku) und der nötigen Berechtigung verknüpft. Alle Angaben sind code-verifiziert (Datei:Zeile), Stand des aktuellen Arbeitsbaums.

**Umfang:** die acht Verwaltungs-Screens des Tenant-Dashboards — Mitarbeiter, Urlaub, Krankheit, Dateien, Teams, Standorte, Erinnerungen, Rollen. Nicht enthalten: Mitarbeiter-Self-Service-App (`/mein-bereich`, siehe API-Doku Abschnitt 3), Schichtplanung als eigener Screen (nur der in Standorte eingebettete `LocationShiftPlanner` wird dort mitdokumentiert), Einstellungen/Abrechnung/Audit als eigene Screens.

**Wichtiger Befund vorab — Suche/Filter:** Auf **keinem** der acht Listen-Screens ist eine echte, funktionierende Volltextsuche verdrahtet. Wo ein Suchfeld/Filter *sichtbar* ist, ist es entweder rein dekorativ (kein `onChange`, kein serverseitiges Filtern) oder fehlt ganz. Details je Screen unten unter "Such-/Filterfunktion", Gesamtüberblick in Abschnitt 9.

## Inhaltsverzeichnis

0. [Berechtigungsmodell (Kurzfassung)](#0-berechtigungsmodell-kurzfassung)
1. [Mitarbeiter](#1-mitarbeiter)
2. [Urlaub](#2-urlaub)
3. [Krankheit](#3-krankheit)
4. [Dateien](#4-dateien)
5. [Teams](#5-teams)
6. [Standorte](#6-standorte)
7. [Erinnerungen](#7-erinnerungen)
8. [Rollen](#8-rollen)
9. [Bekannte Lücken & nicht-funktionale UI-Elemente (übergreifend)](#9-bekannte-lücken--nicht-funktionale-ui-elemente-übergreifend)

---

## 0. Berechtigungsmodell (Kurzfassung)

Jeder Screen hängt am selben Zwölf-Bereiche-Modell (`lib/roles.ts:79-92`, `permissionAreas`): `employees` (Mitarbeiter), `payroll` (Gehaltsabrechnungen), `locations` (Standorte), `teams` (Teams), `files` (Dateien), `vacation` (Urlaub), `sickness` (Krankheit), `shifts` (Schichtplanung), `reminders` (Erinnerungen), `audit` (Audit Logs), `roles` (Rollen), `settings` (Einstellungen).

- **Level** (`none < read < write < admin`, `lib/roles.ts:50`) steuert lesen/schreiben pro Bereich.
- **Scope** (`own`/`team`/`all`/`assigned`, `lib/roles.ts:51`, nicht jeder Bereich unterstützt jeden Scope) filtert, *welche* Datensätze sichtbar sind — z. B. sieht ein Standortleiter mit `assigned`-Scope nur seinen eigenen Standort.
- **Zusatz-Flags**, unabhängig vom Level: `canDelete`, `canUploadFiles`, `canEditFiles`, `canViewFiles`, `canViewAudit`, `shiftsLevel` (eigenes Level für Schichtverwaltung, nur bei `locations`/`teams`). Ein Bereich auf `write` zu haben heißt **nicht automatisch**, dass Löschen erlaubt ist — das ist immer ein separates Flag, serverseitig re-geprüft.

Im Rollen-Editor (Abschnitt 8) wird diese Matrix pro Rolle konfiguriert. Bei jedem Button unten steht, welches Level/Flag ihn freischaltet ("Gate: …") — clientseitiges Aus-/Einblenden **und** serverseitige Re-Prüfung in der jeweiligen `lib/*-service.ts`-Funktion, nicht nur eins von beidem.

---

## 1. Mitarbeiter

**Dateien:** `app/(dashboard)/u/[tenant]/employees/page.tsx` (Liste) · `.../employees/actions.ts` · `.../employees/[employeeId]/page.tsx` (Detail) · `components/EmployeeQuickView.tsx` · `components/InviteEmployeeButton.tsx` · `components/EmployeeContracts.tsx` · `components/EmployeeInfoRequestButton.tsx` · `components/EmergencyContactsCard.tsx` · `components/PayrollUploadButton.tsx` / `PayrollDownloadButton.tsx` · `components/AddressFields.tsx` · Business-Logik: `lib/employee-service.ts`, `lib/contract-service.ts`, `lib/payroll-service.ts`.

### 1.1 Liste (`/employees`)

| Spalte | Inhalt |
|---|---|
| Name | Avatar (Initialen) + Name |
| Personalnummer | mono |
| Standort | `employee.location` |
| Team / Rolle | gestapelt |
| Startdatum | |
| Vertragsart | Badge |
| Status | Badge (Im Dienst / Urlaub / Abwesend) |
| — | Augen-Icon → öffnet Quick View |

Ganze Zeile ist Link auf die Detailseite. Sortierung fix `createdAt asc` (`lib/employee-service.ts:720`), 25 Einträge/Seite (`PaginationControls`). Nutzer mit `employees`-Scope `"own"` werden von der Liste direkt auf die eigene Akte umgeleitet (`page.tsx:122-132`).

### 1.2 Such-/Filterfunktion — **nicht funktional**

Im Seitenkopf stehen ein Suchfeld (`SearchInput`) und ein Standort-`<select>` ("Alle Standorte" + jeder Standortname). Geprüft im Code (`page.tsx:170-193`, `components/inputs/SearchInput.tsx:1-30`): **keines von beiden ist verdrahtet.**
- `SearchInput` ist eine reine Präsentationskomponente ohne `onChange`, ohne umschließendes `<form>`, ohne URL-Query-Param-Logik auf dieser Seite. Text eintippen tut buchstäblich nichts.
- Der Standort-`<select>` hat kein `onChange`, kein `name`-Attribut, kein `<form>` drumherum.
- `page.items` kommt direkt aus `paginate(employees, ...)` ohne jede Filterung nach Suchbegriff oder Standort.

Für den Nutzer sieht es aus wie eine funktionierende Suche/Filter — ist es aber nicht. Das ist der zentrale Befund zur eingangs gestellten Frage nach der Suche.

### 1.3 "Mitarbeiter anlegen"-Dialog (`InviteEmployeeButton`)

Gate: `hasPermissionLevel(permissions.employees, "write")` (`page.tsx:152,195`).

Felder: Vorname, Nachname, E-Mail (Pattern-geprüft), Standort (Select), Team (Select), Berechtigungsrolle (Select, erste Rolle vorbelegt), Vertragsart (Unbefristet/Teilzeit/Befristet/Werkstudentin), Startdatum (`DatePickerField`), Personalnummer (schreibgeschützte Vorschau der nächsten Nummer, `previewNextEmployeeNumber`).

Server: `createEmployeeAction` → `createTenantEmployee` (`lib/employee-service.ts:944-1120`). Regeln: mind. Vor-/Nachname oder E-Mail nötig; `location`/`team`/`role` müssen bekannte Werte sein (`assertKnownOrgReferences`); Personalnummer optional Pflicht je Tenant-Einstellung; **Stripe-Mitarbeiterlimit-Check** (402 bei Limit erreicht); Default `weeklyHours` "38 Std/Woche", `contract` "Unbefristet", `vacationTotal` 30; legt Zeitleisten-Eintrag "Mitarbeiter angelegt" an. Bei Erfolg Redirect auf die neue Detailseite.

### 1.4 Quick View (Augen-Icon in der Liste)

Rein clientseitige Anzeige (`components/EmployeeQuickView.tsx`), kein Server-Call — zeigt bereits geladene Daten:
- Status, Personalnummer, Startdatum
- **Primärer Notfallkontakt** (falls vorhanden), rot hervorgehoben
- **Nächste Schichten** (bis zu 3)
- **Letzte Dokumente** (bis zu 3, Name + Aktualisiert-Datum)
- Button "Personalakte öffnen" → Detailseite

### 1.5 Detailseite (`/employees/[employeeId]`)

Berechtigungs-Flags (`page.tsx:1029-1036`): `canEditEmployee` (employees write), `canDeleteEmployee` (`canDelete`-Flag), `canViewEmployeeAudit`, `canInvite` (settings write), `canViewPayroll`/`canManagePayroll` (payroll read/write — steuert komplett, ob Vertrag/Abrechnungen-Tab überhaupt sichtbar ist), `canManageFiles`, `canManageReminders`.

**Kopfbereich:** Name (editierbar), Rolle · Team · Standort, Status-Badge, Personalnummer, Konto-Verknüpfungsstatus ("Account verknüpft" / "Einladung ausstehend" / "Einladung abgelaufen"). Buttons: **Info-Anfrage** (immer sichtbar), **Einladen/Erneut einladen** (Gate: `canInvite && !hasAccount`, deaktiviert falls keine E-Mail hinterlegt), **Bearbeiten** (Gate: `canEditEmployee`) → `?edit=1`, im Edit-Modus **Löschen** (Gate: `canDeleteEmployee`, Bestätigungsdialog) → `deleteEmployeeAction`.

**Tabs:** Home (immer) · Vertrag (nur `canViewPayroll`, Badge = Vertragsanzahl) · Dateien (immer, Badge = Ordner+Dateien) · Abrechnungen (nur `canViewPayroll`, Badge = Anzahl).

#### Home-Tab — Karten

| Karte | Inhalt / editierbare Felder |
|---|---|
| Stamminformationen | Personalnummer, E-Mail, Telefon (immer sichtbar) + Geburtsdatum/-ort, Nationalität, Familienstand, Privatadresse (`AddressFields`), Steuer-ID, Sozialversicherungsnummer, Krankenkasse, IBAN — **alle hinter `payroll:read` versteckt/redaktiert** (`"•••"` wenn keine Berechtigung) |
| Beschäftigung | Vertragsart, Wochenstunden, Eintrittsdatum, "Beschäftigt seit", Team, Berechtigungsrolle, **Status** (active/vacation/absent — einziger Ort, an dem der Mitarbeiterstatus manuell gesetzt wird) |
| Abwesenheit & Urlaub | Resturlaub / Urlaub gesamt / Genommen (Zahlenfelder), Fortschrittsbalken in Ansicht |
| Schichten diese Woche | read-only, aktuelle ISO-Woche |
| Info-Anfragen | Liste + "Neue Info-Anfrage"-Button (Gate: `canEditEmployee`) |
| Notfallkontakte | siehe 1.6 |
| Kontakt | E-Mail/Telefon (read-only hier), Standort-Adresse (`AddressFields`, editierbar), Standort-Select |
| Verlauf | automatisch generierte Zeitleiste bei Änderungen an Standort/Team/Rolle/Vertrag/Status (`buildEditTimelineEntries`) |

#### Vertrag-Tab

Karte "Vertragsdetails" (aktiver Vertrag: Vertragsart, Rolle, Eintritt/Austritt, Position, Abteilung, Arbeitsort, Arbeitszeit, Vergütung, Urlaub, Probezeit, Kündigungsfrist) + Karte "Hinweise" + Karte "Alle Verträge" (siehe 1.7). Ein `LegacyContractTab` existiert noch im Code, wird aber **nicht gerendert** (toter Code, s. Abschnitt 9).

#### Dateien-Tab

Ordner-Grid + Datei-Liste, "Ordner erstellen"/"Datei hochladen"-Buttons (Gate: `canManageFiles`), pro Zeile ein Erinnerungs-Button (Gate: `canManageReminders`, öffnet Drawer zum Anlegen einer Erinnerung mit vorbefülltem Titel "Nachfassen: {Dateiname}"). Funktioniert identisch zum zentralen Dateien-Modul (Abschnitt 4), nur mit `ownerType="employee"`.

#### Abrechnungen-Tab

"Abrechnung hochladen"-Button (Gate: `canManagePayroll`) → Dialog: Zeitraum (Pflicht), Brutto/Netto (optional), PDF (Pflicht). Pro Eintrag: Zeitraum, Datei·Datum, Brutto/Netto, Status-Tag (Verfügbar/Korrigiert), Download-Button (signierte URL, 5 Min. gültig).

Audit-Log-Panel unter allen Tabs (Gate: `canViewEmployeeAudit`).

### 1.6 Notfallkontakte-Karte

Button "+" öffnet Formular: Name (Pflicht), Beziehung, Telefon (Pflicht), E-Mail, Notiz. Pro Kontakt ein "⋯"-Menü: **Bearbeiten**, **Als Hauptkontakt festlegen** (nur wenn nicht bereits primär), **Löschen** (Bestätigung). Regeln: erster angelegter Kontakt wird automatisch primär; wird der primäre Kontakt gelöscht, rückt automatisch der nächste nach. Alle Aktionen Gate: `employees:write`.

### 1.7 Verträge-Panel & Status-Workflow

"Neuer Vertrag"-Button (Gate: `canManagePayroll`) → Formular mit Titel, Vertragsart, Status, Beginn (Pflicht)/Ende, Position, Abteilung, Arbeitsort, Wochenstunden, Vergütung, Urlaubstage, Probezeitende, Kündigungsfrist, **PDF-Upload (Pflicht)**, Notiz.

**Status-Workflow** (`draft`/`active`/`terminated`/`expired`/`inactive`): Buttons "Aktivieren", "Inaktiv setzen", "Kündigen" je nach aktuellem Status. Bei Zielstatus `terminated` sind Kündigungsdatum **und** -grund im Formular und serverseitig Pflicht. Kein Button für `expired` — dieser Status wird nicht über die UI gesetzt.

### 1.8 Status-Übersicht

| Entität | Werte | Wo gesetzt |
|---|---|---|
| Mitarbeiterstatus | active / vacation / absent | manuell im Beschäftigung-Card-Select — **nicht** automatisch synchronisiert mit genehmigtem Urlaub |
| Vertragsstatus | draft/active/terminated/expired/inactive | Verträge-Panel, `terminated` mit Pflichtfeldern |
| Abrechnungsstatus | available/corrected | reine Anzeige, kein UI-Toggle gefunden |
| Info-Anfrage-Status | open/uploaded/review | wird bei Anlage auf `open` gesetzt, keine UI zum manuellen Ändern gefunden |
| Konto-Verknüpfung | verknüpft / Einladung ausstehend / abgelaufen | aus `hasAccount` + Invitation-Lookup abgeleitet |

### 1.9 API-Referenz

→ API-Dokumentation-Vollstaendig.md Abschnitt 5 (`/api/tenants/[tenant]/employees`), 5.1 (Verträge), 5.2 (Gehaltsabrechnungen).

### 1.10 Auffälligkeiten

- Suchfeld + Standort-Filter auf der Liste sind Attrappen (siehe 1.2).
- `LegacyContractTab` im Detail-Page-Code ist toter Code (nicht gerendert, `eslint-disable`-Kommentar bestätigt das als bewusst stehen gelassenes Altlast-Fragment).
- `components/EmergencyContactsEditor.tsx` existiert, wird aber von keiner Seite importiert — die Detailseite nutzt stattdessen `EmergencyContactsCard`. Vermutlich Vorgänger-Komponente.

---

## 2. Urlaub

**Dateien:** `app/(dashboard)/u/[tenant]/urlaub/page.tsx` · `.../urlaub/actions.ts` · `components/AbsenceActionButtons.tsx` · `components/ActionDrawers.tsx` (Drawer) · Business-Logik: `lib/vacation-service.ts`, `lib/vacations.ts`.

### 2.1 Liste/Dashboard

4 Filter-Tabs im Kopf: **Alle / Ausstehend / Genehmigt / Abgelehnt** — **rein dekorativ**, kein `onClick`, kein Query-Param, nur "Alle" ist hartkodiert als aktiv markiert (`page.tsx:208-222`). Die Liste zeigt immer alle Anträge im eigenen Scope, sortiert `status desc, createdAt desc` (offene/abgelehnte zuerst).

4 Metrik-Kacheln: Ausstehend (Anzahl), Genehmigt (Anzahl), Ø Resturlaub (über alle Mitarbeiter), Beantragte Tage (Summe der geladenen Anträge). Pagination 20/Seite.

### 2.2 Aktionen

| Aktion | Trigger | Server-Action | Gate |
|---|---|---|---|
| Antrag im Namen eines Mitarbeiters erfassen | Button "Antrag erfassen" im Header → Popup | `createVacationRequestAction` → `createTenantVacationRequest` | `canManage` = vacation write (Button nur sichtbar), `requireVacationManager` serverseitig |
| Genehmigen | Button je Zeile, nur bei `status="pending"` | `approveVacationRequestAction` | wie oben, löst Benachrichtigung + Audit-Log aus |
| Ablehnen | Button je Zeile, nur bei `status="pending"` | `rejectVacationRequestAction` | wie oben |
| Details ansehen/bearbeiten | Button "Details" → Drawer | Formular editiert Von/Bis/Notiz → `updateVacationRequestAction` (ändert **nicht** den Status) | Formular als `<fieldset disabled>` wenn kein `canManage` |
| Löschen | Button im Drawer, Bestätigungsdialog | `deleteVacationRequestAction` | separates `canDelete`-Flag |

Formular "Antrag erfassen" (Popup): Mitarbeiter (einfaches `<select>`, **nicht** die reichhaltige `EmployeeSelector`-Komponente), Von/Bis (`DatePickerField`, `min` = heute), Notiz. Validierung: kein Datum in der Vergangenheit, Ende ≥ Start.

### 2.3 Status-Workflow

`pending → approved` oder `pending → rejected`, keine Rückführung. Badges: Ausstehend (Amber) / Genehmigt (Grün) / Abgelehnt (Rot).

### 2.4 API-Referenz

→ API-Dokumentation-Vollstaendig.md Abschnitt 8 (`/api/tenants/[tenant]/vacation-requests`). Selbst beantragen als Mitarbeiter: Abschnitt 3 (`POST /api/me/vacation-requests`).

### 2.5 Auffälligkeiten

- Filter-Tabs (Alle/Ausstehend/Genehmigt/Abgelehnt) funktionieren nicht.
- Admin-erstellte Urlaubsanträge schreiben **keinen** Audit-Log-Eintrag (bestehende Lücke, auch in API-Doku vermerkt).
- Kein Suchfeld überhaupt vorhanden.

---

## 3. Krankheit

**Dateien:** `app/(dashboard)/u/[tenant]/krankheit/page.tsx` · `.../krankheit/actions.ts` · `components/AbsenceActionButtons.tsx` · `components/ActionDrawers.tsx` · Business-Logik: `lib/sickness.ts`.

### 3.1 Dashboard

Kein Suchfeld, kein Filter, kein Sortier-Control. Zwei feste Listen:
- **"Aktuell krank"** — alle offenen Fälle, ohne Pagination.
- **"Verlauf · letzte 30 Tage"** — auf 30 Einträge gedeckelt, sortiert nach Startdatum absteigend, 6-Monats-Fenster.

4 Metrik-Kacheln: Aktuell krank, Diesen Monat, Ø Dauer, Krankenquote (% der aktiven Mitarbeiter). Plus ein **Balkendiagramm** "Krankenquote — Letzte 6 Monate" (ein Balken pro Monat, aktueller Monat hervorgehoben).

### 3.2 Aktionen

| Aktion | Trigger | Server-Action | Gate |
|---|---|---|---|
| Krankmeldung im Namen eines Mitarbeiters erfassen | Button "Krankmeldung erfassen" → Drawer | `createSicknessReportAction` | `canManage` = sickness write |
| Details ansehen/bearbeiten | Button "Details" → Drawer, nur bei laufenden Fällen editierbar | `updateSicknessReportAction` (ändert nicht offen/geschlossen) | abgeschlossene Fälle sind immer read-only, unabhängig von Berechtigung |
| Krankheit beenden | Button im Drawer, nur laufende Fälle | `closeSicknessReportAction` (setzt `endDate`+`closedAt`) | separates `canDelete`-Flag (wiederverwendet für "Beenden" — es gibt **kein echtes Löschen**) |

Formular "Krankmeldung erfassen": Mitarbeiter (`<select>`), Krank seit (`DatePickerField`, **keine** Vergangenheits-Sperre, anders als Urlaub), Voraussichtlich bis (optional), Bescheinigung (Wird nachgereicht/Liegt vor/Nicht erforderlich), Meldeweg (Telefonisch/E-Mail/App/Manager), Notiz. Trotz Hinweistext im Formular gibt es **kein** tatsächliches Datei-Upload-Feld für die AU-Bescheinigung in diesem Dialog.

### 3.3 Status-Workflow

Zwei unabhängige Achsen:
- **Fallstatus**: `open → closed`, einmalig, keine Wiedereröffnung.
- **Bescheinigungsstatus** (`certificateStatus`): pending/received/not-required, jederzeit änderbar solange der Fall offen ist.
- **Meldeweg** (`reportChannel`): nur bei Anlage gesetzt, danach nicht mehr editierbar.

### 3.4 API-Referenz

→ API-Dokumentation-Vollstaendig.md Abschnitt 9 (`/api/tenants/[tenant]/sickness-reports`). Selbst melden: Abschnitt 3 (`POST /api/me/sickness-reports`).

### 3.5 Auffälligkeiten

- Kein Suchfeld/Filter überhaupt.
- Datums-Widget inkonsistent: Erfassen-Drawer nutzt `DatePickerField`, Bearbeiten-Drawer nutzt natives `<input type="date">`.
- Kein separates "Löschen" — nur "Beenden", was den `canDelete`-Flag missbraucht.

---

## 4. Dateien

**Dateien:** `app/(dashboard)/u/[tenant]/dateien/page.tsx` + `[...path]/page.tsx` · `.../dateien/actions.ts` · `components/FilesPageContent.tsx` · `components/FilesBrowser.tsx` · `components/FileActionButtons.tsx` · `components/FolderPinGate.tsx` · Business-Logik: `lib/files-server.ts`, `lib/storage/storage.service.ts`, `lib/file-access.ts`, `lib/folder-pin.ts`.

Das zentrale HR-Ablage-Modul — **nicht** dasselbe wie die an Mitarbeiter/Standort/Team gehängten Dateien-Tabs (die nutzen dieselben Komponenten mit anderem `ownerType`, siehe 1.5, 5.4, 6.4).

### 4.1 Ordnernavigation

Pfadstruktur über URL-Segmente (`/dateien/[...path]`), jeweils nur die **direkten Kinder** des aktuellen Ordners werden gelistet (kein Baum, kein rekursiver Überblick) — Navigation ausschließlich per Drilldown/Breadcrumb. "Ordner erstellen"-Button (Gate: `canManageFiles`) mit Feldern Name, "Verantwortlich", "Ordner schützen"-Checkbox + PIN.

**PIN-geschützte Ordner:** Ein Ordner kann mit 6-stelliger PIN gesperrt werden (gehasht mit `scrypt`, `lib/folder-pin.ts`). Erstes Öffnen zeigt `FolderPinGate` statt Inhalt; korrekte PIN setzt ein 8 Stunden gültiges, AES-GCM-verschlüsseltes Cookie (`ployo-folder-unlock`) — Rate-Limit 10 Versuche/10 Min. **Wichtig:** das ist ein Session-Merker, keine echte Zugriffskontrolle — jeder mit `files:read`, der die PIN kennt/errät, schaltet für sich frei.

### 4.2 Such-/Filterfunktion — **nicht vorhanden**

Es gibt **kein** Suchfeld, keinen Typ-/Tag-/Eigentümer-Filter und keinen Sortier-Regler irgendwo im Datei-Browser (bestätigt per Code-Durchsicht von `FilesBrowser.tsx`/`FilesPageContent.tsx`). Einzige "Filterung": Ordner-Drilldown und die automatische Sichtbarkeits-Einschränkung nach Scope (`own`/`team` sehen nur eigene bzw. Team-Uploads — Zugriffskontrolle, keine Suchfunktion). Feste Sortierung: Ordner alphabetisch, Dateien nach `updatedAt desc`. Pagination 30/Seite.

Eine echte Textsuche existiert nur an einer Stelle im ganzen Dateien-Ökosystem: im Datei-Verlinkungs-Picker der **Erinnerungen** (`LinkedFileBrowser`, siehe Abschnitt 7.3) — dort funktioniert Suche nach Name/Ordner/Eigentümer tatsächlich.

### 4.3 Aktionen

| Aktion | Trigger | Server-Action | Gate |
|---|---|---|---|
| Datei hochladen | "Datei hochladen" → Popup | `uploadHrFileAction` | `files:write` (+ passendes `canUploadFiles`-Flag bei ownerType employee/location/team) |
| Neue Version hochladen | kompakter Button je Datei/auf Detailseite | `uploadHrFileVersionAction` | `files:write` (kein zusätzlicher Owner-Check) |
| Ansehen | Augen-Icon | `getHrFileSignedUrlAction` (inline) | `files:read` + Datei-ACL |
| Herunterladen | Download-Icon | `getHrFileSignedUrlAction` (attachment) | `files:read` + Datei-ACL |
| Löschen (Soft-Delete) | Button → Bestätigung | `softDeleteHrFileAction` | `files:write` |
| Ordner erstellen | s. 4.1 | `createHrFolderAction` | wie Upload |
| Erinnerung anlegen | Glocken-Icon je Zeile | öffnet Erinnerungs-Drawer, vorbefüllt "Nachfassen: {Name}" | `reminders` write |

Upload-Formular-Felder: Datei (Pflicht, max. 15 MB, `pdf/png/jpg/jpeg/webp/heic/doc/docx/xls/xlsx/ppt/pptx/txt/csv/zip`), Dokumenttyp (12 vordefinierte, u. a. Arbeitsvertrag, Krankmeldung, Zeugnis, Sonstiges — Freitext, kein DB-Enum), Gültig ab/Ablaufdatum/Erinnerung, Beschreibung, Tags (kommagetrennt), Zuweisung an Mitarbeiter/Standort, **Zugriffskontrolle**: Mehrfachauswahl von Rollen/Nutzern, die diese Datei sehen dürfen (leer = für alle mit `files:read` sichtbar; OWNER/ADMIN/HR umgehen die ACL immer).

### 4.4 Metrik-Kacheln

Ordner / Dateien / "Geschützt" / Uploads — **Achtung:** "Geschützt" zählt `locked || storageFileId`, und `storageFileId` ist bei jeder echten hochgeladenen Datei gesetzt, wodurch die Kachel praktisch immer gleich der Gesamtzahl der Dateien ist, nicht der tatsächlich gesperrten (Bug/Platzhalter, s. Abschnitt 9).

### 4.5 Versionierung

Jede neue Version ist eine eigene DB-Zeile (alte wird `status:"replaced"`), ACL wird immer von der Wurzel-Datei vererbt. Die im UI angezeigte Versionsliste (Uploader/Datum pro Version) ist auf der Datei-Detailkarte allerdings **synthetisch berechnet, nicht real** — der eigentliche Datei-Download je Version funktioniert korrekt, die angezeigten Metadaten (wer/wann) sind es nicht.

### 4.6 Eigentümer-Scoping

`ownerType`: `tenant` (zentrales Dateien-Modul) / `employee` / `location` / `team`. Das Dateien-Modul zeigt ausschließlich `tenant`-Dateien; die anderen drei laufen über dieselben Komponenten, eingebettet in die jeweilige Detailseite (Abschnitt 1.5, 5.4, 6.4) mit anderem `ownerType`/`ownerId` — kein Umschalter innerhalb des Dateien-Screens selbst.

### 4.7 API-Referenz

→ API-Dokumentation-Vollstaendig.md Abschnitt 10 (`/api/tenants/[tenant]/files`).

### 4.8 Auffälligkeiten

- Keine Suche/kein Filter überhaupt (größte Lücke unter allen acht Screens).
- "Geschützt"-Metrik ist praktisch immer falsch (siehe 4.4).
- Angezeigte Versions-Metadaten (Uploader/Datum je Version) sind fabriziert, nicht real (siehe 4.5).

---

## 5. Teams

**Dateien:** `app/(dashboard)/u/[tenant]/teams/page.tsx` · `.../teams/[teamId]/page.tsx` · `.../teams/actions.ts` · `components/CreateTeamButton.tsx` · `components/TeamEditControls.tsx` · `components/TeamRoleEditorButton.tsx` · Business-Logik: `lib/team-service.ts`.

### 5.1 Liste

Kein Suchfeld, kein Filter, kein Sortier-Control — statisches Grid, `createdAt asc`. 4 Metrik-Kacheln: Teams gesamt, Mitglieder, Durchschnitt (Mitglieder/Team), **"Vakante Stellen" — hartkodierter Wert "2"**, keine echten Daten (Platzhalter, siehe 9). Team-Karten (Link zur Detailseite): Farbstreifen, Name, Standorte, Mitgliederzahl, Mitglieder-Avatare, Teamleitung.

"Team erstellen"-Button (Gate: `teams:write`) → Popup: Name (Pflicht), Standorte (Mehrfachauswahl), Teamleitung (Select), Beschreibung (nur bei Anlage setzbar, später nicht mehr editierbar), Farbe (10 Swatches).

### 5.2 Detailseite — Home-Tab

Zwei Tabs: Home (Standard) / Dateien. Edit-Modus über `?edit=1`.

**Ansicht:** Header mit Farbstreifen, Name, Standorte, Mitgliederzahl, "Im Dienst"-Zähler. Buttons **Bearbeiten** (Gate: `teams:write`) und **Löschen** (Gate: separates `canDelete`-Flag, Bestätigung).

**Bearbeiten-Modus:** Name, Standorte-Mehrfachauswahl, Farbe editierbar. **Teamleitung neu setzen** über eigenes Dropdown-Formular. **Mitglied hinzufügen**: `<select>` aus noch nicht zugeordneten Mitarbeitern + Rolle-Textfeld. Pro Mitgliederzeile: **Entfernen**-Button (fehlt bei der aktuellen Teamleitung — die kann nicht entfernt werden, ohne vorher die Leitung neu zu vergeben) und **Rolle bearbeiten**-Popup (Rolle-Text + "Als Teamleitung markieren"-Checkbox — zweiter Weg, jemanden zur Leitung zu machen).

Mitgliedertabelle: Name (+ "Teamleitung"-Tag), Standort, Rolle, Vertrag, Status (Im Dienst/Urlaub), Aktionen (nur im Edit-Modus).

### 5.3 Aktionen

| Aktion | Server-Action | Gate |
|---|---|---|
| Team erstellen | `createTeamAction` | `teams:write` |
| Team bearbeiten (Name/Standorte/Farbe) | `updateTeamAction` | `teams:write` |
| Team löschen | `deleteTeamAction` | `canDelete`-Flag |
| Teamleitung setzen | `setTeamLeadAction` | `teams:write` |
| Mitglied hinzufügen | `addTeamMemberAction` | `teams:write` |
| Mitglied entfernen | `removeTeamMemberAction` (blockiert bei aktueller Leitung) | `teams:write` |
| Mitgliedsrolle/Leitung ändern | `updateTeamMemberAction` | `teams:write` |

### 5.4 Dateien-Tab

Identisch zum zentralen Dateien-Modul (Abschnitt 4), `ownerType="team"`. Alle team-gebundenen Dateien sind serverseitig immer `locked: true`.

### 5.5 API-Referenz

→ API-Dokumentation-Vollstaendig.md Abschnitt 6 (`/api/tenants/[tenant]/teams`).

### 5.6 Auffälligkeiten

- "Vakante Stellen: 2" auf Liste **und** Detailseite ist ein hartkodierter Platzhalterwert, keine echte Berechnung.
- Kein Suchfeld überhaupt.
- Nur Anlegen/Ändern/Löschen des Teams selbst wird auditiert — Mitglied hinzufügen/entfernen/Rolle ändern/Leitung setzen erzeugen **keinen** Audit-Log-Eintrag.
- Ein hartkodiertes Farbschema für 4 bestimmte Team-Namen ("empfang"/"logistik"/"service"/"verkauf") ist im Code vorhanden — vermutlich Demo-Daten-Rest, greift nicht bei neu angelegten Teams.

---

## 6. Standorte

**Dateien:** `app/(dashboard)/u/[tenant]/standorte/page.tsx` · `.../standorte/[locationId]/page.tsx` · `.../standorte/actions.ts` · `components/CreateLocationButton.tsx` · `components/AddLocationEmployeesButton.tsx` · `components/AddressFields.tsx` · `components/LocationShiftPlanner.tsx` · Business-Logik: `lib/location-service.ts`.

### 6.1 Liste

Kein Suchfeld, kein Filter, kein Sortier-Control — `createdAt asc`. 4 Kacheln: Standorte gesamt, Aktive Standorte, Mitarbeiter gesamt, Offene Schichten (echte Summe, im Gegensatz zu Teams). Standort-Karten: Farbbalken, Typ, Name, Status, Adresse, Mitarbeiter-/Schichtzahl, Leitung.

"Standort anlegen"-Button (Gate: `locations:write`) → Popup: Name, Typ (Filiale/Zentrale/Lager/Büro/Verwaltung), Status, Adresse (`AddressFields`, vollständig Pflicht), Standortleitung (`EmployeeSelector`), Kontakt-E-Mail, Farbe (8 Swatches).

### 6.2 Detailseite — Tabs: Home / Dateien / Schichten

**Home-Tab, Ansicht:** Kopfbereich (Typ, Status, Name, Adresse), Buttons **Löschen** (Gate: `canDelete`-Flag), **Bearbeiten** (Gate: `locations:write`), **Mitarbeiter** (öffnet Zuweisungs-Dialog, Gate: `locations:write`).

4 Metrik-Kacheln: Mitarbeiter (+ "aktiv heute"), Schichten aktiv, Offene Stellen (**Caption ist hartkodiert "Frühschicht Do." — nicht dynamisch**), Auslastung. `employeeCount`/`activeToday` werden bei Mitarbeiterzuweisung serverseitig neu berechnet; `shiftCount`/`openPositions`/`utilization` werden **nicht** automatisch aus echten Schichtdaten hergeleitet — nur über die (im aktuellen Bearbeiten-Formular gar nicht angebotenen) optionalen Felder von `updateTenantLocation` überschreibbar.

**Leitung & Team**-Panel: Avatar, Name, Telefon, E-Mail (im Bearbeiten-Modus editierbar), plus Team-Chips aller zugeordneten Mitarbeiter. **Aktivität**-Panel: automatische Zeitleiste (z. B. "hat X dem Standort hinzugefügt").

**Bearbeiten-Modus:** Name, Typ, Status, Adresse, Farbe, Leitung-Kontaktfelder — editierbar. Metrikfelder werden von diesem Formular **nicht** mitgesendet.

### 6.3 "Mitarbeiter zuweisen"-Dialog

`EmployeeSelector` im Mehrfachauswahl-Modus, nur Mitarbeiter, die diesem Standort noch nicht angehören. Schreibt eine Aktivitäts-Zeile und aktualisiert `employeeCount`/`activeToday`.

### 6.4 Dateien-Tab

Identisch zum zentralen Dateien-Modul (Abschnitt 4), `ownerType="location"`.

### 6.5 Schichten-Tab — eingebetteter `LocationShiftPlanner`

Standort-gefilterte Version des vollständigen Schichtplaners:
- Wochennavigation (Vor/Zurück, "KW N · Jahr"), Konflikt-Zähler
- 7-Tage-Raster (Desktop) / gestapelte Liste (Mobil), pro Tag: genehmigte Wunschfrei-Anträge, Schichtkarten (Zeit, Zuweisung oder "Offen", Konfliktsymbol), "+"-Button zum Anlegen (Gate: `canManage` = Standort-`shiftsLevel` write)
- **Schicht-Drawer**: Start/Ende (Pflicht), Pausenminuten (automatisch aus Tenant-Pausenregel), Mitarbeiter, Notiz. Löschen (Bestätigung), Speichern.
- **Wunschfrei-Drawer**: Filter-Reiter Offen/Genehmigt/Abgelehnt/Alle, Liste + Detail; im Erstell-Modus Mitarbeiter/Datum/Begründung; im Ansicht-Modus **Ablehnen** (mit Begründungsfeld) / **Annehmen**.

### 6.6 API-Referenz

→ API-Dokumentation-Vollstaendig.md Abschnitt 7 (`/api/tenants/[tenant]/locations`), Schichten/Wunschfrei-Teil des Tabs: Abschnitt 4.

### 6.7 Auffälligkeiten

- Kein Suchfeld überhaupt.
- "Offene Stellen"-Kachel hat eine hartkodierte, nicht-dynamische Caption ("Frühschicht Do.").
- `shiftCount`/`openPositions`/`utilization` sind gespeicherte Felder, keine live berechneten Werte — können über die Zeit von der Realität abweichen, da das aktuelle Bearbeiten-Formular sie nicht anfasst.

---

## 7. Erinnerungen

**Dateien:** `app/(dashboard)/u/[tenant]/erinnerungen/page.tsx` · `.../erinnerungen/actions.ts` · `components/CreateReminderButton.tsx` · `components/ActionDrawers.tsx` · Business-Logik: `lib/reminders.ts`.

### 7.1 Liste

Feste Sortierung: fälligstes Datum zuerst (`dueDate asc, createdAt desc`). 5 Metrik-Kacheln: Offen gesamt, Dringend, Abgelaufen, Erledigt, Nächste Frist.

**Filter-Pillen "Alle/Abgelaufen/Dringend" + eine Pille je Kategorie — rein dekorativ**, kein `onClick`, keine Query-Param-Logik; nur "Alle" ist hartkodiert als aktiv markiert. Kein Suchfeld auf der Liste selbst.

### 7.2 Aktionen

| Aktion | Trigger | Server-Action | Gate |
|---|---|---|---|
| Erinnerung anlegen | Button im Header → Popup | `createReminderAction` | `reminders:write` |
| Bearbeiten | Zeile anklicken → Drawer | `updateReminderAction` | `reminders:write`; ohne Berechtigung read-only |
| Als erledigt markieren | Häkchen-Icon je Zeile | `completeReminderAction` | separates `canDelete`-Flag |
| Löschen | — | **existiert nicht** (weder API noch UI) | — |

Formular-Felder (Anlegen/Bearbeiten identisch, außer Team nur bei Anlage): Titel (Pflicht), Fällig am (Pflicht), Priorität (normal/wichtig/dringend), Kategorie (Freitext, Default "Allgemein"), Bezug (Freitext, z. B. Mitarbeiter/Team/Standort), Team (nur beim Anlegen, optional), Hinweise, **Dateien verlinken** — hierüber öffnet sich ein Datei-Picker mit **funktionierender Textsuche** (Name/Ordner/Eigentümer), Quell-Reitern (zentrales Archiv vs. je Mitarbeiter/Standort) und Ordner-Navigation.

### 7.3 API-Referenz

→ API-Dokumentation-Vollstaendig.md Abschnitt 14 (`/api/tenants/[tenant]/reminders`). Kein Delete-Endpunkt, deckt sich mit der UI.

### 7.4 Auffälligkeiten

- Filter-Pillen auf der Liste sind Attrappen.
- Kein Löschen möglich (bewusste Lücke, nicht nur UI — auch API-seitig nicht vorhanden).
- Die einzige tatsächlich funktionierende Textsuche im ganzen Dashboard steckt im Datei-Verlinkungs-Picker dieses Screens.

---

## 8. Rollen

**Dateien:** `app/(dashboard)/u/[tenant]/rollen/page.tsx` · `.../rollen/[roleId]/page.tsx` · `.../rollen/actions.ts` · `components/CreateRoleButton.tsx` · `components/RolePermissionAreaFields.tsx` · statische Referenz: `app/api/permission-config/route.ts`. Business-Logik: `lib/role-service.ts`, `lib/roles.ts`.

### 8.1 Liste

Kein Suchfeld, kein Filter. Feste Sortierung: Systemrollen zuerst, dann Custom-Rollen nach Anlagedatum. Tabelle: Rolle, Mitarbeiter (Mitgliederzahl), Beschreibung. Die vier Systemrollen (HR-Leitung, Gehaltsabrechnung, Teamleitung, Mitarbeiter) werden pro Tenant automatisch angelegt (`ensureTenantDefaultRoles`).

"Rolle erstellen"-Button (immer sichtbar, Server prüft `roles:admin`) → großer Popup-Assistent.

### 8.2 Rollen-Erstellen-Dialog

Pro der zwölf Bereiche eine Karte mit **4-stufigem Level-Toggle** (Kein Zugriff/Lesen/Schreiben/Admin) als Segmented Control. Sobald Level ≠ "Kein Zugriff" gewählt ist, erscheinen Zusatz-Chips: "Löschen erlaubt", "Audit-Log sichtbar", und (bei dateirelevanten Bereichen) "Hochladen"/"Bearbeiten"/"Dateien sehen". Bei Bereichen mit `assigned`-Scope (Standorte/Teams) ersetzt ein "Schichten:"-Select den normalen Scope-Regler.

Zusatzfunktionen:
- **Rollen-Vorlagen**: 3 Presets (Standortleitung, HR-Team, Mitarbeiter Self-Service) setzen die ganze Matrix auf einmal.
- **Bereich suchen** — funktionierende clientseitige Textsuche über Bereichsname/-beschreibung (die einzige funktionierende Suche außerhalb des Erinnerungen-Datei-Pickers, aber nur innerhalb dieses einen Dialogs, nicht auf der Rollen-Liste selbst).
- **Zurücksetzen**-Button.
- Live-Zusammenfassung: "N von 12 Bereichen konfiguriert" + Zähler je Level.

### 8.3 Rollen-Detailseite

**Ansicht:** Tabelle, eine Zeile je Bereich — Bereich, Beschreibung, Recht (farbiger Pill), Sichtbarkeit (Scope-Label oder "—").

**Bearbeiten** (`?edit=1`, Gate: `roles:write`+): eine Karte je Bereich mit **Radio-Buttons** für Level, reaktiv (ohne Reload) passende Sichtbarkeits-Radios (own/team/all bzw. all/assigned), darunter Checkbox-Gruppen für Löschen/Audit-Sichtbarkeit/Datei-Rechte/Schichten-Level. Andere Darstellung als der Erstellen-Dialog (Radios/Checkboxen statt Pills/Chips), gleiches Datenmodell.

**Löschen**-Button erscheint **nur**, wenn alle drei zutreffen: `canDelete`-Flag gesetzt, Rolle ist **keine** Systemrolle, Mitgliederzahl = 0. Serverseitig doppelt abgesichert (`SYSTEM_ROLE`/`ROLE_IN_USE`-Fehler bei Umgehungsversuch).

Es gibt **keine** Mitarbeiter-Zuweisungs-UI auf diesen Screens — Mitgliederzahl ist reine Anzeige, Zuweisung passiert an anderer Stelle (Mitarbeiter-Bearbeiten).

### 8.4 API-Referenz

→ API-Dokumentation-Vollstaendig.md Abschnitt 11 (`/api/tenants/[tenant]/roles`) und `GET /api/permission-config` (statische Referenzdaten für den Editor: 12 Bereiche, 4 Level, 4 Scopes).

### 8.5 Auffälligkeiten

- Rollen-Liste hat keine Suche (die einzige Suche im Rollen-Bereich steckt im Erstellen-Dialog, s. o.).
- Drei unterschiedliche visuelle Darstellungen (Tabelle read-only / Pills+Chips beim Anlegen / Radios+Checkboxen beim Bearbeiten) für dasselbe Datenmodell — funktional konsistent, aber optisch uneinheitlich.

---

## 9. Bekannte Lücken & nicht-funktionale UI-Elemente (übergreifend)

| Screen | Element | Befund |
|---|---|---|
| Mitarbeiter | Suchfeld + Standort-Filter (Liste) | Rein dekorativ, kein `onChange`, keine Filterlogik |
| Urlaub | Filter-Tabs Alle/Ausstehend/Genehmigt/Abgelehnt | Rein dekorativ, kein `onClick` |
| Krankheit | — | Kein Suchfeld/Filter überhaupt vorhanden |
| Dateien | — | Kein Suchfeld/Filter/Sortierung überhaupt vorhanden (größte Lücke) |
| Teams | — | Kein Suchfeld überhaupt vorhanden |
| Standorte | — | Kein Suchfeld überhaupt vorhanden |
| Erinnerungen | Filter-Pillen (Alle/Abgelaufen/Dringend/Kategorien) | Rein dekorativ, kein `onClick` |
| Rollen | — | Keine Suche auf der Liste (nur innerhalb des Erstellen-Dialogs funktioniert eine Bereichs-Suche) |

**Fazit zur Suchfunktion:** Aktuell funktioniert Volltextsuche an genau zwei Stellen im gesamten Dashboard wirklich: im Datei-Verlinkungs-Picker der Erinnerungen (Abschnitt 7.2) und in der Bereichs-Suche des Rollen-Erstellen-Dialogs (Abschnitt 8.2). Alle anderen sichtbaren Such-/Filterelemente sind entweder Attrappen oder fehlen ganz. Wer serverseitig gefilterte/durchsuchbare Listen will, müsste das für jeden der acht Screens neu bauen (Query-Param + `where`-Klausel je nach Feld, ähnlich wie z. B. `filesUploaderScopeWhere` in `lib/files-server.ts` bereits für Scope-Filterung existiert).

Weitere Auffälligkeiten (nicht such-bezogen):

| Screen | Element | Befund |
|---|---|---|
| Teams | "Vakante Stellen"-Kachel (Liste + Detail) | Hartkodierter Wert "2", keine echte Berechnung |
| Standorte | "Offene Stellen"-Kachel, Caption | Hartkodiert "Frühschicht Do.", nicht dynamisch |
| Standorte | `shiftCount`/`openPositions`/`utilization` | Gespeicherte Felder, nicht live aus Schichtdaten berechnet |
| Dateien | "Geschützt"-Metrik | Zählt praktisch immer = Gesamtzahl der Dateien (Logikfehler) |
| Dateien | Versions-Metadaten (Uploader/Datum je Version) | Auf der Detailkarte synthetisch erzeugt, nicht real (Download selbst funktioniert korrekt) |
| Mitarbeiter | `LegacyContractTab` | Toter Code, nicht gerendert |
| Mitarbeiter | `EmergencyContactsEditor.tsx` | Verwaiste Komponente, nirgends importiert |
| Mitarbeiter | Mitarbeiterstatus (active/vacation/absent) | Rein manuell gesetzt, nicht automatisch mit genehmigtem Urlaub synchronisiert |
| Krankheit | Datums-Widget | Erfassen-Drawer nutzt `DatePickerField`, Bearbeiten-Drawer natives `<input type="date">` — inkonsistent |
| Urlaub / Teams (Mitgliederverwaltung) | Audit-Log | Admin-erstellte Urlaubsanträge und Team-Mitgliedsänderungen (hinzufügen/entfernen/Rolle/Leitung) erzeugen keinen Audit-Log-Eintrag — nur Team anlegen/ändern/löschen wird auditiert |
