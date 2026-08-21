# Farben & Design-Regeln im Dashboard

Vollständige Bestandsaufnahme aller Farben, die im Dashboard-Bereich (`app/(dashboard)/**` und die dort verwendeten `components/*`) zum Einsatz kommen, sowie verbindliche Design-Regeln für neue Features. Stand: 2026-08-13.

**Zweck von Teil 2 (Design-Regeln):** Dieses Dokument dient als Vorgabe für eine KI (oder Entwickler:in), die ein weiteres Feature/Design im Dashboard baut. Ziel: visuelle Einheitlichkeit mit dem Bestand – keine neuen Muster erfinden, sondern die hier dokumentierten wiederverwenden.

Es gibt keine `tailwind.config.js/ts` – dieses Projekt nutzt Tailwind v4, alle Design-Tokens sind über `@theme` in `app/globals.css` definiert. Es ist keine Chart-Bibliothek installiert; alle "Diagramme" (z. B. Schicht-Auslastungsbalken) sind einfache `<div>`-Balken, die mit den unten gelisteten Farben eingefärbt werden.

---

## 1. Kern-Farbpaletten (Design-Tokens aus `app/globals.css:9-32`)

| Token | Wert | Bedeutung |
|---|---|---|
| `ink` | `#0E0E0E` | Primärtext / primäre schwarze Marken-/Aktionsfarbe (Buttons, Überschriften, aktive Zustände) |
| `ink-hover` | `#262624` | Hover-Zustand von `ink` |
| `muted` | `#9A9A96` | Sekundärer/gedämpfter Text |
| `muted-2` | `#6E6E6B` | Tertiärer Text, etwas dunkler als `muted` |
| `border` | `#ECEBE7` | Standard-Rahmen für Karten/Tabellen |
| `border-light` | `#E4E3DF` | Hellere innere Rahmen (Listenzeilen, Inputs) |
| `border-soft` | `#F2F1ED` | Sanfte neutrale Füllung (Pills, Icon-Chips, Tabellen-Zebrastreifen) |
| `bg` | `#FAFAF8` | Seiten-/Bereichshintergrund (Off-White) |
| `success` | `#357A52` | Positiv / aktiv / genehmigt (Grün) |
| `danger` | `#B4332A` | Fehler / destruktiv / Konflikt / überfällig (Rot) |
| `warning` | `#E07B00` | Warnung / ausstehend / Aufmerksamkeit nötig (Amber) |
| `background` / `foreground` / `brand` (`:root`) | `#FAFAF8` / `#0E0E0E` / `#0D0D0D` | Seitenhintergrund, Basistextfarbe, Marken-Schwarz |

Diese Tokens werden im Dashboard ausschließlich als Tailwind-Utility-Klassen verwendet (`bg-success`, `text-danger` etc.), nicht als rohe `var(--...)`-Referenzen im Komponentencode.

Am häufigsten verwendete neutrale Tokens: `text-ink` (257×), `text-muted` (360×), `bg-white` (226×), `border-border` (200×), `bg-bg` (133×), `text-muted-2` (115×), `border-border-soft` (89×), `border-muted` (54×), `bg-border-soft` (41×), `bg-ink` (36×), `border-ink` (35×), `border-border-light` (35×).

---

## 2. Semantische Statusfarben (Badges & Indikatoren)

### 🟢 Success – Grün `#357A52`
"aktiv / genehmigt / gesund / positiv"

- Startseite: Schicht-Auslastungsbalken ohne Konflikte, Teamstatus "Im Dienst" (`app/(dashboard)/u/[tenant]/page.tsx`)
- Standort-Status "Aktiv" (`standorte/page.tsx`, `standorte/[locationId]/page.tsx`)
- Team-Mitglied "Im Dienst" (`teams/[teamId]/page.tsx`)
- Urlaub genehmigen-Button (`urlaub/page.tsx`)
- Erinnerung "erledigt" (`erinnerungen/page.tsx`)
- Krankmeldung "Genesen" (`krankheit/page.tsx`)
- Mitarbeiter: aktiver Vertrag, Timeline-Punkt, Einladung versendet (`employees/[employeeId]/page.tsx`)
- Rollen-Berechtigungsstufe "Schreiben" (`rollen/[roleId]/page.tsx`)
- "Gespeichert"-Banner (`konto/page.tsx`)
- Erfolgs-Toast (`components/Toasts.tsx`)
- Default-Status in Tabellen (`components/DataTable.tsx`)

