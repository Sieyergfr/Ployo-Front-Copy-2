import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordTenantAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { parseClockQrToken } from "@/lib/time-clock-qr";
import {
  assertEmployeeInScope,
  requireTenantAccess,
  requireTenantMembership,
  resolveScopeFilter,
  type TenantAccess,
} from "@/lib/tenant-access";
import {
  MAX_ENTRY_RANGE_DAYS,
  TIME_TRACKING_ERRORS,
  addDaysToIsoDate,
  autoClockOutDecision,
  calculateEntryDurations,
  dueReminders,
  eachIsoDate,
  findClockableShift,
  findNextShift,
  isClockInMode,
  isClockTime,
  isTimePeriod,
  isIsoDate,
  isoWeekOfIsoDate,
  localDateKey,
  localTimeKey,
  resolvePeriod,
  resolveShiftInterval,
  safeTimeZone,
  shiftReminderRef,
  zonedTimeToUtc,
  type ClockAction,
  type ClockState,
  type ResolvedShift,
  type TimeTrackingSettings,
} from "@/lib/time-tracking";

/**
 * Zeiterfassung (Stempeluhr).
 *
 * - Self-Service (`getMyClockStatus`, `performMyClockAction`,
 *   `getMyTimeEntries`): jedes Mitglied mit verknüpfter Personalakte, ohne
 *   Bereichsrecht — wie "Meine Schichten" (lib/shift-service.ts).
 * - Verwaltung (`getTenantTimeEntries`, `correctTimeEntry`,
 *   `createManualTimeEntry`, `deleteTimeEntry`): Bereich "timeTracking" mit
 *   own/team/all-Scope.
 * - Cron (`runTimeTrackingJobs`): Stempel-Erinnerungen per Push und
 *   automatisches Ausstempeln vergessener Einträge.
 *
 * Alle Zeitpunkte setzt der Server; der Client schickt nur die Aktion.
 * Schichtbezug ist immer der VERÖFFENTLICHTE Stand
 * (`TenantShiftWeek.publishedShiftsJson`) — denselben sieht der Mitarbeiter
 * in "Meine Schichten".
 */

const settingsSelect = {
  timeTrackingEnabled: true,
  timeTrackingBreaksEnabled: true,
  timeTrackingAutoBreakDeduction: true,
  timeTrackingClockInMode: true,
  timeTrackingClockInLeadMinutes: true,
  timeTrackingReminderPush: true,
  timeTrackingAutoClockOut: true,
  timeTrackingAutoClockOutAfterShiftMinutes: true,
  timeTrackingAutoClockOutMaxHours: true,
  timeTrackingQrRequired: true,
  timeTrackingQrRequiredClockOut: true,
} satisfies Prisma.TenantSettingsSelect;

type SettingsRow = Prisma.TenantSettingsGetPayload<{ select: typeof settingsSelect }>;

const disabledSettings: TimeTrackingSettings = {
  enabled: false,
  breaksEnabled: true,
  autoBreakDeduction: false,
  clockInMode: "always",
  clockInLeadMinutes: 60,
  reminderPush: true,
  autoClockOut: false,
  autoClockOutAfterShiftMinutes: 60,
  autoClockOutMaxHours: 12,
  qrRequired: false,
  qrRequiredClockOut: false,
};

function toSettings(row: SettingsRow | null): TimeTrackingSettings {
  if (!row) return disabledSettings;

  return {
    enabled: row.timeTrackingEnabled,
    breaksEnabled: row.timeTrackingBreaksEnabled,
    autoBreakDeduction: row.timeTrackingAutoBreakDeduction,
    clockInMode: isClockInMode(row.timeTrackingClockInMode) ? row.timeTrackingClockInMode : "always",
    clockInLeadMinutes: row.timeTrackingClockInLeadMinutes,
    reminderPush: row.timeTrackingReminderPush,
    autoClockOut: row.timeTrackingAutoClockOut,
    autoClockOutAfterShiftMinutes: row.timeTrackingAutoClockOutAfterShiftMinutes,
    autoClockOutMaxHours: row.timeTrackingAutoClockOutMaxHours,
    qrRequired: row.timeTrackingQrRequired,
    qrRequiredClockOut: row.timeTrackingQrRequiredClockOut,
  };
}

export async function loadTenantContext(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, timezone: true, settings: { select: settingsSelect } },
  });

  return {
    tenantName: tenant?.name ?? "",
    timeZone: safeTimeZone(tenant?.timezone),
    settings: toSettings(tenant?.settings ?? null),
  };
}

/** Öffentliche Einstellungen für den Client (Stempeluhr-Bedienung). */
export type ClockSettingsView = Pick<
  TimeTrackingSettings,
  "breaksEnabled" | "autoBreakDeduction" | "clockInMode" | "clockInLeadMinutes" | "qrRequired" | "qrRequiredClockOut"
>;

function toClockSettingsView(settings: TimeTrackingSettings): ClockSettingsView {
  return {
    breaksEnabled: settings.breaksEnabled,
    autoBreakDeduction: settings.autoBreakDeduction,
    clockInMode: settings.clockInMode,
    clockInLeadMinutes: settings.clockInLeadMinutes,
    qrRequired: settings.qrRequired,
    qrRequiredClockOut: settings.qrRequiredClockOut,
  };
}

// ---------------------------------------------------------------------------
// Veröffentlichte Schichten
// ---------------------------------------------------------------------------

type SnapshotEntry = {
  id?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  breakMinutes?: number;
  employeeId?: string | null;
};

/**
 * Veröffentlichte Schichten im Datumsbereich (Ortszeit-Kalendertage, `date`
 * der Schicht), gruppiert nach Mitarbeiter. `employeeIds = null` lädt alle.
 */
