# Priorisierter Behebungsplan – Ployo

Stand: 06.09.2026. Referenz-Commit: `7afa0c5f5977292ed996a3c1ab5f462e14404598`.

Grundlage: [vollständiger Auditbericht](AUDIT_REPORT.md). Dieser Plan beschreibt künftige Arbeiten; keine Behebung wurde im Audit ausgeführt. Severity, Voraussetzungen, Beweise und Regressionstests stehen dort je ID. Abhängigkeiten dienen der technischen Koordination; dringende isolierte Korrekturen sollen dadurch nicht unnötig verzögert werden.

## Umsetzung und Abnahme

1. **Zugriffsgrenzen:** C01–C03 schließen und bestehende Rollen/Relationen read-only inventarisieren. Autorisierung zentralisieren, dann alternative Action-/API-/Dateipfade korrigieren. Fehlberechtigungen nur mit nachvollziehbarer Bestandskorrektur bereinigen.
2. **Dokumente und Identität:** Gleiches Rechteobjekt für Versionen und Fachdateien, sicheren Content-Typ/Origin, strikt authentifizierte PIN-Freischaltung und getrennten Tenant-/Global-Account-Lifecycle herstellen.
3. **Löschung:** Vorhandene Daten nicht unkontrolliert löschen. Zweck-/Frist-/Hold-Entscheidung, dauerhaftes Löschmanifest, Retry und Storage-Abgleich vor Bestandsbereinigung einführen. Alte Orphans nicht nur anhand vermeintlich fehlender DB-Referenzen ungeprüft entfernen.
4. **HR und Datenschutz:** Urlaub/Arbeitszeit-/Retention-Regeln mit HR/Juristen abstimmen; Betroffenenexport, Consentwiderruf, Benachrichtigungskanäle und Empfängerscope vollständig testen.
5. **Betrieb:** Next-Sicherheitsupdate, vollständiger Dependency-Scan, isoliertes CI-Testziel, atomare Releases und Restore-Test mit dokumentierten Freigabekriterien.

Abnahme: P0/P1-Regressionen bestehen in isolierter Umgebung; negative Tests mit zwei Tenants und eingeschränkten Rollen sind obligatorisch. P0-Bestandsbereinigung ist nachvollziehbar, unerwartete S3-/DB-Fehler verlieren keine Löschaufträge, Versionen behalten ihren Schutz, widerrufene Zugriffe funktionieren nicht weiter. Produktive Wirksamkeit und offene Vertrags-/Hostingfragen separat belegen. Für HR-Salden-/Compliancezusagen sind M01–M04 ebenfalls vorab erforderlich.

Aufwand: S = begrenzt, M = mehrere Pfade/Tests, L = bereichsübergreifend/Migration, XL = Daten-/Prozessmodell mit Fachabstimmung. Keine Termin-/Personentagszusage; Bestandsanalyse, juristische Prüfung und Kundenkommunikation zusätzlich planen.

### P0 – Sofort / Production Blocker

| ID | Maßnahme | Betroffene Dateien | Aufwand | Abhängigkeiten |
|---|---|---|---|---|
| C01 | Ein einziges kanonisches Rollen-Template einschließlich Scope und Flags verwenden; Rollen bei Tenant-Anlage atomar initialisieren. Bestehende so erzeugte Rollen identifizieren und nach Abgleich mit bewusst angepassten Rollen korrigieren. | `lib/invitation-service.ts`; `lib/roles.ts`; `lib/role-service.ts`; `lib/tenants.ts`; `prisma/schema.prisma` | L | — |
| C02 | Mandantenentzug auf genau die Membership und Mitarbeiter-Verknüpfung in A begrenzen. Globale Kontolöschung ausschließlich als gesonderten, authentifizierten Kontoinhaber-/Betreiberprozess ausführen. | `lib/employee-service.ts`; `lib/account-service.ts`; `app/api/tenants/[tenant]/employees/[employeeHandle]/access/route.ts` | L | — |
| C03 | Location per id UND authenticated tenant auflösen. Tenantkonsistenz für alle Relationen ergänzen, möglichst über zusammengesetzte FKs; Rückrelationen zusätzlich tenantgebunden lesen. | `lib/shift-service.ts`; `lib/location-service.ts`; `app/api/me/team-shifts/[shiftId]/route.ts`; `prisma/schema.prisma` | M | — |