### 🔴 Danger – Rot `#B4332A`
"Fehler / destruktiv / Konflikt / überfällig"

- Schichtkonflikt-Kachel, "Abwesend"-Kachel, Krankheitszähler (Startseite)
- "Ablehnen"-Button bei Urlaub
- "Abgelaufen"-Badge bei Erinnerungen, Priorität "Dringend"
- Notfallkontakte-Karte bei Mitarbeitern
- Rolle löschen, Berechtigungsstufe "Admin" (eine der beiden Varianten, siehe Abschnitt 4)
- Alle destruktiven Bestätigungs-Buttons (`ConfirmSubmitButton.tsx`) – Löschen von Mitarbeitern, Teams, Standorten, Dateien
- Schichtkonflikt-Anzeige in der Schichtplanung (`ShiftPlanningClient.tsx`, `LocationShiftPlanner.tsx`)
- Fehler-Toast, generische Formularfehler (`FormFeedback.tsx`)
- 2FA deaktivieren/Fehler (`TwoFactorSettingsCard.tsx`)

### 🟠 Warning – Amber `#E07B00`
"ausstehend / Aufmerksamkeit nötig / Vorsicht"

- "Urlaubsanträge prüfen"-Kachel (Startseite)
- Ausstehende Urlaubsanträge (Zähler-Ton)
- "Vertragsdetails fehlen"-Banner bei Mitarbeitern
- Neue Wunschfrei-Anfrage (Punkt-Indikator in der Schichtplanung)
- Abrechnung: "keine Zahlungsmethode hinterlegt" / "kein aktives Abo" (`Navigation.tsx`)
- Ungelesene Benachrichtigung (Sidebar-Badge)
- Warnungs-Toast
- Heute-Hervorhebung im Datepicker

---

## 3. Feste Hex-Farben (nicht als Token definiert)

| Hex | Verwendung |
|---|---|
| `#2A6FDB` (Blau) | Berechtigungsstufe "Lesen", Info-Toast, ein Tenant-Switcher-Akzent, eine Standort-Farboption, Standard-Tenant-Markenfarbe |
| `#7A4E00` | Textfarbe auf hellem Amber-Hintergrund (Warnbanner) |
| `#1F5D2C` | Textfarbe auf hellem Grün-Hintergrund ("Abo gesund") |
| `#5C6B7A` (Schiefergrau) | Neutrale Badges (Vertragsart, generische Tags) |
| `#7A3C9C` (Violett) | Team-Akzentfarbe "Empfang" |
| `#1D8A65` (Grün) | Team-Akzentfarbe "Logistik" |
| `#2A5BC9` (Blau) | Team-Akzentfarbe "Service" |
| `#C9622A` (Orange) | Team-/Standort-Akzentfarbe "Verkauf" (Standardfarbe) |
| `#B9B9B4` (Grau) | Neutrale Avatar-Füllung, Standort-Status "Inaktiv" |
| `#2B6845` (Dunkelgrün) | Hover-Zustand des Urlaub-Genehmigen-Buttons |
| `#FFF7EA` (Creme) | Hintergrund des "Vertragsdetails fehlen"-Banners |
| `#5E5E5B` | Gedämpfte Beschriftung im dunklen Sidebar-Panel |
| `#B0B0AB` | Sehr gedämpfter Sekundärtext (IP-Adresse im Audit-Log, Tagesnummer in Schichtplanung, Footer) |
| `#7E7E7B` | Sidebar-Nutzerrolle, Beschreibungstext in Einstellungen |
| `#F6F4EF` | Hintergrund der Karte für ungelesene Benachrichtigungen |
| `#0D0D0D` | Sidebar-/Dunkelpanel-Hintergrund |
| `#C0BFBA` / `#C0BEB7` | Label "Offen" (unbesetzte Schicht), deaktivierte/Fremdmonat-Tage im Kalender |
| `#DEDAD4` | Gestrichelter Rahmen des "Schicht hinzufügen"-Platzhalters |
| `#D7D4CE` | Deaktivierter Kalendertag-Text |
| `#EFEFEA` | Hintergrund der Dokumentvorschau |
| `#D8D5CE` | Rahmen der "Ungespeicherte Änderungen"-Leiste |
| `#8B6ED4` (Violett) | 3. Tenant-Switcher-Akzentfarbe, Standort-Farbe "Violett" |
| `#168A8A` (Türkis) | Standort-/Team-Farbe "Türkis" |
| `#B7791F` (Gold) | Team-Farbe "Gold" |
| `#4A5568` (Schiefer) | Team-Farbe "Schiefer" |
| `#C23B7A` (Pink) | Team-Farbe "Pink" |
| `#6B8E23` (Limette) | Team-Farbe "Limette" |