export async function loadPublishedShifts(
  tenantId: string,
  employeeIds: string[] | null,
  fromDate: string,
  toDate: string,
  timeZone: string,
): Promise<Map<string, ResolvedShift[]>> {
  const weekKeys = new Map<string, { year: number; week: number }>();

  for (const date of eachIsoDate(fromDate, toDate)) {
    const isoWeek = isoWeekOfIsoDate(date);
    weekKeys.set(`${isoWeek.year}-${isoWeek.week}`, isoWeek);
  }

  const result = new Map<string, ResolvedShift[]>();

  if (weekKeys.size === 0 || (employeeIds && employeeIds.length === 0)) {
    return result;
  }

  const weeks = await prisma.tenantShiftWeek.findMany({
    where: { tenantId, status: "published", OR: [...weekKeys.values()] },
    select: { publishedShiftsJson: true },
  });
  const wanted = employeeIds ? new Set(employeeIds) : null;

  for (const week of weeks) {
    const entries = Array.isArray(week.publishedShiftsJson)
      ? (week.publishedShiftsJson as SnapshotEntry[])
      : [];

    for (const entry of entries) {
      if (
        !entry.employeeId ||
        (wanted && !wanted.has(entry.employeeId)) ||
        !entry.id ||
        !isIsoDate(entry.date) ||
        !isClockTime(entry.startTime) ||
        !isClockTime(entry.endTime) ||
        entry.date < fromDate ||
        entry.date > toDate
      ) {
        continue;
      }

      const interval = resolveShiftInterval(
        { date: entry.date, startTime: entry.startTime, endTime: entry.endTime },
        timeZone,
      );
      const list = result.get(entry.employeeId) ?? [];

      list.push({
        id: entry.id,
        date: entry.date,
        startTime: entry.startTime,
        endTime: entry.endTime,
        startAt: interval.startAt,
        endAt: interval.endAt,
        location: entry.location ?? "",
        breakMinutes: typeof entry.breakMinutes === "number" ? entry.breakMinutes : 0,
      });
      result.set(entry.employeeId, list);
    }
  }

  for (const list of result.values()) {
    list.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }

  return result;
}

// ---------------------------------------------------------------------------
// Ansichten
// ---------------------------------------------------------------------------

export type ShiftView = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  startAt: string;
  endAt: string;
  location: string;
  plannedMinutes: number;
};

export function toShiftView(shift: ResolvedShift): ShiftView {
  const duration = Math.round((shift.endAt.getTime() - shift.startAt.getTime()) / 60_000);

  return {
    id: shift.id,
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    startAt: shift.startAt.toISOString(),
    endAt: shift.endAt.toISOString(),
    location: shift.location,
    plannedMinutes: Math.max(0, duration - shift.breakMinutes),
  };
}

export const entryInclude = {
  breaks: { orderBy: { startAt: "asc" } },
} satisfies Prisma.TenantTimeEntryInclude;

type EntryRow = Prisma.TenantTimeEntryGetPayload<{ include: typeof entryInclude }>;

export type TimeEntryView = {
  id: string;
  employeeId: string;
  /** Kalendertag (Ortszeit) des Einstempelns — danach wird gruppiert. */
  date: string;
  clockInAt: string;
  clockOutAt: string | null;
  /** Ortszeit "HH:MM" — fertig für die Anzeige, ohne Zeitzonenwissen im Client. */
  clockInTime: string;
  clockOutTime: string | null;
  breaks: Array<{ startAt: string; endAt: string | null; startTime: string; endTime: string | null }>;
  grossMinutes: number;
  clockedBreakMinutes: number;
  breakMinutes: number;
  breakDeducted: boolean;
  workedMinutes: number;
  isOpen: boolean;
  autoClosed: boolean;
  corrected: boolean;
  breakMinutesOverride: number | null;
  note: string;
  source: string;
  shift: { id: string; startAt: string | null; endAt: string | null; location: string } | null;
  /** Standort, dessen QR-Code beim Einstempeln gescannt wurde (nur App mit QR-Pflicht). */
  clockInLocation: { id: string | null; name: string } | null;
  /** Dto. beim Ausstempeln — darf vom Einstempel-Standort abweichen. */
  clockOutLocation: { id: string | null; name: string } | null;
};

function scannedLocationView(id: string | null, name: string) {
  return id || name ? { id, name } : null;
}

function toEntryView(
  entry: EntryRow,
  options: { timeZone: string; autoBreakDeduction: boolean; now: Date },
): TimeEntryView {
  const durations = calculateEntryDurations(entry, {
    autoBreakDeduction: options.autoBreakDeduction,
    now: options.now,
  });

  return {
    id: entry.id,
    employeeId: entry.employeeId,
    date: localDateKey(entry.clockInAt, options.timeZone),
    clockInAt: entry.clockInAt.toISOString(),
    clockOutAt: entry.clockOutAt?.toISOString() ?? null,
    clockInTime: localTimeKey(entry.clockInAt, options.timeZone),
    clockOutTime: entry.clockOutAt ? localTimeKey(entry.clockOutAt, options.timeZone) : null,
    breaks: entry.breaks.map((item) => ({
      startAt: item.startAt.toISOString(),
      endAt: item.endAt?.toISOString() ?? null,
      startTime: localTimeKey(item.startAt, options.timeZone),
      endTime: item.endAt ? localTimeKey(item.endAt, options.timeZone) : null,
    })),
    ...durations,
    isOpen: entry.clockOutAt === null,
    autoClosed: entry.autoClosed,
    corrected: entry.correctedAt !== null,
    breakMinutesOverride: entry.breakMinutesOverride,
    note: entry.note,
    source: entry.source,
    shift: entry.shiftId
      ? {
          id: entry.shiftId,
          startAt: entry.plannedStartAt?.toISOString() ?? null,
          endAt: entry.plannedEndAt?.toISOString() ?? null,
          location: entry.shiftLocation,
        }
      : null,
    clockInLocation: scannedLocationView(entry.clockInLocationId, entry.clockInLocationName),
    clockOutLocation: scannedLocationView(entry.clockOutLocationId, entry.clockOutLocationName),
  };
}

// ---------------------------------------------------------------------------
// Self-Service
// ---------------------------------------------------------------------------

const NOT_LINKED_MESSAGE = "Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden.";

async function resolveMyContext(tenantSlug: string) {
  const access = await requireTenantMembership(tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true },
  });

  if (!employee) {
    throw new Error(NOT_LINKED_MESSAGE);
  }

  const context = await loadTenantContext(access.tenantId);

  return { access, employeeId: employee.id, ...context };
}

