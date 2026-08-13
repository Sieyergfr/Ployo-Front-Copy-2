# To-Do — Live-Gang Ployo

Stand: 2026-08-13, aus vollständiger Projektprüfung (Code-verifiziert). Jeder Punkt ist markiert: **[Ich]** = kann ich ohne weitere Rückfrage umsetzen, **[Du]** = braucht zwingend dich (Wissen/Entscheidung/externe Aktion, die ich nicht habe/darf), **[Du → Ich]** = du entscheidest kurz, danach setze ich um.

## 🙋 Braucht zwingend deine Aufmerksamkeit (Kurzübersicht)

- Rechtsform im Impressum bestätigen (Einzelunternehmen oder GmbH/UG?) Antwort: Einzelunternehmen
- AGB §6 Datenexport-Versprechen: abschwächen oder echten Tenant-Export bauen? Antwort: bauen
- AVV (Auftragsverarbeitungsvertrag) mit Sentry abschließen - Antwort: noch offen
- Sprachumfang für i18n festlegen (reicht de+en, oder mehr?) - Antwort: de + en vorerst
- Freigabe, dass ich die 220 uncommitteten Dateien committen soll - Antwort: committen
- Empfehlenswert, aber nicht von mir prüfbar: Rechtstexte final von einem Anwalt gegenlesen lassen, Cookie-Kategorien-Formulierung kurz selbst gegenlesen - Antwort: Werde ich in zukunft erledigen, abhaken einfach. Cookie banner implementieren

Alles andere unten kann ich direkt umsetzen, sobald du sagst "los".

## 🔴 Blocker (vor Live-Gang zwingend)

- [ ] **Sentry sammelt zu viel.** `dataCollection: {}` (leer, Rest auskommentiert) in `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts` schaltet die sicheren SDK-Defaults ab und aktiviert volle Datensammlung (komplette HTTP-Bodies, DB-Query-Werte, User-Infos, Cookies). Bei einer App mit IBAN/Sozialversicherungsnummer/Steuer-ID/Krankenkasse ein reales Datenleck an einen Drittanbieter. — **[Ich]**
  - [ ] `dataCollection: {}` in allen drei Dateien entfernen bzw. explizit restriktiv setzen (`httpBodies: []`, `databaseQueryData: false`) — **[Ich]**
  - [ ] `Sentry.replayIntegration()` in `instrumentation-client.ts` standardmäßig aus oder hinter Consent stellen — **[Ich]**
  - [ ] Aufrufstellen von `logger.error()`/`logger.warn()` (`lib/logger.ts`) prüfen — `meta`-Objekt geht 1:1 an `Sentry.captureMessage` — **[Ich]**
- [ ] Cookie-Consent-Banner fehlt komplett, obwohl Sentry-Replay/-Tracing ungefragt lädt — Widerspruch zu §3 Datenschutzerklärung. Umsetzung (Banner-Mechanismus, Consent-Gate) — **[Ich]**; Formulierung der Cookie-Kategorien kurz von dir gegenlesen lassen — **[Du]**
- [ ] **Rechtsform im Impressum bestätigen.** Aktuell Annahme Einzelunternehmen (kein HRB genannt). Falls GmbH/UG: HRB-Nummer + Geschäftsführer ergänzen (§5 DDG). Ich kann nicht wissen, welche Rechtsform tatsächlich eingetragen ist — **[Du]**
- [ ] **AGB §6 Datenexport-Versprechen.** Verspricht vollständigen Export "aller relevanten Daten"; `app/api/me/export/route.ts` exportiert nur die Account-Daten des eingeloggten Users, keine HR-/Mandantendaten. Sag mir, welche Richtung: Text abschwächen ODER echten Tenant-Export bauen — **[Du → Ich]** (Umsetzung danach von mir)
- [ ] Datenschutzerklärung um Sentry und Stripe als Auftragsverarbeiter ergänzen (Hosting/SMTP sind bereits korrekt gelistet) — Text **[Ich]**; AVV mit Sentry tatsächlich abschließen (externer Vertrag, braucht deine Unterschrift/Account) — **[Du]**

## 🟡 Sollte behoben werden

- [ ] 2FA-Verifizierung (TOTP/Backup-Code) eigenes, engeres Rate-Limit geben — läuft aktuell nur unter generischem 60-Requests/60s-Limit, brute-forcebar — **[Ich]**
- [ ] Session-/Cookie-Konfiguration von better-auth explizit pinnen (TTL, secure-Flags) statt auf implizite Defaults zu vertrauen — **[Ich]**
- [ ] Alle 220 uncommitteten Dateien committen (komplette Postgres-Migrationshistorie + neue Features liegen nur im Arbeitsverzeichnis) — technisch **[Ich]**, aber ich committe nur auf dein Signal — **[Du → Ich]**
- [ ] Verwaiste "Platzhalter ausfüllen"-Kommentare in `impressum/page.tsx` und `agb/page.tsx` entfernen (echte Daten stehen längst drin) — **[Ich]**

## 📱 Responsive Design (Mobile)

Reihenfolge wichtig — jeder Schritt baut auf dem vorigen auf. Alle Schritte reine Code-Umsetzung — **[Ich]**.