Alle `rgba(0,0,0, x)`-Werte im Code sind reine Schatten/Elevation-Effekte (Kartenschatten, Modal-Hintergründe) – keine Marken- oder Statusfarben. Es werden keine Farbverläufe (`from-`/`via-`/`to-`) verwendet.

---

## 4. Auswählbare Farbpaletten (Standorte & Teams)

**Standort-Farbpalette** (`lib/org-options.ts`, 8 Farben) – wählbar beim Anlegen/Bearbeiten eines Standorts, wird als farbiger Rand-Akzent auf Schichtkarten dargestellt:
Schwarz (`ink`), Blau (`#2A6FDB`), Grün (`success`), Violett (`#8B6ED4`), Orange (`#C9622A`), Rot (`danger`), Türkis (`#168A8A`), Schiefer (`#5C6B7A`)

**Team-Farbpalette** (`lib/org-options.ts`, 10 Farben) – wählbar beim Anlegen/Bearbeiten eines Teams, wird als Akzentbalken auf Team-Karten und als Avatar-Hintergrund dargestellt:
Orange `#C9622A` (Standard), Blau `#2A5BC9`, Grün `#1D8A65`, Violett `#7A3C9C`, Rot `#B4332A`, Türkis `#168A8A`, Gold `#B7791F`, Schiefer `#4A5568`, Pink `#C23B7A`, Limette `#6B8E23`

⚠️ **Inkonsistenz gefunden:** Die Berechtigungsstufe "Admin" wird an zwei Stellen unterschiedlich eingefärbt – in `rollen/[roleId]/page.tsx` als Schwarz (`ink`), in `CreateRoleButton.tsx` als Rot (`danger`).

---

## 5. Schnellübersicht: Farbe → Bedeutung

| Farbe | Wert | Bedeutung |
|---|---|---|
| Schwarz (ink) | `#0E0E0E` | Primäre Marken-/Aktionsfarbe, Primärtext |
| Grün (success) | `#357A52` | Aktiv, genehmigt, gesund, "Schreiben"-Recht |
| Rot (danger) | `#B4332A` | Fehler, destruktiv, Konflikt, überfällig |
| Amber (warning) | `#E07B00` | Ausstehend, fehlende Daten, ungelesen |
| Blau (Akzent) | `#2A6FDB` | Info, "Lesen"-Recht, ein Standort-/Team-Akzent |
| Schiefergrau | `#5C6B7A` | Neutrale Badges |
| Gedämpftes Grau | `#9A9A96` / `#6E6E6B` | Sekundär-/Tertiärtext |
| Off-White | `#FAFAF8` | Seitenhintergrund |
| Rahmenfarben | `#ECEBE7` / `#E4E3DF` / `#F2F1ED` | Karten-/Tabellenrahmen, sanfte Füllungen |
| Sidebar dunkel | `#0D0D0D` Hintergrund / `#EDEDEA` Text | Sidebar-/Dunkelpanel |
| Team-/Standort-Akzente | 8–10 feste Hex-Werte | Frei wählbare Identitätsfarben für Standorte und Teams |

