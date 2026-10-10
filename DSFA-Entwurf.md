# Datenschutz-Folgenabschätzung (DSFA, Art. 35 DSGVO) — Entwurf

**⚠️ Entwurf, Stand 2026-09-03. Erstbewertung zur Feststellung der Erforderlichkeit einer vollständigen DSFA. Ersetzt keine förmliche DSFA und keine anwaltliche Prüfung.**

## 1. Anlass

Art. 35 Abs. 3 lit. b DSGVO verlangt eine DSFA insbesondere bei "umfangreicher Verarbeitung besonderer Kategorien von personenbezogenen Daten nach Art. 9 Abs. 1". Ployo verarbeitet für seine Kunden Gesundheitsdaten (Krankmeldungen, `TenantSicknessReport`) über potenziell viele Mandanten hinweg. Diese Erstbewertung prüft, ob eine DSFA tatsächlich erforderlich ist.

## 2. Systematische Beschreibung der Verarbeitung

- **Was:** Erfassung von Krankheitszeiträumen, optional Freitext-Angaben zur Erkrankung, optional Anhänge (Atteste).
- **Wer:** Mitarbeiter melden selbst oder werden von HR erfasst; sichtbar für HR-Rollen des jeweiligen Mandanten sowie den betroffenen Mitarbeiter selbst.
- **Wie:** Freitext und Anhänge sind feldverschlüsselt (AES-256-GCM, `lib/encryption.ts`); Zugriff ausschließlich über rollenbasierte, mandantengetrennte Berechtigungen (`lib/tenant-access.ts`).
- **Umfang:** Skaliert mit der Anzahl der Ployo-Kunden (Mandanten) und deren Mitarbeiterzahl — strukturell auf Wachstum angelegt, aktuell (Stand 2026-09-03) noch überschaubar.

## 3. Notwendigkeit und Verhältnismäßigkeit

- Die Verarbeitung ist für die gesetzlich vorgeschriebene Entgeltfortzahnung (§ 3 EFZG) und den Nachweis gegenüber Sozialversicherungsträgern erforderlich — der Zweck ist nicht durch ein milderes Mittel erreichbar (der Arbeitgeber muss wissen, wann und wie lange ein Mitarbeiter arbeitsunfähig war).
- Der Freitext (mögliche Diagnose-Angaben) ist optional und wird nach kurzer Frist (1 Jahr, siehe `Loeschkonzept.md`) durch eine HR-Erinnerung zur manuellen Prüfung markiert — reine Fehlzeit-Metadaten (Datum/Dauer) ohne Diagnosebezug können länger für Lohnfortzahlungs-/Statistikzwecke aufbewahrt werden, ohne dass das den Art.-9-Schutz betrifft.

## 4. Risikobewertung für die betroffenen Personen

| Risiko | Eintrittswahrscheinlichkeit | Schwere | Bestehende Gegenmaßnahme |
|---|---|---|---|
| Unbefugter Zugriff auf Gesundheitsdaten durch Dritte (externer Angriff) | Niedrig | Hoch | Feldverschlüsselung, TLS, Virenscan aller Uploads, Sicherheits-Header, 2FA |
| Unbefugter Zugriff durch Mitarbeiter desselben Mandanten (fehlende Rollenprüfung) | Niedrig | Hoch | Rollenbasierte Zugriffskontrolle, im Sicherheitsaudit ohne IDOR-Befund geprüft |
| Zugriff durch Mitarbeiter eines anderen Mandanten (Mandanten-Leck) | Sehr niedrig | Sehr hoch | Mandanten-ID wird serverseitig aus der Mitgliedschaft abgeleitet, nie aus clientseitig mitgeschickten Werten — im Audit ohne Befund geprüft |
| Zu lange Aufbewahrung sensibler Freitext-Angaben | Mittel (vor diesem Löschkonzept: hoch) | Mittel | Neu eingeführt: automatische HR-Erinnerung nach 1 Jahr (`lib/retention-service.ts`) |
| Datenabfluss über Sub-Prozessor (Expo, USA, für Push-Benachrichtigungen) | Niedrig — betrifft nur Benachrichtigungstext, nicht die Gesundheitsdaten selbst | Niedrig | Verifiziert (`lib/notifications/messages.ts`, Fall `newSicknessReport`): Der Text enthält ausschließlich Mitarbeitername und Beginn-Datum, keinerlei Freitext/Diagnose-Angaben |

## 5. Vorläufige Einschätzung

