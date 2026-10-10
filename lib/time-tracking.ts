/**
 * Reine Zeiterfassungs-Logik ohne DB-/Auth-Abhängigkeiten — Zeitzonen-
 * Umrechnung, Pausen-/Nettoberechnung, Schichtfenster fürs Einstempeln und
 * die Auto-Ausstempel-Regel. Wird von lib/time-tracking-service.ts und dem
 * Cron (app/api/cron/time-tracking) genutzt und ist separat getestet
 * (tests/time-tracking.test.ts).
 *
 * Schichten liegen als lokale Strings vor (`date` "YYYY-MM-DD" +
 * `startTime`/`endTime` "HH:MM" in der Zeitzone des Mandanten), der Server
 * läuft aber in UTC — `new Date("…T…")` wie in lib/arbzg-rules.ts würde hier
 * also um 1–2 Stunden danebenliegen. Deshalb rechnet dieses Modul explizit
 * über `Intl` mit der Mandanten-Zeitzone.
 */

export const DEFAULT_TIME_ZONE = "Europe/Berlin";

/** Kulanz, nach der die Stempel-Erinnerung verschickt wird. */
export const CLOCK_REMINDER_GRACE_MINUTES = 5;

/** Ältere Schichtenden werden nicht mehr erinnert (Cron war z. B. länger aus). */
export const CLOCK_OUT_REMINDER_MAX_DELAY_HOURS = 12;

export const MAX_ENTRY_RANGE_DAYS = 93;

export const clockInModes = ["always", "shift"] as const;
export type ClockInMode = (typeof clockInModes)[number];

export const clockActions = ["clockIn", "clockOut", "breakStart", "breakEnd"] as const;
export type ClockAction = (typeof clockActions)[number];

export type ClockState = "off" | "working" | "break";

export type TimeTrackingSettings = {
  enabled: boolean;
  breaksEnabled: boolean;
  autoBreakDeduction: boolean;
  clockInMode: ClockInMode;
  clockInLeadMinutes: number;
  reminderPush: boolean;
  autoClockOut: boolean;
  autoClockOutAfterShiftMinutes: number;
  autoClockOutMaxHours: number;
  /** App: Einstempeln nur mit gescanntem Standort-QR-Code (Web ausgenommen). */
  qrRequired: boolean;
  /** App: Ausstempeln nur mit gescanntem Standort-QR-Code (Web ausgenommen). */
  qrRequiredClockOut: boolean;
};

/** Eine veröffentlichte Schicht, auf absolute Zeitpunkte umgerechnet. */
export type ResolvedShift = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  startAt: Date;
  endAt: Date;
  location: string;
  breakMinutes: number;
};

const MINUTE_MS = 60_000;

export function isClockInMode(value: unknown): value is ClockInMode {
  return typeof value === "string" && (clockInModes as readonly string[]).includes(value);
}

export function isClockAction(value: unknown): value is ClockAction {
  return typeof value === "string" && (clockActions as readonly string[]).includes(value);
}

export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Versatz der Zeitzone gegenüber UTC zum Zeitpunkt `timestamp`, in ms (Ortszeit − UTC). */
function timeZoneOffsetMs(timestamp: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(timestamp));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));

  return asUtc - Math.floor(timestamp / 1000) * 1000;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

