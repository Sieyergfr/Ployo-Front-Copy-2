# Nachprüfung des Audit-Behebungsstands

**Stand: 06.09.2026, 23:35 UTC.** Grundlage: [AUDIT_REPORT.md](AUDIT_REPORT.md) und [REMEDIATION_PLAN.md](REMEDIATION_PLAN.md), Referenz-Commit `7afa0c5f5977292ed996a3c1ab5f462e14404598`.

Geprüft wurde der **aktuelle uncommittete Arbeitsbaum**, nicht nur HEAD: 61 geänderte versionierte Dateien, zusätzliche Module, Tests und zwei neue Migrationen. HEAD steht weiterhin auf dem ursprünglichen Audit-Commit. Die eigenen Änderungen des Nutzers wurden nicht bearbeitet. Diese Nachprüfung ergänzt ausschließlich dieses Dokument; der ursprüngliche Auditbericht bleibt als historische Grundlage erhalten.

## Ergebnis

**Viele Änderungen sind tatsächlich umgesetzt. Eine vollständige Erledigung der Auditliste oder eine Produktionsfreigabe kann ich noch nicht bestätigen.** Von den 38 ursprünglichen Punkten sind nach diesem Abgleich **13 im Code umgesetzt und 25 teilweise umgesetzt**. „Teilweise“ bedeutet nicht, dass die Änderung wertlos ist: Ein oft gut geschlossener Einstieg hat noch einen alternativen offenen Pfad, eine fehlende Bestandskorrektur oder einen neu eingeführten Fehler.

**UMGESETZT (Code)** bedeutet: ursprünglicher benannter Fehlerpfad im aktuellen Quellstand geschlossen, mit nachfolgend benannten Prüfgrenzen. Das ist weder ein Nachweis produktiver Ausrollung noch die Behauptung, sämtliche denkbaren Härtungsmaßnahmen seien fertig. **TEILWEISE** bedeutet: belegter Fortschritt, aber mindestens ein relevanter Teil des ursprünglichen Befunds noch offen. Organisatorische/produktive Belege werden separat als **NICHT VERIFIZIERBAR – manuelle Prüfung erforderlich** geführt, nicht als angeblich getestete Umsetzung.

Die wichtigsten verbleibenden Punkte:

1. **H08:** Stored-XSS-Kette über Self-Service-Upload weiterhin vorhanden; generischer Upload ist korrigiert.
2. **H01/H02:** verzögerte Rolleneskalation und tenantweiter Export trotz own-/team-Fachscope.
3. **H05/H06/H07/H14/H15:** Wochenaktionen, Dateimutationen, ältere Dokumentversionen, Krankheitsempfänger und Ordner-Metadaten nicht durchgehend geschützt.
4. **H12:** kategorisierte Löschung kann Legal Hold weiterhin umgehen.
5. **Neue Regressionen:** Owner-Mitgliedschaft ohne Schutz entziehbar; Stripe-Retry nach Fehler verloren; automatischer Urlaubsverfall ohne belegten Hinweis; falscher Next-Release-Pfad.

**Prüfergebnisse:** 93 vorhandene ausgewählte Tests bestanden (12 Dateien), TypeScript `--noEmit --incremental false` bestanden, Prisma-Schema validiert. Zusätzlich 22 isolierte Originalcode-Gegenprüfungen ohne echte DB/Storage/Netzwerk: sowohl behobene als auch fortbestehende Pfade verifiziert. Diese Gegenprüfungen haben bewusst nicht nur die vom Nutzer hinzugefügten positiven Regressionstests wiederholt.

## Status aller 38 Auditpunkte

Die Fundstellen beziehen sich auf den aktuellen Arbeitsbaum. Quellpfade mit Zeilenangaben und Testbelege sind ausdrücklich stärker gewichtet als Fix-Kommentare im Code.

