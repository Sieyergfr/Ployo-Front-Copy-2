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

## 6. Offene Punkte

- Bei signifikantem Wachstum: externe Beratung für eine förmliche DSFA nach dem Kurzgutachten-Format der Aufsichtsbehörden einholen.
