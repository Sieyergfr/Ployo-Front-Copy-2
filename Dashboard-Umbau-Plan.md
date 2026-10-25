# Dashboard-Umbau – Plan

Stand: 25.10.2026 · Grundlage: Design-Canvas „Ployo Landing Page“ (Board `Dashboard.dc.html`
mit den Bereichen Übersicht, Mein Bereich, Meine Zeiten, Mitarbeiter, Schichtplanung,
Zeiterfassung, Urlaub, Krankheit, Dateien, Standorte, Teams) · abgeglichen mit
`prisma/schema.prisma`, `app/api/**` und der App `ployo-app` (`src/api/endpoints.ts`).

Legende: **UI** = nur Oberfläche, vorhandene Daten/APIs reichen ·
**API** = neuer Lese-/Schreib-Endpunkt, keine DB-Änderung ·
**DB** = additive Migration nötig · **App** = betrifft die Mitarbeiter-App

---

## 0. Was bewusst unangetastet bleibt

Im Design noch nicht ausgearbeitet und deshalb **nicht Teil des Umbaus** – Seite, Komponenten,
APIs und Daten bleiben exakt wie heute:

- **Rollen** (`/u/[tenant]/rollen`, `/rollen/[roleId]`)
- **Reports** (`/u/[tenant]/reports`)
- **Erinnerungen** (`/u/[tenant]/erinnerungen`, `/erinnerungen`)
- **Einstellungen** (Unternehmens-, Abrechnungs-, Sicherheits-Einstellungen – heute als Dialog in
  `components/Navigation.tsx`). Die neue Seitenleiste ruft denselben Dialog unverändert auf; er
  wird dafür nur in eine eigene Datei verschoben, nicht verändert.

Ebenfalls unverändert: `/konto`, `/verarbeitungsverzeichnis`, `/abo-erforderlich`,
`/zwei-faktor-erforderlich`, `/kein-zugriff`, Druckansichten `(print)`, Landing- und Auth-Seiten.

Die neue Seitenleiste verlinkt Rollen, Reports, Erinnerungen und Einstellungen weiterhin auf die
bestehenden Seiten. Diese sehen bis zu ihrem eigenen Redesign also noch „alt“ aus.

---

## 1. Neue Funktionen im Design (gegenüber heute)

### 1.1 Rahmen (alle Seiten)
| Funktion | Heute | Aufwand |
|---|---|---|
| Neue Seitenleiste: einklappbar, Gruppen (Persönlich/Personal/Organisation/Auswertung), Zähler-Badges an Urlaub/Krankheit, Firmenwechsler unten, Mobile-Drawer | andere Optik | UI |
| **Globale Suche (⌘K)** über Mitarbeiter, Standorte, Teams, Dateien | fehlt | API |
| Benachrichtigungs-Panel mit Filter-Tabs, Gruppierung, Genehmigen/Ablehnen direkt im Panel | Feed vorhanden (`/api/me/notifications`), keine Aktionen | UI |

### 1.2 Übersicht
| Funktion | Heute | Aufwand |
|---|---|---|
| „Tageslage live“: im Dienst / in Pause / folgen / krank | Daten vorhanden (Stempelungen, Pausen, Schichten, Krankmeldungen) | API (Lesen) |
| Besetzung im Tagesverlauf (stündlich, Besetzt vs. **Bedarf**, Lücken) | Bedarf gibt es nur als Mindestbesetzung **pro Tag** | API, ggf. DB → *Frage 4* |
| „Vertretung finden“: passende Personen nach Verfügbarkeit, Ruhezeit, Überstunden, Team; per Push anfragen, „wer zuerst zusagt“ | fehlt | DB + API + **App** |
| Handlungsbedarf-Feed mit Filtern (Anträge, Dokumente, Zeiten, Warnungen) | Einzelteile vorhanden | API (Lesen) |
| Abwesenheits-Radar (14 Tage, Engpass-Hinweis je Team) | fehlt (Daten da) | API (Lesen) |
| Krankheitsquote 30 Tage + Verlauf 12 Wochen | fehlt (Daten da) | API (Lesen) |
| Resturlaub-Verfall + „Erinnern“ | Feld `vacationCarryoverRemindedAt` existiert | API |
| Überstunden im Team, Arbeitszeit diese Woche | Soll steckt nur als Text in `weeklyHours` | API (Lesen) |