---
---

# Teil 2 — Design-Regeln für neue Dashboard-Features

Diese Regeln sind aus dem tatsächlichen, wiederholten Code-Bestand abgeleitet (nicht erraten). Es gibt **keine `tailwind.config.js/ts`** – alle Tokens sind Tailwind-v4-`@theme`-Definitionen und benannte `@utility`-Klassen in `app/globals.css`. **Neue Features sollen diese Utilities verwenden, keine neuen Ad-hoc-Werte erfinden.**

## Checkliste (zuerst prüfen, bevor neuer Code geschrieben wird)

1. Gibt es für dieses UI-Element schon eine Utility-Klasse in `app/globals.css` (`card`, `metric-card`, `btn`, `input`, `field`, `label`, `pill`, `divider`, …)? → verwenden statt neu bauen.
2. Neue Schriftgröße/Farbe nötig? → erst in der Skala/Palette unten nachsehen, ob ein passender Wert existiert.
3. Neue Karte/Panel? → Formel `rounded-card border border-border bg-white` (+ optional Schatten) verwenden, siehe §5.
4. Neuer Button? → `btn` + `btn-primary`/`btn-secondary`/`btn-sm` kombinieren, nie eigene Button-Klasse bauen.
5. Status/Ton (Erfolg/Fehler/Warnung/Info)? → die 10%/25%/100%-Formel aus §8 verwenden, keine neuen Ton-Farben erfinden.

---

## 1. Typografie

**Drei Schriftrollen, strikt getrennt:**

| Schrift | CSS-Var | Verwendung |
|---|---|---|
| `font-display` (Space Grotesk) | `--font-space-grotesk` | Seitentitel, Kartenüberschriften, Drawer-/Popup-Titel, große Kennzahlen |
| `font-sans` (Inter, Standard – keine Klasse nötig) | `--font-inter` | Fließtext, Beschreibungen, Formularwerte |
| `font-mono` (JetBrains Mono) | `--font-jetbrains-mono` | Großgeschriebene Eyebrows/Labels/Metadaten/Zeitstempel/Tabellenköpfe |

**Regel:** Großgeschriebene Mini-Labels (Formular-Labels, Tabellenköpfe, Eyebrows) sind **immer** `font-mono` + `uppercase` + positives Tracking. Überschriften und Kennzahlen sind **immer** `font-display` + negatives Tracking. Alles andere ist `font-sans` ohne Sonderklasse.

**Schriftgrößen** – es werden **keine** Standard-Tailwind-Größen (`text-sm`, `text-lg` etc.) verwendet, sondern feste Pixelwerte:

| Größe | Kontext |
|---|---|
| `text-[9px]`–`text-[10.5px]` | Mono-Eyebrows, Metadaten, Zeitstempel, Tabellenkopf |
| `text-[11px]`–`text-[12.5px]` | Sekundärtext, Bildunterschriften, Tabellen-Subzeilen |
| `text-[13px]`–`text-[14px]` | Standard-Fließtext, Input-Text, Listenkarten-Titel |
| `text-[15px]`–`text-[16px]` | Kleine Abschnittsüberschriften |
| `text-[18px]`–`text-[24px]` | Karten-/Drawer-Überschriften |
| `text-[42px]` bzw. `clamp(30px,3.6vw,44px)` | Kennzahlen (Metric-Werte), Seitentitel |

**Schriftgewicht:** `font-semibold` für fast alle Überschriften, Kartentitel, Kennzahlen, aktive Nav-Zustände; `font-medium` für sekundäre Betonung; `font-bold`/`font-black` nur für Logo und Avatar-Initialen.

