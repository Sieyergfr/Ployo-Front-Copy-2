/**
 * Reine Rechenfunktionen für die Report-Analysen (Überstunden,
 * Abwesenheiten, Arbeitszeitgesetz, Personal) — ohne Datenbank, damit sie
 * sich direkt testen lassen. Alle Datumswerte sind ISO-Kalendertage
 * ("YYYY-MM-DD") in der Zeitzone des Betriebs.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtc(iso: string) {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

function fromUtc(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isIsoDay(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function addDaysIso(iso: string, days: number) {
  return fromUtc(toUtc(iso) + days * DAY_MS);
}

export function daysBetweenIso(from: string, to: string) {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Monate addieren; ein Tag, den es im Zielmonat nicht gibt, rutscht auf dessen letzten Tag. */
export function addMonthsIso(iso: string, months: number) {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7)) - 1 + months;
  const day = Number(iso.slice(8, 10));
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return fromUtc(Date.UTC(year, month, Math.min(day, lastDay)));
}

/** Die letzten `count` Monate bis einschließlich des Monats von `today`, älteste zuerst ("YYYY-MM"). */
export function lastMonths(today: string, count: number) {
  return Array.from({ length: count }, (_, index) => addMonthsIso(`${today.slice(0, 7)}-01`, index - count + 1).slice(0, 7));
}

/** Erster und letzter Tag eines Monats; der laufende Monat endet bei `today`. */
export function monthBounds(month: string, today?: string) {
  const from = `${month}-01`;
  const last = addDaysIso(addMonthsIso(from, 1), -1);

  return { from, to: today && today.slice(0, 7) === month && today < last ? today : last };
}

/** 0 = Montag … 6 = Sonntag. */
export function weekdayIndex(iso: string) {
  return (new Date(toUtc(iso)).getUTCDay() + 6) % 7;
}

export function eachDayIso(from: string, to: string) {
  const days: string[] = [];

  for (let day = from; day <= to; day = addDaysIso(day, 1)) days.push(day);

  return days;
}

const WEEKDAY_KEYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

/** Arbeitstage eines Mitarbeiters im Zeitraum (laut `workDaysJson`, ohne Feiertage). */
export function countWorkdays(
  from: string,
  to: string,
  workDays: Set<string>,
  isHoliday: (iso: string) => boolean = () => false,
) {
  if (from > to) return 0;

  return eachDayIso(from, to).filter((day) => workDays.has(WEEKDAY_KEYS[weekdayIndex(day)]) && !isHoliday(day)).length;
}

export type DateSpan = { from: string; to: string };

/** Schnitt zweier Zeiträume oder null. */
export function intersectSpan(a: DateSpan, b: DateSpan): DateSpan | null {
  const from = a.from > b.from ? a.from : b.from;
  const to = a.to < b.to ? a.to : b.to;

  return from <= to ? { from, to } : null;
}

// ---------------------------------------------------------------------------
// Überstunden
// ---------------------------------------------------------------------------

export const OVERTIME_HIGH_MINUTES = 20 * 60;
export const OVERTIME_LOW_MINUTES = -10 * 60;

export type OvertimeAccount = {
  employeeId: string;
  /** Saldo je Monat (Ist − Soll), älteste zuerst. */
  monthly: number[];
  total: number;
  current: number;
};

export function buildOvertimeAccount(employeeId: string, monthly: number[]): OvertimeAccount {
  return {
    employeeId,
    monthly,
    total: monthly.reduce((sum, value) => sum + value, 0),
    current: monthly.at(-1) ?? 0,
  };
}

export function summarizeOvertime(accounts: OvertimeAccount[]) {
  const total = accounts.reduce((sum, account) => sum + account.total, 0);

  return {
    total,
    average: accounts.length ? total / accounts.length : 0,
    high: accounts.filter((account) => account.total > OVERTIME_HIGH_MINUTES).length,
    low: accounts.filter((account) => account.total < OVERTIME_LOW_MINUTES).length,
  };
}

// ---------------------------------------------------------------------------
// Abwesenheiten
// ---------------------------------------------------------------------------

/** Krankenquote in Prozent (eine Nachkommastelle) — Krankheits-Arbeitstage ÷ mögliche Arbeitstage. */
export function sicknessRate(sickWorkdays: number, possibleWorkdays: number) {
  return possibleWorkdays > 0 ? Math.round((sickWorkdays / possibleWorkdays) * 1000) / 10 : 0;
}

