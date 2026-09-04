# Datenschutz-, Sicherheits- und Löschkonzept-Audit — Umbauplan Ployo

*(Arbeitskopie von `Datenschutz-Sicherheitsaudit-und-Umbauplan.md` ohne die bereits erledigten Schritte — die vollständige Fassung inkl. Historie/Begründung der erledigten Punkte steht im Original.)*

Stand: 2026-09-02. Grundlage: drei parallele Vollaudits des laufenden Codes (Zugriffskontrolle/Sicherheit, Verschlüsselung/Aufbewahrung/Austritt, Prozessoren/Rechtstexte) plus eigene Recherche zu aktueller Gesetzeslage. Alle Befunde sind mit `datei:zeile` belegt und wurden gegen den aktuellen Code verifiziert (nicht gegen alte To-Do-Einträge).

Dieses Dokument beantwortet vier Fragen: (1) Wie muss die Datenbank umgebaut werden, damit Ployo Sicherheit, DSGVO und weitere Unternehmer-relevante Gesetze sauber abbildet? (2) Wie werden Mitarbeiterdaten nach Löschfristen aufgeteilt, wie wird ein Austritt korrekt behandelt? (3) Welche weiteren Gesetze sind für Ployo-Kunden relevant und wie kann das Tool dabei helfen? (4) Ist Ployo aktuell datenschutzrechtlich in Ordnung — gibt es kritische Punkte?

---

## 🙋 Braucht zwingend deine Aufmerksamkeit

Reine Entscheidungen oder externe Schritte, die nur du machen kannst — der Rest dieses Dokuments kann ich umsetzen, sobald du grünes Licht gibst.

| # | Thema | Warum nur du | Vorschlag |
|---|---|---|---|
| 1 | AVV mit Sentry unterschreiben | Externer Vertrag, dein Sentry-Account | weiterhin offen, siehe To-Do.md |
| 2 | **AVV-Vorlage für deine eigenen Kunden fehlt komplett** | AGB §5/Datenschutz §5 versprechen "die Parteien schließen einen AVV", es existiert aber gar keine Vorlage, kein Prozess | Ich kann einen AVV-Entwurf nach Art. 28 DSGVO bauen (Textdokument), du brauchst am Ende trotzdem einen Anwalts-Check |
| 3 | Expo (Push-Dienst, USA) ist ein nicht offengelegter Sub-Prozessor | Echte Benachrichtigungsinhalte (z. B. "Dein Urlaub wurde genehmigt") gehen an `exp.host` (650 Industries Inc., USA), aber die Datenschutzerklärung erwähnt Expo nur im Kontext von Crash-Diagnostik, nicht als Zustellweg für echte Inhalte | Rechtstext-Ergänzung (kann ich schreiben), ggf. Prüfung ob EU-Standardvertragsklauseln mit Expo vorliegen (externe Recherche nötig) |
| 4 | Löschfristen-Kategorisierung (Teil 4) fachlich absegnen | Ich schlage konkrete Fristen vor (z. B. Personalakte 3 Jahre nach Austritt, Lohnunterlagen 8/10 Jahre), das sind aber unternehmerische/steuerliche Entscheidungen mit Haftungsrelevanz | Steuerberater-Rückfrage empfohlen, besonders bei der 8-vs-10-Jahre-Frage (Wachstumschancengesetz) |
| 5 | Verzeichnis von Verarbeitungstätigkeiten (Art. 30), DSFA, Löschkonzept als Dokument | Reine Rechtsdokumente, brauchen am Ende deine/anwaltliche Freigabe | Ich kann Entwürfe vorbereiten (siehe Teil 3.7) |
| 6 | Rechtstexte weiterhin unrevidiert von einem Anwalt | Laut dir bewusst zurückgestellt | Nur als Erinnerung, keine neue Info |
| 7 | Grundsatzentscheidung: wie aggressiv automatisch löschen? | Auto-Löschung nach Ablauf einer Frist ist unumkehrbar — braucht eine Freigabe, wie viel davon vollautomatisch laufen soll vs. nur als Erinnerung/Vorschlag an HR | Siehe Teil 4, Umsetzungsvorschlag mit Review-Schritt vor Hard-Delete |

---

## Teil 1 — Kurz-Antwort: Ist Ployo datenschutzrechtlich in Ordnung?

**Kurz: Die Grundlage ist überdurchschnittlich solide, aber "vollständig DSGVO-konform" kann man aktuell nicht behaupten — es gibt mehrere strukturelle Lücken, die vor einer belastbaren Aussage geschlossen werden sollten.**

Was bereits gut ist (das sollte nicht im Klein-Klein der folgenden Tabellen untergehen):

