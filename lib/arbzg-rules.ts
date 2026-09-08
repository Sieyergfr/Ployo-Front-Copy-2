/**
 * Reine ArbZG-Prüflogik (Ruhezeit §5, Höchstarbeitszeit §3) sowie
 * Nacht-/Sonntags- und Alters-Hilfsfunktionen für Jugendarbeitsschutz
 * (JArbSchG) und Mutterschutz (MuSchG), bewusst ohne DB-/Auth-Abhängigkeiten
 * — analog zu lib/shift-break-rule.ts. Nur für serverseitige Validierung bei
 * Schicht-Anlage/-Änderung gedacht (lib/shift-service.ts); anders als die
 * Pausenregel bislang ohne Live-Vorschau im Formular.
 *
 * Deckt bewusst nicht das ganze jeweilige Gesetz ab, sondern nur die Regeln,
 * die sich ohne einen Bundesland-Feiertagskalender (den es im Code nicht
 * gibt) und ohne behördliche Ausnahmegenehmigungen prüfen lassen: Nachtzeit
 * und Sonntag, aber keine Feiertage. Gleiche Kategorie Einschränkung wie
 * bei §3/§5 ArbZG oben (Teilausschnitt, kein Vollständigkeitsanspruch).
 */

export type ShiftTimeRange = { date: string; startTime: string; endTime: string };

function toTimestamp(date: string, time: string): number {
  return new Date(`${date}T${time}:00`).getTime();
}

/** Start-/End-Zeitstempel einer Schicht, mit Behandlung von Schichten über Mitternacht (Ende ≤ Start → +1 Tag). */
function shiftInterval(shift: ShiftTimeRange): { start: number; end: number } {
  const start = toTimestamp(shift.date, shift.startTime);
  let end = toTimestamp(shift.date, shift.endTime);

  if (end <= start) {
    end += 24 * 60 * 60 * 1000;
  }

  return { start, end };
}

export type RestPeriodViolation = { neighborDate: string; restHours: number };

/**
 * Prüft die zu planende Schicht (`candidate`) gegen die übrigen Schichten
 * derselben Person (`otherShifts`, sinnvollerweise nur ein paar Tage um das
 * Datum herum) auf eine Ruhezeit-Unterschreitung (§5 ArbZG, gesetzliches
 * Minimum 11h) in beide Richtungen (vorherige wie nächste Schicht).
 * Überlappende Schichten (negativer Abstand) sind kein Ruhezeit-, sondern
 * ein Doppelbuchungs-Fall — den deckt bereits `hasConflict()` ab.
 */
export function findRestPeriodViolation(
  otherShifts: ShiftTimeRange[],
  candidate: ShiftTimeRange,
  minRestHours: number,
): RestPeriodViolation | null {
  const candidateInterval = shiftInterval(candidate);
  const minRestMs = minRestHours * 60 * 60 * 1000;

  for (const other of otherShifts) {
    const otherInterval = shiftInterval(other);
    const gapAfterOther = candidateInterval.start - otherInterval.end;
    const gapBeforeOther = otherInterval.start - candidateInterval.end;

    if (gapAfterOther >= 0 && gapAfterOther < minRestMs) {
      return { neighborDate: other.date, restHours: gapAfterOther / (60 * 60 * 1000) };
    }

    if (gapBeforeOther >= 0 && gapBeforeOther < minRestMs) {
      return { neighborDate: other.date, restHours: gapBeforeOther / (60 * 60 * 1000) };
    }
  }

  return null;
}

export function shiftDurationHours(shift: ShiftTimeRange): number {
  const { start, end } = shiftInterval(shift);
  return (end - start) / (60 * 60 * 1000);
}

/** §3 ArbZG: Höchstarbeitszeit je Schicht (Default 10h, siehe TenantSettings.maxShiftHours). */
export function exceedsMaxShiftHours(shift: ShiftTimeRange, maxShiftHours: number): boolean {
  return shiftDurationHours(shift) > maxShiftHours;
}

/**
 * Zwei Schichten derselben Person überschneiden sich zeitlich (echte
 * Intervallüberlappung über `shiftInterval`, damit auch Nachtschichten über
 * Mitternacht korrekt erkannt werden) — anders als die bestehende
 * `hasConflict()`-Anzeigefunktion in shift-service.ts, die nur exakt
 * gleiche Kalendertage vergleicht und nirgends als Schreibsperre verwendet
 * wird (Audit-Finding M03: Überschneidungen wurden bisher gespeichert).
 */