### P1 – Vor Production / bei laufendem Betrieb umgehend

| ID | Maßnahme | Betroffene Dateien | Aufwand | Abhängigkeiten |
|---|---|---|---|---|
| H01 | Fachliche Berufsrolle und Autorisierungsrolle trennen. Membership-Änderungen nur über einen zentralen Rollenadministrator-Service mit zulässiger Delegation und Audit durchführen. | `lib/employee-service.ts`; `lib/api/employee-input.ts`; `lib/role-service.ts`; `lib/roles.ts` | M | C01 |
| H02 | Einladungs-/Rollenadministration und Voll-Export als explizite Fähigkeiten modellieren; keine Vergabe höherer Rechte als selbst delegierbar. Exportauswahl und Output nach Fachrechten filtern. | `lib/settings-service.ts`; `lib/tenant-export.ts`; `app/api/tenants/[tenant]/invitations/route.ts`; `app/api/tenants/[tenant]/export/route.ts` | M | H01 |
| H03 | Berechtigungsfilter und Nutzersuche ausschließlich mit AND verknüpfen; fehlende Scope-Zuordnung muss eine leere Menge ergeben. Gemeinsame Query-Builder für alle Listen verwenden. | `lib/employee-service.ts`; `lib/tenant-access.ts` | M | — |
| H04 | Einheitlichen Actor- und Scope-abhängigen Response-DTO für GET, POST, PATCH und Server Actions verwenden; Default für sensible Felder auf ausgeschlossen setzen. | `lib/employee-service.ts`; `app/api/tenants/[tenant]/employees/[employeeHandle]/route.ts` | M | — |
| H05 | Objekt- und Beziehungsscope zentral im Service vor jeder Mutation erzwingen, einschließlich Zielmitarbeiter, Zielteam und Zielstandort. Delete-Flags ergänzen Scope, ersetzen ihn nicht. | `lib/shift-service.ts`; `lib/team-service.ts`; `lib/location-service.ts`; `lib/employee-service.ts`; `lib/vacation-service.ts`; `lib/reminders.ts`; `app/(dashboard)/u/[tenant]/teams/actions.ts` | L | C03, H03 |
| H06 | Gemeinsame autorisierte Dateiauflösung für Read/Write/Delete/Version/Visibility einführen; Fachbereich, Owner-Scope, ACL und gegebenenfalls PIN prüfen. | `lib/storage/storage.service.ts`; `app/api/tenants/[tenant]/files/[fileId]/versions/route.ts`; `app/api/tenants/[tenant]/files/[fileId]/route.ts` | L | H05 |
| H07 | Unveränderliche logische Dokument-ID mit separaten Versionen modellieren; Autorisierung und Kategorie am logischen Dokument prüfen. Metadaten vollständig übernehmen, aktuelle Fachverknüpfung konsistent fortschreiben und referenzierte Eltern nicht vorzeitig purgen. | `lib/storage/storage.service.ts`; `lib/self-service.ts`; `lib/file-access.ts`; `app/api/cron/cleanup/route.ts`; `prisma/schema.prisma` | L | H06, H11 |
| H08 | Dateityp serverseitig erkennen und Allowlist durchsetzen; untrusted Dateien als attachment oder auf separater cookieloser Origin mit Sandbox ausliefern. Versionsupload identisch validieren. | `lib/storage/storage.service.ts`; `lib/self-service.ts`; `lib/storage/file-stream.ts`; `app/api/tenants/[tenant]/files/[fileId]/content/route.ts`; `proxy.ts` | M | H06 |
| H09 | Für Sicherheitstokens einen strikt authentifizierenden Parser ohne Klartext-Kompatibilität verwenden; User/Session, Tenant und Ablaufzeit kryptografisch binden. Secure-Flag für diesen Cookie ergänzen. | `lib/folder-pin.ts`; `lib/encryption.ts` | S | — |
| H10 | Dedizierte Entscheidungskompetenz und Trennung zum Antragsteller einführen; Änderungen relevanter Felder erzeugen neue Revision/Freigabe. Statusübergänge mit Compare-and-Set atomar erzwingen. | `lib/vacation-service.ts`; `lib/roles.ts`; `lib/tenant-access.ts` | M | — |
| H11 | Dauerhaften Löschauftrag/Outbox mit Objekt-ID und Status verwenden. Metadaten erst nach bestätigter Objektlöschung bzw. nachweislich fehlendem Objekt abschließen; Fehler mit Retry und Alarm behandeln. | `lib/storage/delete.ts`; `lib/employee-service.ts`; `app/api/cron/cleanup/route.ts` | L | — |
| H12 | Zentrale, dokument- und zweckbezogene Löschentscheidung in jedem Einstiegspfad einschließlich Jobs erzwingen; Hold auf betroffene Kategorien/Beweismittel ausdehnen. Ausnahmen begründen und auditieren. | `lib/employee-service.ts`; `lib/storage/storage.service.ts`; `lib/retention-service.ts`; `app/api/cron/cleanup/route.ts`; `app/(dashboard)/u/[tenant]/employees/actions.ts` | L | H11, M04 |
| H13 | Auf einen aktuell sicherheitsgepflegten gepatchten Release aktualisieren; mindestens 16.2.11 behebt genau dieses Advisory, ist aber kein Vollständigkeitsnachweis für weitere Advisories. Vollständigen Lockfile-Scan nachholen. | `package-lock.json`; `package.json`; `app/**/actions.ts` | M | — |
| H14 | Empfänger anhand konkreter Mitarbeiter-/Planungssicht bestimmen; außerhalb berechtigter Gesundheitskontexte nur neutral „nicht verfügbar“ und möglichst inhaltsarme Push-Hinweise senden. Reminder ebenso fachlich schützen. | `lib/shift-service.ts`; `lib/notifications/events.ts`; `lib/notifications/dispatch.ts`; `lib/retention-service.ts` | M | H05, M11 |
| H15 | Dieselbe fachliche Autorisierung auf Metadaten, Ordner, Such-/Formularoptionen und Dateiinhalt anwenden. Für reine Auswahlfelder nur notwendige, sichtbare Minimaldaten liefern. | `lib/files-server.ts`; `lib/reminders.ts`; `lib/shift-service.ts`; `app/api/tenants/[tenant]/files/route.ts`; `app/api/tenants/[tenant]/reminders/file-options/route.ts` | M | H03, H06 |

