/**
 * Reine ArbZG-Prüflogik (Ruhezeit §5, Höchstarbeitszeit §3), bewusst ohne
 * DB-/Auth-Abhängigkeiten — analog zu lib/shift-break-rule.ts. Nur für
 * serverseitige Validierung bei Schicht-Anlage/-Änderung gedacht
 * (lib/shift-service.ts); anders als die Pausenregel bislang ohne
 * Live-Vorschau im Formular.
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