export function findShiftOverlap(
  otherShifts: ShiftTimeRange[],
  candidate: ShiftTimeRange,
): { neighborDate: string } | null {
  const candidateInterval = shiftInterval(candidate);

  for (const other of otherShifts) {
    const otherInterval = shiftInterval(other);

    if (candidateInterval.start < otherInterval.end && candidateInterval.end > otherInterval.start) {
      return { neighborDate: other.date };
    }
  }

  return null;
}

/** Tatsächliche Arbeitszeit (Anwesenheit minus Pause) in Minuten — Basis für §3/§4 ArbZG statt der reinen Anwesenheitsspanne. */
export function netWorkingMinutes(shift: ShiftTimeRange, breakMinutes: number): number {
  return Math.max(0, shiftDurationHours(shift) * 60 - Math.max(0, breakMinutes));
}

/**
 * Gesetzlich vorgeschriebene Mindestpause (Minuten) nach Anwesenheitsspanne
 * (Start bis Ende, VOR Abzug der Pause selbst — wie schon die bestehende
 * `calculateBreakMinutes` in lib/shift-break-rule.ts, hier nur zweistufig
 * statt eines einzelnen Schwellenwerts). Erwachsene (§4 ArbZG): 30 Min. ab
 * über 6h, 45 Min. ab über 9h. Jugendliche (§11 JArbSchG): eigene,
 * niedrigere Schwellen — 30 Min. ab über 4,5h, 60 Min. ab über 6h.
 */
export function requiredBreakMinutes(grossSpanMinutes: number, isMinor: boolean): number {
  const hours = grossSpanMinutes / 60;

  if (isMinor) {
    if (hours > 6) return 60;
    if (hours > 4.5) return 30;
    return 0;
  }

  if (hours > 9) return 45;
  if (hours > 6) return 30;
  return 0;
}

/** `dateIso` (YYYY-MM-DD) um `days` Tage verschieben, ebenfalls in lokaler Zeit wie `toTimestamp()` oben. */
function addDays(dateIso: string, days: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const shifted = new Date(year, month - 1, day + days);

  return [
    shifted.getFullYear(),
    String(shifted.getMonth() + 1).padStart(2, "0"),
    String(shifted.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * true, wenn die Schicht ganz oder teilweise in das Nachtfenster fällt
 * (Default 20:00-06:00) — z. B. für § 14 JArbSchG (Nachtruhe für
 * Jugendliche) oder § 5 MuSchG (Beschäftigungsverbot 20-6 Uhr). Prüft sowohl
 * das Nachtfenster des Schichttags als auch das des Vortags, damit eine
 * früh beginnende Schicht (z. B. 02:00 Uhr) korrekt erkannt wird — sie liegt
 * im Nachtfenster, das am Vortag um 20:00 Uhr begonnen hat.
 */
export function overlapsNightWindow(
  shift: ShiftTimeRange,
  nightStart = "20:00",
  nightEnd = "06:00",
): boolean {
  const { start, end } = shiftInterval(shift);
  const windows = [addDays(shift.date, -1), shift.date].map((date) =>
    shiftInterval({ date, startTime: nightStart, endTime: nightEnd }),
  );

  return windows.some((window) => start < window.end && end > window.start);
}

/**
 * true, wenn `dateIso` (YYYY-MM-DD) ein Sonntag ist. Prüft bewusst nur das
 * Datumsfeld der Schicht (den Tag, dem sie in der Planung zugeordnet ist),
 * nicht die tatsächliche Uhrzeit — eine Samstagsschicht, die kurz nach
 * Mitternacht endet, zählt hier nicht als Sonntagsarbeit. Feiertage werden
 * bewusst nicht geprüft (siehe Dateikommentar oben).
 */
export function isSunday(dateIso: string): boolean {
  const [year, month, day] = dateIso.split("-").map(Number);

  return new Date(year, month - 1, day).getDay() === 0;
}

/**
 * Alter in vollen Jahren zum Stichtag `onDate` (Default heute), oder `null`
 * bei leerem/nicht auswertbarem `birthDateIso` — Geburtsdatum ist ein
 * optionales Feld in der Personalakte, eine fehlende Angabe soll die
 * Schichtplanung nicht blockieren, nur die altersabhängigen Prüfungen
 * entfallen dann einfach.
 */
export function calculateAge(birthDateIso: string, onDate: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDateIso.trim());

  if (!match) {
    return null;
  }

  const birthYear = Number(match[1]);
  const birthMonth = Number(match[2]);
  const birthDay = Number(match[3]);
  const hasHadBirthdayThisYear =
    onDate.getMonth() + 1 > birthMonth ||
    (onDate.getMonth() + 1 === birthMonth && onDate.getDate() >= birthDay);
  const age = onDate.getFullYear() - birthYear - (hasHadBirthdayThisYear ? 0 : 1);

  return age >= 0 ? age : null;
}
