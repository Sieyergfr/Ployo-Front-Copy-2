/**
 * Reine Rechenlogik der Stunden-Reports (app/(dashboard)/u/[tenant]/reports)
 * ohne DB-/Auth-Abhängigkeiten — Zeitraumauflösung, Aufteilung gearbeiteter
 * Zeit in Nacht-/Sonntags-/Feiertagsanteile, Abwesenheitszeiträume und das
 * Parsen manuell bearbeiteter Stundenwerte. Separat getestet
 * (tests/report-hours.test.ts).
 *
 * Zuordnung wie in der Lohnabrechnung (§3b EStG):
 * - Nacht: jede Minute zwischen Nachtbeginn (20:00 bzw. 23:00) und 06:00
 *   Ortszeit des Betriebs.
 * - Feiertag: jede Minute an einem gesetzlichen Feiertag (Bundesland des
 *   Standorts, lib/german-holidays.ts), 0–24 Uhr.
 * - Sonntag: jede Minute an einem Sonntag, der KEIN Feiertag ist — fällt ein
 *   Feiertag auf einen Sonntag, zählt die Zeit nur als Feiertag, damit
 *   Zuschläge nicht doppelt gezählt werden.
 * Nacht überschneidet sich dagegen bewusst mit Sonntag/Feiertag (eine
 * Sonntagnacht ist beides) — die Spalten sind jeweils "davon"-Werte der
 * Ist-Stunden, keine Aufteilung, die sich zur Summe ergänzt.
 */

import {
  addDaysToIsoDate,
  eachIsoDate,
  isIsoDate,
  isoWeekMonday,
  localDateKey,
  localTimeKey,
  zonedTimeToUtc,
} from "@/lib/time-tracking";

export const reportPeriods = ["day", "week", "month", "custom"] as const;
export type ReportPeriod = (typeof reportPeriods)[number];

export const reportModes = ["all", "employee", "employees", "team", "location"] as const;
export type ReportMode = (typeof reportModes)[number];

/** Nachtbeginn: 20 Uhr (§3b EStG, steuerfreie Zuschläge) oder 23 Uhr (§2 Abs. 3 ArbZG). */
export const nightStartOptions = ["20", "23"] as const;
export type NightStartOption = (typeof nightStartOptions)[number];
export const NIGHT_END_TIME = "06:00";

/** Ein Jahr reicht für jede Lohn-/Quartalsauswertung und hält die Abfrage beherrschbar. */
export const MAX_REPORT_RANGE_DAYS = 366;

export const REPORT_ERRORS = {
  invalidRange: "Ungültiger Zeitraum (höchstens 366 Tage).",
  invalidEmail: "Bitte eine gültige E-Mail-Adresse angeben.",
  noRecipients: "Bitte mindestens einen Empfänger auswählen oder eingeben.",
  tooManyRecipients: "Höchstens 10 Empfänger pro Versand.",
  invalidValue: "Ungültiger Stundenwert.",
  emailNotConfigured: "Der E-Mail-Versand ist derzeit nicht eingerichtet.",
  rateLimited: "Zu viele Report-Versendungen. Bitte später erneut versuchen.",
} as const;

export function isReportPeriod(value: unknown): value is ReportPeriod {
  return typeof value === "string" && (reportPeriods as readonly string[]).includes(value);
}

export function isReportMode(value: unknown): value is ReportMode {
  return typeof value === "string" && (reportModes as readonly string[]).includes(value);
}

export function isNightStartOption(value: unknown): value is NightStartOption {
  return typeof value === "string" && (nightStartOptions as readonly string[]).includes(value);
}

export type ReportRange = {
  period: ReportPeriod;
  from: string;
  to: string;
  /** Anker für "zurück"/"weiter" — bei "custom" null. */
  previous: string | null;
  next: string | null;
};

/**
 * Zeitraum des Reports. Tag/Woche/Monat leiten sich aus `anchor` ab,
 * "custom" nimmt `from`/`to` (beide Grenzen inklusive). Wirft bei
 * ungültigem oder zu großem Zeitraum.
 */