export type ClockStatusView = {
  enabled: boolean;
  settings: ClockSettingsView;
  state: ClockState;
  /** Einstempeln ist jetzt erlaubt (Modus "shift": Schicht läuft oder beginnt bald). */
  canClockIn: boolean;
  /**
   * Stempeluhr überhaupt anzeigen: eingestempelt, oder Einstempeln erlaubt.
   * Im Modus "shift" ohne Schicht in Reichweite also ausgeblendet.
   */
  showClock: boolean;
  openEntry: TimeEntryView | null;
  currentBreakStartAt: string | null;
  /** Schicht, auf die ein Einstempeln jetzt bezogen würde. */
  clockableShift: ShiftView | null;
  nextShift: ShiftView | null;
  today: { date: string; workedMinutes: number; breakMinutes: number };
  timeZone: string;
  serverTime: string;
};

export async function getMyClockStatus(tenantSlug: string): Promise<ClockStatusView> {
  const context = await resolveMyContext(tenantSlug);
  return buildClockStatus(context.access.tenantId, context.employeeId, context);
}

async function buildClockStatus(
  tenantId: string,
  employeeId: string,
  context: { timeZone: string; settings: TimeTrackingSettings },
): Promise<ClockStatusView> {
  const now = new Date();
  const { timeZone, settings } = context;
  const today = localDateKey(now, timeZone);

  if (!settings.enabled) {
    return {
      enabled: false,
      settings: toClockSettingsView(settings),
      state: "off",
      canClockIn: false,
      showClock: false,
      openEntry: null,
      currentBreakStartAt: null,
      clockableShift: null,
      nextShift: null,
      today: { date: today, workedMinutes: 0, breakMinutes: 0 },
      timeZone,
      serverTime: now.toISOString(),
    };
  }

  const dayStart = zonedTimeToUtc(today, "00:00", timeZone);
  const [shiftsByEmployee, openEntry, todaysEntries] = await Promise.all([
    loadPublishedShifts(tenantId, [employeeId], addDaysToIsoDate(today, -1), addDaysToIsoDate(today, 7), timeZone),
    prisma.tenantTimeEntry.findFirst({
      where: { employeeId, clockOutAt: null },
      include: entryInclude,
    }),
    prisma.tenantTimeEntry.findMany({
      where: { employeeId, clockInAt: { gte: dayStart } },
      include: entryInclude,
    }),
  ]);
  const shifts = shiftsByEmployee.get(employeeId) ?? [];
  const clockableShift = findClockableShift(shifts, now, settings.clockInLeadMinutes);
  const nextShift = findNextShift(shifts, now);
  const openBreak = openEntry?.breaks.find((item) => item.endAt === null) ?? null;
  const state: ClockState = openEntry ? (openBreak ? "break" : "working") : "off";
  const canClockIn = !openEntry && (settings.clockInMode === "always" || clockableShift !== null);
  const viewOptions = { timeZone, autoBreakDeduction: settings.autoBreakDeduction, now };
  const todayViews = todaysEntries.map((entry) => toEntryView(entry, viewOptions));

  // Ein noch offener Eintrag von gestern (Nachtschicht) zählt mit in "heute",
  // damit die laufende Uhr nicht bei 0 steht.
  if (openEntry && openEntry.clockInAt < dayStart) {
    todayViews.push(toEntryView(openEntry, viewOptions));
  }

  return {
    enabled: true,
    settings: toClockSettingsView(settings),
    state,
    canClockIn,
    showClock: state !== "off" || canClockIn,
    openEntry: openEntry ? toEntryView(openEntry, viewOptions) : null,
    currentBreakStartAt: openBreak?.startAt.toISOString() ?? null,
    clockableShift: clockableShift ? toShiftView(clockableShift) : null,
    nextShift: nextShift ? toShiftView(nextShift) : null,
    today: {
      date: today,
      workedMinutes: todayViews.reduce((sum, entry) => sum + entry.workedMinutes, 0),
      breakMinutes: todayViews.reduce((sum, entry) => sum + entry.breakMinutes, 0),
    },
    timeZone,
    serverTime: now.toISOString(),
  };
}

/**
 * Sperrt die Personalakte für die Dauer der Transaktion — so können zwei
 * gleichzeitige Stempelaktionen (Doppeltipp, App + Web) nie zwei offene
 * Einträge oder zwei offene Pausen erzeugen.
 */
async function lockEmployee(tx: Prisma.TransactionClient, employeeId: string) {
  await tx.$queryRaw`SELECT "id" FROM "TenantEmployee" WHERE "id" = ${employeeId} FOR UPDATE`;
}

/**
 * Standort zum gescannten Stempel-QR-Code — nur aktive Standorte des eigenen
 * Mandanten. Bewusst NICHT auf den Schicht-Standort beschränkt: gestempelt
 * werden darf an jedem Standort, sichtbar ist hinterher, an welchem.
 */
async function resolveScannedLocation(tenantId: string, qrCode: string) {
  const token = parseClockQrToken(qrCode);
  const location = token
    ? await prisma.tenantLocation.findFirst({
        where: { tenantId, clockQrToken: token, status: "active" },
        select: { id: true, name: true },
      })
    : null;

  if (!location) {
    throw new Error(TIME_TRACKING_ERRORS.qrInvalid);
  }

  return location;
}