### P2 – Kurzfristig

| ID | Maßnahme | Betroffene Dateien | Aufwand | Abhängigkeiten |
|---|---|---|---|---|
| M01 | Anspruch/Verbrauch auf datierten Arbeitskalender und Standortfeiertage stützen; Date-only-Arithmetik statt Millisekundendifferenz. Anzeige von Kalenderdauer und Belastung getrennt führen. | `lib/vacation-service.ts`; `lib/vacations.ts`; `lib/self-service.ts` | L | — |
| M02 | Jahresübergreifende Tage splitten, datierte Anspruchsquelle vereinheitlichen, Überträge/Korrekturen einschließlich Krankheit erfassen. Verfallsentscheidung nur mit juristisch geprüftem Regelwerk und Hinweisdokumentation. | `lib/self-service.ts`; `lib/employee-service.ts`; `lib/vacations.ts`; `lib/contract-service.ts` | L | M01, H10 |
| M03 | Datierte Arbeits-/Pausenintervalle mit Zeitzone modellieren; Regelprofile fachlich prüfen, Ausnahmen nachvollziehbar dokumentieren, Überschneidungen sperren. Bei Veröffentlichung/Reset dieselben zentralen Regeln und aktuelle Schutzmerkmale anwenden. | `lib/shift-service.ts`; `lib/arbzg-rules.ts`; `lib/shift-break-rule.ts`; `lib/self-service.ts` | XL | H05 |
| M04 | Dokumentarten und gesetzliche Fristauslöser fachlich trennen; Jahresendregel, Betriebsprüfungen und Sonderverlängerungen abbilden. Für personaldaten tatsächlichen Austritt und Zweck statt bloßem Offboarding-Klick verwenden. | `lib/data-retention.ts`; `lib/retention-service.ts`; `tests/data-retention.test.ts`; `Loeschkonzept.md` | M | — |
| M05 | Verarbeitungsgraph pro Person und Zweck führen; Löschung/Pseudonymisierung klar benennen, referenzierte Kopien und externe Dienste berücksichtigen. Einzelne fällige Krankheitsfälle unabhängig von neueren bearbeiten; Abschluss nur bei überprüftem Gesamtzustand. | `lib/retention-service.ts`; `lib/data-retention.ts`; `app/api/cron/cleanup/route.ts`; `prisma/schema.prisma` | XL | H11, H12, M04 |
| M06 | Exports klar beschriften und einen vollständigen, nachvollziehbaren DSAR-Prozess mit Datenmanifest, Prüfung Drittrechte und sicherer Bereitstellung ergänzen. Fachlich notwendige Entschlüsselung konsistent durchführen. | `lib/self-service.ts`; `lib/tenant-export.ts`; `app/api/me/export/route.ts`; `lib/processing-register.ts`; `prisma/schema.prisma` | L | H02, M05 |
| M07 | Standard-Delete deaktivieren oder denselben zentralen Lifecycle über sichere Hooks erzwingen; Provider-Revoke, Sole-Owner-Übergabe und Datenfristen vor globaler Löschung behandeln. | `lib/auth.ts`; `lib/account-service.ts` | M | C02, M05 |
| M08 | Gemeinsamen persistenten Login-Limiter auch vor direkten Server-API-Aufrufen verwenden, gebunden an Account plus vertrauenswürdig ermittelte Clientquelle. | `app/invite/[token]/actions.ts`; `lib/auth.ts` | M | — |
| M09 | Für HR-Zugriffe zeitnahe Revocation garantieren, etwa ohne Session-Cookie-Cache oder mit wirksamer serverseitiger Session-Versionprüfung. Gewolltes Restfenster transparent definieren. | `lib/auth.ts`; `lib/tenant-access.ts` | M | — |
| M10 | Bei Widerruf Replay/optionale Traces aktiv stoppen und Puffer gemäß Policy behandeln oder sicher neu laden. Datenschutzhinweise nach tatsächlich getrennten Verarbeitungszwecken korrigieren. | `components/CookieConsent.tsx`; `instrumentation-client.ts`; `sentry.server.config.ts`; `sentry.edge.config.ts`; `app/(legal)/datenschutz/page.tsx` | M | — |
| M11 | Einheitliche Entscheidung pro Kanal aus Tenant- und User-Einstellungen sowie Fachberechtigung berechnen; E-Mail nicht als globalen Versand-Schalter missbrauchen. | `lib/settings-service.ts`; `lib/notifications/events.ts`; `lib/notifications/dispatch.ts` | M | — |
| M12 | Schutzklassen über alle Datenmodelle vereinheitlichen, Tokenverschlüsselung samt Migration/Rotation prüfen. Entschlüsselungsfehler als gesperrten Fehlerzustand mit Alarm behandeln, nicht als leere Nutzereingabe. | `lib/contract-service.ts`; `lib/self-service.ts`; `lib/encryption.ts`; `lib/auth.ts`; `prisma/schema.prisma` | L | — |
| M13 | Entity→Bereich→Scope serverseitig ableiten; definierte Ereignisliste mit transaktionaler Outbox abdecken. Strukturierte PII-arme Fehlercodes und rekursive Allowlist-Redaktion; append-only Audit-Rechte technisch/betrieblich trennen. | `lib/audit.ts`; `app/api/tenants/[tenant]/audit/route.ts`; `lib/shift-service.ts`; `lib/storage/storage.service.ts`; `lib/logger.ts`; `lib/email.ts`; `app/(dashboard)/u/[tenant]/employees/actions.ts` | L | H05 |
| M14 | Checkout pro Tenant und Plan atomar/idempotent koordinieren; Event-IDs persistieren und aktuellen Subscription-Zustand konsistent aus verifizierter Quelle abgleichen. | `lib/billing-service.ts`; `app/api/webhooks/stripe/route.ts` | M | — |
| M15 | Tests gegen explizit erzeugte Wegwerf-DB mit hartem Zielguard; Seed gegen Production sperren. Release in separatem Verzeichnis bauen, prüfen und atomar umschalten; Migration-/Rollbackplan und fehlschlagende Drift-Gates ergänzen. | `tests/setup.ts`; `tests/e2e/fixture.ts`; `scripts/seed-review-demo.ts`; `scripts/deploy.sh`; `.github/workflows/ci.yml` | M | — |
| M16 | Aktuelle überlappende/open Fälle unabhängig vom historischen Chartfenster laden; Statistik und aktuelle operative Liste getrennt berechnen. | `lib/sickness.ts` | S | — |