| ID | Status | Nachweisbarer Fortschritt | Offener Rest / Prüfgrenze | Aktuelle Fundstelle |
|---|---|---|---|---|
| **C01** | TEILWEISE | Kanonisches Rollen-Template; atomare Rollenanlage beim Tenant-Create; Einladung nutzt denselben Builder. | Bestehende falsch initialisierte Rollen werden durch update: {} nicht repariert. Bestandsprüfung/-korrektur ist nicht belegt. | `lib/roles.ts:321`; `lib/tenants.ts:312`; `lib/role-service.ts:182–199` |
| **C02** | UMGESETZT (Code) | Zugangsentzug löscht nur Membership im ausgewählten Tenant und dessen Employee-Link. Keine globale User-Löschung mehr. | Der ursprüngliche Cross-Tenant-Fehler ist geschlossen. Neuer Owner-Schutzfehler R01 unten; deshalb keine Gesamtfreigabe dieses Workflows. | `lib/employee-service.ts:2303–2347` |
| **C03** | UMGESETZT (Code) | Update löst locationId mit tenantId auf; Location-Rückrelationen zusätzlich tenantgefiltert. | Produktiv vorhandene inkonsistente Relationen und DB-seitige Tenant-Invarianten separat prüfen. Kein direkter Update-Bypass mehr gefunden. | `lib/shift-service.ts:1484–1493`; `lib/location-service.ts:393,443` |
| **H01** | TEILWEISE | Membership-Synchronisierung nur noch bei roles:write. | Das unprivilegiert gespeicherte role-Feld bleibt manipulierbar. Spätere harmlose Bearbeitung durch einen Rollenverwalter synchronisiert den gespeicherten privilegierten Namen nachträglich. | `lib/employee-service.ts:1834–1838,1977–1987,2110,2182–2188`; `lib/role-service.ts:262–289` |
| **H02** | TEILWEISE | ADMIN/HR-Einladungen durch Custom settings:write werden zu EMPLOYEE heruntergestuft; Export prüft einzelne Fachbereiche. | Export prüft nur Vorhandensein von Leserecht, nicht own/team. Restliche Bereiche und Metadaten bleiben tenantweit; Notfallkontakte/Mutterschutz werden nicht konsequent fachlich gefiltert. | `lib/settings-service.ts:450–463`; `lib/tenant-export.ts:29–38,81–116,135–174,189–208` |
| **H03** | UMGESETZT (Code) | Employee-Suche kombiniert Scope/Filter per AND; leere Team-Sicht in Mitarbeiter-, Vertrags-, Payroll-, Krankheits-, Urlaubs-, Info- und Schichtpfaden geschlossen. | Veränderte Listenpfade statisch abgeglichen; neue Suchfilter künftig gegen Scope-Kreuzprodukt testen. | `lib/employee-service.ts:790–799,995–1004`; `lib/sickness.ts:105–133`; `lib/vacation-service.ts:243–250`; `lib/shift-service.ts:288–295` |
| **H04** | UMGESETZT (Code) | Gemeinsame employeeVisibilityFlags werden bei GET, Create und Update auf den DTO angewendet. | Sensible Antworten der ursprünglichen Create-/PATCH-Kette sind jetzt actorabhängig. Andere Exporte siehe H02. | `lib/employee-service.ts:1529–1540,1846–1865,2169–2172` |
| **H05** | TEILWEISE | Objektguards in vielen Team-/Standort-/Employee-/Reminder-/Schicht-/Urlaubs-Mutationen ergänzt. | Publish/Unpublish/Reset/Template-Wochenpfade bleiben tenantweit. Reset kann fremde Teams desselben Tenants löschen/wiederherstellen. Kategorienlöschung weiterhin ohne Employee-Scope. | `lib/shift-service.ts:1668–1713,1904–1999,2022–2040`; `lib/retention-service.ts:427–438` |
| **H06** | TEILWEISE | ACL/Fachbereich/Ordner-PIN vor Version/Delete/Visibility; Owner-Scope beim generischen Upload ergänzt. | files:own/team (Uploader-Scope) wird bei bekannten zentralen Datei-IDs in den Mutationen nicht wie in Leselisten erzwungen. Kein einheitlicher autorisierter Resolver über alle Eigentümer-/Schreibpfade. | `lib/storage/storage.service.ts:946–992,1098–1128`; `lib/files-server.ts:248–306`; `lib/file-access.ts:62–131` |
| **H07** | TEILWEISE | Neue Version kopiert viele Schutzfelder und hängt Contract-/Payroll-FK um. | Alte weiterhin abrufbare Version verliert die Fachkategorie; Krankheit-FK wird nicht umgehängt. uploadedBy-Felder und Versionskonkurrenz bleiben offen. Keine Bestandsreparatur bereits falsch geschützter Kindversionen. | `lib/storage/storage.service.ts:946–1087`; `lib/file-access.ts:74–92`; `lib/storage/file-stream.ts:25–61` |
| **H08** | TEILWEISE | Generischer Upload/Version nutzt Inhaltsprüfung und serverseitige MIME-Zuordnung. | Self-Service verwendet weiterhin nur validateUploadFile (Name/Größe), speichert Client-MIME und liefert es über inline Content aus. Der ursprüngliche Stored-XSS-Pfad bleibt erreichbar. | `lib/self-service.ts:699–752`; `lib/storage/storage.service.ts:350–456`; `lib/storage/file-stream.ts:173–182`; `app/api/tenants/[tenant]/files/[fileId]/content/route.ts:60–80` |
| **H09** | UMGESETZT (Code) | Eigenes strikt authentifizierendes Cookieformat, Userbindung, Ablauf und Secure-Flag; kein Klartext-Fallback. | Klartext-/Manipulationsfehler geschlossen. Zusätzliche Session-/PIN-Wechsel-Invalidierung und Key-Rotation bleiben mögliche Härtung, keine Behauptung eines fortbestehenden Klartext-Bypasses. | `lib/folder-pin.ts:43–169` |
| **H10** | TEILWEISE | Eigene Genehmigung gesperrt; pending-CAS bei Entscheidung; Datumsänderung entschiedener Anträge setzt zurück. | Read/Modify/Write der Datumsänderung ist nicht revisionsgebunden. Genehmigung zwischen Lesen eines pending-Antrags und Schreiben neuer Daten bleibt approved. | `lib/vacation-service.ts:536–572,630–682` |
| **H11** | UMGESETZT (Code) | S3-Fehler löschen Metadaten nicht mehr; failed IDs erhalten deleted-Status für Retry. | Ursprünglicher Fehler lokal geschlossen. Retry erst nach erneuter Karenzzeit; Cron zählt Kandidaten statt tatsächlicher Erfolge. DB-/FK-Fehler, Löschsperren und Produktions-Orphans gesondert behandeln (H07/H12). | `lib/storage/delete.ts:86–134`; `app/api/cron/cleanup/route.ts:229` |
| **H12** | TEILWEISE | File-/Employee-Direktlöschung und Cron prüfen neue Löschguards. | Kategorienlöschung prüft Legal Hold weiterhin nur für personaldaten. Replaced-Dateien verlieren durch FK-Umhängen ihre Payroll-Retention; allgemeine Beweis-/Dokumentfristen nicht vollständig. | `lib/retention-service.ts:244–317,327–419,427–502`; `app/api/cron/cleanup/route.ts:140–162` |
| **H13** | UMGESETZT (Code) | Manifest, Lockfile und lokal installiertes Next sind 16.3.4 und außerhalb des ursprünglichen DoS-Bereichs. | Produktives Deployment nicht nachgewiesen; kein vollständiger aktueller Dependency-Freibrief. eslint-config-next bleibt 16.2.9 (Kompatibilitätsabgleich, keine eigene CVE-Behauptung). | `package.json`; `package-lock.json`; `node_modules/next/package.json` |
| **H14** | TEILWEISE | Schicht-Empfänger werden nach Planungsteam gefiltert; neutraler Text bei fehlendem sickness-Level. | sickness-Scope wird nicht geprüft: read/own zählt als Recht auf fremde Krankheit. Gesundheits-Retention-Reminder unverändert; Roh-Payload enthält bei neutraler Darstellung weiter reason=sickness (nicht automatisch an Client ausgegeben). | `lib/shift-service.ts:978–1055`; `lib/notifications/events.ts:178–194`; `lib/retention-service.ts:165–194` |
| **H15** | TEILWEISE | Owner-Scope und fachliche Prüfung für Dateien; Schichtformular-Mitarbeiter nach Scope gefiltert. | Reminder-Dateibrowser gibt Ordner/Ownernamen weiter tenantweit aus. Owner-Ordnerliste filtert verborgene/PIN-geschützte Metadaten nicht durchgängig. | `lib/files-server.ts:151–237,361–459`; `lib/shift-service.ts:812–867` |
| **M01** | TEILWEISE | UTC-Zählung, Wochenmuster, Bundesland-Feiertage und neue Felder/Migration vorhanden. | 0 Arbeitstage wird zu 1 Tag. Kein regulärer API-/Form-Schreibpfad für workDaysJson/bundesland gefunden; neue Defaults sind nicht individuelle Dienstpläne. Bestandsanträge bleiben alte day-Werte. | `lib/vacations.ts:7–67`; `lib/vacation-service.ts:144–161,425–428`; `prisma/migrations/20260906190000_add_bundesland_workdays_vacation_carryover/migration.sql` |
| **M02** | TEILWEISE | Carryover-Felder, Cron-Rollover, Hinweis und automatische Verfallsfunktion ergänzt. | Fehlerhafte Saldorechnung; fehlendes Jahresledger/Verbrauch des Übertrags; Jahresüberschneidung unverändert. remindedAt trotz ausbleibender Zustellung möglich; pauschaler Verfall ohne Prüfung von Krankheit/Anspruchsjahr. Neue Risiken R05. | `lib/vacations.ts:125–133`; `lib/vacation-service.ts:748–845`; `lib/vacation-carryover.ts:36–104`; `lib/notifications/events.ts:404–435` |
| **M03** | TEILWEISE | Überlappung, Pausen, Nettozeit, Jugend-Tages/Wochengrenze und Publish-Revalidierung ergänzt. | Ausgleich falsch auf Schichttage bezogen; Pause auf Bruttospanne statt Nettoarbeit; keine Pausenlage. Reset explizit ohne Revalidierung, weiter fehlende MuSchG-/Jugendruhe-Regeln. | `lib/arbzg-rules.ts:100–129`; `lib/shift-service.ts:1198–1320,1599–1667,1960–1967` |
| **M04** | TEILWEISE | Kalenderjahresanker eingeführt und Tests angepasst. | Frist endet 31.12. um 00:00 UTC, zu früh. AO-Nummer 4a und pauschale Achtjahres-/36-Monats-Annahmen unverändert; Dokument-/Zweckdifferenzierung fehlt. | `lib/data-retention.ts:33–105` |
| **M05** | TEILWEISE | Name-Slug, User-Link, Standortleitung, Dateizuweisung, Consent-TTL und Account-Unlink erweitert. | Keine vollständige Anonymisierung: Team-/Location-Mitglieder, Wochen-Snapshots, Aktenfreitexte und weitere Kopien bleiben. Gesundheits-/Arbeitszeit-Retention und externe Löschung weiterhin unvollständig. | `lib/retention-service.ts:70–194`; `lib/user-deletion-lifecycle.ts:53–58`; `app/api/cron/cleanup/route.ts:216` |
| **M06** | TEILWEISE | Personalaktenexport ergänzt Mutterschutz, Inbox und Consent; Vergütung wird entschlüsselt. | Kein vollständiges DSAR-Manifest/Drittrechteverfahren; pauschal ausgeschlossene interne Notizen und weitere Daten fehlen. Tenant-Export bleibt unvollständig und scopeunsicher (H02). | `lib/self-service.ts:490–609`; `lib/tenant-export.ts:135–208` |
| **M07** | TEILWEISE | SDK-beforeDelete nutzt gemeinsamen Sole-Owner-Guard und Employee-/Consent-Bereinigung. | SDK-/Cron-Pfad widerrufen Provider-Tokens weiterhin nicht; Avatar/weitere Artefakte fehlen. Cleanup und User-Delete nicht gemeinsam transaktional. | `lib/auth.ts:208–223`; `lib/user-deletion-lifecycle.ts:53–58`; `app/api/cron/cleanup/route.ts:213–219` |
| **M08** | UMGESETZT (Code) | Einladungslogin besitzt eigene persistente Account- und IP-Limits vor signInEmail. | Ursprünglich unbegrenzter Action-Pfad geschlossen; getrennte Zähler statt einheitlichem Loginbudget. Vertrauenswürdiges Überschreiben von Forwarded-Headern muss der reale Proxy gewährleisten. | `app/invite/[token]/actions.ts:109–134`; `lib/rate-limit.ts:24–36` |
| **M09** | TEILWEISE | Cachefenster von fünf Minuten auf 60 Sekunden reduziert. | Widerruf weiterhin verzögert; Kommentar erklärt Restrisiko, ist aber kein vom Betreiber nachgewiesener Freigabebeschluss. Sofortige Revocation nicht umgesetzt. | `lib/auth.ts:184–198` |
| **M10** | TEILWEISE | Auch denied führt zum Reload, wodurch Replay/Tracing beim Neustart ausbleiben. | Widerspruch der Datenschutzhinweise zu consentunabhängiger Basisfehlererfassung nicht korrigiert. Kein Browser-Nachweis zu Unload-Puffern/sofortigem Stop vor Navigation. | `components/CookieConsent.tsx:65–80`; `instrumentation-client.ts:8–46`; `app/(legal)/datenschutz/page.tsx:49–51` |
| **M11** | UMGESETZT (Code) | Zentrale getrennte Tenant-Kanalprüfung plus User-Präferenzen; mail nicht mehr globaler Vorfilter. | Neue DB-basierte Kanaltests vorhanden, hier mangels isolierter DB nicht ausgeführt. Statisch stimmen Events und Dispatch überein. | `lib/notifications/dispatch.ts:66–244`; `lib/notifications/events.ts:12–29`; `tests/notification-dispatch.test.ts` |
| **M12** | TEILWEISE | Vergütung neuer/aktualisierter Dateiverträge wird verschlüsselt; Entschlüsselungsfehler sichtbar und geloggt. | OAuth-Verschlüsselung/Bestandsmigration fehlt. Sentinel kann von encryptField gespeichert werden; harmlose Employee-Updates können so beschädigte Originalwerte überschreiben. | `lib/contract-service.ts:183,331`; `lib/encryption.ts:74–87,103–154`; `lib/employee-service.ts:2078–2112`; `lib/auth.ts` |
| **M13** | TEILWEISE | Entity→Bereich serverseitig; employee/team/location-Scopes beim Audit geprüft. | Andere Auditobjekte (z. B. vacation/file/shift) ohne entsprechenden Objektscope. Ereignisabdeckung/Transaktionsbindung und Logger-Redaktion unverändert; rohe Fehler in Info-Request-Action. | `lib/audit.ts:22–104`; `lib/logger.ts:25–54`; `app/(dashboard)/u/[tenant]/employees/actions.ts:337–352` |
| **M14** | TEILWEISE | Checkout-Idempotency-Key, Event-ID-Tabelle und Altersvergleich ergänzt. | Event als verarbeitet vor eigentlicher Verarbeitung markiert: Fehler führt zum verlorenen Retry. Zeitvergleich nicht atomar; Sekunden-Gleichstand/Subscription-Wechsel und Fenstergrenze des Checkout bleiben offen. | `app/api/webhooks/stripe/route.ts:64–78,137–194`; `lib/billing-service.ts:94–108`; `lib/stripe/webhook-idempotency.ts:14–26` |
| **M15** | TEILWEISE | Release-Verzeichnisse/Symlink-Wechsel statt beabsichtigtem In-place-Build. | Absoluter distDir passt nicht zu Next path.join; Symlink kann anderes/leeres Ziel erhalten. Testsetup/Seeds weiterhin ohne Testzielguard, CI-Drift weiterhin nur Warnung; Healthcheck fehlt. | `scripts/deploy.sh:35–69`; `next.config.ts:36`; `node_modules/next/dist/build/index.js:543`; `tests/setup.ts:6`; `.github/workflows/ci.yml:85–95` |
| **M16** | UMGESETZT (Code) | Offene Erkrankungen werden unabhängig vom historischen Chartfenster geladen und aktuell gefiltert. | Kein ursprünglicher Sechsmonats-Ausschluss mehr in der Active-Liste; DB-Regressionstest vorhanden. | `lib/sickness.ts:139–164`; `tests/security-audit-critical.test.ts:3365` |
| **L01** | UMGESETZT (Code) | Lokaler .env-Modus ist jetzt 0600 statt 0664. | Produktive Hosts, weitere Secretkopien und Rotation nicht aus diesem Arbeitsbaum belegbar. | `Dateimetadaten .env, Werte nicht ausgegeben` |
| **L02** | TEILWEISE | Actions SHA-gepinnt; critical-Advisories stoppen CI. | Alle High-Advisories pauschal Warnung, nicht nur exakt befristete bekannte Ausnahmen. Kein Secret-Gate; Kommentar zu drei High-Paketen extern hier nicht verifiziert. | `.github/workflows/ci.yml:31–52` |
| **L03** | UMGESETZT (Code) | Avatar verlangt gemeinsame Tenantmembership; eigenes Bild erlaubt. | Ursprüngliche globale beliebige Profilsicht eingeschränkt; reales Deployment nicht nachgewiesen. | `app/api/avatar/[userId]/route.ts:19–33`; `lib/tenant-access.ts:635–643` |
| **L04** | UMGESETZT (Code) | Nicht unterstützter sessionTimeout-Parameter wird explizit abgewiesen. | Keine vorgetäuschte Speicherung mehr; MFA-Einstellung bleibt getrennt nutzbar. | `lib/settings-service.ts:402–417` |