### 1.3 Mein Bereich / Meine Zeiten
| Funktion | Heute | Aufwand |
|---|---|---|
| Stempeluhr mit Pause, Schicht heute, Restzeit | vorhanden | UI |
| Schnellaktionen, nächste Schichten, meine Anfragen, meine Dokumente, Monatskalender, Kennzahlen (Urlaub übrig, Überstunden, Woche) | Daten vorhanden | UI |
| Meine Zeiten: Wochen-Balken je Tag, Monatsansicht je KW, Pausen-Kennzahl | Daten vorhanden | UI |
| **Korrektur beantragen** (Kommen/Gehen + Grund → Freigabe durch Teamleitung, zurückziehen) | fehlt – heute korrigiert nur die Verwaltung direkt | DB + API + (später **App**) |

### 1.4 Mitarbeiter (Liste, Anlegen, Personalakte)
| Funktion | Heute | Aufwand |
|---|---|---|
| Kennzahlen-Kopf (aktiv, heute im Dienst, Handlungsbedarf, App-Nutzung %, Tarif-Plätze) | teils | API (Lesen) |
| Status-Tabs, Filter Standort/Team/Beschäftigungsart, Sortierung | teils | UI |
| **CSV-Import** | fehlt | API |
| Anlegen in 3 Schritten (Person / Einsatz mit mehreren Teams+Standorten / Zugriff & Vertrag) + „Nächste Schritte“ | vorhanden, andere Aufteilung | UI |
| Personalakte „Übersicht“: Kennzahlen, Arbeitszeit 12 Wochen, Einsatzorte, Schichtarten, Pünktlichkeit, „Braucht Aufmerksamkeit“ | fehlt (Daten da) | API (Lesen) |
| **„Ansicht als“** (Akte so sehen wie Teamleitung) | fehlt | UI (aus Rollenrechten berechnet) |
| Akte-Vollständigkeit + „Fehlt – Ergänzen“ je Feld | fehlt | UI |
| **App-Zugang sperren / entsperren** (mit Grund) | fehlt (heute nur Zugang endgültig löschen) | DB + API, wirkt auf **App** |
| Datenauskunft (DSGVO) | vorhanden (`/api/me/personalakte-export`, Admin-Variante prüfen) | UI |
| Verträge: Befristungs-Warnung | fehlt (Daten da) | UI |
| Verträge: **„Eckdaten werden automatisch erkannt“** (PDF auslesen) | fehlt | groß → *Frage 3* |
| Lohn: Status „gesehen“ je Abrechnung | fehlt | DB (1 Feld), App-Route bleibt gleich |
| **Anfragen mit mehreren Elementen** (Dokument/Angabe, Pflicht/optional, Prüfen → Akzeptieren / Neu anfordern, Erinnern, Zurückziehen, Vorlagen) | heute 1 Anfrage = 1 Antwort | DB + API + **App** → *Frage 5* |
| Verlauf (Audit-Log) mit Filtern und Export | Audit-Log vorhanden | UI + kleiner Export |
| Notfallkontakte inline bearbeiten | vorhanden | UI |

### 1.5 Schichtplanung
| Funktion | Heute | Aufwand |
|---|---|---|
| Wochenauswahl, Status-Chips, Standort-Tabs, Feiertage, Abwesende je Tag | vorhanden/teils | UI |
| **Vorwoche kopieren** | fehlt | API |
| Offene Schichten + Zuweisen mit Kandidaten-Prüfung („Beste Wahl“) | offene Schichten möglich (`employeeId` leer) | API (Lesen) |
| **„In App anbieten“** (offene Schicht an alle Passenden) | fehlt | DB + API + **App** |
| „Zu prüfen“-Panel (Konflikte/Warnungen), „Trotzdem veröffentlichen“ | Regeln vorhanden (`lib/arbzg-rules.ts`) | UI |
| Zurückziehen mit Schalter „Team benachrichtigen“ | Zurückziehen vorhanden, ohne Benachrichtigung | API (optionaler Parameter) |
| Schichtvorlagen mit **Farbe** und Pause, duplizieren | Vorlagen vorhanden (`shiftPresetsJson`), ohne Farbe | UI (Farbe im JSON, keine Migration) |
| Wochenvorlagen: anwenden, umbenennen, mit aktueller Woche überschreiben | anwenden vorhanden | API |
| Einstellungen: Ruhezeit, Max./Tag, **Überstunden-Schwelle**, Feiertage je Standort, **App-Schalter** | Ruhezeit/Max/Bundesland vorhanden | DB (neue Felder) |

