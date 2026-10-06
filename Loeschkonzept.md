# Löschkonzept Ployo

*Entwurf, Stand 2026-09-03. Beschreibt in Prosa, was `lib/data-retention.ts` im Code umsetzt — als für Steuerberater/Anwalt lesbare Grundlage. Ersetzt keine rechtliche Prüfung, siehe Anhang.*

## 1. Zweck

Dieses Dokument legt fest, wie lange Ployo welche Kategorie personenbezogener Mitarbeiterdaten aufbewahrt, wann sie automatisch anonymisiert werden, und wann eine Löschung nur manuell durch den Kunden (als datenschutzrechtlich Verantwortlichem) möglich ist. Es setzt Teil 4 des `Datenschutz-Sicherheitsaudit-und-Umbauplan.md` um.

## 2. Kategorien und Fristen

Die Fristen sind zentral in `lib/data-retention.ts` (`RETENTION_POLICIES`) hinterlegt — **im Code, nicht als Mandanten-Einstellung**, weil es sich um gesetzliche Mindest-/Regelfristen handelt, keine unternehmerische Präferenz. Eine Änderung erfordert eine Code-Anpassung dieser einen Datei.

| Kategorie | Betroffene Daten | Frist | Rechtsgrundlage | Fristbeginn |
|---|---|---|---|---|
| `personaldaten` | Name, Adresse, Notfallkontakte, Geburtsdaten, Telefon, E-Mail (Kontaktdaten), Vertragsdaten ohne eigene Aufbewahrungspflicht | 3 Jahre | §195, §199 BGB (regelmäßige zivilrechtliche Verjährung) | Austrittsdatum (`offboardedAt`) |
| `lohn_sozialversicherung` | Gehaltsabrechnungen (`TenantPayrollStatement`), Steuer-ID, SV-Nummer, Krankenkasse | 8 Jahre | §147 Abs. 1 Nr. 4a AO / §257 HGB — verkürzt von 10 auf 8 Jahre durch das **Vierte Bürokratieentlastungsgesetz** (BEG IV, in Kraft seit 1.1.2025); deckt §28f SGB IV (SV-Unterlagen, praktisch ≤5 Jahre an die letzte Betriebsprüfung gebunden) mit der längeren, sichereren Frist ab | Ende des Kalenderjahres der Ausstellung |
| `gesundheit_freitext` | Freitext-Feld `TenantSicknessReport.note` (Art. 9 DSGVO) | 1 Jahr | Art. 5 Abs. 1 lit. c/e DSGVO (Datenminimierung) — keine feste gesetzliche Frist, kürzeste vertretbare Frist gewählt | Abschluss des Krankheitsfalls (`closedAt`) |
| `arbeitszeit` | Schichtdokumentation (`TenantShift`), gestempelte Arbeitszeiten (`TenantTimeEntry` inkl. Pausen — automatische Löschung durch den Cleanup-Cron, Legal Hold ausgenommen) | 2 Jahre | §17 MiLoG, §16 Abs. 2 ArbZG | Erfassungsdatum |
| Audit-Logs | `TenantAuditLog` | konfigurierbar, Standard 24 Monate | Bereits vor diesem Löschkonzept korrekt implementiert (`TenantSettings.auditRetentionMonths`) | laufend |

**Wichtige Korrektur gegenüber dem ursprünglichen Audit-Dokument:** Die Verkürzung der Buchungsbeleg-Aufbewahrung auf 8 Jahre wird dort fälschlich dem "Wachstumschancengesetz" zugeschrieben. Tatsächliche Rechtsgrundlage ist das Vierte Bürokratieentlastungsgesetz (BEG IV). Die neue 8-Jahres-Frist gilt für alle Fristen, die nach dem 31.12.2024 zu laufen beginnen — für ältere, bereits laufende Fristen bleibt es bei 10 Jahren (bei Ployo praktisch nicht relevant, da das System selbst jünger ist).

**Bewusste Vereinfachung:** Sozialversicherungsdaten (Kategorie 4 im ursprünglichen Audit-Dokument) sind nicht als eigene Kategorie geführt, sondern mit den Lohndaten zusammengelegt. Grund: §28f SGB IV bindet die Aufbewahrung an die letzte Betriebsprüfung (mindestens alle 4 Jahre) — einen Zeitpunkt, den Ployo softwareseitig nicht kennt. Da SV- und Lohndaten ohnehin gemeinsam verarbeitet werden, gilt einheitlich die längere, rechtssichere 8-Jahres-Frist statt einer separaten, potenziell zu kurzen SV-Frist.

## 3. Was automatisch passiert