## Wichtigste Restfehler und Regressionen

### R01 – Neuer Fehler beim Zugangsentzug: letzter Owner ungeschützt

**Bezug:** C02, dessen ursprüngliche mandantenübergreifende Löschung behoben ist. **Priorität: HIGH / P1. Confidence: HIGH, Codepfad bestätigt.**

`deleteEmployeeAccess` löscht jetzt korrekt nur `tenantId + userId`, prüft aber nicht die Rolle der betroffenen Membership oder die Zahl verbleibender Owner. Der vorher indirekt wirksame Sole-Owner-Schutz aus der globalen Löschung entfällt. Ein Actor mit `employees:write`, dessen Scope die Mitarbeiterakte des Owners umfasst, kann damit die letzte Owner-Mitgliedschaft entfernen. Voraussetzung: Owner ist mit einer solchen Akte verknüpft. Das globale Konto und andere Tenants bleiben intakt; der betroffene Tenant kann dennoch ohne Owner zurückbleiben.

**Beleg:** `lib/employee-service.ts:2303–2347`; isolierter Check beobachtet `tenantMembership.deleteMany({where:{tenantId,userId}})` ohne Rollen-/Ownerabfrage. Keine echten Memberships gelöscht.

**Noch nötig:** Entzug privilegierter Memberships separat autorisieren; letzten Owner innerhalb einer konsistenten Transaktion schützen. Regression: HR mit Employee-Schreibrecht darf weder sich selbst noch einen anderen Benutzer zum letzten Owner-Entzug verwenden; normaler Mitarbeiterentzug in A lässt B unverändert.

