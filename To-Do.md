# To-Do — Live-Gang Ployo

Stand: 2026-08-13. Blocker, Sollte-behoben-werden und Responsive Design (inkl. gestapelter Tagesansicht für die Schichtplanung) sind vollständig umgesetzt und committet. i18n-String-Extraktion läuft, ist aber bei 108 Dateien kein Ein-Sitzungs-Umfang — aktueller Fortschritt und exakter Wiedereinstiegspunkt unten.

## 🙋 Braucht weiterhin deine Aufmerksamkeit

- AVV (Auftragsverarbeitungsvertrag) mit Sentry abschließen — externer Vertrag, braucht deine Unterschrift/deinen Sentry-Account. Solange offen: Sentry sendet mit Consent Fehler-/Replay-Daten ohne unterschriebenen AVV — rechtlich das größte verbleibende Risiko. — **[Du]**
- Rechtstexte (Impressum/Datenschutz/AGB) final von einem Anwalt gegenlesen lassen, Cookie-Kategorien-Formulierung kurz selbst gegenlesen — laut dir für später vorgemerkt, hier nur als Erinnerung stehen gelassen. — **[Du]**
- Sprachumfang bestätigt: nur DE + EN, keine weiteren Sprachen. ✅ erledigt/entschieden

## ✅ Blocker, Sollte-behoben-werden, Responsive Design — vollständig erledigt

### Blocker (Commit `62f06dc`)
- Sentry: `dataCollection` in allen drei Config-Dateien restriktiv gesetzt (`userInfo`, `cookies`, `httpHeaders`, `httpBodies`, `urlQueryParams`, `databaseQueryData`, `stackFrameVariables` alle explizit aus) statt der SDK-Vollsammlung durch das leere `{}`
- Sentry-Replay/-Tracing (`instrumentation-client.ts`) hinter Cookie-Consent gestellt; Basis-Fehlererfassung bleibt aktiv (Betriebssicherheit)
- `lib/logger.ts`: PII (E-Mail, Stripe-Customer-ID) wird vor `Sentry.captureMessage` redigiert, lokales JSON-Log bleibt vollständig
- Cookie-Consent-Banner (`components/CookieConsent.tsx`) inkl. Reopen-Link „Cookie-Einstellungen“ im Landing- und Legal-Footer
- Rechtsform im Impressum: Einzelunternehmen bestätigt; Widerspruch „Ployo GmbH“ in drei Footern (Landing, Auth-Layout, Company-Create) bereinigt zu „Ployo“
- AGB §6: echter Mandanten-Datenexport gebaut (`lib/tenant-export.ts`, `/api/tenants/[tenant]/export`, Button in Einstellungen → Unternehmen → Daten & Aufbewahrung); eigener Konto-Export jetzt auch von der Konto-Seite aus verlinkt
- Datenschutzerklärung um Sentry (§8) und Stripe (§9) als Auftragsverarbeiter ergänzt, §3 Cookies an den neuen Consent-Flow angepasst
- Veraltete „Platzhalter ausfüllen“-Kommentare in `impressum/page.tsx` und `agb/page.tsx` entfernt

### Sollte behoben werden (Commit `62f06dc`)
- 2FA-Verifizierung (`/two-factor/verify-totp`, `/two-factor/verify-backup-code`) eigenes 5-Requests/5-Minuten-Limit statt generischem 60/60s
- better-auth Session-/Cookie-Konfiguration explizit gepinnt (`expiresIn`, `updateAge`, `freshAge`, `cookieCache`, `useSecureCookies`, `defaultCookieAttributes`)
- Alle uncommitteten Dateien committet (Postgres-Migrationshistorie + Feature-Arbeit, nach Secret-Scan)

