# Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO) — Entwurf

**⚠️ Entwurf, Stand 2026-09-03. Aus den tatsächlich im Code gefundenen Verarbeitungen erstellt (nicht aus einer generischen Vorlage). Vor Verwendung fachlich/anwaltlich freigeben.**

Ployo ist als Anbieter der Software sowohl Verantwortlicher (für die eigenen Kunden- und Nutzerkonten) als auch Auftragsverarbeiter (für die von Kunden verwalteten Mitarbeiterdaten). Dieses Dokument führt beide Rollen getrennt.

---

## Teil A — Ployo als Verantwortlicher

### A1. Kundenverwaltung / Vertragsabwicklung
- **Zweck:** Vertragsabschluss und -durchführung mit Ployo-Kunden (Tenant-Inhaber).
- **Kategorien betroffener Personen:** Kunden-Ansprechpartner (i. d. R. Unternehmer/HR-Verantwortliche).
- **Datenkategorien:** Name, E-Mail, Firma, Rechnungsdaten.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO (Vertrag).
- **Empfänger:** Stripe Payments Europe, Ltd. (Zahlungsabwicklung).
- **Löschfrist:** Nach Vertragsende gemäß handelsrechtlicher Aufbewahrungsfrist (siehe `Loeschkonzept.md`, Kategorie `lohn_sozialversicherung` als Orientierung für Rechnungsdaten).
- **TOM:** siehe `AVV-Vorlage-Entwurf.md`, Anlage 1.

### A2. Nutzerkonten (Login, Authentifizierung)
- **Zweck:** Bereitstellung des Zugangs zur Anwendung (Web + mobile App).
- **Kategorien betroffener Personen:** Alle Nutzer (Kunden-Admins, HR, Mitarbeiter).
- **Datenkategorien:** Name, E-Mail, Passwort-Hash, Zwei-Faktor-Secret, Sitzungsdaten, OAuth-Verknüpfungen (Google/Apple, optional).
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO (Vertrag/vorvertragliche Maßnahme).
- **Empfänger:** Google/Apple (nur bei OAuth-Login durch den Nutzer selbst gewählt).
- **Löschfrist:** Bei Konto-Löschung (30-Tage-Frist), automatisiert über `app/api/cron/cleanup`.

### A3. Cookie-Consent-Nachweis
- **Zweck:** Nachweis einer wirksamen Einwilligung nach Art. 7 Abs. 1 DSGVO.
- **Kategorien betroffener Personen:** Website-Besucher.
- **Datenkategorien:** Einwilligungsentscheidung, Zeitpunkt, IP-Adresse, Banner-Version.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. c DSGVO (rechtliche Verpflichtung, Nachweispflicht).
- **Löschfrist:** Kein automatisches Löschen — der Nachweiswert bleibt über die Zeit relevant (`ConsentRecord`-Modell).

### A4. Fehler-/Performance-Monitoring (Sentry)
- **Zweck:** Erkennung und Behebung technischer Fehler.
- **Kategorien betroffener Personen:** Alle Nutzer.
- **Datenkategorien:** Fehlermeldungen, technische Metadaten, ggf. Session-Aufzeichnung (nur mit Einwilligung).
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. a DSGVO (Einwilligung, Session-Aufzeichnung) bzw. lit. f (berechtigtes Interesse, Basis-Fehlererfassung).
- **Empfänger:** Sentry / Functional Software, Inc. (EU-Datenverarbeitung).

## Teil B — Ployo als Auftragsverarbeiter (im Auftrag jedes einzelnen Kunden)

### B1. Personalstammdaten- und Personalaktenverwaltung
- **Zweck:** Verwaltung von Mitarbeiterstammdaten, Verträgen, Dokumenten.
- **Kategorien betroffener Personen:** Mitarbeiter, ehemalige Mitarbeiter des Kunden.
- **Datenkategorien:** Name, Kontaktdaten, Adresse, Geburtsdaten, Notfallkontakte, Vertragsdaten.
- **Rechtsgrundlage (beim Kunden als Verantwortlichem):** Art. 6 Abs. 1 lit. b DSGVO (Arbeitsvertrag), § 26 BDSG.
- **Löschfrist:** Kategorie `personaldaten`, 3 Jahre nach Austritt, siehe `Loeschkonzept.md`.