### R02 – H01: Rollenänderung wird verzögert statt vollständig verhindert

**Priorität: HIGH / P1. Confidence: HIGH, statische vollständige Kette; nicht als DB-Test ausgeführt.**

Die neue Rollenprüfung verhindert den unmittelbaren Sync durch einen unprivilegierten Profilbearbeiter. Sie verhindert jedoch nicht, dass derselbe Bearbeiter den Rollen-Namen in `TenantEmployee.role` speichert (`lib/employee-service.ts:1987,2110`). Ein späterer Aufruf von `updateTenantEmployee` durch einen Rollenverwalter – beispielsweise zum Ändern der Telefonnummer – verwendet ohne neuen role-Input `current.role` und synchronisiert diesen Wert zur echten Membership (`2182–2188`, `lib/role-service.ts:277–288`).

**Abuse Case:** eigenes Profil auf „HR-Leitung“ setzen; der unmittelbare Membershipwechsel bleibt aus. Später bearbeitet Owner/HR mit Rollenrecht die Akte ohne bewusste Rollenentscheidung; der vorab manipulierte Name wird zur Berechtigung. Ein Test, der ausschließlich prüft, dass der erste unprivilegierte Request roleId nicht ändert, entdeckt diesen zweiten Schritt nicht.

**Noch nötig:** Autorisierungsrollen aus frei editierbaren Fachfeldern lösen. Mindestens unberechtigte Änderungen des synchronisierten Felds ablehnen und Sync nur bei ausdrücklich autorisierter Rollenänderung durchführen, niemals aufgrund eines übernommenen Altwerts. Den Zweischritt testen.