### 1.6 Zeiterfassung
| Funktion | Heute | Aufwand |
|---|---|---|
| Kennzahlen (jetzt eingestempelt, erfasst, Saldo Team, zu prüfen) | teils | API (Lesen) |
| Wochenraster je Mitarbeiter mit Ist/Soll/Saldo, Markierungen | teils | UI |
| Tab **„Korrekturen“** (Anträge aus 1.3 genehmigen/ablehnen) | fehlt | kommt mit 1.3 |
| Detail-Seitenleiste: Bearbeiten mit Pflicht-Grund, Nachtragen | vorhanden | UI |

### 1.7 Urlaub
| Funktion | Heute | Aufwand |
|---|---|---|
| Kennzahlen, Monatskalender „Wer ist wann weg?“ mit „gleichzeitig“-Zähler | fehlt (Daten da) | UI |
| Antragsliste mit Filtern/Suche, Bearbeiten/Löschen | vorhanden | UI |
| **Tab „Urlaubskonten“**: Anspruch, Übertrag, Korrektur, Rest, Verfallshinweis, „Hinweisen“ / „Alle hinweisen“ | Felder vorhanden, Oberfläche und Hinweis-Aktion fehlen | API |
| „Direkt genehmigen“ beim Eintragen | vorhanden? (Admin-Route legt an) – prüfen | API (optionales Feld) |

### 1.8 Krankheit
| Funktion | Heute | Aufwand |
|---|---|---|
| Kennzahlen, „Aktuell krank“, Verlauf je Monat, Historie mit Filtern | teils | UI |
| Detail: Bearbeiten, Beenden, Meldeweg, verschlüsselte Notiz, Hinweis auf betroffene Schichten | vorhanden/teils | UI |
| **eAU digital bei der Krankenkasse abrufen** | fehlt | sehr groß (externe, zertifizierte Schnittstelle) → *Frage 3* |

### 1.9 Dateien (zentral, Personalakte, Standort, Team)
| Funktion | Heute | Aufwand |
|---|---|---|
| Suche, Speicherbelegung, Papierkorb-Ansicht, Wiederherstellen | Papierkorb/Wiederherstellen vorhanden | UI |
| **Ordner anheften** | fehlt | DB (1 Feld) |
| **Datei/Ordner umbenennen** | fehlt | API |
| **Datei verschieben** | fehlt | API |
| Ordner-Sichtbarkeit: **nur für Teams/Standorte** (App), **zusätzliche Rollen** | Rollen-Freigabe nur je Datei | DB + API |
| PIN-Schutz, „PIN vergessen?“ | PIN vorhanden | UI |

### 1.10 Standorte / Teams
| Funktion | Heute | Aufwand |
|---|---|---|
| Karten- und Tabellenansicht, Kennzahlen, Suche, Filter | teils | UI |
| Standort: Typ, Status, Farbe, Leitung, Mindestbesetzung, Öffnungszeiten (mehrere Zeitfenster, über Mitternacht), QR-Code, Aktivität, Dateien, Schichten + Wunschfrei | alles vorhanden | UI |
| Standort: eigene **Kontakt-E-Mail** (getrennt von der Leitung) | fehlt | DB (1 Feld) |
| Team: Farbe, Beschreibung, mehrere Standorte, Leitung, Teamrolle, Dateien | vorhanden | UI |

---

## 2. Wie es gebaut wird, ohne die App zu brechen

Grundlage ist die Liste der 51 Server-Routen, die die App nutzt (siehe Chat vom 25.10.).