### P3 – Hardening

| ID | Maßnahme | Betroffene Dateien | Aufwand | Abhängigkeiten |
|---|---|---|---|---|
| L01 | Secrets nur dem benötigten Serviceaccount zugänglich machen, getrennte Umgebungen und Rotation nach tatsächlicher Exposition. Demo-Konten strikt auf isolierte Umgebungen begrenzen. | `.env`; `.gitignore`; `lib/auth.ts`; `scripts/seed-review-demo.ts`; `tests/e2e/fixture.ts` | S | — |
| L02 | Actions auf geprüfte SHAs pinnen; aktuelle Advisory-/Secret-Gates mit begründeten, ablaufenden Ausnahmen integrieren. | `.github/workflows/ci.yml`; `.github/dependabot.yml`; `package-lock.json` | M | — |
| L03 | Profilsicht festlegen und gegebenenfalls gemeinsame Membership bzw. ausdrückliche Freigabe verlangen; globale ID allein nicht als Sichtberechtigung behandeln. | `app/api/avatar/[userId]/route.ts` | S | — |
| L04 | Nicht unterstützte Sicherheitsoption ablehnen oder konkret spezifizierte Laufzeit serverseitig durchsetzen. | `lib/settings-service.ts`; `lib/auth.ts` | S | — |

## Zusätzliche Freigabenachweise ohne eigenständige bestätigte Schwachstelle

- Tatsächliche Deployment-/DB-/Storage-/Backupregion und Schutzkonfiguration erfassen.
- AVV/Unterauftragnehmer/Transfers, freigegebene TOMs/VVT/DSFA und reale Betroffenenverfahren belegen.
- Arbeitszeitmodelle, Tarif-/Betriebsvereinbarungen, Schutzregeln und Dokumentfristen fachlich freigeben.
- Nach fehlgeschlagenem npm-Scan vollständige aktuelle Advisory-Prüfung nachholen: **EXTERNE CVE-PRÜFUNG ERFORDERLICH**.
- Bei tatsächlichem Verdacht auf frühere Offenlegung Incident-Prozess starten; Codefehler allein nicht als nachgewiesenen meldepflichtigen Vorfall behandeln.

Für nicht aus dem Repository belegbare Betriebs-/Vertragsaspekte gilt: **NICHT VERIFIZIERBAR – manuelle Prüfung erforderlich**.