/** Wie oft eine Krankmeldung an welchem Wochentag beginnt (Mo … So). */
export function sicknessStartsByWeekday(starts: string[]) {
  const counts = [0, 0, 0, 0, 0, 0, 0];

  for (const start of starts) counts[weekdayIndex(start)] += 1;

  return counts;
}

// ---------------------------------------------------------------------------
// Personal
// ---------------------------------------------------------------------------

export type StaffRecord = {
  id: string;
  /** Eintritt (ISO) — leer, wenn unbekannt. */
  startDate: string;
  /** Austritt bzw. Befristungsende (ISO) — leer, wenn keins. */
  endDate: string;
  /** Ausgeschieden (Status "former"). */
  former: boolean;
  /** Tatsächlicher Austritt, falls bekannt (Offboarding-Datum). */
  exitDate: string;
};

/** Beschäftigt an diesem Tag? Ohne Eintrittsdatum zählt eine aktive Person immer. */
export function employedOn(record: StaffRecord, day: string) {
  if (record.startDate && record.startDate > day) return false;

  const end = record.former ? record.exitDate || record.endDate : "";

  return !end || end >= day;
}

/** Beschäftigte am Monatsende (laufender Monat: heute). */
export function headcountByMonth(records: StaffRecord[], months: string[], today: string) {
  return months.map((month) => {
    const { to } = monthBounds(month, today);

    return { month, count: records.filter((record) => employedOn(record, to)).length };
  });
}

/** Eintritte und Austritte in einem Zeitraum. */
export function staffMovements(records: StaffRecord[], span: DateSpan) {
  const entries = records.filter((record) => record.startDate && record.startDate >= span.from && record.startDate <= span.to);
  const exits = records.filter((record) => {
    const end = record.exitDate || record.endDate;

    return record.former && end && end >= span.from && end <= span.to;
  });

  return { entries, exits };
}

/** Fluktuation in Prozent: Austritte ÷ durchschnittliche Belegschaft. */
export function turnoverRate(exits: number, averageHeadcount: number) {
  return averageHeadcount > 0 ? Math.round((exits / averageHeadcount) * 1000) / 10 : 0;
}

export function tenureYears(startDate: string, today: string) {
  return isIsoDay(startDate) && startDate <= today ? daysBetweenIso(startDate, today) / 365.25 : null;
}

/** "6 Monate" → 6, "3 Mon." → 3, "keine" → null. */
export function parseProbationMonths(text: string) {
  const match = /(\d+)\s*(monat|mon)/i.exec(text);

  return match ? Number(match[1]) : null;
}

export type StaffDeadlineKind = "fixedTermEnd" | "probationEnd" | "anniversary";

export type StaffDeadline = {
  kind: StaffDeadlineKind;
  date: string;
  /** Nur bei Jubiläen. */
  years?: number;
};

export const ANNIVERSARY_YEARS = [5, 10, 15, 20, 25, 30, 35, 40];

/**
 * Anstehende Fristen einer Person bis `horizonDays` voraus: Befristungsende,
 * Ende der Probezeit und runde Betriebszugehörigkeit.
 */
export function upcomingStaffDeadlines(
  input: { startDate: string; fixedTermEnd: string; probation: string },
  today: string,
  horizonDays = 365,
): StaffDeadline[] {
  const horizon = addDaysIso(today, horizonDays);
  const inWindow = (date: string) => date >= today && date <= horizon;
  const deadlines: StaffDeadline[] = [];

  if (isIsoDay(input.fixedTermEnd) && inWindow(input.fixedTermEnd)) {
    deadlines.push({ kind: "fixedTermEnd", date: input.fixedTermEnd });
  }

  const probationMonths = parseProbationMonths(input.probation);

  if (isIsoDay(input.startDate) && probationMonths) {
    const end = addDaysIso(addMonthsIso(input.startDate, probationMonths), -1);

    if (inWindow(end)) deadlines.push({ kind: "probationEnd", date: end });
  }

  if (isIsoDay(input.startDate)) {
    for (const years of ANNIVERSARY_YEARS) {
      const date = addMonthsIso(input.startDate, years * 12);

      if (inWindow(date)) deadlines.push({ kind: "anniversary", date, years });
    }
  }

  return deadlines;
}