**Tracking:** große Display-Schrift zieht sich zusammen (`tracking-[-1.2px]` bis `-0.2px`), Mono-/Uppercase-Labels weiten sich (`tracking-[0.06em]` bis `0.2em`). Nie umgekehrt.

**Zeilenhöhe:** `leading-none` bei Kennzahlen, `leading-tight`/`leading-[1.02]` bei Überschriften, `leading-[1.5]`–`leading-[1.55]` bei Fließtext-Absätzen.

⚠️ **Bekannte Abweichung, nicht als Vorbild nehmen:** `app/not-found.tsx` und `app/(dashboard)/u/[tenant]/error.tsx` nutzen Standard-Tailwind-Klassen statt dieser Konvention.

---

## 2. Abstände & Layout

- **Seiten-Container:** `mx-auto w-full max-w-[1200px] px-[clamp(24px,4vw,60px)] pt-16 pb-16 md:pt-10` (Utility `container`, `globals.css:636-638`) — jede neue Dashboard-Seite bekommt max. 1200px Breite und dieses Padding, keine eigene Breite definieren.
- **Seiten-Header:** `mb-[30px]` unter dem Header-Block, `mb-3` zwischen Eyebrow und Titel, `gap-2.5` zwischen Aktions-Buttons im Header.
- **Karten-Innenabstand:** `p-8` für generische Content-Karten (`card`-Utility), `px-[22px] pt-6 pb-5` für Metric-Cards, `p-4`/`p-5` bzw. `px-6 py-[22px]` für Dashboard-Abschnittskarten, `p-6` für Drawer/Popup-Inhalte, `p-3`/`p-2.5` für kleine Info-Boxen innerhalb einer Karte.
- **Abstände zwischen Elementen (gap):** `gap-2`–`gap-2.5` für Button-Gruppen/Footer-Aktionen, `gap-3`/`gap-3.5` für Formular-Grids und Tabellenspalten, `gap-4`/`gap-5` zwischen gestapelten Karten/Abschnitten.
- **Standard-Grids:**
  - Kennzahlen-Reihe: `grid gap-4 md:grid-cols-2 xl:grid-cols-4`
  - Zweispaltiger Seitenkörper: `grid gap-5 xl:grid-cols-[1.35fr_0.95fr]`
  - Formularfelder: `grid gap-3 sm:grid-cols-2` — **das** Standardmuster für responsive Formulare (einspaltig mobil, zweispaltig ab `sm:`). Immer dieses Muster verwenden, kein eigenes bauen.
- **Trennlinie:** Utility `divider` = `my-6 h-px w-full bg-border`.

---

## 3. Rundungen (Radius-Skala)

Definierte Tokens: `--radius-card: 16px`, `--radius-btn: 10px`, `--radius-chip: 6px`. Progressive Skala, von klein nach groß:

| Radius | Klasse | Verwendung |
|---|---|---|
| 6px | `rounded-chip` | kleine Pills/Chips |
| 7–9px | `rounded-[7px]`/`rounded-[9px]` etc. | Tabellen-Badges, quadratische Icon-Buttons (Schließen-Button etc.) |
| 10px | `rounded-btn` | alle Buttons |
| 12px | `rounded-xl` | verschachtelte Sub-Karten, Listenzeilen, Info-Boxen innerhalb einer Karte |
| 16px | `rounded-card` | Haupt-Container: Karten, Tabellen, Drawer, Popups |
| voll | `rounded-full` | Avatare, Status-Punkte, Toggle-Chips |

**Regel:** nie einen Radius außerhalb dieser Skala erfinden. Äußere Karte = `rounded-card`; Element *innerhalb* der Karte = eine Stufe kleiner (`rounded-xl` oder `rounded-[9px]`).

---

## 4. Schatten (Elevation)

Keine Standard-Tailwind-Schatten (`shadow-md` etc.) — nur abgestimmte `shadow-[...]`-Werte, die mit der Elevation skalieren:

| Elevation | Schatten | Verwendung |
|---|---|---|
| Flach, statisch auf der Seite | `shadow-[0_4px_24px_rgba(0,0,0,0.05)]` bzw. `shadow-[0_10px_30px_rgba(0,0,0,0.04)]` | Generische Karten, Dashboard-Abschnittskarten |
| Schwebend, mittel | `shadow-[0_12px_34px_rgba(0,0,0,0.10)]` bis `shadow-[0_14px_40px_rgba(0,0,0,0.14)]` | Dropdowns, Popover, Toasts, Datepicker |
| Schwebend, groß (zentrierte Modals) | `shadow-[0_24px_80px_rgba(0,0,0,0.22)]` | Popups/Dialoge (`UniversalPopup`) |
| Gerichtet (seitliche Drawer) | `shadow-[-20px_0_70px_rgba(0,0,0,0.18)]` | Rechts einschiebende Drawer |
| Maximal | `shadow-[0_24px_90px_rgba(0,0,0,0.24)]` | Persistente Floating-Leiste (Floating Edit Bar) |

**Regel:** Elemente, die *flach auf der Seite liegen* (Karten, Tabellen), bekommen kleine, weiche Schatten oder gar keinen. Elemente, die *über der Seite schweben* (Drawer, Popup, Dropdown, Toast), bekommen große, weiche Schatten. Schatten und Rahmen werden nicht gemischt, um dieselbe Kante doppelt zu betonen — schwebende Elemente nutzen primär Schatten, flach liegende primär `border`.

---

## 5. Rahmen & Karten-Formel