1. **Vertrag zuerst absichern (Phase 0).** Für jede der 51 App-Routen kommt ein automatischer Test
   dazu, der Statuscodes, Fehlerform (`{ error }` / `{ code, message }`, `"TWO_FACTOR_REQUIRED"`,
   409 „nicht verknüpft“, `Retry-After`) und die Schlüssel der Antwort prüft. Läuft in der
   bestehenden Vitest-Suite und in CI. Ab dann fällt jeder versehentliche Bruch beim Build auf,
   nicht erst in der App.
2. **Nur additiv.** An bestehenden App-Routen werden höchstens neue *optionale* Felder in der Antwort
   ergänzt oder neue *optionale* Parameter akzeptiert, deren Fehlen das alte Verhalten ergibt
   (z. B. `notifyTeam` beim Zurückziehen, `approve` beim Urlaub-Eintragen). Nichts wird umbenannt,
   entfernt oder in der Bedeutung geändert.
3. **Neue Funktionen = neue Routen.** Alles Neue (Suche, Korrekturanträge, Schicht anbieten,
   Ordner-Rechte, CSV-Import, Kennzahlen) bekommt eigene Endpunkte; das Dashboard liest
   wo möglich direkt über Server-Komponenten aus `lib/*`.
4. **Gemeinsame Logik nicht umbauen.** Services in `lib/*`, die auch App-Routen bedienen
   (Schichten, Zeiterfassung, Urlaub, Dateien), bekommen neue Funktionen daneben statt geänderter
   Signaturen. Besonders heikel und deshalb tabu: `publishedShiftsJson`-Schnappschuss,
   Stempel-Sperrlogik, Urlaubsberechnung.
5. **Nebenwirkungen auf die App bewusst behandeln:**
   - *App-Zugang sperren:* gesperrte Konten bekommen 401 (wie abgemeldet). Die alte App kann damit
     umgehen (Login-Bildschirm). Zusätzlich werden ihre Sitzungen beendet.
   - *Neue Benachrichtigungsarten* (z. B. Schichtangebot): Die alte App zeigt unbekannte Typen an,
     macht sie nur nicht antippbar – unkritisch.
   - *Mehrteilige Anfragen:* Die alte App kann nur „Nachricht + eine Datei“ beantworten.
     Lösungsvorschlag in *Frage 5*.
   - *Korrekturanträge / Schicht anbieten:* Erst nutzbar, wenn die App ein Update bekommt; bis
     dahin entstehen sie nur im Dashboard (Mein Bereich/Meine Zeiten im Web). Die alte App merkt davon nichts.
6. **Seitenweise umbauen.** Jede Seite wird einzeln ersetzt; die alte Seite bleibt bis dahin
   unverändert. So kann man nach jeder Seite live gehen oder alles am Ende auf einmal.

---

## 3. Live-Datenbank: Update ohne Datenverlust

Diese Regeln gelten für jede Migration des Umbaus. Sie entsprechen dem Vorgehen, das in
`To-Do.md` für frühere Releases dokumentiert ist:

**Regeln für Migrationen**
- Nur **additiv**: neue Tabellen, neue Spalten mit Default oder `NULL`. Keine Umbenennungen, kein
  `DROP`, keine Typänderungen, kein `NOT NULL` ohne Default. Alte Spalten bleiben stehen, auch wenn
  sie nicht mehr gelesen werden.
- Generiertes SQL wird **von Hand gelesen**, bevor es committet wird. Grund: Prisma hat hier schon
  einmal fehlerhaftes SQL erzeugt (fehlender `USING`-Cast).
- Daten-Backfills laufen nie in der Migration selbst, sondern als eigenes, mehrfach ausführbares
  Skript unter `scripts/` (wie die bestehenden `backfill-*.ts`).
- Auf Live **niemals** `prisma migrate dev`, `prisma db push` oder `prisma migrate reset`,
  nur `prisma migrate deploy`.

**Ablauf beim Einspielen** (auf dem Server, je Release)
1. Backup: `pg_dump … | gzip > /var/backups/ployo/ployo-before-<name>-<zeit>.sql.gz`, danach
   mit `gunzip -t` prüfen und die Größe mit dem letzten Backup vergleichen.
