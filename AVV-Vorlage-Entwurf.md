# Auftragsverarbeitungsvertrag (AVV) — Entwurf

**⚠️ Entwurf. Vor Verwendung anwaltliche Prüfung erforderlich (Punkt 6 der "Braucht zwingend deine Aufmerksamkeit"-Tabelle im Umbauplan). Dies ist eine technisch fundierte Vorlage nach Art. 28 DSGVO, keine Rechtsberatung.**

Dieser Vertrag ergänzt den Hauptvertrag (AGB) zwischen Ployo und dem Kunden und regelt die Verarbeitung personenbezogener Daten der Mitarbeiter des Kunden durch Ployo als Auftragsverarbeiter. AGB §5 und die Datenschutzerklärung §5 setzen das Bestehen eines solchen AVV bereits voraus — bislang existierte dafür keine tatsächliche Vorlage.

---

## 1. Gegenstand und Dauer

Ployo ("Auftragsverarbeiter") verarbeitet im Auftrag des Kunden ("Verantwortlicher") personenbezogene Daten der vom Kunden angelegten Mitarbeiter im Rahmen der Nutzung der Ployo-Software (Personaleinsatzplanung, Personalakte, Zeiterfassung, Selbstauskunft). Die Laufzeit dieses AVV entspricht der Laufzeit des Hauptvertrags.

## 2. Art und Zweck der Verarbeitung

Verwaltung von Personalstammdaten, Vertrags- und Gehaltsdaten, Schichtplanung, Urlaubs-/Krankmeldungsverwaltung, Dokumentenablage (Personalakte), Push-Benachrichtigungen, Selbstauskunft der Mitarbeiter über die Web-Anwendung und die mobile App.

## 3. Art der personenbezogenen Daten

Stammdaten (Name, Kontaktdaten, Adresse, Geburtsdaten), Beschäftigungsdaten (Vertrag, Rolle, Gehalt, IBAN, Steuer-ID, SV-Nummer), besondere Kategorien nach Art. 9 DSGVO (Gesundheitsdaten aus Krankmeldungen), Notfallkontakte, hochgeladene Dokumente (Verträge, Zertifikate, Ausweisdokumente), Nutzungsdaten (Anmeldungen, Push-Token).

## 4. Kategorien betroffener Personen

Mitarbeiter, ehemalige Mitarbeiter und Bewerber (soweit vom Kunden im System angelegt) des Verantwortlichen.

## 5. Pflichten des Auftragsverarbeiters (Art. 28 Abs. 3 DSGVO)

- Verarbeitung ausschließlich auf dokumentierte Weisung des Verantwortlichen (die Nutzung der Software-Funktionen durch den Kunden gilt als Weisung).
- Vertraulichkeitsverpflichtung aller Personen, die Zugriff auf die Daten haben.
- Technische und organisatorische Maßnahmen nach Art. 32 DSGVO (siehe Anlage 1).
- Unterstützung des Verantwortlichen bei der Erfüllung von Betroffenenrechten (Auskunft, Berichtigung, Löschung, Datenübertragbarkeit) — technisch abgebildet über `/api/me/export`, den Personalakte-Export und den gezielten Löschantrags-Workflow (siehe `Loeschkonzept.md`).
- Unterstützung bei Meldepflichten nach Art. 33/34 DSGVO im Falle einer Datenschutzverletzung.
- Löschung oder Rückgabe aller Daten nach Vertragsende, soweit keine gesetzliche Aufbewahrungspflicht entgegensteht.
- Bereitstellung aller zur Kontrolle erforderlichen Informationen, Ermöglichung von Audits.

## 6. Unterauftragsverarbeiter

Der Verantwortliche stimmt dem Einsatz folgender Subunternehmer zu (Stand siehe Datenschutzerklärung, `app/(legal)/datenschutz/page.tsx`):

| Subunternehmer | Zweck | Standort |
|---|---|---|
| Host Unlimited | Hosting | Frankfurt am Main, Deutschland |
| OVHcloud | Objektspeicher (Dateien) | Frankfurt am Main, Deutschland |
| Proton AG | Transaktions-E-Mail | Schweiz |
| Sentry (Functional Software, Inc.) | Fehler-/Performance-Monitoring | EU-Datenverarbeitung |
| Stripe Payments Europe, Ltd. | Zahlungsabwicklung | EU |
| Expo (650 Industries, Inc.) | Zustellung von Push-Benachrichtigungen | USA |
| Google / Apple | OAuth-Login (optional, nur bei Nutzung durch den Endnutzer) | USA/international |

Eine Änderung der Unterauftragsverarbeiter wird dem Kunden vorab angekündigt; der Kunde kann innerhalb einer angemessenen Frist widersprechen.

**Offener Punkt:** Für Expo (USA) ist zu klären, auf welcher Grundlage die Datenübermittlung in ein Drittland erfolgt (EU-Standardvertragsklauseln, Angemessenheitsbeschluss o. ä.) — externe Recherche/Anfrage bei Expo nötig, siehe Punkt 3 der "Braucht zwingend deine Aufmerksamkeit"-Tabelle im Umbauplan.

## 7. Technische und organisatorische Maßnahmen (Anlage 1, Kurzfassung)

- Verschlüsselung besonders sensibler Felder (Steuer-ID, SV-Nummer, IBAN, Gesundheitsdaten) mit AES-256-GCM (`lib/encryption.ts`).
- TLS-Verschlüsselung aller Übertragungen.
- Rollenbasierte Zugriffskontrolle mit granularen Berechtigungen pro Funktionsbereich.
- Zwei-Faktor-Authentifizierung, mandantenweit erzwingbar und bei jedem Zugriff neu geprüft.
- Mandanten-Trennung auf Datenbankebene, serverseitig aus der Mitgliedschaft abgeleitet (kein IDOR-Risiko über clientseitig mitgeschickte IDs).
- Virenscan aller Datei-Uploads (ClamAV).
- Sicherheits-Header (CSP, HSTS, X-Frame-Options u. a.).
- Audit-Protokollierung sicherheits- und datenschutzrelevanter Vorgänge, konfigurierbare Aufbewahrung.
- Definiertes Löschkonzept mit kategorienspezifischen Fristen (siehe `Loeschkonzept.md`).

## 8. Haftung

Es gelten die Haftungsregelungen des Hauptvertrags (AGB), soweit nicht zwingende gesetzliche Vorgaben der Art. 82, 28 DSGVO entgegenstehen.

---

*Diese Vorlage wurde am 2026-09-03 auf Basis der tatsächlichen Datenverarbeitung im Ployo-Code erstellt (nicht aus einer generischen Mustervorlage kopiert). Vor Einsatz mit einem Anwalt abstimmen, insbesondere zu Haftungsfragen und der Drittland-Übermittlung an Expo.*