### R03 – H02: Bereichsrecht ohne Scope genügt weiter für Fremddatenexport

**Priorität: HIGH / P1. Confidence: HIGH, lokal reproduziert.**

`buildTenantExport` reduziert die Fachberechtigung auf Boolean (`lib/tenant-export.ts:29–38`), lädt dann weiterhin sämtliche Mitarbeiter/Verträge/Abrechnungen des Tenants (`81–116`). `payroll:read/own` oder `sensitiveData:read/team` wird so wie `all` behandelt. Der isolierte Originalcode-Test mit Payroll-Own-Recht lieferte Abrechnungen für `self` und `other`. Ohne irgendein Payroll-Recht wird die Liste inzwischen korrekt unterdrückt – dieser positive Fall deckt den Scopefehler nicht ab.

Zusätzlich bleiben Daten wie Notfallkontakte, Mutterschutzstatus, Urlaubs-/Wunschfrei-/Schicht-/Dateimetadaten nicht durchgehend an ihre eigenen Fachrechte gebunden. `...employee` ist keine sichere Export-Whitelist.

**Noch nötig:** pro Datensatz und Feld dieselben Scope-/Fach-/ACL-Entscheidungen wie in den normalen Lesewegen. Alternativ einen ausdrücklich separaten Voll-Export nur für wirklich hierzu berechtigte Rollen zulassen. Regression: settings:write + jeweils own/team/null darf exakt die freigegebene Teilmenge exportieren.

### R04 – H08: eigener Upload bleibt eine Same-Origin-HTML-Quelle

**Priorität: HIGH / P1. Confidence: HIGH, Upload-/MIME-Fluss lokal reproduziert; keine Browser-Ausführung.**

Die neue Byteprüfung liegt in `fileToBuffer`; der Self-Service ruft sie nicht auf. `uploadMyDocument` ruft nur die bisherige Name-/Größenprüfung und anschließend unmittelbar `uploadObject` mit Client-Bytes und `input.file.type` auf (`lib/self-service.ts:721–751`). Auch der gespeicherte MIME-Typ bleibt clientbestimmt.

Der Gegencheck mit HTML-Bytes, Dateiname `proof.pdf` und MIME `text/html` wurde im Self-Service angenommen. Derselbe Input wird im neuen generischen Pfad abgewiesen. `resolveContentType` liefert für die Self-Service-Datei weiterhin `text/html`, und die Content-Route kann sie inline ohne isolierende CSP ausliefern. Autorisierte Opferinteraktion bleibt Voraussetzung; keine pauschale anonyme Ausführung behauptet.

**Noch nötig:** denselben Byte-/Typ-Parser für alle Uploadpfade einschließlich Self-Service/Info-Anfragen/Versionen einsetzen und untrusted Content sicher als Attachment oder auf isolierter Origin/Sandbox ausliefern. Bereits gespeicherte gefährliche MIME-Kombinationen kontrolliert behandeln. Regression muss beide Upload-Einstiege und den späteren Content-Response umfassen.

### R05 – M02: neue automatische Urlaubsverfallslogik ist nicht freigabefähig

**Priorität: P1 vor Aktivierung/Weiterbetrieb dieser Automatik. Technische Fehler bestätigt; konkrete Rechtswirkung nutzungsabhängig.**

- **Falscher Saldo:** `Math.max(0, total - taken) + carryover` liefert bei 30 Tagen Jahresurlaub, 5 Übertrag und 32 genommenen Tagen noch 5 statt 3 (`lib/vacations.ts:125–133`), lokal reproduziert. Verbrauch wird nicht korrekt gegen den Gesamtbestand verrechnet.
- **Kein Verbrauchsledger:** Der Übertrag bleibt als eigener unverminderter Betrag gespeichert. Ein späteres pauschales Setzen auf 0 unterscheidet nicht, welcher Teil bereits in genommenem Urlaub aufgegangen ist. Jahresüberschreitende Anträge werden weiterhin nach Startdatum vollständig einem Jahr zugerechnet.
- **Hinweis ohne Zustellung:** `notifyEmployeeOfExpiringVacationCarryover` kehrt bei fehlendem verknüpften Konto ohne Versand zurück. Der Cron setzt anschließend trotzdem `remindedAt` und dokumentiert einen angeblich erfolgten Hinweis (`lib/vacation-service.ts:803–821`, `lib/notifications/events.ts:411–415`). Der isolierte Check bestätigt: kein Konto → kein Versand → remindedAt gesetzt → `shouldForfeitCarryover` erlaubt den Verfall. Deaktivierte Kanäle oder verschluckte Versandfehler sind weitere Fälle, in denen ein erfolgreicher Funktionsreturn keinen Nachweis bildet.
- **Pauschale Rechtsannahme:** Ein einzelner Timestamp vor dem 31.03. reicht dem Code; weder hinreichende Vorlaufzeit noch tatsächliche Möglichkeit der Urlaubsnahme, Krankheit, differenzierte Anspruchsjahre oder gesetzlicher/vertraglicher Mehrurlaub werden geprüft. Selbst ein sehr später Hinweis vor dem Fristzeitpunkt genügt technisch.
- **Initialisierung:** Der erste Cronlauf verwendet aktuelle `vacationTotal` als Vorjahresanspruch, auch ohne historisch belegten Vorjahresanspruch. Eine Personalakte kann so erstmals einen fiktiven Vorjahresübertrag erhalten.

