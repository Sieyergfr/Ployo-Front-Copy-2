# Prompt für Claude Design — Mitarbeiter Self-Service App

Fertiger, kopierbarer Prompt (unten im Codeblock). Referenziert das bestehende Design-System aus [Farben-Dashboard.md](Farben-Dashboard.md), ist aber selbstständig lesbar — die relevanten Tokens sind direkt eingebettet, damit der Prompt auch ohne dieses Repo funktioniert.

---

```
Du bist ein erfahrener Product- und UI-Designer. Gestalte das High-Fidelity-Design einer mobilen Self-Service-App für Mitarbeiter eines Schichtplanungs-/Workforce-Tools (Ployo). Es existiert bereits ein Web-Dashboard für Admins/Manager mit einem klar definierten Design-System. Die neue App ist KEIN Redesign davon, sondern eine eigenständige, mobile-first Companion-App für Mitarbeiter (nicht Admins) — sie muss aber erkennbar zur selben Marke/Designsprache gehören.

## Design-System (zwingend einhalten, keine neuen Werte erfinden)

**Schriften** (Google Fonts, gleiche Namen verwenden):
- Space Grotesk → Überschriften, Kennzahlen/große Zahlen, Screen-Titel (negatives Letter-Spacing, z. B. -1px bis -1.5px)
- Inter → sämtlicher Fließtext, Standard ohne Sonderklasse
- JetBrains Mono → NUR für großgeschriebene Mini-Labels/Eyebrows/Zeitstempel (uppercase, positives Letter-Spacing, sehr klein: 9-11px)

**Farben:**
- Primär/Text: `#0E0E0E` (fast Schwarz), Hover `#262624`
- Hintergrund: `#FAFAF8` (warmes Off-White), Karten: `#FFFFFF`
- Text sekundär: `#9A9A96`, Text tertiär: `#6E6E6B`
- Rahmen: `#ECEBE7` (Standard), `#E4E3DF` (Inputs), `#F2F1ED` (soft/Trennlinien)
- Erfolg/Grün: `#357A52` — aktiv, genehmigt, im Dienst
- Fehler/Rot: `#B4332A` — Konflikt, abgelehnt, überfällig, destruktiv
- Warnung/Amber: `#E07B00` — ausstehend, Aufmerksamkeit nötig
- Info/Blau: `#2A6FDB` — informativ, neutral hervorgehoben
- WICHTIG — Ton-Formel für jeden Status/Badge/Banner: Hintergrund `{farbe}` bei 10% Deckkraft + Rahmen `{farbe}` bei 20-30% Deckkraft + Text `{farbe}` bei voller Deckkraft. Keine anderen Statusfarben verwenden als success/warning/danger/info.

**Radien (progressive Skala, nichts dazwischen erfinden):**
6px (kleine Chips) → 8-9px (Icon-Buttons) → 10px (Buttons) → 12px (verschachtelte Sub-Karten) → 16px (Haupt-Karten/Sheets/Modals) → voll rund (Avatare, Pills, der zentrale Aktions-Button)

**Schatten:** weich und dezent, keine harten Tailwind-Standardschatten. Flach auf der Seite liegende Elemente (Karten) bekommen kleine, kaum sichtbare Schatten (`0 4px 24px rgba(0,0,0,0.05)`). Schwebende Elemente (Floating Nav Bar, Sheets, Modals, Toasts) bekommen große, weiche Schatten (`0 20-24px 70-90px rgba(0,0,0,0.15-0.22)`).

**Buttons:** Primär = voll gefüllt `#0E0E0E` mit weißem Text, Radius 10px. Sekundär = `#F2F1ED`-Hintergrund mit `#ECEBE7`-Rahmen, Text `#0E0E0E`. Destruktiv = wie Sekundär, aber Rahmen/Text in Rot bei 25% bzw. voller Deckkraft, KEIN volles Rot als Fläche. Icons immer vor dem Label. Aktiv-Zustand: leichtes Scale-down (0.98).

**Icons:** ausschließlich Lucide-Icons (lucide-react), Strichstärke ~2, Größen 14-20px im UI, größer (24-32px) nur bei leeren Zuständen/Illustrationen.

**Kartenformel:** `Radius 16px + 1px Rahmen #ECEBE7 + weißer Hintergrund + optional dezenter Schatten`. Verschachtelte Elemente innerhalb einer Karte eine Stufe kleiner (Radius 12px, flacher Hintergrund `#FAFAF8`, kein eigener Schatten).

## Zielgruppe & Nutzungskontext

Mitarbeiter, nicht Admins. Nutzung überwiegend mobil, oft kurz "zwischendurch" (auf dem Weg zur Arbeit, in der Pause) — Schicht checken, Urlaub beantragen, Datei einsehen. Große Touch-Ziele, wenig Text pro Screen, das Wichtigste (aktuelle/nächste Schicht, offene Anträge) muss ohne Scrollen sichtbar sein.

## Zu gestaltende Screens