- **Mandanten-Trennung ist durchgängig sauber.** Praktisch jeder Datenzugriff läuft über `requireTenantAccess`/`requireTenantMembership` (`lib/tenant-access.ts`), die `tenantId` immer frisch aus der DB-Mitgliedschaft ableiten — nie aus einer clientseitig mitgeschickten ID. Kein einziger klassischer IDOR-Fall (fremde Mandanten-Daten über ID erreichbar) wurde gefunden.
- **2FA wird bei jedem Zugriff neu geprüft**, nicht nur beim Login (`lib/tenant-access.ts:154-156,243-245`) — eine nachträglich aktivierte 2FA-Pflicht kann nicht durch eine bestehende Session umgangen werden.
- **Kernfelder sind verschlüsselt** (Steuer-ID, Sozialversicherungsnummer, Krankenkasse, IBAN — `lib/encryption.ts`, AES-256-GCM).
- **Webhooks sind korrekt abgesichert** (Stripe-Signatur, Apple-JWT gegen echtes JWKS geprüft).
- **Virenscan** deckt alle 11 Upload-Pfade ab (ClamAV, fail-closed).
- **Security-Header/CSP** größtenteils vorbildlich gesetzt (HSTS, X-Frame-Options, Permissions-Policy).
- **Sentry ist bewusst PII-restriktiv konfiguriert** und Replay/Tracing hängt am Cookie-Consent.
- **Audit-Logging ist breit**, wenn auch mit Lücken (siehe Teil 2.4).

Was die Aussage "in Ordnung" aktuell einschränkt:

1. Es gibt **kein Löschkonzept** — weder als Dokument noch im Code. `former`-Status ist rein kosmetisch, es läuft nichts automatisch ab (Teil 3.3/3.4, Teil 4).
2. Die Verschlüsselung hat **keine Rotationsfähigkeit** und würde bei einem Schlüsselwechsel still Daten unbrauchbar machen (Teil 3.1).
3. Es fehlen **Auftragsverarbeitungsverträge** — weder mit Sentry, noch (als Vorlage) mit deinen eigenen Kunden — obwohl AGB/Datenschutz das Bestehen eines AVV bereits voraussetzen.
4. Ein Sub-Prozessor (Expo, USA) wird für echte Benachrichtigungsinhalte genutzt, aber nicht korrekt offengelegt.
5. Einwilligung (Cookie-Consent) ist **nicht nachweisbar** — es gibt keine serverseitige Aufzeichnung, wann wer welcher Kategorie zugestimmt hat (Art. 7 Abs. 1 DSGVO).
6. Es existiert **kein Verzeichnis von Verarbeitungstätigkeiten** (Art. 30) und **keine DSFA** — bei der Menge an Gesundheits- und Sozialdaten, die über viele Mandanten hinweg verarbeitet werden, spricht einiges dafür, dass eine DSFA nach Art. 35 Abs. 3 lit. b DSGVO tatsächlich erforderlich ist, nicht nur "nice to have".

Das ist der Stand, den Teil 6/7 in einen konkreten, priorisierten Fahrplan übersetzen.

---

## Teil 2 — Sicherheitsaudit bestehender Funktionen

### 2.4 CSP / Security-Header — Rest offen: `style-src`

`script-src` trägt inzwischen einen Nonce + `'strict-dynamic'` statt `'unsafe-inline'` (CSP kommt jetzt per-Request aus `proxy.ts`), das war der eigentliche XSS-Ausführungsweg. Bewusst **nicht** angefasst: `style-src` behält `'unsafe-inline'`, weil Inline-`style={{...}}`-Attribute (15 Dateien, u. a. `ShiftPlanningClient.tsx`, `DataTable.tsx`) sich per CSP nicht per Nonce erlauben lassen (nur `<style>`-Tags, nicht das `style=""`-Attribut selbst). Das vollständig zu schließen bräuchte einen eigenen Umbau — alle Inline-Styles durch CSS-Klassen/-Variablen ersetzen, plus echtes Browser-Testing gegen Layout-Regressions. Restrisiko ist vergleichsweise gering (CSS-Injection kann keinen Code ausführen), aber offen. Schweregrad: Niedrig–Mittel (runter von Mittel).

### 2.6 Webhooks & externe Eingaben — gut

Stripe-Signaturprüfung, Apple-JWT gegen Live-JWKS mit Issuer/Audience-Check, Kontaktformular korrekt doppelt rate-limitiert (IP + E-Mail) mit sauberer `x-forwarded-for`-Behandlung.

---

## Teil 3 — Datenschutz-Audit (DSGVO)

### 3.1 Verschlüsselung sensibler Daten — Rest offen: Key-Versioning/Rotation

**Verschlüsselt** (AES-256-GCM, `lib/encryption.ts`): `taxId`, `socialSecurityNumber`, `healthInsurance`, `iban`, `birthDate`/`birthPlace`/`nationality`/`maritalStatus`, `TenantSicknessReport.note`, Gehaltsfelder (`TenantEmployeeContractDetails.compensation`/`compensationGross`, `TenantPayrollStatement.gross`/`net`), `emergencyContactsJson` und die Privat-/Arbeitsadresse (eigenes `EmployeeAddress`-Modell, getrennt von der weiterhin unverschlüsselten, geteilten `Address`-Tabelle für Standorte/Firmenadresse).