export async function performMyClockAction(input: {
  tenantSlug: string;
  action: ClockAction;
  source: "app" | "web";
  /** Gescannter Inhalt des Standort-QR-Codes (nur App). */
  qrCode?: string | null;
}): Promise<ClockStatusView> {
  const context = await resolveMyContext(input.tenantSlug);
  const { settings, timeZone, employeeId } = context;
  const tenantId = context.access.tenantId;

  if (!settings.enabled) {
    throw new Error(TIME_TRACKING_ERRORS.disabled);
  }

  if ((input.action === "breakStart" || input.action === "breakEnd") && !settings.breaksEnabled) {
    throw new Error(TIME_TRACKING_ERRORS.breaksDisabled);
  }

  // QR-Pflicht ist fürs Ein- und Ausstempeln getrennt einstellbar und gilt
  // nur in der App — im Web-Dashboard (meist am PC) lässt sich kein Code
  // scannen, dort bleibt es beim normalen Stempeln. Pausen gehen immer per
  // Knopfdruck. Wird ein Code mitgeschickt (auch ohne Pflicht), wird er
  // trotzdem geprüft und der Standort festgehalten.
  const isClockInOrOut = input.action === "clockIn" || input.action === "clockOut";
  const qrCode = isClockInOrOut && typeof input.qrCode === "string" && input.qrCode.trim() ? input.qrCode : null;

  if (input.action === "clockIn" && input.source === "app" && settings.qrRequired && !qrCode) {
    throw new Error(TIME_TRACKING_ERRORS.qrRequired);
  }

  if (input.action === "clockOut" && input.source === "app" && settings.qrRequiredClockOut && !qrCode) {
    throw new Error(TIME_TRACKING_ERRORS.qrRequiredClockOut);
  }

  const scannedLocation = qrCode ? await resolveScannedLocation(tenantId, qrCode) : null;
  let clockableShift: ResolvedShift | null = null;

  if (input.action === "clockIn") {
    const today = localDateKey(new Date(), timeZone);
    const shifts =
      (await loadPublishedShifts(tenantId, [employeeId], addDaysToIsoDate(today, -1), addDaysToIsoDate(today, 1), timeZone))
        .get(employeeId) ?? [];
    clockableShift = findClockableShift(shifts, new Date(), settings.clockInLeadMinutes);

    if (settings.clockInMode === "shift" && !clockableShift) {
      throw new Error(TIME_TRACKING_ERRORS.outsideShift);
    }
  }

  await prisma.$transaction(async (tx) => {
    await lockEmployee(tx, employeeId);

    const now = new Date();
    const openEntry = await tx.tenantTimeEntry.findFirst({
      where: { employeeId, clockOutAt: null },
      select: { id: true, breaks: { where: { endAt: null }, select: { id: true } } },
    });
    const openBreak = openEntry?.breaks[0] ?? null;

    switch (input.action) {
      case "clockIn": {
        if (openEntry) throw new Error(TIME_TRACKING_ERRORS.alreadyClockedIn);

        await tx.tenantTimeEntry.create({
          data: {
            tenantId,
            employeeId,
            clockInAt: now,
            source: input.source,
            shiftId: clockableShift?.id ?? "",
            plannedStartAt: clockableShift?.startAt ?? null,
            plannedEndAt: clockableShift?.endAt ?? null,
            shiftLocation: clockableShift?.location ?? "",
            clockInLocationId: scannedLocation?.id ?? null,
            clockInLocationName: scannedLocation?.name ?? "",
          },
        });
        return;
      }
      case "clockOut": {
        if (!openEntry) throw new Error(TIME_TRACKING_ERRORS.notClockedIn);

        if (openBreak) {
          await tx.tenantTimeBreak.update({ where: { id: openBreak.id }, data: { endAt: now } });
        }

        await tx.tenantTimeEntry.update({
          where: { id: openEntry.id },
          data: {
            clockOutAt: now,
            ...(scannedLocation
              ? { clockOutLocationId: scannedLocation.id, clockOutLocationName: scannedLocation.name }
              : {}),
          },
        });
        return;
      }
      case "breakStart": {
        if (!openEntry) throw new Error(TIME_TRACKING_ERRORS.notClockedIn);
        if (openBreak) throw new Error(TIME_TRACKING_ERRORS.breakRunning);

        await tx.tenantTimeBreak.create({ data: { timeEntryId: openEntry.id, startAt: now } });
        return;
      }
      case "breakEnd": {
        if (!openEntry) throw new Error(TIME_TRACKING_ERRORS.notClockedIn);
        if (!openBreak) throw new Error(TIME_TRACKING_ERRORS.noBreak);

        await tx.tenantTimeBreak.update({ where: { id: openBreak.id }, data: { endAt: now } });
        return;
      }
    }
  });

  return buildClockStatus(tenantId, employeeId, context);
}

export type DaySummaryView = {
  date: string;
  entries: TimeEntryView[];
  shifts: ShiftView[];
  workedMinutes: number;
  breakMinutes: number;
  plannedMinutes: number;
};

export type TimeEntriesView = {
  from: string;
  to: string;
  /** Anker für "zurück"/"weiter" (nur bei Abfrage per `period`). */
  previous: string | null;
  next: string | null;
  /** Heutiger Kalendertag in der Zeitzone des Betriebs. */
  today: string;
  timeZone: string;
  autoBreakDeduction: boolean;
  days: DaySummaryView[];
  totals: { workedMinutes: number; breakMinutes: number; plannedMinutes: number; entryCount: number };
};

type RangeInput = {
  from?: string;
  to?: string;
  /** Alternativ zu from/to: Woche bzw. Monat, in dem `date` liegt (Standard: heute). */
  period?: string;
  date?: string;
};

/**
 * Zeitraum einer Abfrage: explizit `from`/`to`, sonst `period` + `date`,
 * sonst die laufende ISO-Woche (alles Ortszeit des Betriebs). Wirft bei
 * ungültigem oder zu großem Zeitraum.
 */
function resolveRange(input: RangeInput, timeZone: string) {
  const today = localDateKey(new Date(), timeZone);

  if (!input.from && !input.to) {
    const period = isTimePeriod(input.period) ? input.period : "week";
    const anchor = isIsoDate(input.date) ? input.date : today;

    return { ...resolvePeriod(period, anchor), today };
  }

  const { from, to } = input;

  if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
    throw new Error(TIME_TRACKING_ERRORS.invalidRange);
  }

  if (eachIsoDate(from, to).length > MAX_ENTRY_RANGE_DAYS) {
    throw new Error(TIME_TRACKING_ERRORS.invalidRange);
  }

  return { from, to, previous: null, next: null, today };
}