2. Probelauf: Backup in eine **separate** Test-DB einspielen, dort `prisma migrate deploy` und
   die Testsuite (inkl. App-Vertragstests) laufen lassen.
3. `npx prisma migrate status`: Live muss „up to date“ bis zur vorigen Migration sein.
4. `npx prisma migrate deploy` gegen Live, danach `npx prisma generate`.
5. Weil die Migration additiv ist, läuft der **alte Code** weiter. Erst jetzt den neuen Code
   ausrollen: `scripts/deploy.sh` (baut in `.next-releases/`, schaltet atomar um,
   `pm2 reload`). Kein `rm -rf .next`, kein `next dev` auf dem Server.
6. Smoke-Test: Dashboard-Seiten, Login, und die App-Routen (z. B. `/api/me/overview`,
   `/api/me/shifts`, `/api/me/time-tracking`) mit einem Test-Konto.
7. Wenn etwas nicht stimmt: `scripts/rollback.sh` stellt den vorigen Code wieder her. Die neuen
   Spalten/Tabellen dürfen stehen bleiben, sie stören den alten Code nicht. Ein DB-Restore ist nur
   im Notfall nötig, dafür gibt es das Backup aus Schritt 1.

**Geplante Migrationen (alle additiv)**

| # | Phase | Änderung |
|---|---|---|
| M1 | 2 | `TenantFileFolder`: `pinned Boolean @default(false)`, `accessRoleIdsJson Json @default("[]")`, `visibleTeamIdsJson Json @default("[]")`, `visibleLocationIdsJson Json @default("[]")` |
| M2 | 2 | `TenantEmployee`: `appAccessLockedAt DateTime?`, `appAccessLockReason String @default("")` |
| M3 | 2 | `TenantPayrollStatement`: `firstViewedAt DateTime?` |
| M4 | 2 | `TenantSettings`: `overtimeThresholdMinutes Int @default(…)` + Schalter für die Mitarbeiter-App (Namen nach Klärung, Default = heutiges Verhalten) |
| M5 | 2 | `TenantLocation`: `contactEmail String @default("")` |
| M6 | 3 | neue Tabelle `TenantTimeCorrectionRequest` (Mitarbeiter, Eintrag/Datum, Kommen/Gehen neu, Grund, Status, entschieden von/am) |
| M7 | 3 | neue Tabelle `TenantEmployeeInfoRequestItem` (Anfrage, Typ Dokument/Angabe, Name, Pflicht, Status, Antwort, Datei) |
| M8 | 3 | neue Tabelle `TenantShiftOffer` (Schicht, angefragte Personen, Antworten, Status) |

Ich habe aus diesem Container **keinen Zugriff** auf den Server oder die Live-DB. Die Schritte 1–7
führst du aus oder gibst sie frei. Ich liefere je Release ein fertiges Skript mit genau diesen Befehlen.

---

## 4. Reihenfolge

**Phase 0 – Absichern (keine sichtbare Änderung, keine Migration)**
- App-Vertragstests für alle 51 Routen
- Einstellungen-Dialog aus `Navigation.tsx` in eigene Datei verschieben (unverändert)
- Design-Grundlagen: Farben/Typo aus dem Design als Tokens, gemeinsame Bausteine (Karten,
  Kennzahl-Kacheln, Tabs, Seitenleisten-Dialoge, Datumsauswahl, Mehrfachauswahl)

**Phase 1 – Neue Oberfläche auf bestehenden Daten (keine Migration)**
Neue Seitenleiste und Benachrichtigungs-Panel, dann die Seiten in dieser Reihenfolge:
Übersicht (lesende Kennzahlen) → Mein Bereich → Meine Zeiten (ohne Korrekturanträge) →
Mitarbeiter-Liste + Anlegen + Personalakte → Urlaub → Krankheit → Zeiterfassung →
Schichtplanung → Dateien → Standorte → Teams.
Alles, was neue Daten bräuchte, erscheint hier noch nicht oder nur deaktiviert.