**Strukturelle Schwäche der aktuellen Verschlüsselung, unabhängig vom Feld-Umfang:**
- **Ein einziger statischer Schlüssel** (`FIELD_ENCRYPTION_KEY`, per `scrypt` abgeleitet), keine KMS-Anbindung, kein Key-Versioning trotz Präfix `enc:v1:`, der genau dafür gedacht aussieht.
- **Rotation ist nicht nur unimplementiert, sondern würde beim Versuch still Daten zerstören**: `decryptField` fängt jeden Fehler ab und gibt `""` zurück (`lib/encryption.ts:60-79`) — ein Schlüsselwechsel würde Steuer-ID/SV-Nummer/Krankenkasse/IBAN für alle Mitarbeiter unbemerkt leeren, ohne einen einzigen Fehler zu werfen.
- **Fallback-Schlüssel im Repo**: Ist `NODE_ENV !== "production"` und die Env-Variable nicht gesetzt, wird ein im Quellcode fest hinterlegter String als Schlüssel verwendet (`lib/encryption.ts:12-33`). Bei einer falsch konfigurierten Umgebung mit echten Daten wäre das faktisch keine Verschlüsselung.
- Korrektur ggü. der ursprünglichen Audit-Fassung: ein Boot-Zeit-Check existiert bereits (`lib/encryption.ts:20-26`, hartes `throw` in Produktion ohne `FIELD_ENCRYPTION_KEY`) — nur die benannte Hilfsfunktion `isFieldEncryptionConfigured()` selbst wird nirgendwo aufgerufen (totes Code, nicht fehlender Schutz).

### 3.2 Betroffenenrechte — was schon geht, was fehlt

| Recht | Für den Account (User) | Für die Personalakte (TenantEmployee) |
|---|---|---|
| Auskunft (Art. 15) | ✅ `/api/me/export` | ⚠️ Nur On-Screen-Einsicht über "Mein Bereich" (`lib/self-service.ts:190-360`), **kein Download/Export der eigenen Personalakte** |
| Berichtigung (Art. 16) | ✅ Konto-Einstellungen | ✅ `updateMyProfile` (`lib/self-service.ts:369-412`) für die eigenen Kernfelder |
| Datenübertragbarkeit (Art. 20) | ✅ Export als strukturierte Datei | ❌ Nicht vorhanden |
| Löschung (Art. 17) — durch den Mitarbeiter selbst | ✅ Konto-Löschung (30 Tage Frist) | ❌ Bewusst nicht möglich (richtig so: Arbeitgeber ist Verantwortlicher, nicht der Mitarbeiter) |
| Löschung (Art. 17) — durch HR/Admin für einen einzelnen Mitarbeiter | — | ⚠️ Nur als Alles-oder-nichts-Aktion (`deleteTenantEmployee`), siehe 3.3 |

Das ist im Kern richtig aufgeteilt (Ployo als Auftragsverarbeiter gibt dem einzelnen Mitarbeiter zurecht keine Löschmacht über die Personalakte des Arbeitgebers), aber es fehlt der Baustein in der Mitte: ein Self-Service-Export der eigenen Personalakte für den Mitarbeiter, und ein *gezieltes*, teilbares Löschwerkzeug für HR (statt nur "alles oder nichts").

### 3.3 Mitarbeiter-Austritt ("former") — aktuelles Verhalten

`offboardEmployee()` (`lib/employee-service.ts:1893-1944`) setzt nur `status: "former"`, `endDate` und einen Zeitleisten-Eintrag. Der Code-Kommentar sagt es selbst: die Personalakte bleibt bewusst vollständig erhalten, nichts wird reduziert oder terminiert. Der Status ist zudem jederzeit umkehrbar (`reactivateEmployee()`). Es gibt **keinen einzigen Mechanismus im gesamten Code**, der nach Ablauf einer Frist automatisch etwas mit den Daten eines ehemaligen Mitarbeiters tut — weder Löschung noch Anonymisierung noch auch nur eine Erinnerung an HR.

Die einzige existierende "harte" Löschung, `deleteTenantEmployee()` (`lib/employee-service.ts:2051-2112`), löscht per Cascade **auch Lohnabrechnungen und Krankmeldungen**, ohne jede Prüfung, ob eine gesetzliche Aufbewahrungspflicht (z. B. die 8/10-Jahres-Frist für Lohnunterlagen) dem entgegensteht. Es gibt kein Legal-Hold-Flag im gesamten Schema.

→ Das ist die zentrale Lücke, die Teil 4 dieses Dokuments schließt.