function buildDays(input: {
  from: string;
  to: string;
  entries: TimeEntryView[];
  shifts: ResolvedShift[];
}): Pick<TimeEntriesView, "days" | "totals"> {
  const days: DaySummaryView[] = eachIsoDate(input.from, input.to).map((date) => {
    const entries = input.entries.filter((entry) => entry.date === date);
    const shifts = input.shifts.filter((shift) => shift.date === date).map(toShiftView);

    return {
      date,
      entries,
      shifts,
      workedMinutes: entries.reduce((sum, entry) => sum + entry.workedMinutes, 0),
      breakMinutes: entries.reduce((sum, entry) => sum + entry.breakMinutes, 0),
      plannedMinutes: shifts.reduce((sum, shift) => sum + shift.plannedMinutes, 0),
    };
  });

  return {
    days,
    totals: {
      workedMinutes: days.reduce((sum, day) => sum + day.workedMinutes, 0),
      breakMinutes: days.reduce((sum, day) => sum + day.breakMinutes, 0),
      plannedMinutes: days.reduce((sum, day) => sum + day.plannedMinutes, 0),
      entryCount: input.entries.length,
    },
  };
}

export function rangeBounds(from: string, to: string, timeZone: string) {
  return {
    gte: zonedTimeToUtc(from, "00:00", timeZone),
    lt: zonedTimeToUtc(addDaysToIsoDate(to, 1), "00:00", timeZone),
  };
}

export async function getMyTimeEntries(
  input: { tenantSlug: string } & RangeInput,
): Promise<TimeEntriesView> {
  const context = await resolveMyContext(input.tenantSlug);
  const { timeZone, settings, employeeId } = context;

  if (!settings.enabled) {
    throw new Error(TIME_TRACKING_ERRORS.disabled);
  }

  const range = resolveRange(input, timeZone);
  const now = new Date();
  const [entries, shiftsByEmployee] = await Promise.all([
    prisma.tenantTimeEntry.findMany({
      where: { employeeId, clockInAt: rangeBounds(range.from, range.to, timeZone) },
      include: entryInclude,
      orderBy: { clockInAt: "asc" },
    }),
    loadPublishedShifts(context.access.tenantId, [employeeId], range.from, range.to, timeZone),
  ]);
  const views = entries.map((entry) =>
    toEntryView(entry, { timeZone, autoBreakDeduction: settings.autoBreakDeduction, now }),
  );

  return {
    ...range,
    timeZone,
    autoBreakDeduction: settings.autoBreakDeduction,
    ...buildDays({ ...range, entries: views, shifts: shiftsByEmployee.get(employeeId) ?? [] }),
  };
}

/** Für den Personalakte-Export (Art. 15/20 DSGVO): alle eigenen Einträge. */
export async function getTimeEntriesForEmployeeExport(tenantId: string, employeeId: string) {
  const { timeZone, settings } = await loadTenantContext(tenantId);
  const entries = await prisma.tenantTimeEntry.findMany({
    where: { tenantId, employeeId },
    include: entryInclude,
    orderBy: { clockInAt: "asc" },
  });
  const now = new Date();

  return entries.map((entry) =>
    toEntryView(entry, { timeZone, autoBreakDeduction: settings.autoBreakDeduction, now }),
  );
}

// ---------------------------------------------------------------------------
// Verwaltung
// ---------------------------------------------------------------------------

export type TenantTimeEmployeeSummary = {
  id: string;
  name: string;
  team: string;
  workedMinutes: number;
  plannedMinutes: number;
  entryCount: number;
  isClockedIn: boolean;
  autoClosedCount: number;
};

export type TenantTimeEntriesView = TimeEntriesView & {
  employees: TenantTimeEmployeeSummary[];
  selectedEmployeeId: string | null;
  canWrite: boolean;
  canDelete: boolean;
  timeTrackingEnabled: boolean;
};

export async function scopedEmployeeWhere(access: TenantAccess): Promise<Prisma.TenantEmployeeWhereInput> {
  const scope = await resolveScopeFilter(access);

  if (scope.type === "all") return { tenantId: access.tenantId };
  if (scope.type === "own") return { tenantId: access.tenantId, id: scope.employeeId ?? "__none__" };
  if (scope.type === "team") {
    return { tenantId: access.tenantId, id: { in: scope.teammateIds } };
  }

  // "assigned" wird für diesen Bereich nicht angeboten (supportsAssignedScope: false).
  return { id: "__none__" };
}

export async function getTenantTimeEntries(
  input: { tenantSlug: string; employeeId?: string } & RangeInput,
): Promise<TenantTimeEntriesView> {
  const access = await requireTenantAccess(input.tenantSlug, "timeTracking", "read");
  const { timeZone, settings } = await loadTenantContext(access.tenantId);
  const range = resolveRange(input, timeZone);
  const employees = await prisma.tenantEmployee.findMany({
    where: await scopedEmployeeWhere(access),
    select: { id: true, name: true, team: true, status: true },
    orderBy: { name: "asc" },
  });
  const employeeIds = employees.map((employee) => employee.id);
  const now = new Date();
  const [entries, shiftsByEmployee] = await Promise.all([
    prisma.tenantTimeEntry.findMany({
      where: {
        tenantId: access.tenantId,
        employeeId: { in: employeeIds },
        clockInAt: rangeBounds(range.from, range.to, timeZone),
      },
      include: entryInclude,
      orderBy: { clockInAt: "asc" },
    }),
    loadPublishedShifts(access.tenantId, employeeIds, range.from, range.to, timeZone),
  ]);
  const openEmployeeIds = new Set(
    (
      await prisma.tenantTimeEntry.findMany({
        where: { tenantId: access.tenantId, employeeId: { in: employeeIds }, clockOutAt: null },
        select: { employeeId: true },
      })
    ).map((entry) => entry.employeeId),
  );
  const views = entries.map((entry) =>
    toEntryView(entry, { timeZone, autoBreakDeduction: settings.autoBreakDeduction, now }),
  );
  const selectedEmployeeId =
    input.employeeId && employeeIds.includes(input.employeeId) ? input.employeeId : null;

  // Ausgeschiedene nur, wenn sie im Zeitraum noch Einträge haben (Nachweis).
  const summaries = employees.flatMap((employee) => {
    const own = views.filter((entry) => entry.employeeId === employee.id);
    const shifts = shiftsByEmployee.get(employee.id) ?? [];

    if (employee.status === "former" && own.length === 0) return [];

    return {
      id: employee.id,
      name: employee.name,
      team: employee.team,
      workedMinutes: own.reduce((sum, entry) => sum + entry.workedMinutes, 0),
      plannedMinutes: shifts.reduce((sum, shift) => sum + toShiftView(shift).plannedMinutes, 0),
      entryCount: own.length,
      isClockedIn: openEmployeeIds.has(employee.id),
      autoClosedCount: own.filter((entry) => entry.autoClosed).length,
    } satisfies TenantTimeEmployeeSummary;
  });

  const selectedViews = selectedEmployeeId
    ? views.filter((entry) => entry.employeeId === selectedEmployeeId)
    : views;
  const selectedShifts = selectedEmployeeId
    ? (shiftsByEmployee.get(selectedEmployeeId) ?? [])
    : summaries.flatMap((summary) => shiftsByEmployee.get(summary.id) ?? []);

  return {
    ...range,
    timeZone,
    autoBreakDeduction: settings.autoBreakDeduction,
    ...buildDays({ ...range, entries: selectedViews, shifts: selectedShifts }),
    employees: summaries,
    selectedEmployeeId,
    canWrite: access.permissionLevel === "write" || access.permissionLevel === "admin",
    canDelete: access.canDelete,
    timeTrackingEnabled: settings.enabled,
  };
}