### B2. Gehaltsabrechnung / Sozialversicherung
- **Zweck:** Bereitstellung von Gehaltsabrechnungen, Verwaltung SV-relevanter Daten.
- **Datenkategorien:** IBAN, Steuer-ID, SV-Nummer, Krankenkasse, Gehaltsbeträge (verschlüsselt, `lib/encryption.ts`).
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b, c DSGVO; steuer-/sozialversicherungsrechtliche Pflichten.
- **Löschfrist:** Kategorie `lohn_sozialversicherung`, 8 Jahre, §147 AO/§257 HGB.

### B3. Krankmeldungs- und Gesundheitsdatenverwaltung
- **Zweck:** Nachweis von Arbeitsunfähigkeit, Entgeltfortzahlung.
- **Datenkategorien:** Zeitraum der Erkrankung, Freitext-Notizen, Atteste (Art. 9 DSGVO, besondere Kategorie).
- **Rechtsgrundlage:** Art. 9 Abs. 2 lit. b DSGVO i. V. m. § 26 BDSG.
- **Löschfrist:** Kategorie `gesundheit_freitext`, 1 Jahr für Freitext nach Fallabschluss.
- **Besonderheit:** Kein automatisches Löschen — nur Erinnerung an HR (siehe `Loeschkonzept.md`, Abschnitt 3).

### B4. Personaleinsatzplanung (Schichtplanung)
- **Zweck:** Planung und Dokumentation von Arbeitszeiten.
- **Datenkategorien:** Schichtzeiten, Standort-/Teamzuordnung.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b, c DSGVO; §17 MiLoG, ArbZG-Dokumentationspflichten.
- **Löschfrist:** Kategorie `arbeitszeit`, 2 Jahre.
- **Ergänzung seit 2026-09-03:** Automatisierte Prüfung auf Ruhezeit- (§5 ArbZG) und Höchstarbeitszeit-Verstöße (§3 ArbZG) bei Schicht-Anlage (`lib/arbzg-rules.ts`).

### B4a. Arbeitszeiterfassung (Stempeluhr) — seit 2026-10-06
- **Zweck:** Erfassung der tatsächlich geleisteten Arbeitszeit (Beginn, Ende, Pausen) zur Erfüllung der Aufzeichnungspflichten und als Grundlage der Lohnabrechnung.
- **Datenkategorien:** Ein-/Ausstempel- und Pausenzeitpunkte, Bezug zur geplanten Schicht, Korrekturen inkl. Grund und Bearbeiter; bei aktiviertem QR-Stempeln der Betriebsstandort, dessen QR-Code beim Einstempeln gescannt wurde. Kein GPS/keine Geräteortung.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b, c DSGVO; §16 Abs. 2 ArbZG, §17 MiLoG, BAG 1 ABR 22/21.
- **Löschfrist:** Kategorie `arbeitszeit`, 2 Jahre ab Erfassung, automatische Löschung (Legal Hold ausgenommen).
- **Besonderheit:** Je Mandant einschaltbar (Standard aus); Mitbestimmung nach § 87 Abs. 1 Nr. 6 BetrVG beachten.

### B5. Push-Benachrichtigungen
- **Zweck:** Benachrichtigung über neue Schichten, genehmigte Anträge, Info-Anfragen, Erinnerungen zum Ein-/Ausstempeln.
- **Datenkategorien:** Geräte-/Push-Token, Benachrichtigungsinhalt.
- **Rechtsgrundlage:** Art. 6 Abs. 1 lit. b, f DSGVO.
- **Empfänger:** Expo (650 Industries, Inc., USA) als Zustelldienst, leitet an Apple/Google weiter.

### B6. Selbstauskunft und Datenexport
- **Zweck:** Erfüllung der Betroffenenrechte (Art. 15, 20 DSGVO) durch den Mitarbeiter selbst.
- **Datenkategorien:** Alle in B1–B4 genannten, im Umfang der eigenen Personalakte.
- **Rechtsgrundlage:** Art. 15, 20 DSGVO.
- **Technische Umsetzung:** `/api/me/export` (Kontodaten), `/api/me/personalakte-export` (vollständige Personalakte, seit 2026-09-03).

---

## Hinweis zur Datenschutz-Folgenabschätzung

Angesichts der Verarbeitung von Gesundheitsdaten (B3) über potenziell viele Mandanten hinweg ist eine DSFA nach Art. 35 Abs. 3 lit. b DSGVO ernsthaft zu prüfen — siehe `DSFA-Entwurf.md`.