### 3.4 Aufbewahrung/Löschung — was tatsächlich automatisch läuft

Der stündlich laufende Cron-Job (`app/api/cron/cleanup/route.ts`, live via `crontab -l` bestätigt) räumt zuverlässig auf: abgelaufene Sessions/Verifizierungen/Rate-Limits, abgelaufene Einladungen, alte Push-Subscriptions (90 Tage), Audit-Logs entsprechend der pro Mandant konfigurierbaren `auditRetentionMonths` (Standard 24 Monate — dieses Setting ist **echt verdrahtet**, kein totes Feld), weich gelöschte Dateien nach 30 Tagen inkl. S3-Objekt, sowie final geplante Konto-Löschungen.

**Was er nicht anfasst:** `TenantEmployee`, `TenantPayrollStatement`, `TenantSicknessReport` — nichts davon hat eine Alters-/Fristlogik.

**Gefundenes Leck, unabhängig von DSGVO-Fristen:** Wird eine Dateiversion durch eine neue ersetzt, wird ihr Status auf `"replaced"` gesetzt (`lib/storage/storage.service.ts:789`) — dieser Status wird aber **nirgendwo im Code je wieder gelesen oder aufgeräumt**. Alte Versionen verschwinden aus der Oberfläche, bleiben aber für immer in Datenbank und S3 liegen. Das ist ein eigenständiger, unbeabsichtigter Verstoß gegen den Speicherbegrenzungsgrundsatz (Art. 5 Abs. 1 lit. e), unabhängig vom größeren Löschkonzept-Thema.

### 3.5 Auftragsverarbeiter/Sub-Prozessoren

| Prozessor | Zweck | In Datenschutzerklärung offengelegt? |
|---|---|---|
| Host Unlimited (Frankfurt) | Hosting | ✅ |
| OVHcloud (Frankfurt) | Objektspeicher (Dateien) | ✅ |
| Proton AG (Schweiz) | Transaktions-E-Mail | ✅ |
| Sentry / Functional Software Inc. | Fehler-Tracking | ✅ (aber kein AVV signiert) |
| Stripe Payments Europe Ltd. | Zahlungsabwicklung | ✅ |
| Google / Apple | OAuth-Login | ✅ |
| **Expo / 650 Industries Inc. (USA)** | **Versand echter Push-Benachrichtigungsinhalte** (`lib/notifications/expo-push.ts`, `lib/notifications/dispatch.ts:126-130` — z. B. "Dein Urlaub wurde genehmigt.") | ❌ Nur im Kontext von Crash-/Build-Diagnostik erwähnt, nicht als Zustellweg für echte Inhalte |

### 3.6 Einwilligung (Cookie-Consent) — nicht nachweisbar

`lib/consent.ts`/`components/CookieConsent.tsx` setzen nur ein reines Browser-Cookie, client-seitig, 180 Tage gültig. **Es gibt keine serverseitige Aufzeichnung**, wann welche Einwilligung mit welchem Banner-Text unter welcher IP gegeben wurde. Löscht ein Nutzer seine Cookies oder kommt es zum Streitfall, kann Ployo aktuell nicht belegen, dass wirksam eingewilligt wurde (Art. 7 Abs. 1 DSGVO verlangt genau diesen Nachweis).

### 3.7 Fehlende Dokumente

Bestätigt: nirgendwo im Repository existiert ein Verzeichnis von Verarbeitungstätigkeiten (Art. 30), eine Datenschutz-Folgenabschätzung, eine AVV-Vorlage für Kunden, oder ein schriftliches Löschkonzept. Bei der Menge an Gesundheits- und Sozialdaten (Krankmeldungen, Steuer-/SV-Daten), die über potenziell viele Mandanten hinweg verarbeitet werden, ist eine DSFA nach Art. 35 Abs. 3 lit. b DSGVO ("umfangreiche Verarbeitung besonderer Kategorien") ernsthaft zu prüfen, nicht nur als Kür zu behandeln.

---

## Teil 4 — Löschkonzept: Aufteilung der Mitarbeiterdaten nach Löschfristen

Das ist der Kern dessen, was du für den "Umbau der Datenbank" angefragt hast. Statt einer flachen `TenantEmployee`-Tabelle mit einer einzigen, undifferenzierten Lebensdauer, braucht es eine Kategorisierung nach **Rechtsgrundlage der Aufbewahrung** — denn genau die bestimmt, wann etwas gelöscht werden *muss*, wann es gelöscht werden *darf*, und wann es *trotz Löschantrag nicht gelöscht werden darf* (Art. 17 Abs. 3 lit. b DSGVO: gesetzliche Aufbewahrungspflicht sticht das Löschrecht).

### 4.1 Kategorien