### Responsive Design (Commits `9d327a6`, `dc254eb`)
1. Globale Shell/Navigation → Off-Canvas-Menü unterhalb `md:` (Hamburger, Backdrop, Auto-Close bei Linkklick)
2. `DataTable.tsx` → Karten-Fallback unterhalb `md:` statt reinem Querscroll
3. Teams/Standorte/Dateien → spot-geprüft, bereits in Ordnung
4. Rollen-Seite → auf `DataTable` umgestellt
5. `RolePermissionAreaFields`/`EmployeeQuickView` → `sm:`-Fallback für die Radio-/Info-Grids ergänzt
6. Schichtplanung → Schicht-Vorlagen-Zeile responsive gemacht; **echte gestapelte Tagesansicht für Mobile ergänzt** (`ShiftPlanningClient.tsx`, `LocationShiftPlanner.tsx`: gemeinsamer `renderShiftDay()`-Renderer für Querscroll-Grid am Desktop und vertikal gestapelte Tagesabschnitte unterhalb `md:`)

Visuell nicht live getestet (kein `next dev` möglich, siehe unten) — nur Code-Review/tsc/eslint.

## 🌍 i18n — läuft, Wiedereinstiegspunkt für nächste Session

**Fertig und committet** (Commits `f3dd1ac`, `b751e54`, `f8ebc17`, `00df687`, `6c294b9`):

- **Infrastruktur**: `lib/i18n.ts` löst die Locale jetzt auch für Seiten ohne Session auf (neuer `ployo-locale`-Cookie als Fallback vor der DB-Präferenz); `NextIntlClientProvider` einmalig ins Root-Layout gezogen statt dupliziert im Dashboard-Layout; `components/LocaleSwitcher.tsx` (schlanker DE/EN-Umschalter für Login/Marketing/Legal) in `(auth)`-Layout, `(legal)`-Layout und Landingpage-Footer eingehängt; `switchLanguageAction` (Konto, für eingeloggte Nutzer) setzt den Cookie zusätzlich zur DB-Präferenz.
- **Auth-Modul** (15 Dateien): kompletter Login-/Registrierungs-/Reset-/2FA-/Bestätigungs-/Unternehmensauswahl-Flow inkl. `AuthHeader`/`AuthSegmented`.
- **Dashboard-Shell**: `components/Navigation.tsx` (1600+ Zeilen) komplett — Nav-Items, Sidebar-Chrome, kompletter Einstellungen-Dialog mit allen 7 Tabs.
- **Mitarbeiter-Modul, Teil 1**: `employees/page.tsx` (Liste inkl. Filter/Suche/Spalten), `EmployeeQuickView.tsx`, `InviteEmployeeButton.tsx`, `EmployeeSelector.tsx`, `EmployeeContracts.tsx`, `EmployeeInfoRequestButton.tsx`.

DE/EN-Key-Parität nach jedem Modul geprüft (0 fehlende Keys in beide Richtungen), tsc/eslint/vitest jeweils grün.

**Nicht angefasst, bewusst**: `metadata.title`-Exports (Browser-Tab-Titel — würde `generateMetadata()` in jeder Page-Datei brauchen, geringer Nutzerwert); Rechtstexte (Impressum/Datenschutz/AGB) bleiben inhaltlich deutschsprachig, nur die Shell drumherum (Nav, Footer) ist an next-intl angeschlossen.

**Noch offen — ca. 84 von 108 Dateien.** Auf deine Entscheidung hin (2026-08-13, "erstmal stoppen, Rest später") hier gestoppt. Empfohlene Reihenfolge für den Wiedereinstieg, gleiche Methode wie bisher (Namespace in `messages/de.json`+`en.json`, Komponente umstellen, Parität prüfen, tsc/eslint/vitest, committen):