- Standardbreite ist **1px** (`border`), Farbe je nach Kontext `border-border` (#ECEBE7, Standard), `border-border-light` (#E4E3DF, Inputs/Sekundärcontainer), `border-border-soft` (#F2F1ED, Trennlinien/Tabellenzeilen).
- **1.5px** (`border-[1.5px] border-ink`) ist reserviert für „aktuell ausgewählt/aktiv" (z. B. aktive Listenzeile) — keine weiteren Breiten einführen.

**Karten-Grundformel** (für jede neue Karte verwenden):
```
rounded-card border border-border bg-white [optional: p-* + shadow-[...]]
```
Zwei-Stufen-Hierarchie: äußere Karte = `rounded-card` + Schatten; verschachtelte Sub-Karte/Info-Box darin = `rounded-xl border border-border(-light) bg-bg` (oder `bg-white`), **ohne** Schatten.

---

## 6. Buttons

Basis-Utility `btn` (immer als Grundlage nehmen, nie neu bauen):
```
inline-flex items-center justify-center gap-2 rounded-btn px-[18px] py-[10px] text-[14px] font-semibold transition-all duration-150 active:scale-[0.98]
```

| Variante | Klassen | Verwendung |
|---|---|---|
| Primär | `btn btn-primary` = `bg-ink text-white hover:bg-ink-hover` | Haupt-CTA (eine pro Kontext) |
| Sekundär | `btn btn-secondary` = `border border-border bg-border-soft text-ink hover:bg-border` | Standard-Zweitaktion, "Abbrechen" |
| Klein | `btn btn-sm` | kompaktere Aktionen in Drawern/Tabellenzeilen |
| Destruktiv | `btn btn-secondary border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5` | Löschen/Ablehnen — **keine eigene `btn-danger`-Klasse existiert**, immer exakt diese Komposition verwenden |
| Icon-Button (kompakt) | `flex size-8 items-center justify-center rounded-[8px] border border-border bg-white text-muted hover:border-muted hover:text-ink` | Tabellen-/Header-Aktionen (Schließen, Bearbeiten-Icon) |

**Regeln:**
- Icon steht immer **vor** dem Label (`<Save size={15} /> Speichern`), nie danach — Ausnahme: Chevrons/Expand-Pfeile dürfen folgen.
- Deaktiviert: natives `disabled` + `disabled:opacity-*`/`disabled:cursor-not-allowed`.
- Ladezustand: Icon wird durch `<Loader2 className="animate-spin" />` ersetzt, Label wechselt zu einer "-ing"-Form ("Wird gespeichert…"). Das ist das **einzige** Lade-Muster im Projekt — keine Skeletons für Buttons erfinden.

---

## 7. Formulare

Utility-Trio `field` + `label` + `input`, immer zusammen verwendet:
```
field  = flex flex-col gap-1.5
label  = font-mono text-[9px] uppercase tracking-[0.06em] text-muted
input  = w-full rounded-btn border border-border-light bg-bg px-[13px] py-[11px] text-[13.5px] text-ink outline-none placeholder:text-muted
```
- **Fokus:** Rahmenfarbe wechselt zu `border-ink` (`focus:border-ink`) — **kein** Ring/Glow bei normalen Inputs. Ausnahme: Checkboxen nutzen `ring-2 ring-ink/20`.
- **Hintergrund:** Standard `bg-bg`; liegt der Input in einem bereits `bg-bg`-getönten Container, auf `input bg-white` wechseln, damit er sich abhebt.
- **Fehlertext pro Feld:** `<p className="mt-1 text-[12px] text-danger">`.
- **Formular-weiter Fehler-Banner:** `rounded-[10px] border border-danger/20 bg-danger/5 px-3 py-2 text-[12.5px] text-danger` (folgt derselben Ton-Formel wie §8).
- Varianten: `input-mono` (für IDs/Slugs/Telefonnummern), `input-with-icon-left/right` (Suche, Passwort).

---

## 8. Status-/Ton-Formel (Badges, Banner, Alerts)

**Die wichtigste, durchgängigste Regel im ganzen Projekt.** Jeder Status-/Ton-Hinweis (Erfolg, Warnung, Fehler, Info) folgt exakt dieser Formel:

```
Hintergrund:  bg-{ton}/10
Rahmen:       border-{ton}/20  bis  border-{ton}/30
Text:         text-{ton}  (volle Deckkraft)
```

wobei `{ton}` = `success` | `warning` | `danger` | `#2A6FDB` (Info, kein eigenes Token).

**Neue Statusfarben/-töne nicht erfinden** — jeder neue Zustand muss sich in success/warning/danger/info (blau) einordnen lassen.

Weitere Badge-Muster:
- Neutrales Inline-Badge: `rounded-[7px] border border-border-light px-[9px] py-[3px] text-[11.5px] text-[#5C6B7A]`
- Punkt+Label-Status (statt gefüllter Pille): `size-2 rounded-full` farbiger Punkt + `text-[12.5px]`
- Toggle-Chip: inaktiv `border-border bg-white text-muted`, aktiv `border-ink bg-ink text-white`, `rounded-full`, `h-7`

---

## 9. Tabellen

Neue Datenlisten folgen dem `DataTable`-Muster, nicht `<table>`:
- Äußerer Container: `overflow-hidden rounded-card border border-border bg-white` (kein Schatten).
- CSS Grid statt HTML-Table; Spaltenbreiten über `gridTemplateColumns`.
- Kopfzeile: `border-b border-border px-6 py-4 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted`.
- Datenzeile: `border-t border-border-soft px-6 py-[13px] hover:bg-bg` — **keine Zebra-Streifen**, Trennung nur über 1px-Border, Hover nur dezente Tönung.
- Leerzustand: zentrierter Text, `py-10 text-center text-[13px] text-muted`, Standardtext „Keine Einträge gefunden."
- **Mobil (< `md:`):** Grid-Tabelle wird durch gestapelte Karten ersetzt (erste Spalte = Titel, Rest = Label/Wert-Paare) — kein horizontales Scrollen der Tabelle.

---

## 10. Icons

- **Ausschließlich `lucide-react`** — kein anderes Icon-Set, keine neuen Custom-SVGs außer für das Logo.
- **Größen:** 13–15px für Inline-/Button-/Tabellen-Icons (Standard), 16–18px für Panel-/Abschnitts-Icons, 24–32px nur für Empty-State-/Hero-Icons.
- **Farbe:** `text-muted` als Neutral-/Sekundärzustand, `text-ink` wenn aktiv/betont, sonst die semantische Ton-Farbe (`text-success`/`text-danger`/`text-warning`).
- Icon steht vor dem Label (siehe §6).

---

## 11. Modals & Drawer

Zwei getrennte Systeme — vor dem Bauen entscheiden, welches passt:

**A. Rechter Slide-in-Drawer** — für Detail-/Bearbeitungsansicht zu einem konkreten Datensatz:
- Backdrop: `fixed inset-0 z-[1000] flex justify-end bg-black/35 backdrop-blur-[4px]`
- Panel: `h-full w-full max-w-[560px] border-l border-border bg-white p-6 shadow-[-20px_0_70px_rgba(0,0,0,0.18)]` (Breite je nach Inhalt 460–620px)
- Header: Eyebrow + `font-display text-[24px] font-semibold` Titel links, `size-8 rounded-[9px] border` Schließen-Button rechts
- Footer: rechtsbündige Aktionen, abgetrennt durch `border-t border-border-soft pt-4`

**B. Zentriertes Popup** — für eigenständige Aktionen/Formulare ohne Bezug zu einem Datensatz in einer Liste:
- Backdrop: `fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 backdrop-blur-[6px]` (stärker als Drawer-Backdrop)
- Panel: `max-w-[520px] rounded-card border border-border bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)]`
- Gleicher Schließen-Button wie Drawer (`size-8 rounded-[9px] border`, oben rechts)

Beide schließen per Klick auf den Backdrop (nicht auf das Panel selbst) und über den expliziten X-Button.

---

## 12. Empty States & Loading

- **Empty State (innerhalb Karte):** `rounded-[10px] border border-border-light bg-bg px-3 py-2.5 text-[12.5px] text-muted`
- **Empty State (Upload/Suche, gestrichelt):** `rounded-xl border border-dashed border-border bg-bg px-4 py-8 text-center`
- **Ganzseitiger Empty State (z. B. kein Zugriff):** zentriert, `max-w-md rounded-card border border-border bg-white px-6 py-14 text-center`
- **Loading:** Es gibt bewusst **keine Skeleton-Loader** und keine `loading.tsx`-Routen. Ladezustände werden ausschließlich über Button-Spinner (`Loader2` + `animate-spin`) und Text-Wechsel dargestellt (siehe §6). Neue Features sollen dieses Muster übernehmen, keine Skeletons einführen.

---

## 13. Responsive Breakpoints

- **`sm:`** = Formular-Grid-Umbruch. Standardmuster: `grid gap-3 sm:grid-cols-2` (mobil einspaltig, ab `sm:` zweispaltig).
- **`md:`** = Sidebar-/Tabellen-Umbruch. Unterhalb `md:` ist die Sidebar ein Off-Canvas-Drawer (von links einschiebend) und Tabellen werden zu gestapelten Karten; ab `md:` feste Sidebar + Grid-Tabelle.
- **`xl:`** = breiteste Dashboard-Layouts (z. B. 4-spaltige Kennzahlenreihe, `[1.35fr_0.95fr]`-Zweispalter) — degradiert auf `md:` zu 2 Spalten bzw. 1 Spalte.
- Seiten-Padding ist fluid via `clamp()`, nicht breakpoint-gestuft.

---

## Bekannte Inkonsistenzen im Bestand (nicht kopieren)

1. `app/not-found.tsx` / `app/(dashboard)/u/[tenant]/error.tsx` folgen nicht der Typografie-Konvention (§1).
2. Die generische `card`-Utility nutzt `rounded-[18px]` statt des `rounded-card`-Tokens (16px) — bei neuen Karten `rounded-card` (16px) verwenden, nicht 18px.
3. Berechtigungsstufe „Admin" wird an zwei Stellen unterschiedlich eingefärbt (Schwarz vs. Rot, siehe Teil 1 §4) — bei neuen Rollen-/Berechtigungs-UIs eine der beiden Varianten bewusst wählen und vereinheitlichen, nicht eine dritte Variante hinzufügen.