| # | Kategorie | Betroffene Felder/Modelle | Rechtsgrundlage & Frist | Fristbeginn |
|---|---|---|---|---|
| 1 | **Stammdaten ohne eigene Aufbewahrungspflicht** | Name, Kontaktdaten, Adresse, Notfallkontakte (`emergencyContactsJson`), Familienstand, Nationalität | Keine gesetzliche Aufbewahrungspflicht — nur solange für den Zweck (aktives Arbeitsverhältnis + Verjährung möglicher Ansprüche) erforderlich | Ende des Arbeitsverhältnisses |
| 2 | **Personalakte / Vertragsdaten** | `TenantEmployeeContract`, `TenantEmployeeContractDetails`, `TenantEmployeeTimeline` | Regelmäßige zivilrechtliche Verjährung (§ 195 BGB, 3 Jahre) als Untergrenze für Nachweis-/Beweiszwecke; bei Kündigungsschutzklagen/Zeugnisansprüchen ggf. länger | Ende des Kalenderjahres des Austritts |
| 3 | **Lohn-/Gehaltsunterlagen (steuer-/handelsrechtlich)** | `TenantPayrollStatement`, `compensation`/`compensationGross`, `iban`, `taxId` | §147 AO / §257 HGB — **Buchungsbelege seit dem Wachstumschancengesetz (2024) grundsätzlich 8 statt 10 Jahre, Bücher/Jahresabschlüsse weiterhin 10 Jahre** — Details unternehmensindividuell, Steuerberater-Rücksprache empfohlen (Punkt 4 oben) | Ende des Kalenderjahres der Ausstellung |
| 4 | **Sozialversicherungsrelevante Daten** | `socialSecurityNumber`, `healthInsurance` | § 28f SGB IV, mind. 4 Jahre nach Ablauf des Kalenderjahres der Fälligkeit — praktisch meist deckungsgleich mit Kategorie 3 aufbewahrt | Ende des Kalenderjahres |
| 5 | **Gesundheitsdaten (Art. 9 DSGVO, besondere Kategorie)** | `TenantSicknessReport` inkl. `note`, Anlagen | Strengste Zweckbindung — nur so lange wie für Entgeltfortzahlungs-/Nachweiszwecke nötig; Diagnose-/Freitextdetails sollten so früh wie vertretbar entfernt werden, unabhängig davon, ob Fehlzeiten-Metadaten (Dauer, kein Grund) länger für Statistik/Lohn gebraucht werden | Abschluss des Krankheitsfalls |
| 6 | **Arbeitszeit-/Mindestlohn-Dokumentation** | `TenantShift`, ggf. künftige Ist-Zeiterfassung | § 17 MiLoG, § 16 Abs. 2 ArbZG — 2 Jahre | Erfassungsdatum |
| 7 | **Audit-/Sicherheitsprotokolle** | `TenantAuditLog` | Bereits vorhanden und konfigurierbar (`auditRetentionMonths`, Standard 24 Monate) — funktioniert bereits korrekt | laufend |

### 4.2 Was das für die Datenbank konkret bedeutet

**Nicht** empfohlen: `TenantEmployee` in viele Kleinst-Tabellen zu zersplittern — das meiste ist bereits sinnvoll normalisiert (Contracts, Payroll, Sickness sind schon eigene Modelle). Der fehlende Teil ist ein **Aufbewahrungs-Metadaten-Layer**, der pro Kategorie trackt, wann etwas fällig zur Prüfung/Löschung ist, plus die Fähigkeit, Kategorie 1 unabhängig von Kategorie 3/4 zu entfernen.

Vorschlag für neue/geänderte Schema-Elemente:

```prisma
model TenantDataRetentionPolicy {
  id          String   @id @default(cuid())
  tenantId    String
  category    String   // "stammdaten" | "personalakte" | "lohn" | "sozialversicherung" | "gesundheit" | "arbeitszeit"
  retentionMonths Int
  legalBasis  String   // Freitext-Referenz, z. B. "§147 AO"
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([tenantId, category])
}
```

Auf `TenantEmployee` selbst:
- `offboardedAt DateTime?` (bisher nur implizit über `endDate`/Status — explizites Datum für Fristberechnung)
- `legalHold Boolean @default(false)` + `legalHoldReason String @default("")` — blockiert jede automatische Löschung/Anonymisierung, mit Audit-Pflicht bei Setzen/Aufheben
- `piiAnonymizedAt DateTime?` — Zeitpunkt, an dem Kategorie-1-Felder anonymisiert wurden (Name → "Ehemalige/r Mitarbeiter/in #<employeeNumber>", Adresse/Notfallkontakte/Geburtsdaten geleert), während `TenantPayrollStatement`/Vertragsdaten für ihre jeweilige Kategorie-Frist unangetastet bleiben

Auf `TenantSicknessReport`: `note` verschlüsseln (wie die anderen Art.-9-Felder) **und** einen separaten, kürzeren Lösch-Turnus für den Freitext bekommen als für die reinen Fehlzeit-Metadaten (Start-/Enddatum).