type ManualTimesInput = {
  date: string;
  startTime: string;
  endTime: string | null;
  breakMinutes: number | null;
};

/** Datum + Uhrzeiten (Ortszeit) → Zeitpunkte, mit Plausibilitätsprüfung. Ende ≤ Beginn heißt über Mitternacht. */
function resolveManualTimes(input: ManualTimesInput, timeZone: string) {
  if (
    !isIsoDate(input.date) ||
    !isClockTime(input.startTime) ||
    (input.endTime !== null && !isClockTime(input.endTime))
  ) {
    throw new Error(TIME_TRACKING_ERRORS.invalidTimes);
  }

  const clockInAt = zonedTimeToUtc(input.date, input.startTime, timeZone);
  const clockOutAt = input.endTime
    ? resolveShiftInterval(
        { date: input.date, startTime: input.startTime, endTime: input.endTime },
        timeZone,
      ).endAt
    : null;
  const now = new Date();

  if (clockInAt > now || (clockOutAt && clockOutAt > now)) {
    throw new Error(TIME_TRACKING_ERRORS.inFuture);
  }

  if (clockOutAt && clockOutAt <= clockInAt) {
    throw new Error(TIME_TRACKING_ERRORS.endBeforeStart);
  }

  const durationMinutes = Math.floor(((clockOutAt ?? now).getTime() - clockInAt.getTime()) / 60_000);

  if (durationMinutes > 24 * 60) {
    throw new Error(TIME_TRACKING_ERRORS.tooLong);
  }

  if (
    input.breakMinutes !== null &&
    (!Number.isInteger(input.breakMinutes) || input.breakMinutes < 0 || input.breakMinutes > durationMinutes)
  ) {
    throw new Error(TIME_TRACKING_ERRORS.invalidBreak);
  }

  return { clockInAt, clockOutAt };
}

async function assertNoOverlap(
  tx: Prisma.TransactionClient,
  input: { employeeId: string; clockInAt: Date; clockOutAt: Date | null; excludeId?: string },
) {
  const end = input.clockOutAt ?? new Date(8.64e15);
  const others = await tx.tenantTimeEntry.findMany({
    where: {
      employeeId: input.employeeId,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      clockInAt: { lt: end },
      OR: [{ clockOutAt: null }, { clockOutAt: { gt: input.clockInAt } }],
    },
    select: { id: true },
    take: 1,
  });

  if (others.length > 0) {
    throw new Error(TIME_TRACKING_ERRORS.overlap);
  }

  // Ein Eintrag ohne Ende ist "jetzt eingestempelt" — davon darf es nur einen geben.
  if (!input.clockOutAt) {
    const open = await tx.tenantTimeEntry.findFirst({
      where: {
        employeeId: input.employeeId,
        clockOutAt: null,
        ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      },
      select: { id: true },
    });
    if (open) throw new Error(TIME_TRACKING_ERRORS.overlap);
  }
}

function describeEntryForAudit(
  entry: { clockInAt: Date; clockOutAt: Date | null; breakMinutesOverride: number | null },
  timeZone: string,
) {
  const start = `${localDateKey(entry.clockInAt, timeZone)} ${localTimeKey(entry.clockInAt, timeZone)}`;
  const end = entry.clockOutAt
    ? `${localDateKey(entry.clockOutAt, timeZone)} ${localTimeKey(entry.clockOutAt, timeZone)}`
    : "offen";
  const pause = entry.breakMinutesOverride === null ? "gestempelt" : `${entry.breakMinutesOverride} Min.`;

  return `${start} – ${end}, Pause ${pause}`;
}

function requireWrite(access: TenantAccess) {
  if (access.permissionLevel !== "write" && access.permissionLevel !== "admin") {
    throw new Error("FORBIDDEN");
  }
}