export function isClockTime(value: unknown): value is string {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

/**
 * Lokale Wanduhrzeit (`date` + `time` in `timeZone`) → absoluter Zeitpunkt.
 * Zweimal korrigiert, damit auch Zeitpunkte direkt an einer
 * Sommer-/Winterzeit-Umstellung stimmen.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  let result = wallClock - timeZoneOffsetMs(wallClock, timeZone);
  result = wallClock - timeZoneOffsetMs(result, timeZone);

  return new Date(result);
}

/** Kalendertag (`YYYY-MM-DD`) eines Zeitpunkts in der Zeitzone. */
export function localDateKey(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

/** Uhrzeit (`HH:MM`) eines Zeitpunkts in der Zeitzone. */
export function localTimeKey(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function addDaysToIsoDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Alle Kalendertage von `from` bis `to` (jeweils inklusive). */
export function eachIsoDate(from: string, to: string): string[] {
  const days: string[] = [];
  for (let current = from; current <= to; current = addDaysToIsoDate(current, 1)) {
    days.push(current);
  }
  return days;
}

/**
 * Start/Ende einer Schicht als absolute Zeitpunkte. Ende ≤ Start heißt
 * Schicht über Mitternacht (wie in lib/arbzg-rules.ts).
 */
export function resolveShiftInterval(
  shift: { date: string; startTime: string; endTime: string },
  timeZone: string,
): { startAt: Date; endAt: Date } {
  const startAt = zonedTimeToUtc(shift.date, shift.startTime, timeZone);
  const endDate = shift.endTime <= shift.startTime ? addDaysToIsoDate(shift.date, 1) : shift.date;

  return { startAt, endAt: zonedTimeToUtc(endDate, shift.endTime, timeZone) };
}

/**
 * Schicht, in die gerade eingestempelt werden darf bzw. auf die ein
 * Einstempeln bezogen wird: läuft bereits oder beginnt in höchstens
 * `leadMinutes`. Bei mehreren die am frühesten beginnende.
 */
export function findClockableShift(
  shifts: ResolvedShift[],
  now: Date,
  leadMinutes: number,
): ResolvedShift | null {
  const lead = Math.max(0, leadMinutes) * MINUTE_MS;
  const candidates = shifts
    .filter((shift) => shift.startAt.getTime() - lead <= now.getTime() && now < shift.endAt)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  return candidates[0] ?? null;
}

/** Nächste Schicht, die noch nicht zu Ende ist. */
export function findNextShift(shifts: ResolvedShift[], now: Date): ResolvedShift | null {
  return (
    shifts
      .filter((shift) => shift.endAt > now)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0] ?? null
  );
}

/**
 * Gesetzliche Mindestpause nach §4 ArbZG: mehr als 6 Stunden Arbeit →
 * 30 Minuten, mehr als 9 Stunden → 45 Minuten.
 */
export function requiredBreakMinutes(workedMinutesBeforeBreaks: number): number {
  if (workedMinutesBeforeBreaks > 9 * 60) return 45;
  if (workedMinutesBeforeBreaks > 6 * 60) return 30;
  return 0;
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / MINUTE_MS));
}

export type EntryForCalculation = {
  clockInAt: Date;
  clockOutAt: Date | null;
  breakMinutesOverride: number | null;
  breaks: Array<{ startAt: Date; endAt: Date | null }>;
};

export type EntryDurations = {
  /** Einstempeln bis Ausstempeln (bzw. bis jetzt). */
  grossMinutes: number;
  /** Tatsächlich gestempelte Pausen. */
  clockedBreakMinutes: number;
  /** Angerechnete Pause (Korrektur > gestempelt/Mindestpause). */
  breakMinutes: number;
  /** Ob die Mindestpause aufgefüllt wurde. */
  breakDeducted: boolean;
  workedMinutes: number;
};

/**
 * Brutto/Pause/Netto eines Arbeitsblocks. Eine Korrektur der Verwaltung
 * (`breakMinutesOverride`) ersetzt die gestempelten Pausen vollständig; sonst
 * gilt bei `autoBreakDeduction` mindestens die gesetzliche Pause. Wird
 * während der Schicht angezeigt (`clockOutAt` = null), rechnet sie bis `now`.
 */
export function calculateEntryDurations(
  entry: EntryForCalculation,
  options: { autoBreakDeduction: boolean; now: Date },
): EntryDurations {
  const end = entry.clockOutAt ?? options.now;
  const grossMinutes = minutesBetween(entry.clockInAt, end);
  const clockedBreakMinutes = Math.min(
    grossMinutes,
    entry.breaks.reduce((sum, item) => {
      const breakEnd = item.endAt ?? end;
      return sum + minutesBetween(item.startAt, breakEnd < end ? breakEnd : end);
    }, 0),
  );

  if (entry.breakMinutesOverride !== null) {
    const breakMinutes = Math.min(grossMinutes, Math.max(0, entry.breakMinutesOverride));
    return {
      grossMinutes,
      clockedBreakMinutes,
      breakMinutes,
      breakDeducted: false,
      workedMinutes: grossMinutes - breakMinutes,
    };
  }

  let breakMinutes = clockedBreakMinutes;
  let breakDeducted = false;

  // Nur für abgeschlossene Blöcke: während der laufenden Schicht wäre eine
  // plötzlich abgezogene halbe Stunde bei 6:01 h eher verwirrend als hilfreich.
  if (options.autoBreakDeduction && entry.clockOutAt) {
    const required = requiredBreakMinutes(grossMinutes - clockedBreakMinutes);
    if (required > clockedBreakMinutes) {
      breakMinutes = Math.min(grossMinutes, required);
      breakDeducted = true;
    }
  }

  return {
    grossMinutes,
    clockedBreakMinutes,
    breakMinutes,
    breakDeducted,
    workedMinutes: grossMinutes - breakMinutes,
  };
}