**Kategorie `personaldaten` — vollautomatisch, anonymisierend, nicht löschend:** Der bestehende stündliche Cron-Job (`app/api/cron/cleanup/route.ts`) prüft täglich, welche ausgeschiedenen Mitarbeiter (`status: "former"`) ihre Frist überschritten haben. Betroffen sind ausschließlich Name, Geburtsdaten, Kontaktdaten, Adresse und Notfallkontakte — diese werden überschrieben (Name → „Ehemalige/r Mitarbeiter/in #<Personalnummer>"). Lohn-, SV- und Vertragsdaten bleiben unverändert bestehen, verknüpft nur noch über die intern bleibende Personalnummer, bis ihre jeweils eigene, längere Frist abläuft. Jede Anonymisierung erzeugt einen Audit-Log-Eintrag mit Rechtsgrundlage.

Ein **Legal Hold** (`TenantEmployee.legalHold`) blockiert diese automatische Anonymisierung vollständig, z. B. bei einem laufenden Rechtsstreit.

**Kategorie `lohn_sozialversicherung` — niemals automatisch gelöscht.** Der Cron-Job löscht hier nichts. Eine Löschung ist nur über den gezielten Löschantrags-Workflow (siehe unten) möglich, und nur für einzelne Datensätze, deren eigene 8-Jahres-Frist bereits abgelaufen ist.

**Kategorie `gesundheit_freitext` — niemals automatisch gelöscht, stattdessen Erinnerung.** Der Cron-Job erzeugt eine `TenantReminder`-Erinnerung für HR, sobald der Freitext einer abgeschlossenen Krankmeldung älter als 1 Jahr ist. HR entscheidet manuell, ob der Text noch gebraucht wird.

Diese Abstufung (Kategorie 1 automatisch, Kategorie 3/4 nur Freigabe + manuelle Bestätigung, Kategorie 5 nur Erinnerung) folgt der im Umbauplan (Teil 4.3) festgelegten Risikoabwägung: je sensibler/folgenreicher eine Fehlentscheidung, desto weniger Automatismus.

## 4. Gezielter Löschantrag (z. B. Art. 17 DSGVO-Anfrage)

Verlässt ein Mitarbeiter das Unternehmen und beantragt Löschung, oder möchte HR gezielt einzelne Kategorien löschen: Die Mitarbeiter-Detailseite zeigt (für ausgeschiedene Mitarbeiter) pro Kategorie, ob sie aktuell löschfähig ist, und falls nicht, bis wann sie gesperrt bleibt und warum (`getDeletionEligibilityForEmployee` in `lib/retention-service.ts`). HR wählt die löschfähigen Kategorien aus; nicht löschfähige Kategorien werden serverseitig immer verweigert, unabhängig von der Auswahl — ein Mitarbeiter oder Kunde kann die gesetzliche Aufbewahrungspflicht damit nicht durch einen Löschantrag umgehen (Art. 17 Abs. 3 lit. b DSGVO).

Das ersetzt das bisherige `deleteTenantEmployee()` (Alles-oder-nichts, ignoriert Aufbewahrungspflichten) für den Fall, dass tatsächlich einzelne Kategorien bereits fristgerecht löschbar sind. Die alte Funktion bleibt für den Fall bestehen, dass ein Mitarbeiter versehentlich angelegt wurde und komplett ohne Aufbewahrungspflicht entfernt werden soll (z. B. Testdatensatz).

## 5. Offene Punkte

- Diese Fristen sind nach bestem Wissen recherchiert (Stand 2026-09-03), aber wie jede steuer-/arbeitsrechtliche Frist im Einzelfall von Übergangsregelungen abhängig — eine Steuerberater-Rückfrage vor Verlassen auf die 8-Jahres-Frist wird empfohlen.
- Bereits vor Einführung dieses Löschkonzepts ausgeschiedene Mitarbeiter (`offboardedAt` = null) werden von der automatischen Anonymisierung **nicht** erfasst, um kein bestehendes historisches Datum rückwirkend/überraschend zu verarbeiten. Ein bewusstes Nachziehen für Altfälle (Backfill von `offboardedAt` aus dem vorhandenen `endDate`) wäre ein separater, expliziter Schritt.
- Kategorie `gesundheit_freitext` deckt nur das Freitextfeld ab. Ob auch angehängte Atteste/Anlagen nach Ablauf der Frist gelöscht werden sollen, ist im gezielten Löschantrags-Workflow bereits vorgesehen (Anlagen werden mitgelöscht, sobald die Kategorie für einen Datensatz aktiv gewählt wird), läuft aber nicht automatisch über den Cron-Job.