export async function correctTimeEntry(input: {
  tenantSlug: string;
  entryId: string;
  date: string;
  startTime: string;
  endTime: string | null;
  breakMinutes: number | null;
  note: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "timeTracking", "write");
  requireWrite(access);
  const note = input.note.trim().slice(0, 500);

  if (!note) {
    throw new Error(TIME_TRACKING_ERRORS.noteRequired);
  }

  const existing = await prisma.tenantTimeEntry.findFirst({
    where: { id: input.entryId, tenantId: access.tenantId },
  });

  if (!existing) {
    throw new Error(TIME_TRACKING_ERRORS.notFound);
  }

  await assertEmployeeInScope(access, existing.employeeId);
  const { timeZone } = await loadTenantContext(access.tenantId);
  const { clockInAt, clockOutAt } = resolveManualTimes(input, timeZone);

  // Ein bereits abgeschlossener Eintrag darf nicht wieder "geöffnet" werden —
  // das wäre ein nachträgliches Einstempeln im Namen des Mitarbeiters.
  if (!clockOutAt && existing.clockOutAt) {
    throw new Error(TIME_TRACKING_ERRORS.invalidTimes);
  }

  await prisma.$transaction(async (tx) => {
    await lockEmployee(tx, existing.employeeId);
    await assertNoOverlap(tx, {
      employeeId: existing.employeeId,
      clockInAt,
      clockOutAt,
      excludeId: existing.id,
    });

    if (clockOutAt) {
      // Offene Pause beim Schließen mit beenden (wie beim Ausstempeln).
      await tx.tenantTimeBreak.updateMany({
        where: { timeEntryId: existing.id, endAt: null },
        data: { endAt: clockOutAt },
      });
    }

    await tx.tenantTimeEntry.update({
      where: { id: existing.id },
      data: {
        clockInAt,
        clockOutAt,
        breakMinutesOverride: input.breakMinutes,
        note,
        correctedAt: new Date(),
        correctedBy: access.userName,
      },
    });
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Zeiteintrag korrigiert",
    source: "Zeiterfassung",
    entityType: "time-entry",
    entityId: existing.id,
    detail: `Vorher: ${describeEntryForAudit(existing, timeZone)} · Nachher: ${describeEntryForAudit(
      { clockInAt, clockOutAt, breakMinutesOverride: input.breakMinutes },
      timeZone,
    )} · Grund: ${note}`,
  });
}

export async function createManualTimeEntry(input: {
  tenantSlug: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number | null;
  note: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "timeTracking", "write");
  requireWrite(access);
  const note = input.note.trim().slice(0, 500);

  if (!note) {
    throw new Error(TIME_TRACKING_ERRORS.noteRequired);
  }

  const employee = await prisma.tenantEmployee.findFirst({
    where: { id: input.employeeId, tenantId: access.tenantId },
    select: { id: true },
  });

  if (!employee) {
    throw new Error("EMPLOYEE_NOT_FOUND");
  }

  await assertEmployeeInScope(access, employee.id);
  const { timeZone } = await loadTenantContext(access.tenantId);
  const { clockInAt, clockOutAt } = resolveManualTimes(input, timeZone);

  const created = await prisma.$transaction(async (tx) => {
    await lockEmployee(tx, employee.id);
    await assertNoOverlap(tx, { employeeId: employee.id, clockInAt, clockOutAt });

    return tx.tenantTimeEntry.create({
      data: {
        tenantId: access.tenantId,
        employeeId: employee.id,
        clockInAt,
        clockOutAt,
        source: "manual",
        breakMinutesOverride: input.breakMinutes,
        note,
        correctedAt: new Date(),
        correctedBy: access.userName,
      },
    });
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Zeiteintrag nachgetragen",
    source: "Zeiterfassung",
    entityType: "time-entry",
    entityId: created.id,
    detail: `${describeEntryForAudit(created, timeZone)} · Grund: ${note}`,
  });

  return created.id;
}

export async function deleteTimeEntry(input: { tenantSlug: string; entryId: string }) {
  const access = await requireTenantAccess(input.tenantSlug, "timeTracking", "write");

  if (!access.canDelete) {
    throw new Error("FORBIDDEN");
  }

  const existing = await prisma.tenantTimeEntry.findFirst({
    where: { id: input.entryId, tenantId: access.tenantId },
  });

  if (!existing) {
    throw new Error(TIME_TRACKING_ERRORS.notFound);
  }

  await assertEmployeeInScope(access, existing.employeeId);
  const { timeZone } = await loadTenantContext(access.tenantId);

  await prisma.tenantTimeEntry.delete({ where: { id: existing.id } });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Zeiteintrag gelöscht",
    source: "Zeiterfassung",
    entityType: "time-entry",
    entityId: existing.id,
    detail: describeEntryForAudit(existing, timeZone),
  });
}

// ---------------------------------------------------------------------------
// Cron: Erinnerungen + automatisches Ausstempeln
// ---------------------------------------------------------------------------

export type TimeTrackingJobResult = {
  tenants: number;
  autoClosed: number;
  remindersSent: number;
};

/**
 * Wird alle 5 Minuten von app/api/cron/time-tracking aufgerufen. Idempotent:
 * Erinnerungen sind über `TenantTimeClockReminder` (Unique-Key) gegen
 * Doppelversand gesichert, das Ausstempeln über ein bedingtes `updateMany`.
 */