**Phase 2 – Kleine Erweiterungen (Migrationen M1–M5)**
Ordner anheften/Rechte, Umbenennen/Verschieben, App-Zugang sperren, Lohn „gesehen“,
Urlaubskonten-Hinweise, Vorwoche kopieren, Wochenvorlagen verwalten, Schichtplan-Einstellungen,
„Team benachrichtigen“, globale Suche, CSV-Import.

**Phase 3 – Neue Abläufe mit App-Bezug (M6–M8, App-Update danach)**
Korrekturanträge, mehrteilige Anfragen, Schicht anbieten / Vertretung per Push.
Web zuerst, abwärtskompatibel; die App-Seite kommt als eigener Schritt in `ployo-app`.

**Zurückgestellt (eigene Entscheidung nötig)**
eAU-Abruf, PDF-Eckdaten-Erkennung, stündlicher Personalbedarf (siehe Fragen).

---

## 5. Entscheidungen (25.10.2026)

1. **Alle Seiten jetzt umbauen**, Design-Änderungen werden später nachgezogen.
2. **Alles sammeln** und auf einmal live schalten (ein gemeinsames Release mit allen Migrationen).
3. **eAU-Abruf und PDF-Eckdaten-Erkennung kommen später** – vorerst nicht gebaut.
4. **Bedarf je Stunde wird abgeleitet** aus Öffnungszeiten × Mindestbesetzung je Standort, kein neues Feld.
5. **Mehrteilige Anfragen – Übergangslösung bis zum App-Update** (siehe Merkposten unten).
6. **Branch:** weiter auf `claude/affectionate-noether-axt94e`.

### ⚠️ Merkposten: Übergangslösung mehrteilige Anfragen zurückbauen

Solange die App noch nicht aktualisiert ist, gilt für Anfragen mit mehreren Elementen:
- `/api/me/overview` und `/api/me/info-requests/[requestId]` liefern sie wie bisher als **eine**
  Anfrage; alle Elemente stehen als Aufzählung im Nachrichtentext.
- Eine Antwort aus der alten App (Nachricht + eine Datei) wird dem **ersten offenen Element**
  zugeordnet; HR prüft im Dashboard und fordert Weiteres an.

**Zurückbauen, sobald die App mehrteilige Anfragen kann:** App-Update ausrollen, Mindestversion
durchsetzen, dann die Text-Aufzählung und die „erstes offenes Element“-Zuordnung entfernen. Im Code
ist die Stelle mit `TODO(app-multi-item-requests)` markiert. Auch in `To-Do.md` vermerkt.

## 6. Ursprünglich offene Fragen

1. **Unfertiges Design:** Soll ich Phase 0 + 1 jetzt für alle Seiten bauen und Änderungen am Design
   später nachziehen, oder nur die Seiten, die du als fertig betrachtest?
2. **Ausrollen:** Seite für Seite live gehen (alte und neue Optik gemischt), oder alles sammeln und
   auf einmal umschalten?
3. **eAU-Abruf und PDF-Erkennung:** Der eAU-Abruf braucht eine zertifizierte Anbindung an die
   Krankenkassen (eigenes Projekt). Die PDF-Erkennung braucht eine Text- oder KI-Auswertung. Vorschlag: beides
   vorerst weglassen. Bei der Krankmeldung bleibt der AU-Status wie heute manuell wählbar.
4. **Bedarf je Stunde** (Besetzungskurve): Aus Öffnungszeiten × Mindestbesetzung pro Tag ableiten
   (kein neues Datenfeld), oder neues Feld „Bedarf je Zeitfenster“ pro Standort?
5. **Mehrteilige Anfragen und alte App:** Vorschlag: Solange die App nicht aktualisiert ist, sieht sie
   eine mehrteilige Anfrage als eine Anfrage mit allen Punkten im Text. Eine Antwort aus der alten App
   (Nachricht + Datei) landet beim ersten offenen Punkt; HR kann sie im Dashboard prüfen und weitere
   anfordern. Einverstanden?
6. **Branch:** Ich arbeite auf `claude/affectionate-noether-axt94e`, wo auch Landing/Auth liegen.
   Soll der Dashboard-Umbau dort weiterlaufen, oder auf einen eigenen Branch?