1. **Mitarbeiter-Modul fertigstellen**: `SelfServiceEmployeeLink.tsx` (308 Zeilen), vor allem `employees/[employeeId]/page.tsx` — die Personalakte-Detailseite, mit 1697 Zeilen die größte Einzeldatei im ganzen Projekt (größer als `Navigation.tsx` war). Realistisch eigener Arbeitsblock.
2. **Rollen/Teams/Standorte**: `rollen/page.tsx` (Grid-Teil, DataTable-Spalten schon auf Deutsch hartkodiert), `rollen/[roleId]/page.tsx`, `CreateRoleButton.tsx`, `RolePermissionAreaFields.tsx`, `TeamRoleEditorButton.tsx`, `teams/page.tsx`, `teams/[teamId]/page.tsx`, `TeamEditControls.tsx`, `CreateTeamButton.tsx`, `standorte/page.tsx`, `standorte/[locationId]/page.tsx`, `CreateLocationButton.tsx`, `AddLocationEmployeesButton.tsx`.
3. **Schichtplanung**: `ShiftPlanningClient.tsx`, `LocationShiftPlanner.tsx` (beide groß, gerade erst für Mobile responsive gemacht — Struktur ist frisch im Kopf, guter Anschluss), zugehörige `schichtplanung/`-Seiten und Actions-UI.
4. **Urlaub/Krankheit/Erinnerungen**: jeweilige `page.tsx` + `AbsenceActionButtons.tsx`, `CreateReminderButton.tsx` u. Ä.
5. **Dateien**: `dateien/page.tsx`, `dateien/[...path]/page.tsx`, `FilesBrowser.tsx`, `FilesPageContent.tsx`, `FileActionButtons.tsx`.
6. **Einstellungen/Konto/Abrechnung außerhalb Navigation.tsx**: `konto/page.tsx` (teilweise schon über `AccountPreferences`-Namespace angebunden), `ChangeEmailForm.tsx`, `TwoFactorSettingsCard.tsx`, `AvatarUploadForm.tsx`.
7. **Marketing/Legal-Shell**: Landingpage (`app/page.tsx`), `(legal)`-Layout-Reststrings — Rechtstexte selbst bewusst außen vor (siehe oben).

Am Ende: das `disclaimer` in `AccountPreferences` ("Sprache wirkt sich bereits auf diesen Bereich aus — Rest folgt schrittweise") aktualisieren/entfernen, sobald wirklich alles übersetzt ist.

## 🗒️ Sonstiges

- `vectorized-foraging-tiger.md` im Repo-Root ist ein Planungs-Leftover aus einer früheren Session (Rollen/Berechtigungs-Overhaul) — der beschriebene Stand ist laut `prisma/schema.prisma` bereits umgesetzt (`canDelete`, `canUploadFiles` etc. existieren). Datei ist unverändert liegen geblieben (nicht committet) — sag Bescheid, ob ich sie löschen soll.
- `Farben-Dashboard.md` und `Prompt-Mitarbeiter-App-Design.md` im Repo-Root sind während dieser Session neu aufgetaucht (nicht von mir angelegt, vermutlich deine eigene Arbeit direkt im Dateisystem/IDE) — ebenfalls unangetastet und nicht committet gelassen.

## ✅ Bereits verifiziert (keine Aktion nötig)

- `tsc --noEmit`, `eslint`, `vitest` (86 Tests) — sauber, nach jedem Commit dieser Runde erneut geprüft
- Google/Apple-OAuth korrekt deaktiviert, kein Crash-Risiko
- 2FA-Pflicht pro Mandant serverseitig erzwungen (nicht nur UI)
- Passwort-Reset/E-Mail-Verifizierung vollständig verdrahtet
- Stripe: Webhook-Signatur, Abo-Sync, Promo-Codes — alles korrekt
- Konto-Löschung: echte End-to-End-Funktion (30 Tage Frist, Cascade-Delete, S3-Purge)
- Cronjobs (Cleanup + Erinnerungs-Digest) live installiert und laufend
- CSP/Security-Header live gegen laufenden Prozess geprüft — korrekt gesetzt
- Prisma-Migrationshistorie konsistent mit Live-DB (`migrate status`: up to date)
- CI-Pipeline auf echtes Postgres + E2E-Tests + Drift-Check umgestellt