1. **Dashboard / Home**
   - Persönliche Begrüßung (Name, Tageszeit)
   - "Aktuelle Schicht"-Karte, prominent, falls gerade im Dienst (Ort, Zeit bis Ende, Team)
   - Kennzahlen-Kacheln: z. B. verbleibende Urlaubstage, geleistete Stunden diese Woche/diesen Monat, offene Anträge
   - Liste "Nächste Schichten" (2-3 kommende Termine, Datum/Uhrzeit/Standort)
   - Kleiner Hinweisbereich für offene Benachrichtigungen/Aufgaben

2. **Schichtplan**
   - Wochen-Switcher oben (Pfeile links/rechts, aktueller Wochenbereich, evtl. horizontal scrollbarer Tages-Streifen Mo–So)
   - Umschalter "Meine Schichten" / "Alle Schichten" (Team-Ansicht) als Segmented Control
   - Tagesweise gruppierte Schichtkarten mit Zeit, Standort, Team, Status-Farbe nach Ton-Formel (bestätigt/offen/Konflikt)
   - Leerer Tag = dezenter Platzhalter ("Kein Dienst")

3. **Meine Personalakte**
   - Liste der für den Mitarbeiter freigegebenen Dateien (Vertrag, Gehaltsabrechnungen, Bescheinigungen, Zertifikate), nach Kategorie gruppiert/filterbar
   - Datei-Zeile mit Typ-Icon, Name, Datum, Dateigröße, Tap öffnet Vorschau/Download
   - Eigener Upload-Bereich für Dokumente, die der Mitarbeiter selbst einreicht (z. B. Krankschreibung, Unterschriebenes)

4. **Profil & Einstellungen**
   - Kopfbereich mit Avatar, Name, Rolle/Team
   - Persönliche Daten (teils editierbar, teils "nur über HR änderbar" gekennzeichnet)
   - Notfallkontakte
   - Benachrichtigungs-Einstellungen (Toggles)
   - Sprache (App ist mehrsprachig)
   - Konto & Sicherheit (Passwort, Zwei-Faktor-Authentifizierung)
   - Abmelden

5. **Benachrichtigungen**
   - Liste, neueste zuerst, ungelesen optisch hervorgehoben (z. B. Punkt-Indikator)
   - Typen mit passendem Icon/Ton: Schichtänderung (info), Urlaub genehmigt (success), Urlaub abgelehnt (danger), Erinnerung (warning), System (neutral)
   - Tippen markiert als gelesen / führt zum jeweiligen Kontext

6. **Quick Actions** (als Bottom Sheet vom zentralen "+"-Button der Floating Bar, nicht als eigener Vollbild-Screen)
   - Auswahl-Grid mit großen Kacheln: Urlaub beantragen, Krankheit melden, Datei hochladen
   - "Urlaub beantragen" im Detail zeigen: Datumsbereich-Auswahl, Grund/Kommentar-Feld, Absenden-Button
   - "Krankheit melden" im Detail zeigen: Datum, optionaler Attest-Upload, Absenden-Button

## Navigation: Floating Bottom Bar

- Schwebt über dem Content, nicht randständig — Abstand zu Bildschirmrand und unterer Kante, freistehend
- Form: stark abgerundet (Pill-artig, Radius nahe voll-rund), weißer/leicht transparenter Hintergrund, großer weicher Schatten (siehe Schatten-Skala oben, "schwebend")
- 4-5 Einträge mit Icon + Kurzlabel: Home, Schichtplan, [zentraler "+"-Button für Quick Actions — optisch abgesetzt, größer, rund, voll gefüllt in `#0E0E0E`, leicht über die Bar-Kante herausragend], Akte, Profil
- Aktiver Tab: Icon/Label in `#0E0E0E`, inaktive Tabs in `#9A9A96`
- Benachrichtigungen erreichbar über Glocken-Icon im Header der Screens (mit rotem Badge-Punkt bei ungelesenen), nicht als eigener Bottom-Bar-Eintrag
- Safe-Area unten berücksichtigen (Home-Indicator bei iPhones)

## Output-Anforderungen

- Mobile-first, Viewport ca. 390×844px (iPhone-Standard)
- High-Fidelity-Mockups als interaktives HTML/CSS für jeden der 6 Bereiche oben (Quick Actions als Sheet-Overlay über dem Home-Screen zeigen)
- Durchgängige, wiederverwendete Komponenten über alle Screens (gleiche Karten-, Button-, Badge-, Listenzeilen-Stile) — keine Screen-spezifischen Sonderstile
- Realistische Beispieldaten (echte Namen, Uhrzeiten, Standorte), kein Lorem Ipsum
- Zeige für mindestens einen Screen auch einen Sekundärzustand (z. B. leerer Schichtplan-Tag, ungelesene Benachrichtigung, Ladezustand eines Buttons per Spinner)
- Nur Light Mode (das bestehende Design-System hat aktuell keinen Dark Mode)
```