- [ ] **1. Globale Shell/Navigation** — größter Hebel, alles andere hängt daran. `components/Navigation.tsx`: feste `<aside className="sidebar">` (236px / 68px collapsed) in Off-Canvas/Hamburger-Menü unterhalb eines Breakpoints (z. B. `md:`) umbauen. `app/(dashboard)/layout.tsx:127` (`fixed inset-0 flex w-full overflow-hidden`) für mobiles Stacking anpassen
- [ ] **2. Gemeinsame Tabellen-Komponente** — `components/DataTable.tsx` (aktuell `overflow-x-auto` mit `minWidth=900`, kein Karten-Fallback) um mobile Karten-/Stacked-Row-Darstellung erweitern; Employees & andere Tabellen hängen daran
- [ ] **3. Teams, Standorte, Dateien** — bereits größtenteils flex-/card-basiert bzw. mit `sm:grid-cols-2 lg:grid-cols-4` (Dateien); nur Feinschliff/Spot-Check nötig
- [ ] **4. Rollen-Seite** — `app/(dashboard)/u/[tenant]/rollen/page.tsx`: hartkodiertes `grid-cols-[2fr_160px_1.5fr_80px]` durch DataTable oder responsives Card-Layout ersetzen
- [ ] **5. Formular-Ausreißer** — `components/RolePermissionAreaFields.tsx` (`grid-cols-2`/`grid-cols-3`) und `components/EmployeeQuickView.tsx` (`grid-cols-2`) fehlt `sm:`-Fallback; schnelle Fixes, Rest der Formulare ist bereits responsive
- [ ] **6. Schichtplanung** — größter Aufwand, zuletzt: `components/ShiftPlanningClient.tsx:853` (6-Spalten-Grid für Schicht-Vorlagen-Zeile, **kein** `overflow-x-auto`-Wrapper, überläuft auf 375px) fixen; gleiches Muster in `components/LocationShiftPlanner.tsx`; 7-Tage-Wochenraster (`min-w-[900px]`) für Mobile neu denken (gestapelte Tagesansicht statt Querscroll-Kalender)

## 🌍 i18n vollständig implementieren

Ist-Zustand geprüft: Fundament liegt (next-intl verdrahtet, `i18n/request.ts`, `messages/de.json` + `en.json`, Locale-Auflösung über `UserPreference.language` in `lib/i18n.ts`, unterstützte Sprachen aktuell `["de", "en"]`), aber real übersetzt ist nur **1 von 109** Komponenten (`app/(dashboard)/konto/page.tsx`) mit gerade mal 19 Message-Keys. Der Rest der App ist fest auf Deutsch verdrahtet. Marketing-/Login-Seiten sind laut Code-Kommentar bewusst noch nicht angeschlossen.

- [ ] **1. Sprachumfang festlegen** — reicht de+en, oder werden mehr Sprachen gebraucht (z. B. für Schicht-/Servicekräfte oft Türkisch, Polnisch, Rumänisch relevant)? Betrifft eure Zielgruppe, das kann ich nicht entscheiden — **[Du]**
- [ ] **2. Alle hartkodierten deutschen Strings extrahieren** — die 108 verbleibenden Dateien in Message-Keys überführen, sinnvoll in Chunks je Modul (Auth, Dashboard-Shell, Mitarbeiter, Schichtplanung, Urlaub/Krankheit, Dateien, Einstellungen) — **[Ich]**
- [ ] **3. Übersetzungen erstellen** — Erstentwurf für die gewählten Sprachen — **[Ich]**; bei Rechtstexten (Impressum/Datenschutz/AGB) und rechtlich heiklen Formulierungen empfiehlt sich muttersprachliche/fachliche Prüfung, da Übersetzungsfehler dort echte rechtliche Risiken bergen — **[Du]**
- [ ] **4. Sprachumschalter in der UI verdrahten** — aktuell nur auf der Konto-Seite vorhanden, muss in die globale Shell (Navigation/Header) — **[Ich]**
- [ ] **5. Marketing-/Login-/Legal-Seiten ans i18n-System anschließen** — aktuell laut Code bewusst ausgeklammert, ergibt aber erst nach Punkt 1 Sinn — **[Ich]**

## ✅ Bereits verifiziert (keine Aktion nötig)

- `tsc --noEmit`, `eslint`, `vitest` (86 Tests) — sauber
- Google/Apple-OAuth korrekt deaktiviert, kein Crash-Risiko
- 2FA-Pflicht pro Mandant serverseitig erzwungen (nicht nur UI)
- Passwort-Reset/E-Mail-Verifizierung vollständig verdrahtet
- Stripe: Webhook-Signatur, Abo-Sync, Promo-Codes — alles korrekt
- Konto-Löschung: echte End-to-End-Funktion (30 Tage Frist, Cascade-Delete, S3-Purge)
- Cronjobs (Cleanup + Erinnerungs-Digest) live installiert und laufend
- CSP/Security-Header live gegen laufenden Prozess geprüft — korrekt gesetzt
- Prisma-Migrationshistorie konsistent mit Live-DB (`migrate status`: up to date)
- CI-Pipeline auf echtes Postgres + E2E-Tests + Drift-Check umgestellt