export async function runTimeTrackingJobs(now: Date = new Date()): Promise<TimeTrackingJobResult> {
  const result: TimeTrackingJobResult = { tenants: 0, autoClosed: 0, remindersSent: 0 };
  const rows = await prisma.tenantSettings.findMany({
    where: {
      timeTrackingEnabled: true,
      OR: [{ timeTrackingReminderPush: true }, { timeTrackingAutoClockOut: true }],
    },
    select: {
      ...settingsSelect,
      tenant: { select: { id: true, name: true, timezone: true } },
    },
  });

  for (const row of rows) {
    result.tenants += 1;
    const settings = toSettings(row);
    const tenant = { id: row.tenant.id, name: row.tenant.name, timeZone: safeTimeZone(row.tenant.timezone) };

    try {
      if (settings.autoClockOut) {
        result.autoClosed += await autoCloseForgottenEntries(tenant, settings, now);
      }

      if (settings.reminderPush) {
        result.remindersSent += await sendClockReminders(tenant, settings, now);
      }
    } catch (error) {
      // Ein Mandant darf die übrigen nicht blockieren.
      logger.error("Zeiterfassungs-Cron für Mandant fehlgeschlagen.", {
        tenantId: tenant.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

type CronTenant = { id: string; name: string; timeZone: string };

async function getEmployeeAccounts(employeeIds: string[]) {
  const employees = await prisma.tenantEmployee.findMany({
    where: { id: { in: employeeIds }, userId: { not: null } },
    select: { id: true, userId: true },
  });

  return new Map(employees.map((employee) => [employee.id, employee.userId as string]));
}

async function autoCloseForgottenEntries(
  tenant: CronTenant,
  settings: TimeTrackingSettings,
  now: Date,
): Promise<number> {
  const openEntries = await prisma.tenantTimeEntry.findMany({
    where: { tenantId: tenant.id, clockOutAt: null },
    select: { id: true, employeeId: true, clockInAt: true, plannedEndAt: true },
  });
  const accounts = await getEmployeeAccounts(openEntries.map((entry) => entry.employeeId));
  let closed = 0;

  for (const entry of openEntries) {
    const decision = autoClockOutDecision(entry, settings, now);

    if (!decision) continue;

    const clockOutAt = decision.clockOutAt;
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.tenantTimeEntry.updateMany({
        where: { id: entry.id, clockOutAt: null },
        data: { clockOutAt, autoClosed: true },
      });

      if (result.count === 0) return false;

      // Pausen, die erst nach dem gesetzten Ende begonnen haben, fallen weg;
      // eine noch laufende endet mit dem Eintrag.
      await tx.tenantTimeBreak.deleteMany({
        where: { timeEntryId: entry.id, startAt: { gte: clockOutAt } },
      });
      await tx.tenantTimeBreak.updateMany({
        where: { timeEntryId: entry.id, OR: [{ endAt: null }, { endAt: { gt: clockOutAt } }] },
        data: { endAt: clockOutAt },
      });

      return true;
    });

    if (!updated) continue;

    closed += 1;
    const userId = accounts.get(entry.employeeId);

    if (userId) {
      await dispatchNotification({
        userId,
        email: null,
        tenantId: tenant.id,
        category: "shift",
        channels: ["push", "in-app"],
        entityType: "time-tracking",
        entityId: entry.id,
        message: {
          key: "autoClockedOut",
          tenantName: tenant.name,
          date: localDateKey(clockOutAt, tenant.timeZone),
          time: localTimeKey(clockOutAt, tenant.timeZone),
        },
      });
    }
  }

  return closed;
}

function absenceCoversDate(
  date: string,
  vacations: Array<{ startDate: string; endDate: string }>,
  sickness: Array<{ startDate: Date; endDate: Date | null }>,
) {
  return (
    vacations.some((vacation) => vacation.startDate <= date && date <= vacation.endDate) ||
    sickness.some((report) => {
      const start = report.startDate.toISOString().slice(0, 10);
      const end = report.endDate?.toISOString().slice(0, 10) ?? null;
      return start <= date && (end === null || date <= end);
    })
  );
}

async function sendClockReminders(
  tenant: CronTenant,
  settings: TimeTrackingSettings,
  now: Date,
): Promise<number> {
  const today = localDateKey(now, tenant.timeZone);
  // Gestern mit: Nachtschichten enden heute, gehören aber zum Vortag.
  const shiftsByEmployee = await loadPublishedShifts(
    tenant.id,
    null,
    addDaysToIsoDate(today, -1),
    today,
    tenant.timeZone,
  );
  const employeeIds = [...shiftsByEmployee.keys()];

  if (employeeIds.length === 0) return 0;

  const lookback = new Date(now.getTime() - 2 * 86_400_000);
  const [accounts, openEntries, recentEntries, vacations, sickness] = await Promise.all([
    getEmployeeAccounts(employeeIds),
    prisma.tenantTimeEntry.findMany({
      where: { tenantId: tenant.id, employeeId: { in: employeeIds }, clockOutAt: null },
      select: { employeeId: true, clockInAt: true },
    }),
    prisma.tenantTimeEntry.findMany({
      where: { tenantId: tenant.id, employeeId: { in: employeeIds }, clockInAt: { gte: lookback } },
      select: { employeeId: true, clockInAt: true },
      orderBy: { clockInAt: "desc" },
    }),
    prisma.tenantVacationRequest.findMany({
      where: {
        tenantId: tenant.id,
        employeeId: { in: employeeIds },
        status: "approved",
        endDate: { gte: addDaysToIsoDate(today, -1) },
        startDate: { lte: today },
      },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
    prisma.tenantSicknessReport.findMany({
      where: {
        tenantId: tenant.id,
        employeeId: { in: employeeIds },
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: lookback } }],
      },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
  ]);
  const openByEmployee = new Map(openEntries.map((entry) => [entry.employeeId, entry]));
  const lastClockInByEmployee = new Map<string, Date>();

  for (const entry of recentEntries) {
    if (!lastClockInByEmployee.has(entry.employeeId)) {
      lastClockInByEmployee.set(entry.employeeId, entry.clockInAt);
    }
  }

  let sent = 0;

  for (const [employeeId, shifts] of shiftsByEmployee) {
    const userId = accounts.get(employeeId);

    if (!userId) continue;

    for (const shift of shifts) {
      const reminders = dueReminders({
        shift,
        now,
        leadMinutes: settings.clockInLeadMinutes,
        openEntry: openByEmployee.get(employeeId) ?? null,
        lastClockInAt: lastClockInByEmployee.get(employeeId) ?? null,
      });

      for (const reminder of reminders) {
        if (
          reminder.kind === "clock-in" &&
          absenceCoversDate(
            shift.date,
            vacations.filter((vacation) => vacation.employeeId === employeeId),
            sickness.filter((report) => report.employeeId === employeeId),
          )
        ) {
          continue;
        }

        try {
          await prisma.tenantTimeClockReminder.create({
            data: { tenantId: tenant.id, employeeId, shiftRef: shiftReminderRef(shift), kind: reminder.kind },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            continue;
          }
          throw error;
        }

        await dispatchNotification({
          userId,
          email: null,
          tenantId: tenant.id,
          category: "shift",
          channels: ["push"],
          entityType: "time-tracking",
          entityId: shift.id,
          message:
            reminder.kind === "clock-in"
              ? {
                  key: "clockInReminder",
                  tenantName: tenant.name,
                  startTime: shift.startTime,
                  endTime: shift.endTime,
                }
              : { key: "clockOutReminder", tenantName: tenant.name, endTime: shift.endTime },
        });
        sent += 1;
      }
    }
  }

  return sent;
}