### 4.3 Der neue Austritts-Workflow

Statt der heutigen zwei Extreme (kosmetisches `former` vs. alles-löscht-`deleteTenantEmployee`) ein dreistufiger Prozess:

1. **Austritt (`offboardEmployee`, wie heute)** — setzt Status + `offboardedAt`. Keine Datenänderung, nur der Startschuss für die Fristuhr.
2. **Automatische Kategorie-1-Anonymisierung nach Ablauf der kurzen Frist** (Vorschlag: 3 Jahre nach `offboardedAt`, konfigurierbar über `TenantDataRetentionPolicy`, es sei denn `legalHold` ist gesetzt) — läuft im bestehenden Cron-Job mit, analog zur bereits funktionierenden Audit-Log-Bereinigung. Vor jeder automatischen Anonymisierung: Audit-Log-Eintrag mit Rechtsgrundlage, keine Rückgängig-Funktion.
3. **Kategorie 3/4/5 laufen unabhängig weiter**, bis ihre je eigene gesetzliche Frist abläuft — Lohnabrechnungen und SV-Daten dürfen (müssen!) auch nach Anonymisierung der Stammdaten noch als eigenständiger, pseudonymisierter Datensatz (verknüpft nur über die intern bleibende `employeeNumber`, nicht über Name/Adresse) bestehen bleiben.

Für den **gezielten Einzelfall-Löschantrag** (Art. 17 DSGVO-Anfrage eines ehemaligen Mitarbeiters an den Kunden, Kunde leitet an HR-Admin weiter): ein neuer, granularer Workflow statt `deleteTenantEmployee`, der pro Kategorie zeigt, was sofort löschbar ist und was wegen Aufbewahrungspflicht (`legalHold`-artige Sperre, aber gesetzlich statt manuell) noch nicht gelöscht werden darf — inklusive einer für HR verständlichen Erklärung, warum ("Lohnabrechnung Juni 2024 kann laut § 147 AO erst ab 2033 gelöscht werden").

**Wie automatisch soll das laufen?** Das ist Punkt 7 der Aufmerksamkeits-Tabelle oben — mein Vorschlag: Kategorie 1 (unkritische Stammdaten) vollautomatisch nach Fristablauf, alles mit Aufbewahrungspflicht (3/4) nie automatisch löschen (nur automatisch *freigeben*, danach manuelle HR-Bestätigung), Kategorie 5 (Gesundheitsdaten) mit kürzester Frist und aktiver Erinnerung an HR statt stillem Auto-Lauf, da hier Fehlentscheidungen am teuersten sind.

---

## Teil 5 — Weitere für Unternehmer relevante Gesetze & Produktideen

Diese Gesetze betreffen nicht Ployo direkt, sondern **deine Kunden** (die Unternehmer) — das Tool kann ihnen aber helfen, sie einzuhalten, was gleichzeitig ein Verkaufsargument ist.