/**
 * Wann und mit welchem Ausstempel-Zeitpunkt ein vergessener offener Eintrag
 * automatisch geschlossen wird — `null`, solange es noch nicht so weit ist.
 *
 * Mit zugeordneter Schicht: `afterShiftMinutes` nach Schichtende, gestempelt
 * wird das Schichtende (die realistischste Annahme). Ohne Schicht (oder
 * eingestempelt erst nach Schichtende): `maxHours` nach dem Einstempeln.
 */
export function autoClockOutDecision(
  entry: { clockInAt: Date; plannedEndAt: Date | null },
  settings: Pick<TimeTrackingSettings, "autoClockOutAfterShiftMinutes" | "autoClockOutMaxHours">,
  now: Date,
): { clockOutAt: Date } | null {
  if (entry.plannedEndAt && entry.plannedEndAt > entry.clockInAt) {
    const trigger = entry.plannedEndAt.getTime() + settings.autoClockOutAfterShiftMinutes * MINUTE_MS;
    return now.getTime() >= trigger ? { clockOutAt: entry.plannedEndAt } : null;
  }

  const trigger = entry.clockInAt.getTime() + settings.autoClockOutMaxHours * 60 * MINUTE_MS;
  return now.getTime() >= trigger ? { clockOutAt: new Date(trigger) } : null;
}

export function shiftReminderRef(shift: { id: string; date: string }): string {
  return `${shift.id}@${shift.date}`;
}

export type ReminderCandidate = { kind: "clock-in" | "clock-out"; shift: ResolvedShift };

/**
 * Welche Erinnerungen für eine Schicht jetzt fällig sind.
 *
 * - Einstempeln: 5 Min. nach Beginn, solange die Schicht läuft, kein offener
 *   Eintrag besteht und seit `leadMinutes` vor Beginn auch nicht schon
 *   gestempelt wurde (z. B. ein- und wieder ausgestempelt).
 * - Ausstempeln: 5 Min. nach Ende, wenn noch ein vor Schichtende begonnener
 *   Eintrag offen ist.
 */
export function dueReminders(input: {
  shift: ResolvedShift;
  now: Date;
  leadMinutes: number;
  openEntry: { clockInAt: Date } | null;
  lastClockInAt: Date | null;
}): ReminderCandidate[] {
  const { shift, now } = input;
  const grace = CLOCK_REMINDER_GRACE_MINUTES * MINUTE_MS;
  const reminders: ReminderCandidate[] = [];
  const shiftWindowStart = shift.startAt.getTime() - Math.max(0, input.leadMinutes) * MINUTE_MS;

  if (
    now.getTime() >= shift.startAt.getTime() + grace &&
    now < shift.endAt &&
    !input.openEntry &&
    !(input.lastClockInAt && input.lastClockInAt.getTime() >= shiftWindowStart)
  ) {
    reminders.push({ kind: "clock-in", shift });
  }

  if (
    now.getTime() >= shift.endAt.getTime() + grace &&
    now.getTime() < shift.endAt.getTime() + CLOCK_OUT_REMINDER_MAX_DELAY_HOURS * 60 * MINUTE_MS &&
    input.openEntry &&
    input.openEntry.clockInAt < shift.endAt
  ) {
    reminders.push({ kind: "clock-out", shift });
  }

  return reminders;
}

/** ISO-Kalenderwoche eines Kalendertags (`YYYY-MM-DD`), rein in UTC gerechnet. */
export function isoWeekOfIsoDate(date: string): { year: number; week: number } {
  const [year, month, day] = date.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const weekday = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday);
  const isoYear = utcDate.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);

  return { year: isoYear, week: Math.ceil(((utcDate.getTime() - yearStart) / 86_400_000 + 1) / 7) };
}

/** Montag der ISO-Woche, in der `date` liegt. */
export function isoWeekMonday(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
  return addDaysToIsoDate(date, 1 - weekday);
}

/**
 * Feste, für Nutzer formulierte Fehlermeldungen der Zeiterfassung samt
 * HTTP-Status — lib/api/self-service-errors.ts reicht genau diese Texte 1:1
 * an App und Web durch (Allowlist statt `includes()`-Raten).
 */