// ---------------------------------------------------------------------------
// Arbeitszeitgesetz
// ---------------------------------------------------------------------------

export type WorkBlock = {
  /** Kalendertag des Beginns. */
  date: string;
  start: number;
  end: number;
  /** Netto gearbeitet (Minuten). */
  workedMinutes: number;
  /** Tatsächlich genommene Pause (Minuten). */
  breakMinutes: number;
};

export type ArbzgRule = "maxDaily" | "rest" | "break" | "weekly";

export type ArbzgFinding = {
  rule: ArbzgRule;
  date: string;
  /** Gearbeitete Minuten am Tag (maxDaily/break) bzw. in der Woche (weekly). */
  minutes?: number;
  /** Ruhezeit in Minuten (rest) und der Vortag. */
  restMinutes?: number;
  previousDate?: string;
  breakMinutes?: number;
  requiredBreakMinutes?: number;
};

export const ARBZG_MAX_DAILY_MINUTES = 10 * 60;
export const ARBZG_MIN_REST_MINUTES = 11 * 60;
export const ARBZG_MAX_WEEKLY_MINUTES = 60 * 60;

function requiredBreak(workedMinutes: number) {
  if (workedMinutes > 9 * 60) return 45;
  if (workedMinutes > 6 * 60) return 30;
  return 0;
}

/**
 * Prüft Arbeitsblöcke einer Person auf §3 (max. 10 Std. am Tag, 60 Std. in
 * der Woche), §4 (Pausen) und §5 ArbZG (11 Std. Ruhezeit). Mehrere Blöcke an
 * einem Tag werden zusammengezählt. Pausen nur prüfen, wenn sie überhaupt
 * erfasst werden (`checkBreaks`).
 */
export function findArbzgViolations(blocks: WorkBlock[], options: { checkBreaks?: boolean } = {}): ArbzgFinding[] {
  const checkBreaks = options.checkBreaks ?? true;
  const findings: ArbzgFinding[] = [];
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const byDay = new Map<string, WorkBlock[]>();

  for (const block of sorted) {
    byDay.set(block.date, [...(byDay.get(block.date) ?? []), block]);
  }

  for (const [date, dayBlocks] of byDay) {
    const worked = dayBlocks.reduce((sum, block) => sum + block.workedMinutes, 0);
    const breaks = dayBlocks.reduce((sum, block) => sum + block.breakMinutes, 0);
    // Unterbrechungen zwischen Blöcken zählen als Pause.
    const gaps = dayBlocks.slice(1).reduce((sum, block, index) => sum + Math.max(0, (block.start - dayBlocks[index].end) / 60_000), 0);
    const required = requiredBreak(worked);

    if (worked > ARBZG_MAX_DAILY_MINUTES) {
      findings.push({ rule: "maxDaily", date, minutes: worked });
    }

    if (checkBreaks && required > 0 && breaks + gaps < required) {
      findings.push({ rule: "break", date, minutes: worked, breakMinutes: Math.round(breaks + gaps), requiredBreakMinutes: required });
    }
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];

    if (current.date === previous.date) continue;

    const rest = Math.round((current.start - previous.end) / 60_000);

    if (rest >= 0 && rest < ARBZG_MIN_REST_MINUTES) {
      findings.push({ rule: "rest", date: current.date, restMinutes: rest, previousDate: previous.date });
    }
  }

  const byWeek = new Map<string, number>();

  for (const block of sorted) {
    const monday = addDaysIso(block.date, -weekdayIndex(block.date));
    byWeek.set(monday, (byWeek.get(monday) ?? 0) + block.workedMinutes);
  }

  for (const [monday, minutes] of byWeek) {
    if (minutes > ARBZG_MAX_WEEKLY_MINUTES) {
      findings.push({ rule: "weekly", date: monday, minutes });
    }
  }

  return findings.sort((a, b) => b.date.localeCompare(a.date));
}

/** §11 ArbZG: mindestens 15 Sonntage im Jahr frei — Hochrechnung aus den bisherigen Sonntagen. */
export function projectSundaysOff(sundaysWorked: number, sundaysElapsed: number) {
  if (sundaysElapsed <= 0) return 52;

  const projectedWorked = Math.round((sundaysWorked / sundaysElapsed) * 52);

  return Math.max(0, 52 - projectedWorked);
}

export const ARBZG_MIN_SUNDAYS_OFF = 15;