| Gesetz | Relevanz für Ployo-Kunden | Was das Tool tun könnte | Priorität |
|---|---|---|---|
| **Arbeitszeitgesetz (ArbZG)** — Ruhezeiten (11 h zwischen Schichten), Höchstarbeitszeit (8 h, verlängerbar auf 10 h), Pausenpflicht | Bei Schicht-basierten Betrieben (Gastro, Einzelhandel — genau Ployos Zielgruppe) ein häufiger, teurer Compliance-Fehler | `TenantSettings.shiftBreakRule` existiert bereits als Einstellung, aber es fehlt eine aktive Prüfung/Warnung beim Anlegen von Schichten, die gegen Ruhezeit oder Höchstarbeitszeit verstößt — naheliegende, im Schichtplanungs-Modul direkt umsetzbare Erweiterung | Hoch — passt genau zum Kernprodukt |
| **Kommendes Arbeitszeiterfassungsgesetz** — Referentenentwurf des BMAS (Juni 2026), Pflicht zur elektronischen Ist-Zeiterfassung, gestaffelte Übergangsfristen nach Betriebsgröße, Kleinstbetriebe dauerhaft von der elektronischen Pflicht ausgenommen | Wird für einen Großteil der Kunden verpflichtend, sobald das Gesetz in Kraft tritt | Ployo hat aktuell nur Soll-Schichtpläne, keine Ist-Zeiterfassung. Frühzeitiger Aufbau einer echten elektronischen Zeiterfassung wäre ein Wettbewerbsvorteil, sobald das Gesetz kommt | Mittel–Hoch (Timing beobachten, Gesetz ist noch nicht final) |
| **Nachweisgesetz (NachwG)** | Wesentliche Vertragsbedingungen müssen fristgerecht schriftlich/in Textform mitgeteilt werden; für einige Branchen (Bau, Gastgewerbe, Fleischwirtschaft, Sicherheitsgewerbe, Speditions-/Transportgewerbe u. a.) weiterhin Schriftform (Unterschrift auf Papier) statt reiner Textform nötig | `TenantReminder` existiert bereits — ließe sich um automatische Nachweis-Fristen je Vertragsänderung erweitern; bei Vertragserstellung Warnhinweis, falls Kunde einer der schriftformpflichtigen Branchen zuzuordnen ist | Mittel |
| **Mindestlohngesetz (MiLoG)** § 17 | Aufzeichnungspflicht für Beginn/Ende/Dauer der täglichen Arbeitszeit bei Minijobs/bestimmten Branchen, binnen 7 Tagen, 2 Jahre Aufbewahrung | Direkt durch echte Zeiterfassung (siehe oben) erfüllbar | Mittel–Hoch |
| **Jugendarbeitsschutzgesetz (JArbSchG)** | Für minderjährige Mitarbeiter: Nachtarbeits-/Sonntagsverbote, Höchstarbeitszeiten, strengere Pausen | `TenantEmployee.birthDate` ist erfasst, aber die Schichtplanung prüft aktuell nicht auf Minderjährigkeit — automatische Warnung/Blockade bei Schichtzuweisung wäre naheliegend | Mittel (v. a. für Gastro/Einzelhandel-Kunden mit Azubis/Schülern relevant) |
| **Mutterschutzgesetz (MuSchG)** | Beschäftigungsverbote (grds. 20–6 Uhr, Sonn-/Feiertage), Gefährdungsbeurteilungspflicht | Bräuchte ein bewusst *besonders geschütztes* Datenfeld (Schwangerschaft ist hochsensibel, eigene Zugriffsbeschränkung nötig) + Schichtplan-Warnung | Niedrig–Mittel (sensibles Thema, sorgfältige Opt-in-Gestaltung nötig, kein automatischer Zwang zur Angabe) |
| **Betriebsverfassungsgesetz (BetrVG)** § 87 Abs. 1 Nr. 6 | Mitbestimmungspflicht des Betriebsrats bei Einführung technischer Kontroll-/Überwachungseinrichtungen — ein Schichtplanungs-/Auswertungstool kann darunterfallen | Kein Code-Feature, sondern ein Hinweis-/Onboarding-Baustein: Kunden mit Betriebsrat auf die Mitbestimmungspflicht hinweisen, bevor sie loslegen | Niedrig (Aufklärung, kein Code) |
| **AGG** | Bei künftigem Recruiting-Feature relevant (Bewerbungsdaten: 6 Monate Aufbewahrung wegen möglicher AGG-Ansprüche) | Aktuell nicht vorhanden — nur als Notiz für den Fall, dass Ployo später Bewerbermanagement anbietet | Für später vormerken |
| **Barrierefreiheitsstärkungsgesetz (BFSG)**, seit 28.06.2025 | Betrifft primär an Verbraucher gerichtete Dienste; Ployo ist B2B (Vertragspartner ist der Unternehmer, nicht der einzelne Mitarbeiter) — direkte Pflicht ist unwahrscheinlich, aber nicht hundertprozentig auszuschließen (Mitarbeiter-App als Endnutzer-Dienst) | Barrierefreiheit ohnehin sinnvoll für breite Nutzbarkeit — niedrige Priorität als Pflicht, aber gute Praxis | Niedrig |
| **Art. 30 DSGVO (Verzeichnis von Verarbeitungstätigkeiten)** | Pflicht für Ployo *und* für jeden Kunden ab bestimmter Schwelle/bei Verarbeitung besonderer Kategorien (Gesundheitsdaten via Krankmeldungen greift das fast immer) | Eigenständige Produktidee: ein automatisch aus den genutzten Modulen generiertes Verarbeitungsverzeichnis für den Kunden — echtes Alleinstellungsmerkmal, macht Ployo selbst gleichzeitig compliant | Mittel (guter mittelfristiger Roadmap-Punkt) |

---

## Teil 6 — Technischer Umbauplan (Datenbank & Code)

Konkrete, reihenfolge-abhängige Schritte, zusammengeführt aus Teil 2–5:

1. **Key-Versioning einführen** — `enc:v{n}:`-Präfix tatsächlich nutzen, Rotationsskript (unter altem Schlüssel entschlüsseln, unter neuem neu verschlüsseln, Migration in Batches). Feld-Abdeckung selbst ist erledigt, siehe Teil 3.1.
2. **`TenantFile.status = "replaced"`-Leck schließen** — entweder in den bestehenden 30-Tage-Purge-Lauf aufnehmen oder explizit dokumentieren, warum alte Versionen dauerhaft bleiben sollen (falls das eine bewusste Versionshistorie-Anforderung ist, dann wenigstens mit eigener, expliziter Frist statt stillem Datenwachstum).
3. **Löschkonzept-Schema** (Teil 4.2) einführen: `TenantDataRetentionPolicy`, `TenantEmployee.offboardedAt`/`legalHold`/`legalHoldReason`/`piiAnonymizedAt`.
4. **Cron-Job erweitern** um die Kategorie-1-Anonymisierungslogik (Teil 4.3), analog zur bestehenden Audit-Log-Bereinigung.
5. **Gezielter Löschantrags-Workflow** für HR (Teil 4.3, "Einzelfall-Löschantrag") als Ersatz/Ergänzung zum heutigen alles-oder-nichts `deleteTenantEmployee`.
6. **Consent-Protokollierung** — neues `ConsentRecord`-Modell (userId/anonyme Kennung, Kategorie, Zeitpunkt, IP, Banner-Version), serverseitig geschrieben bei jeder Einwilligung/jedem Widerruf.
7. **Self-Service-Export der eigenen Personalakte** — Pendant zu `/api/me/export`, aber für die Felder aus `getMySelfServiceOverview`.
8. **`style-src` CSP `unsafe-inline` entfernen** — Inline-`style={{...}}`-Attribute (15 Dateien) durch CSS-Klassen/-Variablen ersetzen (`script-src` ist bereits Nonce-basiert, siehe 2.4).
9. **Rechtstexte** um Expo als Sub-Prozessor ergänzen, veraltetes "Stand"-Datum auf der Datenschutzseite korrigieren.

---

## Teil 7 — Priorisierter Maßnahmenplan

### Phase 0 — Sofort (diese Woche)
- Datenschutzerklärung um Expo ergänzen, "Stand"-Datum korrigieren — **[Ich]**

### Phase 1 — Kurzfristig (2–4 Wochen)
- Key-Versioning einführen — **[Ich]**, aber Rotation selbst nur mit deiner Freigabe ausführen (unumkehrbar bei Fehler) — **[Du → Ich]**
- `TenantFile.status = "replaced"`-Leck schließen — **[Ich]**
- Consent-Protokollierung (`ConsentRecord`) — **[Ich]**
- Self-Service-Export der eigenen Personalakte — **[Ich]**

### Phase 2 — Mittelfristig (1–3 Monate)
- Löschkonzept-Schema + Cron-Erweiterung (Kategorie-1-Anonymisierung) — **[Ich]**, Fristen/Kategorien fachlich mit dir/Steuerberater abstimmen — **[Du → Ich]**
- Gezielter Löschantrags-Workflow für HR — **[Ich]**
- AVV-Vorlage für Kunden entwerfen — **[Ich]** (Entwurf), Anwalts-Freigabe — **[Du]**
- Verzeichnis von Verarbeitungstätigkeiten + DSFA-Entwurf — **[Ich]** (Entwurf), fachliche/anwaltliche Freigabe — **[Du]**
- ArbZG-Compliance-Prüfung in der Schichtplanung (Ruhezeit/Höchstarbeitszeit-Warnung) — **[Ich]**
- `style-src` CSP `unsafe-inline` entfernen (Inline-Styles → CSS-Klassen, `script-src` bereits erledigt) — **[Ich]**

### Phase 3 — Langfristig / Produkt-Roadmap
- Echte elektronische Ist-Zeiterfassung (Vorgriff auf Arbeitszeiterfassungsgesetz, erfüllt gleichzeitig MiLoG §17) — **[Du → Ich]** (Produktentscheidung, dann Umsetzung)
- Automatisch generiertes Verarbeitungsverzeichnis als Kunden-Feature — **[Du → Ich]**
- Jugendarbeitsschutz-Prüfung in der Schichtplanung (Minderjährigen-Schutz) — **[Du → Ich]**
- Mutterschutz-Kennzeichnung mit strikter Zugriffsbeschränkung (sensibles Opt-in-Design) — **[Du → Ich]**
- Betriebsrat-Hinweisbaustein im Onboarding — **[Ich]**

---

## Anhang: Methodik

Drei parallele Vollaudits des aktuellen Codes (nicht des Trainingsstands, nicht alter To-Do-Einträge): (1) PII/Verschlüsselung/Aufbewahrung/Austritts-Handling, (2) Zugriffskontrolle/Sicherheit, (3) Prozessoren/Rechtstexte-Abgleich. Zusätzlich eigene Recherche zum Stand des Arbeitszeiterfassungsgesetzes (Referentenentwurf des BMAS, Juni 2026, noch kein Regierungsentwurf). Alle Befunde sind mit `datei:zeile` belegt; Rechtsfristen (§147 AO, §257 HGB, §28f SGB IV, §17 MiLoG) sind nach bestem Wissen benannt, aber — wie in der Aufmerksamkeits-Tabelle markiert — vor Umsetzung mit Steuerberater/Anwalt gegenzuprüfen, da einzelne Fristen (insbesondere die 8-vs-10-Jahre-Frage bei Buchungsbelegen seit dem Wachstumschancengesetz) von Übergangsregelungen und Einzelfallauslegung abhängen.