Urlaubsverfall bei Krankheit ist rechtlich differenziert; ein pauschaler 31.03.-Schalter erfüllt das nicht. Maßgeblich ist unter anderem die tatsächliche Erfüllung der Mitwirkungsobliegenheiten. [BAG 9 AZR 245/19](https://www.bundesarbeitsgericht.de/entscheidung/9-azr-245-19/).

**Noch nötig:** Automatische anspruchsmindernde Entscheidungen erst nach fachlich freigegebenem Jahres-/Verbrauchsledger, belastbarer Hinweis-/Zustell- und Ausnahmenentscheidung. Technisch vorzugsweise offene Fälle zur HR-Prüfung statt unbegründeter Nullsetzung. Kein realer Urlaubsbestand wurde im Audit verändert.

### R06 – M14: neue Stripe-Deduplizierung verliert fehlgeschlagene Ereignisse

**Priorität: HIGH / P1 für Abrechnungsintegrität. Confidence: HIGH, lokal reproduziert.**

Die Event-ID wird vor dem eigentlichen Handler dauerhaft geschrieben (`app/api/webhooks/stripe/route.ts:64`). Schlägt danach beispielsweise die Tenant-Aktualisierung vorübergehend fehl, bleibt dieser Eintrag bestehen. Stripe-Retry trifft auf den Unique-Constraint und erhält `200 {deduplicated:true}`, ohne die fehlgeschlagene Verarbeitung nachzuholen.

Der isolierte Test nutzt einen vom gemockten Verifier akzeptierten synthetischen `checkout.session.completed`: erster Tenant-Write wirft einen simulierten DB-Fehler; zweiter Request wird dedupliziert; der Write wird nur einmal versucht. Die echte Signaturprüfung wurde weder angegriffen noch deaktiviert.

Der neue Altersvergleich ist außerdem ein Read-then-Write ohne atomare Zeit-/Versionsbedingung. Zwei unterschiedliche Events können denselben alten Stand lesen und anschließend in falscher Reihenfolge schreiben. Der Checkout-Key wechselt an Fünfminutengrenzen, während ältere Sessions noch offen sein können.

**Noch nötig:** persistentes Event-Inbox-/Processing-Modell mit Retry oder atomarer Transaktion aus Ereignisabschluss und Zustandsänderung; nur erfolgreich verarbeitete Events als fertig behandeln. Zeit-/Subscription-Invariante beim Write erzwingen und aktive Checkoutversuche dauerhaft koordinieren. Regression: Fehler nach Aufnahme, Retry, parallele Events, gleicher Timestamp und Fenstergrenze.

### R07 – M15: Release-Symlink und tatsächlicher Next-Buildpfad stimmen nicht überein

**Priorität: HIGH / P1 vor dem nächsten Deploy mit diesem Skript. Confidence: HIGH für die Pfadberechnung; kein Deploy ausgeführt.**

`scripts/deploy.sh` setzt `NEXT_BUILD_DIR` auf einen absoluten Pfad wie `/opt/apps/ployo-front/.next-releases/<timestamp>`. `next.config.ts` übernimmt ihn unverändert. Die installierte Next-16.3.4-Buildimplementierung verwendet `path.join(dir, config.distDir)` (`node_modules/next/dist/build/index.js:543`), ebenso Teile des Dateiservers. Node `path.join` behandelt das hier nicht wie `path.resolve`.

Reproduzierte Pfadberechnung:

```text
Skript erwartet: /opt/apps/ployo-front/.next-releases/<timestamp>
Next join:       /opt/apps/ployo-front/opt/apps/ployo-front/.next-releases/<timestamp>
```

Das Skript prüft am erwarteten Ziel keinen gültigen Build und setzt den Symlink anschließend auf dieses andere Ziel. Ein erfolgreicher Build allein genügt deshalb nicht zur sicheren Umschaltung. Unabhängig davon ist das einmalige Verschieben des bisherigen `.next` vor Anlegen des Symlinks kein atomarer Übergang; PM2-Reload-/Healthcheckfehler lösen keinen verifizierten Rollback aus.

**Noch nötig:** projektrelativen distDir verwenden, Ergebnis/BUILD_ID am exakt aufzulösenden Ziel prüfen, atomare vollständige Release-Strategie mit Fehler-Rollback testen. Zusätzlich M15-Testzielguards und echtes CI-Drift-Gate nachholen. Ausschließlich Pfad-/Quellprüfung; kein Build in `.next`, kein PM2/Deployment gestartet.

### R08 – Weitere bestätigte Restpfade mit konkreten Gegenbeispielen

| Bezug | Gegenbeispiel und Beleg | Noch nötig |
|---|---|---|
| H05 | Team-Planer führt Reset einer veröffentlichten Woche aus; DeleteMany begrenzt nur Tenant und Datum, nicht Team. Originalservice mit simulierter DB geprüft. | Atomare Wochenoperation nur mit passender vollständiger Reichweite, oder echte scopesichere Teiloperation. |
| H06 | Files-Scope schützt Uploaderliste; Versions-/Delete-Auflösung mit bekannter zentraler Datei-ID bindet diesen Scope nicht ein. | Gemeinsamen Datei-Resolver auch für Uploader-Scope anwenden. |
| H07 | FK wird auf neue Payroll-Datei umgehängt; alte replaced-Datei ist weiterhin abrufbar, aber `requireTenantFileAreaAccess` findet keine Payroll-FK und wählt employeeFiles. Im Helper reproduziert. | Kategorie am logischen Dokument/Versionenverbund unverlierbar führen; gleicher Schutz für alte Versionen. |
| H10 | pending lesen → parallel approved setzen → neue Datumswerte schreiben ohne Statusreset. Original-Update mit deterministisch injizierter Zwischenänderung reproduziert. | Versions-/Zeitstempel-CAS für Datenänderung und Freigabe, gemeinsam gültige Revision. |
| H12 | Legal Hold sperrt im Kategorien-Eligibility nur personaldaten; abgelaufene Payroll kann in der anderen Kategorie weiter gelöscht werden. | Hold-/Zweckentscheidung zentral in allen Löschpfaden, einschließlich Versionen. |
| H14 | shifts:write/all plus sickness:read/own wird für einen anderen Mitarbeiter als `canViewSicknessReason=true` bewertet. Original-Empfängerhelper reproduziert. | Beide Scopes anhand derselben konkreten Person prüfen; auch Reminder und Payload minimieren. |
| H15 | Dateiliste leer; Reminder-Dateibrowser gibt trotzdem fremden HR-Ordnernamen und Owner zurück. Originalservice reproduziert. | Folder-Metadaten genauso autorisieren wie Files, ohne Namen/IDs gesperrter Inhalte. |
| M01 | Ausschließlich arbeitsfreier Sonntag ergibt 1 statt 0 Urlaubstag. | Kein Verbrauch für arbeitsfreie Zeit oder Antrag fachlich ablehnen. Feldpflege für individuelle Kalender implementieren. |
| M03 | Erste 8,5h-Netto-Schicht wird mangels anderer Schichttage immer als Durchschnitt >8 abgewiesen. | Werktäglichen gesetzlichen Bezugszeitraum einschließlich geeigneter Ausgleichstage korrekt modellieren; keine pauschale Schichttag-Näherung. |
| M04 | Beleg vom 01.02.2020 gilt am 31.12.2028 um 12 Uhr UTC schon als löschbar. | Fristablauf nach Schluss des Jahres mit passendem juristischem Zeitbezug, nicht zu dessen letzter Tagesmitternacht. |
| M12 | Beschädigter Ciphertext → Sentinel → encryptField(Sentinel) funktioniert. Employee-Update verwendet entschlüsselte Rückfallwerte auch für unveränderte Felder. | Fehler typisiert markieren und Speichern verhindern bzw. ursprüngliche Rohwerte erhalten. |

Der Arbeitszeitmaßstab ist durchschnittliche **werktägliche** Arbeitszeit, nicht der Durchschnitt nur der gespeicherten Schichttage. [ArbZG § 3](https://www.gesetze-im-internet.de/arbzg/__3.html). Bei AO-Fristen ist der Schluss des Kalenderjahres maßgeblich; gewöhnliche Buchungsbelege stehen in Nr. 4, nicht Nr. 4a. [AO § 147](https://www.gesetze-im-internet.de/ao_1977/__147.html).

## Verifikation und Grenzen

### Tatsächlich ausgeführt

- Arbeitsbaumvergleich gegen den Audit-Commit einschließlich neu angelegter Module/Migrationen; Querverfolgung von Aufrufern, Guards, Scopes, DTOs und SDK-/Next-Implementierung.
- **93/93 bestandene Tests** aus `arbzg-rules`, `data-retention`, `digest-schedule`, `encryption`, `shift-break-rule`, `shift-presets`, `shift-templates`, `storage-key-builder`, `german-holidays`, `vacation-carryover`, `vacations`, `vacation-service`.
- **TypeScript:** `node node_modules/typescript/bin/tsc --noEmit --incremental false`, Exit 0.
- **Prisma:** Schema-Validierung, Exit 0. Kein `migrate deploy`, kein `db push`; syntaktisch gültiges Schema beweist keinen produktiven Migrationsstand.
- **22 gezielte Checks**, tatsächliche Source-Funktionen in temporärem VM-/Mock-Kontext, Ergebnisübersicht unten. Keine echten DB-, S3-, Mail-, Push- oder Stripe-Mutationen.
- Lokale Paketversionen abgefragt, Next 16.3.4 bestätigt; ursprünglicher H13-DoS-Bereich anhand Herstellerquelle abgeglichen. [Next Advisory](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj).
- `.env`-Dateimodus geprüft, jetzt 0600; keine Secretwerte ausgegeben.

Die neuen umfangreichen DB-Tests in `tests/security-audit-critical.test.ts` und `tests/notification-dispatch.test.ts` wurden gelesen, **aber nicht ausgeführt**. Ein eigener temporärer PostgreSQL-Cluster ließ sich im Sandbox-Usernamespace nicht als unprivilegierter Benutzer starten (`cannot set groups: Operation not permitted`; nur UID 0 gemappt). Ich habe deshalb keine vorhandene Datenbank als Ersatz verwendet. Das ist eine lokale Ausführungsgrenze, keine Ablehnung durch einen automatischen Approval-Reviewer.

Die ausgewählte Vitest-Konfiguration deaktivierte das normale `.env`-Testsetup und verwendete eine bereinigte Umgebung sowie eine absichtlich nicht nutzbare lokale Dummy-DB-URL. Prisma-CLI kann `.env` lesen; die Dummy-DATABASE_URL wurde dafür explizit im Prozess gesetzt. Es wurden keine produktiven Datenbankziele angesprochen. Tests/VMs/Logs liegen ausschließlich im temporären Prüfverzeichnis, keine Testdatei im Projekt wurde verändert.

**Wichtige Testlücken:** Der H08-Bestandstest prüft generischen Upload, nicht Self-Service. H02 testet fehlendes Fachrecht, aber nicht ausreichenden Level mit engem Scope. H14 prüft fehlenden sickness-Level, aber nicht sickness:own bei shifts:all. H07 prüft neue Version, nicht die danach fachlich ungeschützte alte Version. Stripe-Tests beweisen Unique-Constraint und reine Zeitfunktion, nicht Retry nach Zwischenfehler. Grüne Tests allein schließen diese Fälle nicht.

### Ergebnis der 22 zusätzlichen Gegenprüfungen

„Verifiziert“ heißt hier: beobachtete Entscheidung/Parameter des Originalcodes im angegebenen lokalen Mockkontext. Bei einem Restfehler ist das ein erfolgreicher **Nachweis des noch bestehenden Problems**, kein bestandener Sicherheitsregressionstest.

| Bezug | Prüffall | Beobachtung |
|---|---|---|
| C01 | Neuanlage enthält Scope | sensitiveData=own, vollständiges kanonisches Template |
| C01-rest | Altrolle bleibt unverändert | update:{} repariert keine bestehende all-Rolle |
| C02 | Entzug tenantgebunden; Owner-Schutz fehlt | Nur Membership A wird gelöscht; kein Lookup/Schutz für Rolle oder letzten Owner |
| C03 | Fremder Standort zurückgewiesen | Update stoppt vor Schreibzugriff |
| H02 | Export mit payroll:read/own exportiert zwei Personen | Ausgabe enthält fremde Payroll trotz own-Scope |
| H05 | Team-Planer kann gesamte Woche resetten | DeleteMany nur tenantId+Wochentage, kein Team-Scope |
| H08-fixed-part | Generischer Upload prüft Bytes | Generischer Parser lehnt HTML mit PDF-Namen ab |
| H08-rest | Self-Service akzeptiert weiterhin HTML | Echter Self-Service speichert HTML-MIME und HTML-Bytes; Stream behält text/html |
| H09 | Klartext-PIN-Cookie abgewiesen | Klartext gibt false |
| H11 | S3-Fehler erhält Retry-Datensatz | Metadaten erhalten, status=deleted für Retry |
| H07-rest | Alte Payroll-Version verliert Fachbereich | Nach FK-Umhängen fällt alte (weiter abrufbare) Version auf employeeFiles |
| H14-rest | sickness:read/own wird als fremde Krankheitssicht behandelt | Fremder Team-B-Fall mit sickness/own wird nicht neutralisiert |
| M01-rest | Arbeitsfreier Sonntag belastet Urlaub | 0 Arbeitstage werden zu 1 Urlaubstag |
| M02-rest | Urlaubssaldo nach Verbrauch des Jahreskontos falsch | 30 + 5 - 32 müsste 3 sein; Funktion liefert 5 |
| M04-rest | Frist endet zu Beginn des 31.12. | Am 31.12.2028 mittags schon löschbar statt nach Schluss des Jahres |
| M12-rest | Entschlüsselungs-Sentinel kann zurückgespeichert werden | encryptField akzeptiert Fehler-Platzhalter; Employee-Update schreibt diese Rückfallwerte |
| M14-rest | Webhook-Verarbeitungsfehler macht Retry zum Duplikat | Event-ID bleibt nach Fehler gespeichert; Retry HTTP 200, Mutation nicht erneut versucht |
| M15-rest | Absoluter NEXT_BUILD_DIR ergibt anderes Next-Ausgabeverzeichnis | Next path.join(dir,config.distDir)=/opt/apps/ployo-front/opt/apps/ployo-front/.next-releases/retest; Symlink zeigt auf /opt/apps/ployo-front/.next-releases/retest |
| M03-rest | Erste 8,5h-Schicht wird pauschal als unausgeglichen abgewiesen | Nenner enthält nur Schichttage; erste verlängerte Schicht wird trotz möglicher Ausgleichstage blockiert |
| H10-rest | Gleichzeitige Genehmigung und Änderung erhält approved | Pending gelesen → Genehmigung dazwischen → Datumsupdate ohne Versionsvergleich behält approved |
| M02-notice | Hinweis als erfolgt gespeichert, obwohl kein verknüpftes Konto existiert | Kein Konto → kein Versand; trotzdem remindedAt gesetzt und Verfall danach zugelassen |
| H15-rest | Reminder-Dateibrowser enthält fremde Ordnernamen | Keine eigene Datei nötig; fremde Folder-Metadaten bleiben ungefiltert |

### Weiterhin nicht verifizierbar

- Produktiv ausgerollter Commit/Build, tatsächlicher Neustart mit Next 16.3.4 und Migrationen.
- Korrektur bestehender all-Rollen, alter Dateiversionen, Klartextfelder und bereits inkonsistenter Tenantrelationen.
- Reale Zustellung/Retention von E-Mail/Push, laufende Jobs, Lösch-Retries, Orphan-Storage und Backup-/Restoreverhalten.
- Juristisch freigegebene Kalender-/Urlaubs-/Verfalls-/Aufbewahrungsregeln; AVV/TOMs/VVT/DSFA und produktive Infrastruktur.

Für diese Punkte gilt jeweils: **NICHT VERIFIZIERBAR – manuelle Prüfung erforderlich**.

Der vollständige npm-Advisory-Scan wurde erneut versucht und scheiterte wieder mit `EAI_AGAIN registry.npmjs.org`. **EXTERNE CVE-PRÜFUNG ERFORDERLICH.** Der CI-Kommentar zu drei High-Findings ist deshalb hier kein unabhängig bestätigtes aktuelles Scannergebnis. Das ursprüngliche einzelne Next-Advisory ist separat abgeglichen.

## Empfohlene nächste Reihenfolge

1. H08-Self-Service, H01-Rollensync, H02-Exportscopes, H05-Wochenaktionen und R01-Owner-Entzug schließen; negative Tests über die alternativen Einstiege ergänzen.
2. H06/H07/H12/H14/H15 vervollständigen: Dokumentverbund/Metadaten, Scopes, Retention und Empfänger.
3. Vor nächstem Deploy R07 beheben; R06-Stripeverarbeitung und R05-Urlaubsautomatik vor produktiver Nutzung fachlich/technisch absichern.
4. C01-Bestandsrollen und alte Dateien kontrolliert prüfen; keine undifferenzierte Reparatur produktiver Daten anhand dieses Berichts.
5. Verbleibende M-/L-Punkte abarbeiten; vollständige DB-Regressionsmatrix in einer ausdrücklich isolierten Umgebung und produktive Wirksamkeitsnachweise ergänzen.

**Abschlussbewertung:** Die Änderungen zeigen deutlichen Fortschritt. Für die 13 als umgesetzt bewerteten ursprünglichen Codefehler ist die Behebung nachvollziehbar. Die übrigen 25 Punkte und die beschriebenen neuen Regressionen verhindern derzeit eine Bestätigung „Audit erledigt“.
