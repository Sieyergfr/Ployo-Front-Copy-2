# To-Do — Live-Gang Ployo

Stand: 2026-08-13. Update: alle **[Ich]**-Punkte aus den Abschnitten Blocker, Sollte behoben werden und Responsive Design sind umgesetzt und committet (Commits `62f06dc`, `9d327a6`, `311690b`). Offen sind nur noch Punkte, die **[Du]** brauchen, plus die vollständige i18n-String-Extraktion (siehe unten — realistisch kein Ein-Sitzungs-Umfang).

## 🙋 Braucht weiterhin deine Aufmerksamkeit

- AVV (Auftragsverarbeitungsvertrag) mit Sentry abschließen — externer Vertrag, braucht deine Unterschrift/deinen Sentry-Account. Solange offen: Sentry sendet mit Consent Fehler-/Replay-Daten ohne unterschriebenen AVV — rechtlich das größte verbleibende Risiko. — **[Du]**
- Rechtstexte (Impressum/Datenschutz/AGB) final von einem Anwalt gegenlesen lassen, Cookie-Kategorien-Formulierung kurz selbst gegenlesen — laut dir für später vorgemerkt, hier nur als Erinnerung stehen gelassen. — **[Du]**
- Sprachumfang über de+en hinaus (z. B. Türkisch/Polnisch/Rumänisch für Schicht-/Servicekräfte) — nur falls gewünscht, sonst bleibt es bei de+en. — **[Du]** Bitte nur DE + EN

## ✅ Erledigt in dieser Runde

### Blocker
- Sentry: `dataCollection` in allen drei Config-Dateien restriktiv gesetzt (`userInfo`, `cookies`, `httpHeaders`, `httpBodies`, `urlQueryParams`, `databaseQueryData`, `stackFrameVariables` alle explizit aus) statt der SDK-Vollsammlung durch das leere `{}`
- Sentry-Replay/-Tracing (`instrumentation-client.ts`) hinter Cookie-Consent gestellt; Basis-Fehlererfassung bleibt aktiv (Betriebssicherheit)
- `lib/logger.ts`: PII (E-Mail, Stripe-Customer-ID) wird vor `Sentry.captureMessage` redigiert, lokales JSON-Log bleibt vollständig
- Cookie-Consent-Banner (`components/CookieConsent.tsx`) inkl. Reopen-Link „Cookie-Einstellungen“ im Landing- und Legal-Footer
- Rechtsform im Impressum: Einzelunternehmen bestätigt; Widerspruch „Ployo GmbH“ in drei Footern (Landing, Auth-Layout, Company-Create) bereinigt zu „Ployo“
- AGB §6: echter Mandanten-Datenexport gebaut (`lib/tenant-export.ts`, `/api/tenants/[tenant]/export`, Button in Einstellungen → Unternehmen → Daten & Aufbewahrung); eigener Konto-Export jetzt auch von der Konto-Seite aus verlinkt (vorher nur als toter API-Endpunkt vorhanden)
- Datenschutzerklärung um Sentry (§8) und Stripe (§9) als Auftragsverarbeiter ergänzt, §3 Cookies an den neuen Consent-Flow angepasst
- Veraltete „Platzhalter ausfüllen“-Kommentare in `impressum/page.tsx` und `agb/page.tsx` entfernt

### Sollte behoben werden
- 2FA-Verifizierung (`/two-factor/verify-totp`, `/two-factor/verify-backup-code`) eigenes 5-Requests/5-Minuten-Limit statt generischem 60/60s
- better-auth Session-/Cookie-Konfiguration explizit gepinnt (`expiresIn`, `updateAge`, `freshAge`, `cookieCache`, `useSecureCookies`, `defaultCookieAttributes`)
- Alle uncommitteten Dateien committet (Postgres-Migrationshistorie + Feature-Arbeit, nach Secret-Scan)

### Responsive Design
1. Globale Shell/Navigation → Off-Canvas-Menü unterhalb `md:` (Hamburger, Backdrop, Auto-Close bei Linkklick)
2. `DataTable.tsx` → Karten-Fallback unterhalb `md:` statt reinem Querscroll
3. Teams/Standorte/Dateien → spot-geprüft, bereits in Ordnung
4. Rollen-Seite → auf `DataTable` umgestellt (vorher hartkodiertes Grid ohne Scroll-Wrapper um die Kopfzeile)
5. `RolePermissionAreaFields`/`EmployeeQuickView` → `sm:`-Fallback für die Radio-/Info-Grids ergänzt
6. Schichtplanung → Schicht-Vorlagen-Zeile in `ShiftPlanningClient.tsx` responsive gemacht (lief vorher auf 375px über); 7-Tage-Wochenraster ist bereits über `overflow-x-auto` scrollbar

  **Offen (bewusst nicht angefasst):** eine echte gestapelte Tagesansicht für das Wochenraster (statt Querscroll-Kalender) wäre die sauberere Lösung, ist aber ein Umbau der Kern-Interaktionslogik einer komplexen, live laufenden Komponente — ohne Möglichkeit, das in dieser Umgebung visuell zu testen (`next dev` würde die von PM2 gemeinsam genutzte `.next`/DB stören), war mir das zu riskant für einen blinden Umbau.

### i18n
- Sprachumschalter (DE/EN) ist jetzt global in der Navigation erreichbar, nicht mehr nur auf der Konto-Seite (`switchLanguageAction` in `konto/actions.ts`, `useLocale()` in `Navigation.tsx`)

  **Offen:** die eigentliche String-Extraktion für die restlichen 108 Komponenten. Das ist kein Fix, sondern eine eigenständige, mehrtägige Übersetzungsarbeit (jede Komponente einzeln durchgehen, Message-Keys ziehen, de+en-Texte schreiben, pro Modul verifizieren) — das habe ich in dieser Session bewusst nicht mechanisch durchgezogen, um nicht unverifizierten Text in eine Live-App zu drücken. Vorschlag: modulweise angehen (Auth → Dashboard-Shell → Mitarbeiter → Schichtplanung → Urlaub/Krankheit → Dateien → Einstellungen → Marketing/Legal), jedes Modul einzeln committen.

## 🗒️ Sonstiges

- `vectorized-foraging-tiger.md` im Repo-Root ist ein Planungs-Leftover aus einer früheren Session (Rollen/Berechtigungs-Overhaul) — der beschriebene Stand ist laut `prisma/schema.prisma` bereits umgesetzt (`canDelete`, `canUploadFiles` etc. existieren). Datei ist unverändert liegen geblieben (nicht committet) — sag Bescheid, ob ich sie löschen soll.

## ✅ Bereits verifiziert (keine Aktion nötig)

- `tsc --noEmit`, `eslint`, `vitest` (86 Tests) — sauber, auch nach allen Änderungen dieser Runde erneut geprüft
- Google/Apple-OAuth korrekt deaktiviert, kein Crash-Risiko
- 2FA-Pflicht pro Mandant serverseitig erzwungen (nicht nur UI)
- Passwort-Reset/E-Mail-Verifizierung vollständig verdrahtet
- Stripe: Webhook-Signatur, Abo-Sync, Promo-Codes — alles korrekt
- Konto-Löschung: echte End-to-End-Funktion (30 Tage Frist, Cascade-Delete, S3-Purge)
- Cronjobs (Cleanup + Erinnerungs-Digest) live installiert und laufend
- CSP/Security-Header live gegen laufenden Prozess geprüft — korrekt gesetzt
- Prisma-Migrationshistorie konsistent mit Live-DB (`migrate status`: up to date)
- CI-Pipeline auf echtes Postgres + E2E-Tests + Drift-Check umgestellt