export function resolveReportRange(input: {
  period: ReportPeriod;
  anchor: string;
  from?: string;
  to?: string;
}): ReportRange {
  const { period, anchor } = input;

  if (period === "custom") {
    const { from, to } = input;

    if (!isIsoDate(from) || !isIsoDate(to) || from > to || eachIsoDate(from, to).length > MAX_REPORT_RANGE_DAYS) {
      throw new Error(REPORT_ERRORS.invalidRange);
    }

    return { period, from, to, previous: null, next: null };
  }

  if (!isIsoDate(anchor)) {
    throw new Error(REPORT_ERRORS.invalidRange);
  }

  if (period === "day") {
    return {
      period,
      from: anchor,
      to: anchor,
      previous: addDaysToIsoDate(anchor, -1),
      next: addDaysToIsoDate(anchor, 1),
    };
  }

  if (period === "week") {
    const from = isoWeekMonday(anchor);
    return {
      period,
      from,
      to: addDaysToIsoDate(from, 6),
      previous: addDaysToIsoDate(from, -7),
      next: addDaysToIsoDate(from, 7),
    };
  }

  const [year, month] = anchor.split("-").map(Number);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const previous = month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, "0")}-01`;

  return { period, from, to: addDaysToIsoDate(nextMonth, -1), previous, next: nextMonth };
}

export type SurchargeMinutes = { nightMinutes: number; holidayMinutes: number; sundayMinutes: number };

type Interval = { start: number; end: number };

/** Zieht die (Pausen-)Intervalle von einem Intervall ab. */
function subtractIntervals(base: Interval, cuts: Interval[]): Interval[] {
  let pieces: Interval[] = [base];

  for (const cut of cuts) {
    if (cut.end <= cut.start) continue;
    pieces = pieces.flatMap((piece) => {
      if (cut.end <= piece.start || cut.start >= piece.end) return [piece];
      const parts: Interval[] = [];
      if (cut.start > piece.start) parts.push({ start: piece.start, end: cut.start });
      if (cut.end < piece.end) parts.push({ start: cut.end, end: piece.end });
      return parts;
    });
  }

  return pieces;
}

function isSundayIso(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
}

/**
 * Teilt die gearbeitete Zeit eines Zeiteintrags in Nacht-/Feiertags-/
 * Sonntagsanteile auf.
 *
 * Gestempelte Pausen werden zeitgenau herausgerechnet. Wird stattdessen eine
 * andere Pausendauer angerechnet (Korrektur der Verwaltung oder
 * automatische Mindestpause — beides ohne konkrete Lage), werden die Anteile
 * proportional auf `workedMinutes` skaliert, damit kein "davon"-Wert größer
 * als die Ist-Zeit des Eintrags wird.
 */
export function splitSurchargeMinutes(
  entry: {
    clockInAt: Date;
    /** Ausstempeln bzw. "jetzt" bei offenem Eintrag. */
    endAt: Date;
    breaks: Array<{ startAt: Date; endAt: Date | null }>;
    /** Angerechnete Netto-Arbeitszeit (calculateEntryDurations). */
    workedMinutes: number;
  },
  options: {
    timeZone: string;
    nightStart: NightStartOption;
    isHoliday: (date: string) => boolean;
  },
): SurchargeMinutes {
  const start = entry.clockInAt.getTime();
  const end = entry.endAt.getTime();

  if (end <= start || entry.workedMinutes <= 0) {
    return { nightMinutes: 0, holidayMinutes: 0, sundayMinutes: 0 };
  }

  const nightStartTime = `${options.nightStart}:00`;
  const working = subtractIntervals(
    { start, end },
    entry.breaks.map((item) => ({
      start: Math.max(start, item.startAt.getTime()),
      end: Math.min(end, (item.endAt ?? entry.endAt).getTime()),
    })),
  );

  let workingMs = 0;
  let nightMs = 0;
  let holidayMs = 0;
  let sundayMs = 0;

  for (const interval of working) {
    let cursor = interval.start;

    while (cursor < interval.end) {
      const at = new Date(cursor);
      const date = localDateKey(at, options.timeZone);
      const time = localTimeKey(at, options.timeZone);
      // Nächste Grenze, an der sich eine Kategorie ändern kann: 06:00,
      // Nachtbeginn oder Mitternacht. Keine davon liegt in einer
      // Sommerzeit-Lücke (02:00–03:00), zonedTimeToUtc ist dort also eindeutig.
      const boundaryTime = [NIGHT_END_TIME, nightStartTime].filter((value) => value > time).sort()[0];
      let boundary = boundaryTime
        ? zonedTimeToUtc(date, boundaryTime, options.timeZone).getTime()
        : zonedTimeToUtc(addDaysToIsoDate(date, 1), "00:00", options.timeZone).getTime();

      if (boundary <= cursor) {
        boundary = cursor + 60_000;
      }

      const segmentEnd = Math.min(boundary, interval.end);
      const length = segmentEnd - cursor;
      const holiday = options.isHoliday(date);

      workingMs += length;
      if (time >= nightStartTime || time < NIGHT_END_TIME) nightMs += length;
      if (holiday) holidayMs += length;
      else if (isSundayIso(date)) sundayMs += length;

      cursor = segmentEnd;
    }
  }

  if (workingMs <= 0) {
    return { nightMinutes: 0, holidayMinutes: 0, sundayMinutes: 0 };
  }

  const factor = Math.min(1, (entry.workedMinutes * 60_000) / workingMs);
  const toMinutes = (ms: number) => Math.min(entry.workedMinutes, Math.round((ms * factor) / 60_000));

  return {
    nightMinutes: toMinutes(nightMs),
    holidayMinutes: toMinutes(holidayMs),
    sundayMinutes: toMinutes(sundayMs),
  };
}

export type AbsencePeriod = {
  from: string;
  to: string;
  /** Tage innerhalb des Report-Zeitraums (Urlaub: Arbeitstage, Krankheit: Kalendertage). */
  days: number;
  /** Krankmeldung ohne Enddatum (noch offen). */
  open?: boolean;
};

/**
 * Schneidet einen Abwesenheitszeitraum auf den Report-Zeitraum zu — `null`,
 * wenn er ihn nicht berührt. `end = null` heißt "noch offen" und wird bis
 * zum Ende des Report-Zeitraums gezählt.
 */
export function clipPeriod(
  start: string,
  end: string | null,
  range: { from: string; to: string },
): { from: string; to: string } | null {
  const effectiveEnd = end ?? range.to;

  if (effectiveEnd < range.from || start > range.to || effectiveEnd < start) {
    return null;
  }

  return { from: start < range.from ? range.from : start, to: effectiveEnd > range.to ? range.to : effectiveEnd };
}

/** Minuten → Dezimalstunden mit zwei Nachkommastellen (Lohnabrechnungsformat, z. B. 465 → 7.75). */
export function minutesToDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Parst einen in der Tabelle eingegebenen Stundenwert in Minuten: "7,75",
 * "7.75", "7" oder "7:45". Leere Eingabe → null. Ungültig/negativ → NaN.
 */
export function parseHoursInput(raw: string): number | null {
  const value = raw.trim();

  if (!value) return null;

  const clock = /^(\d{1,4}):([0-5]\d)$/.exec(value);
  if (clock) {
    return Number(clock[1]) * 60 + Number(clock[2]);
  }

  if (!/^\d{1,4}([.,]\d{1,2})?$/.test(value)) {
    return Number.NaN;
  }

  return Math.round(Number(value.replace(",", ".")) * 60);
}

export const editableReportFields = ["workedMinutes", "nightMinutes", "holidayMinutes", "sundayMinutes"] as const;
export type EditableReportField = (typeof editableReportFields)[number];
export type ReportOverrides = Record<string, Partial<Record<EditableReportField, number>>>;

/**
 * Bereinigt die vom Client geschickten Korrekturen: nur bekannte
 * Mitarbeiter/Felder, ganze Minuten zwischen 0 und der Länge des Zeitraums.
 * Alles andere wird verworfen bzw. wirft bei unplausiblen Zahlen.
 */
export function sanitizeOverrides(
  raw: unknown,
  allowedEmployeeIds: Set<string>,
  maxMinutes: number,
): ReportOverrides {
  const result: ReportOverrides = {};

  if (!raw || typeof raw !== "object") return result;

  for (const [employeeId, fields] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowedEmployeeIds.has(employeeId) || !fields || typeof fields !== "object") continue;

    const clean: Partial<Record<EditableReportField, number>> = {};

    for (const field of editableReportFields) {
      const value = (fields as Record<string, unknown>)[field];
      if (value === undefined || value === null) continue;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > maxMinutes) {
        throw new Error(REPORT_ERRORS.invalidValue);
      }
      clean[field] = value;
    }

    if (Object.keys(clean).length > 0) {
      result[employeeId] = clean;
    }
  }

  return result;
}

const EMAIL_PATTERN = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

export function normalizeReportEmail(value: string): string {
  const email = value.trim().toLowerCase();

  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new Error(REPORT_ERRORS.invalidEmail);
  }

  return email;
}