Die Verarbeitung erfüllt das Kriterium "besondere Kategorien" (Art. 9), aber der Umfang ist nach aktuellem Stand (wenige Mandanten, Stand 2026-09-03) noch nicht eindeutig "umfangreich" im Sinne der Aufsichtsbehörden-Leitlinien (WP248 rev.01: Kriterien sind u. a. Anzahl betroffener Personen, Datenvolumen, Dauer, geografische Ausdehnung). **Empfehlung:** Diese Erstbewertung jährlich oder bei signifikantem Kundenwachstum wiederholen; eine förmliche, vollständige DSFA vorbereiten, sobald die Mandanten-/Mitarbeiterzahl deutlich wächst oder ein Aufsichtsbehörden-Kontakt ansteht. Bereits jetzt sinnvoll: diese Erstbewertung als Nachweis vorhalten, dass die Frage aktiv geprüft wurde.

## 5a. Ergänzung 2026-10-06: Arbeitszeiterfassung (Stempeluhr)

- **Was:** Ein-/Ausstempel- und Pausenzeitpunkte je Mitarbeiter (`TenantTimeEntry`, `TenantTimeBreak`), Bezug zur geplanten Schicht, Korrekturen der Verwaltung inkl. Grund und Bearbeiter. Vom Mandanten pro Betrieb einschaltbar, standardmäßig aus.
- **Keine besondere Kategorie (Art. 9)**, aber ein typisches Kriterium aus WP248 rev.01 berührt: systematische Überwachung von Beschäftigten (Machtungleichgewicht Arbeitgeber/Arbeitnehmer). Deshalb gesondert bewertet.
- **Zweck/Rechtsgrundlage:** gesetzliche Pflicht zur Arbeitszeiterfassung (BAG 1 ABR 22/21, § 16 Abs. 2 ArbZG, § 17 MiLoG), Art. 6 Abs. 1 lit. b, c DSGVO.
- **Datenminimierung:** kein GPS/keine Geräteortung (beim optionalen QR-Stempeln wird nur der Betriebsstandort gespeichert, dessen fest ausgehängter QR-Code gescannt wurde — die Kamera erkennt nur den Code, es werden keine Bilder gespeichert), keine Geräte-Kennungen am Stempel, keine automatisierte Leistungsbewertung oder Profilbildung; nur Zeitpunkte, die der Server setzt (manipulationssicher, keine clientseitigen Zeitangaben).
- **Zugriff:** eigene Zeiten nur der Mitarbeiter selbst; fremde Zeiten nur mit eigenem Berechtigungsbereich „Zeiterfassung“ (Scope eigene/Team/alle); jede Korrektur mit Pflicht-Grund im Audit-Log (vorher/nachher).
- **Speicherdauer:** automatische Löschung nach 2 Jahren (Kategorie `arbeitszeit`, `lib/retention-service.ts`), Legal Hold wird respektiert.
- **Push-Erinnerungen** über Expo enthalten nur Betriebsname und Schichtzeiten, keine Ist-Zeiten.
- **Mitbestimmung:** Hinweis auf § 87 Abs. 1 Nr. 6 BetrVG im Onboarding und direkt an der Einstellung.

| Risiko | Eintrittswahrscheinlichkeit | Schwere | Gegenmaßnahme |
|---|---|---|---|
| Nutzung der Zeiten zur verdeckten Leistungs-/Verhaltenskontrolle | Mittel | Mittel | Keine Auswertungsfunktionen über Soll/Ist hinaus, Rollenbeschränkung, BetrVG-Hinweis |
| Unberechtigte nachträgliche Änderung von Zeiten | Niedrig | Mittel | Nur mit Schreibrecht, Pflicht-Grund, Audit-Log mit Vorher/Nachher, Kennzeichnung „korrigiert/nachgetragen“ für den Mitarbeiter sichtbar |
| Zu lange Aufbewahrung | Niedrig | Niedrig | Automatische Löschung nach Fristablauf |

**Einschätzung:** Mit diesen Maßnahmen derzeit kein hohes Restrisiko; eine förmliche DSFA ist für die Zeiterfassung allein nicht zwingend, die Bewertung sollte aber zusammen mit der Gesamt-DSFA (siehe oben) bei Wachstum wiederholt werden.

## 6. Offene Punkte

- Zeiterfassung (Abschnitt 5a) gemeinsam mit der Datenschutzerklärung (Ziffer 5/13) anwaltlich prüfen lassen.
- Bei signifikantem Wachstum: externe Beratung für eine förmliche DSFA nach dem Kurzgutachten-Format der Aufsichtsbehörden einholen.