export const TIME_TRACKING_ERRORS = {
  disabled: "Die Zeiterfassung ist für diesen Betrieb nicht aktiviert.",
  alreadyClockedIn: "Sie sind bereits eingestempelt.",
  notClockedIn: "Sie sind nicht eingestempelt.",
  breakRunning: "Die Pause läuft bereits.",
  noBreak: "Es läuft gerade keine Pause.",
  breaksDisabled: "Pausen werden in diesem Betrieb nicht gestempelt.",
  outsideShift: "Einstempeln ist nur kurz vor oder während einer geplanten Schicht möglich.",
  invalidAction: "Ungültige Stempelaktion.",
  invalidRange: "Ungültiger Zeitraum.",
  invalidTimes: "Bitte gültige Zeiten angeben.",
  endBeforeStart: "Das Ende muss nach dem Beginn liegen.",
  tooLong: "Ein Zeiteintrag darf höchstens 24 Stunden umfassen.",
  inFuture: "Zeiteinträge in der Zukunft sind nicht möglich.",
  invalidBreak: "Die Pause muss zwischen 0 Minuten und der Dauer des Eintrags liegen.",
  noteRequired: "Bitte einen Grund für die Korrektur angeben.",
  overlap: "Der Eintrag überschneidet sich mit einem anderen Zeiteintrag.",
  notFound: "Zeiteintrag nicht gefunden.",
  qrRequired: "Bitte scannen Sie zum Einstempeln den QR-Code am Standort.",
  qrRequiredClockOut: "Bitte scannen Sie zum Ausstempeln den QR-Code am Standort.",
  qrInvalid: "Dieser QR-Code gehört zu keinem aktiven Standort Ihres Betriebs.",
} as const;

export const TIME_TRACKING_ERROR_STATUS: ReadonlyMap<string, number> = new Map([
  [TIME_TRACKING_ERRORS.disabled, 403],
  [TIME_TRACKING_ERRORS.alreadyClockedIn, 409],
  [TIME_TRACKING_ERRORS.notClockedIn, 409],
  [TIME_TRACKING_ERRORS.breakRunning, 409],
  [TIME_TRACKING_ERRORS.noBreak, 409],
  [TIME_TRACKING_ERRORS.breaksDisabled, 409],
  [TIME_TRACKING_ERRORS.outsideShift, 409],
  [TIME_TRACKING_ERRORS.invalidAction, 400],
  [TIME_TRACKING_ERRORS.invalidRange, 400],
  [TIME_TRACKING_ERRORS.invalidTimes, 400],
  [TIME_TRACKING_ERRORS.endBeforeStart, 400],
  [TIME_TRACKING_ERRORS.tooLong, 400],
  [TIME_TRACKING_ERRORS.inFuture, 400],
  [TIME_TRACKING_ERRORS.invalidBreak, 400],
  [TIME_TRACKING_ERRORS.noteRequired, 400],
  [TIME_TRACKING_ERRORS.overlap, 409],
  [TIME_TRACKING_ERRORS.notFound, 404],
  [TIME_TRACKING_ERRORS.qrRequired, 400],
  [TIME_TRACKING_ERRORS.qrRequiredClockOut, 400],
  [TIME_TRACKING_ERRORS.qrInvalid, 400],
]);

/** Minuten als "h:mm" (z. B. 465 → "7:45"); negative Werte mit Minus (Soll/Ist-Differenz). */
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? "−" : "";
  const absolute = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, "0")}`;
}

export const timePeriods = ["week", "month"] as const;
export type TimePeriod = (typeof timePeriods)[number];

export function isTimePeriod(value: unknown): value is TimePeriod {
  return typeof value === "string" && (timePeriods as readonly string[]).includes(value);
}

/**
 * Zeitraum für die Listen-Ansichten: ISO-Woche bzw. Kalendermonat, in dem
 * `anchor` liegt, plus die Anker für "zurück"/"weiter".
 */
export function resolvePeriod(period: TimePeriod, anchor: string) {
  if (period === "month") {
    const [year, month] = anchor.split("-").map(Number);
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const to = addDaysToIsoDate(nextMonth, -1);
    const previous = month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, "0")}-01`;
    return { from, to, previous, next: nextMonth };
  }

  const from = isoWeekMonday(anchor);
  return { from, to: addDaysToIsoDate(from, 6), previous: addDaysToIsoDate(from, -7), next: addDaysToIsoDate(from, 7) };
}
