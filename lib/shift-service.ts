import { auth } from "@/lib/auth";
import { recordTenantAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { type Shift, type ShiftDay } from "@/lib/shifts";
import { headers } from "next/headers";
import {
  requireTenantAccess,
  requireTenantMembership,
  resolveScopeFilter,
} from "@/lib/tenant-access";
import { hasPermissionLevel } from "@/lib/roles";
import {
  parseOpeningHoursDays,
  resolveEffectiveOpeningHours,
  type OpeningHoursDay,
} from "@/lib/opening-hours";
import { parseShiftPresets } from "@/lib/shift-presets";
import {
  parseShiftTemplateEntries,
  type ShiftTemplateEntry,
} from "@/lib/shift-templates";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { exceedsMaxShiftHours, findRestPeriodViolation } from "@/lib/arbzg-rules";
import {
  notifyEmployeeOfShiftPlanPublished,
  notifyShiftPlanManagersOfAbsenceConflict,
} from "@/lib/notifications/events";

export type ShiftEmployeeOption = {
  id: string;
  name: string;
  location: string;
  team: string;
  role: string;
  weeklyHours: string;
};

export type ShiftLocationOption = {
  id: string;
  name: string;
  kind: string;
  accentClassName: string;
  /** Effektive Öffnungszeiten (eigene Angabe, sonst Mandanten-Standard) — für die "geschlossen"-Kennzeichnung bei der Standortauswahl. */
  openingHours: OpeningHoursDay[];
};

const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

function normalizeShiftKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function createUniqueShiftKey(input: {
  tenantId: string;
  date: string;
  startTime: string;
  employeeName?: string;
  excludeShiftId?: string;
}) {
  const keyBase =
    normalizeShiftKey(
      `${input.date}-${input.startTime}-${input.employeeName ?? "offen"}`,
    ) || "schicht";
  let key = keyBase;
  let suffix = 2;

  while (
    await prisma.tenantShift.findFirst({
      where: {
        tenantId: input.tenantId,
        key,
        id: input.excludeShiftId ? { not: input.excludeShiftId } : undefined,
      },
      select: { id: true },
    })
  ) {
    key = `${keyBase}-${suffix}`;
    suffix += 1;
  }

  return key;
}

export function getISOWeekStart(year: number, week: number) {
  const january4 = new Date(Date.UTC(year, 0, 4));
  const january4Day = january4.getUTCDay() || 7;
  const weekStart = new Date(january4);

  weekStart.setUTCDate(january4.getUTCDate() - january4Day + 1 + (week - 1) * 7);

  return weekStart;
}

export function getISOWeekFromDate(date: Date) {
  const utcDate = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = utcDate.getUTCDay() || 7;

  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);

  const year = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((utcDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );

  return { year, week };
}

function formatDateValue(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatDateLabel(date: Date) {
  return `${String(date.getUTCDate()).padStart(2, "0")}.${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

function formatWeekRange(startDate: Date) {
  const endDate = new Date(startDate);

  endDate.setUTCDate(startDate.getUTCDate() + 6);

  return `${formatDateLabel(startDate)}-${formatDateLabel(endDate)}.${endDate.getUTCFullYear()}`;
}

function buildWeekDays(year: number, week: number) {
  const startDate = getISOWeekStart(year, week);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startDate);

    date.setUTCDate(startDate.getUTCDate() + index);

    return {
      id: formatDateValue(date),
      weekday: weekdays[index],
      date: formatDateLabel(date),
      isWeekend: index >= 5,
      shifts: [] as Shift[],
    };
  });
}

function toTimeRange(startTime: string, endTime: string) {
  return `${startTime}-${endTime}`;
}

function hasConflict(input: {
  employeeId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  existing: Array<{
    id: string;
    employeeId: string | null;
    date: string;
    startTime: string;
    endTime: string;
  }>;
}) {
  if (!input.employeeId) {
    return false;
  }

  return input.existing.some((shift) => {
    if (
      shift.employeeId !== input.employeeId ||
      shift.date !== input.date
    ) {
      return false;
    }

    return input.startTime < shift.endTime && input.endTime > shift.startTime;
  });
}

/**
 * Liefert eine Prüffunktion `(employeeId, date) => boolean`, die erkennt, ob
 * der Mitarbeiter an diesem Tag genehmigten Urlaub oder eine offene
 * Krankmeldung hat — genutzt, um Schichten als Konflikt zu markieren, wenn
 * eine Abwesenheit NACH der Schichteinteilung hinzukam (siehe `getShiftPlanForTenant`).
 */
async function buildAbsenceCheck(
  tenantId: string,
  employeeIds: string[],
  rangeStart: string,
  rangeEnd: string,
) {
  const rangeEndDate = new Date(`${rangeEnd}T23:59:59.999Z`);
  const rangeStartDate = new Date(`${rangeStart}T00:00:00.000Z`);

  const [vacations, sicknesses] = await Promise.all([
    prisma.tenantVacationRequest.findMany({
      where: {
        tenantId,
        employeeId: { in: employeeIds },
        status: "approved",
        startDate: { lte: rangeEnd },
        endDate: { gte: rangeStart },
      },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
    prisma.tenantSicknessReport.findMany({
      where: {
        tenantId,
        employeeId: { in: employeeIds },
        status: "open",
        startDate: { lte: rangeEndDate },
        OR: [{ endDate: null }, { endDate: { gte: rangeStartDate } }],
      },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
  ]);

  return (employeeId: string, date: string) => {
    const inVacation = vacations.some(
      (v) => v.employeeId === employeeId && v.startDate <= date && v.endDate >= date,
    );

    if (inVacation) {
      return true;
    }

    const dateValue = new Date(`${date}T00:00:00.000Z`);

    return sicknesses.some(
      (s) =>
        s.employeeId === employeeId &&
        s.startDate <= dateValue &&
        (!s.endDate || s.endDate >= dateValue),
    );
  };
}

async function getSessionUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user?.id ?? null;
}

export async function getTenantIdForShifts(tenantSlug: string) {
  return (await requireTenantAccess(tenantSlug, "shifts", "read")).tenantId;
}

/**
 * Übersetzt den konfigurierten Scope (own/team/all) der "shifts"-
 * Berechtigung in einen zusätzlichen `where`-Filter. "own"/"team" ohne
 * verknüpften eigenen Mitarbeiterdatensatz liefert einen Filter, der nichts
 * trifft — nie stillschweigend auf "alles sehen" zurückfallen.
 */
async function shiftScopeWhere(tenantSlug: string) {
  const access = await requireTenantAccess(tenantSlug, "shifts", "read");
  const scopeFilter = await resolveScopeFilter(access);

  if (scopeFilter.type === "all") {
    return { tenantId: access.tenantId };
  }

  if (scopeFilter.type === "own") {
    return { tenantId: access.tenantId, employeeId: scopeFilter.employeeId ?? "__none__" };
  }

  if (scopeFilter.type === "team") {
    return { tenantId: access.tenantId, employee: { team: scopeFilter.team } };
  }

  // "shifts" unterstützt (bisher) keinen "assigned"-Scope — sollte er
  // dennoch auftreten, nichts treffen statt stillschweigend alles zu zeigen.
  return { tenantId: access.tenantId, employeeId: "__none__" };
}

/**
 * Fehlt die Zeile für (tenantId, year, week), gilt die Woche implizit als
 * Entwurf — es wird keine Zeile pro Woche vorab angelegt, nur beim ersten
 * Veröffentlichen (siehe `publishShiftWeek`).
 */
async function getShiftWeekRecord(tenantId: string, year: number, week: number) {
  return prisma.tenantShiftWeek.findUnique({
    where: { tenantId_year_week: { tenantId, year, week } },
  });
}

/**
 * Vergleichsschlüssel einer Schicht — alles, was eine Änderung ausmacht.
 * Grundlage für "seit dem Veröffentlichen bearbeitet" (Entwurfs-Badge) und
 * damit bewusst unabhängig von `updatedAt`: eine Änderung und ihre Rücknahme
 * ergeben denselben Schlüssel und gelten dann zu Recht nicht als Abweichung.
 */
function shiftComparisonKey(entry: {
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  employeeId?: string | null;
  locationId?: string | null;
  team?: string | null;
  note?: string | null;
}) {
  return [
    entry.date,
    entry.startTime,
    entry.endTime,
    String(entry.breakMinutes),
    entry.employeeId ?? "",
    entry.locationId ?? "",
    entry.team ?? "",
    entry.note ?? "",
  ].join("|");
}

/** Schlüssel der Mitarbeiter-sichtbaren Felder — Rückfallebene für Alt-Schnappschüsse. */
function visibleShiftComparisonKey(entry: {
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  employeeId?: string | null;
  note?: string | null;
}) {
  return [
    entry.date,
    entry.startTime,
    entry.endTime,
    String(entry.breakMinutes),
    entry.employeeId ?? "",
    entry.note ?? "",
  ].join("|");
}

function keysDiffer(live: string[], published: string[]) {
  if (live.length !== published.length) {
    return true;
  }

  const sortedLive = [...live].sort();
  const sortedPublished = [...published].sort();

  return sortedLive.some((key, index) => key !== sortedPublished[index]);
}

/**
 * Weicht der aktuelle Planungsstand einer Woche vom zuletzt veröffentlichten
 * Schnappschuss ab? Nur dann zeigt die UI trotz Status "veröffentlicht" die
 * Entwurfs-Badge und bietet "auf veröffentlichte Version zurücksetzen" an.
 *
 * Schnappschüsse aus der Zeit vor `key`/`locationId`/`team` (siehe
 * `PublishedShiftSnapshotEntry`) enthalten nur die besetzten Schichten und
 * deren sichtbare Felder — dagegen wird entsprechend eingeschränkt
 * verglichen, sonst gälte jede alte Woche sofort als abweichend.
 */
function hasWeekDivergedFromSnapshot(
  liveShifts: Array<{
    date: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    employeeId: string | null;
    locationId: string | null;
    team: string;
    note: string;
  }>,
  snapshot: PublishedShiftSnapshotEntry[],
) {
  const isLegacySnapshot =
    snapshot.length > 0 && snapshot.every((entry) => entry.key === undefined);

  if (isLegacySnapshot) {
    return keysDiffer(
      liveShifts.filter((shift) => shift.employeeId).map(visibleShiftComparisonKey),
      snapshot.map(visibleShiftComparisonKey),
    );
  }

  return keysDiffer(liveShifts.map(shiftComparisonKey), snapshot.map(shiftComparisonKey));
}

/**
 * Mindestbesetzung je Standort: eigener Wert des Standorts, sonst die
 * Unternehmensvorgabe (`TenantSettings.shiftMinStaffing`).
 */
async function getLocationMinStaffing(tenantId: string, tenantMinStaffing: number) {
  const locations = await prisma.tenantLocation.findMany({
    where: { tenantId },
    select: { id: true, shiftMinStaffing: true },
  });

  return Object.fromEntries(
    locations.map((location) => [location.id, location.shiftMinStaffing ?? tenantMinStaffing]),
  ) as Record<string, number>;
}

/**
 * Unterbesetzt wird pro Standort gezählt, nicht mehr pro Tag über alle
 * Standorte hinweg: ein Tag ist unterbesetzt, sobald irgendein Standort an
 * diesem Tag unter seiner eigenen Mindestbesetzung liegt. Schichten ohne
 * Standort laufen weiter gegen die Unternehmensvorgabe.
 */
function isDayUnderstaffed(
  shifts: Shift[],
  tenantMinStaffing: number,
  locationMinStaffing: Record<string, number>,
) {
  const staffedByLocation = new Map<string, number>();

  for (const shift of shifts) {
    if (!shift.employeeId) {
      continue;
    }

    const key = shift.locationId ?? "";

    staffedByLocation.set(key, (staffedByLocation.get(key) ?? 0) + 1);
  }

  if (staffedByLocation.size === 0) {
    return tenantMinStaffing > 0;
  }

  return Array.from(staffedByLocation.entries()).some(([locationId, staffed]) => {
    const required = locationId
      ? locationMinStaffing[locationId] ?? tenantMinStaffing
      : tenantMinStaffing;

    return required > 0 && staffed < required;
  });
}

/**
 * Der veröffentlichte Stand einer Woche in derselben Form, in der
 * getShiftPlanForTenant sonst die Live-Zeilen aus TenantShift verarbeitet —
 * Grundlage der Nur-Lese-Ansicht (siehe dort). Ist die Woche nicht
 * veröffentlicht, gibt es entsprechend nichts zu sehen.
 *
 * Der konfigurierte Scope (own/team) wird hier erneut angewendet: der
 * Schnappschuss enthält die ganze Woche, das where der Live-Abfrage greift
 * für ihn also nicht.
 */
async function publishedShiftRecords(
  tenantId: string,
  access: Awaited<ReturnType<typeof requireTenantAccess>>,
  weekRecord: Awaited<ReturnType<typeof getShiftWeekRecord>>,
) {
  const entries =
    weekRecord?.status === "published"
      ? ((weekRecord.publishedShiftsJson ?? []) as PublishedShiftSnapshotEntry[])
      : [];

  if (!entries.length) {
    return [];
  }

  const scopeFilter = await resolveScopeFilter(access);
  let visible = entries;

  if (scopeFilter.type === "own") {
    visible = entries.filter((entry) => entry.employeeId === scopeFilter.employeeId);
  } else if (scopeFilter.type === "team") {
    const teammates = await prisma.tenantEmployee.findMany({
      where: { tenantId, team: scopeFilter.team },
      select: { id: true },
    });
    const teammateIds = new Set(teammates.map((employee) => employee.id));

    visible = entries.filter((entry) => entry.employeeId && teammateIds.has(entry.employeeId));
  } else if (scopeFilter.type !== "all") {
    // "assigned" kennt der Schichtbereich nicht — nichts zeigen statt alles.
    visible = [];
  }

  const employeeIds = Array.from(
    new Set(visible.map((entry) => entry.employeeId).filter((id): id is string => Boolean(id))),
  );
  const employees = employeeIds.length
    ? await prisma.tenantEmployee.findMany({
        where: { tenantId, id: { in: employeeIds } },
        select: { id: true, name: true, team: true },
      })
    : [];
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

  return visible.map((entry) => {
    const employee = entry.employeeId ? employeeById.get(entry.employeeId) : undefined;

    return {
      id: entry.id,
      key: entry.key ?? entry.id,
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      breakMinutes: entry.breakMinutes,
      employeeId: entry.employeeId,
      locationId: entry.locationId ?? null,
      team: entry.team ?? "",
      note: entry.note,
      conflict: false,
      employee: employee ? { id: employee.id, name: employee.name, team: employee.team } : null,
      location: entry.location
        ? {
            id: entry.locationId ?? "",
            name: entry.location,
            accentClassName: entry.locationAccentClassName ?? "",
          }
        : null,
    };
  });
}

export async function getShiftPlanForTenant(input: {
  tenantSlug: string;
  year: number;
  week: number;
}) {
  const scopeWhere = await shiftScopeWhere(input.tenantSlug);
  const tenantId = scopeWhere.tenantId;

  if (!tenantId) {
    return null;
  }

  const days = buildWeekDays(input.year, input.week);
  const dayIds = days.map((day) => day.id);
  const [liveRecords, settings, weekRecord] = await Promise.all([
    prisma.tenantShift.findMany({
      where: {
        ...scopeWhere,
        date: { in: dayIds },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            team: true,
          },
        },
        location: {
          select: {
            id: true,
            name: true,
            accentClassName: true,
          },
        },
      },
    }),
    prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { shiftMinStaffing: true },
    }),
    getShiftWeekRecord(tenantId, input.year, input.week),
  ]);
  // Ohne Schreibrecht ist der Schichtplan eine reine Ansicht — und dann darf
  // sie nur zeigen, was tatsächlich veröffentlicht ist. Sonst sah ein
  // Mitarbeiter mit "shifts: read" unter "Alle Schichten" den laufenden
  // Entwurf der Planung, während "Meine Schichten"
  // (getMyShiftsForCurrentWeek) längst korrekt nur den veröffentlichten
  // Schnappschuss zeigte.
  const planAccess = await requireTenantAccess(input.tenantSlug, "shifts", "read");
  const canSeeDrafts = hasPermissionLevel(planAccess.permissionLevel, "write");
  const records = canSeeDrafts
    ? liveRecords
    : await publishedShiftRecords(tenantId, planAccess, weekRecord);
  const minStaffing = settings?.shiftMinStaffing ?? 0;
  const locationMinStaffing = await getLocationMinStaffing(tenantId, minStaffing);
  const conflictIds = new Set<string>();
  const employeeIds = Array.from(
    new Set(records.map((record) => record.employeeId).filter((id): id is string => Boolean(id))),
  );
  const isAbsent = employeeIds.length
    ? await buildAbsenceCheck(tenantId, employeeIds, dayIds[0], dayIds[dayIds.length - 1])
    : () => false;

  for (const record of records) {
    if (
      hasConflict({
        employeeId: record.employeeId,
        date: record.date,
        startTime: record.startTime,
        endTime: record.endTime,
        existing: records.filter((item) => item.id !== record.id),
      }) ||
      (record.employeeId && isAbsent(record.employeeId, record.date))
    ) {
      conflictIds.add(record.id);
    }
  }

  const shiftsByDate = new Map<string, Shift[]>();

  for (const record of records) {
    const shift: Shift = {
      id: record.key,
      dbId: record.id,
      key: record.key,
      startTime: record.startTime,
      endTime: record.endTime,
      breakMinutes: record.breakMinutes,
      employeeId: record.employeeId ?? undefined,
      locationId: record.locationId ?? undefined,
      locationAccentClassName: record.location?.accentClassName,
      time: toTimeRange(record.startTime, record.endTime),
      assignee: record.employee?.name,
      location: record.location?.name,
      team: record.team || record.employee?.team || "",
      conflict: record.conflict || conflictIds.has(record.id),
      note: record.note,
    };
    const dateShifts = shiftsByDate.get(record.date) ?? [];

    dateShifts.push(shift);
    shiftsByDate.set(record.date, dateShifts);
  }

  const publishedSnapshot = (weekRecord?.publishedShiftsJson ??
    []) as PublishedShiftSnapshotEntry[];
  const hasUnpublishedChanges =
    weekRecord?.status === "published" &&
    hasWeekDivergedFromSnapshot(
      records.map((record) => ({
        date: record.date,
        startTime: record.startTime,
        endTime: record.endTime,
        breakMinutes: record.breakMinutes,
        employeeId: record.employeeId,
        locationId: record.locationId,
        team: record.team,
        note: record.note,
      })),
      publishedSnapshot,
    );

  return {
    label: `KW ${input.week}`,
    range: formatWeekRange(getISOWeekStart(input.year, input.week)),
    conflictCount: conflictIds.size + records.filter((record) => record.conflict).length,
    minStaffing,
    locationMinStaffing,
    status: weekRecord?.status ?? "draft",
    publishedAt: weekRecord?.publishedAt?.toISOString() ?? null,
    /**
     * Woche ist veröffentlicht, wurde danach aber bearbeitet — die UI zeigt
     * dann trotz Status "veröffentlicht" die Entwurfs-Badge, damit sichtbar
     * ist, dass Mitarbeiter diesen Stand noch nicht sehen.
     */
    hasUnpublishedChanges,
    days: days.map((day) => {
      const dayShifts = shiftsByDate.get(day.id) ?? [];
      const staffedCount = dayShifts.filter((shift) => shift.employeeId).length;

      return {
        ...day,
        shifts: dayShifts,
        staffedCount,
        understaffed: isDayUnderstaffed(dayShifts, minStaffing, locationMinStaffing),
      };
    }) satisfies ShiftDay[],
  };
}

export type MyShift = {
  id: string;
  startTime: string;
  endTime: string;
  time: string;
  location: string;
  locationAccentClassName: string | null;
  note: string;
  breakMinutes: number;
};

export type MyWeekDay = {
  id: string;
  weekday: string;
  date: string;
  isWeekend: boolean;
  shifts: MyShift[];
};

/**
 * Ein einzelner Eintrag im Schnappschuss `TenantShiftWeek.publishedShiftsJson`.
 *
 * Enthält bewusst auch nicht besetzte Schichten (`employeeId: null`) und die
 * Planungsfelder (`key`, `locationId`, `team`) — nur so lässt sich die Woche
 * mit `resetShiftWeekToPublished` wieder exakt auf den veröffentlichten Stand
 * zurücksetzen. `getMyShiftsForCurrentWeek` filtert ohnehin auf die eigene
 * `employeeId` und ignoriert die unbesetzten Einträge dadurch von selbst.
 * Ältere Schnappschüsse (vor dieser Erweiterung) haben die Zusatzfelder
 * nicht; alle Leser behandeln sie deshalb als optional.
 */
type PublishedShiftSnapshotEntry = MyShift & {
  date: string;
  employeeId: string | null;
  key?: string;
  weekday?: string;
  locationId?: string | null;
  team?: string;
};

/**
 * Read-only Variante von `getShiftPlanForTenant` für "Mein Bereich" —
 * bewusst ohne `shifts:read`-Berechtigung (nur `requireTenantMembership`),
 * damit jedes Mitglied seine eigenen Schichten der laufenden Woche sehen
 * kann, unabhängig vom konfigurierten "shifts"-Scope der eigenen Rolle.
 * Liefert nur die eigenen Schichten, kein Bearbeiten — dafür gibt es die
 * reguläre Schichtplanung mit den passenden Berechtigungen.
 *
 * Zeigt bewusst NICHT die live bearbeiteten `TenantShift`-Zeilen, sondern den
 * Schnappschuss der letzten Veröffentlichung (`TenantShiftWeek.publishedShiftsJson`,
 * befüllt in `publishShiftWeek`): Änderungen an einer bereits veröffentlichten
 * Woche werden für Mitarbeiter erst mit dem nächsten Veröffentlichen sichtbar,
 * nicht sofort beim Speichern in der Planung. Wurde die Woche noch nie
 * veröffentlicht, gibt es entsprechend noch keine sichtbaren Schichten.
 */
export async function getMyShiftsForCurrentWeek(
  tenantSlug: string,
  weekOverride?: { year: number; week: number },
): Promise<{
  label: string;
  range: string;
  days: MyWeekDay[];
} | null> {
  const access = await requireTenantMembership(tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true },
  });

  if (!employee) {
    return null;
  }

  const { year, week } = weekOverride ?? getISOWeekFromDate(new Date());
  const days = buildWeekDays(year, week);

  const weekRecord = await prisma.tenantShiftWeek.findUnique({
    where: { tenantId_year_week: { tenantId: access.tenantId, year, week } },
    select: { status: true, publishedShiftsJson: true },
  });

  const snapshot =
    weekRecord?.status === "published"
      ? ((weekRecord.publishedShiftsJson ?? []) as PublishedShiftSnapshotEntry[])
      : [];
  const shiftsByDate = new Map<string, MyShift[]>();

  for (const entry of snapshot) {
    if (entry.employeeId !== employee.id) {
      continue;
    }

    const dateShifts = shiftsByDate.get(entry.date) ?? [];

    dateShifts.push({
      id: entry.id,
      startTime: entry.startTime,
      endTime: entry.endTime,
      time: entry.time,
      location: entry.location,
      locationAccentClassName: entry.locationAccentClassName,
      note: entry.note,
      breakMinutes: entry.breakMinutes,
    });
    shiftsByDate.set(entry.date, dateShifts);
  }

  return {
    label: `KW ${week}`,
    range: formatWeekRange(getISOWeekStart(year, week)),
    days: days.map((day) => ({
      id: day.id,
      weekday: day.weekday,
      date: day.date,
      isWeekend: day.isWeekend,
      shifts: shiftsByDate.get(day.id) ?? [],
    })),
  };
}

export async function getShiftFormOptions(tenantSlug: string) {
  const tenantId = await getTenantIdForShifts(tenantSlug);

  if (!tenantId) {
    return null;
  }

  const [employees, locationRecords, tenantDefaultOpeningHours] = await Promise.all([
    prisma.tenantEmployee.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        location: true,
        team: true,
        role: true,
        weeklyHours: true,
      },
    }),
    prisma.tenantLocation.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        kind: true,
        accentClassName: true,
        openingHoursJson: true,
      },
    }),
    getDefaultOpeningHours(tenantSlug),
  ]);

  const locations: ShiftLocationOption[] = locationRecords.map((location) => ({
    id: location.id,
    name: location.name,
    kind: location.kind,
    accentClassName: location.accentClassName,
    openingHours: resolveEffectiveOpeningHours(
      parseOpeningHoursDays(location.openingHoursJson),
      tenantDefaultOpeningHours,
    ),
  }));

  return {
    employees: employees satisfies ShiftEmployeeOption[],
    locations,
  };
}

/**
 * Planungseinstellungen für die Schichtansicht. Bewusst über die
 * shifts-Berechtigung geladen (nicht settings), damit auch Planende ohne
 * Einstellungs-Rechte ihre Standardschichten sehen.
 */
export async function getShiftPlanningSettings(tenantSlug: string) {
  const tenantId = await getTenantIdForShifts(tenantSlug);
  const settings = tenantId
    ? await prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: {
          weekStart: true,
          shiftMinStaffing: true,
          shiftBreakRule: true,
          shiftPresetsJson: true,
          defaultOpeningHoursJson: true,
        },
      })
    : null;

  return {
    weekStart: settings?.weekStart ?? "monday",
    minStaffing: settings?.shiftMinStaffing ?? 3,
    breakRule: settings?.shiftBreakRule ?? "30-6",
    presets: parseShiftPresets(settings?.shiftPresetsJson ?? []),
    defaultOpeningHours: parseOpeningHoursDays(settings?.defaultOpeningHoursJson ?? []),
  };
}

/** Tenant-Standard-Öffnungszeiten — für die Übersicht ("Schichtlage") ohne die volle Planungseinstellungen-Auswahl. */
export async function getDefaultOpeningHours(tenantSlug: string) {
  const tenantId = await getTenantIdForShifts(tenantSlug);
  const settings = tenantId
    ? await prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { defaultOpeningHoursJson: true },
      })
    : null;

  return parseOpeningHoursDays(settings?.defaultOpeningHoursJson ?? []);
}

export async function requireShiftManager(tenantSlug: string) {
  await requireTenantAccess(tenantSlug, "shifts", "write");
  const userId = await getSessionUserId();

  if (!userId) {
    throw new Error("Nicht angemeldet.");
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId,
      tenant: { slug: tenantSlug },
    },
    select: {
      role: true,
      tenant: { select: { id: true } },
      roleRef: {
        select: {
          permissions: {
            where: { area: "shifts" },
            select: { level: true },
          },
        },
      },
    },
  });

  if (!membership) {
    throw new Error("Keine Berechtigung für diesen Mandanten.");
  }

  const role = membership.role;
  const permission = membership.roleRef?.permissions[0]?.level ?? "none";

  if (
    role === "OWNER" ||
    role === "ADMIN" ||
    role === "HR" ||
    permission === "write" ||
    permission === "admin"
  ) {
    return {
      tenantId: membership.tenant.id,
      userId,
    };
  }

  throw new Error("Keine Berechtigung zum Bearbeiten von Schichten.");
}

/** `requireShiftManager` liefert keinen Namen — hier für Audit-Einträge separat nachgeladen. */
async function getActorName() {
  const session = await auth.api.getSession({ headers: await headers() });

  return session?.user?.name || session?.user?.email || "System";
}

/** Alle Mitglieder mit Schichtplan-Admin-Recht (gleiche Regel wie `requireShiftManager`) — für Konflikt-Benachrichtigungen. */
async function getShiftPlanManagers(tenantId: string) {
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId },
    select: {
      userId: true,
      role: true,
      user: { select: { email: true } },
      roleRef: {
        select: {
          permissions: {
            where: { area: "shifts" },
            select: { level: true },
          },
        },
      },
    },
  });

  return memberships
    .filter((membership) => {
      const permission = membership.roleRef?.permissions[0]?.level ?? "none";

      return (
        membership.role === "OWNER" ||
        membership.role === "ADMIN" ||
        membership.role === "HR" ||
        permission === "write" ||
        permission === "admin"
      );
    })
    .map((membership) => ({ userId: membership.userId, email: membership.user.email }));
}

/** Alle (Jahr/Woche)-Paare, die der Zeitraum [startDate, endDate] berührt. */
function isoWeeksInRange(startDate: string, endDate: string) {
  const weeks = new Map<string, { year: number; week: number }>();
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  while (cursor <= end) {
    const { year, week } = getISOWeekFromDate(cursor);

    weeks.set(`${year}-${week}`, { year, week });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  const { year: endYear, week: endWeek } = getISOWeekFromDate(end);

  weeks.set(`${endYear}-${endWeek}`, { year: endYear, week: endWeek });

  return Array.from(weeks.values());
}

/**
 * Prüft, ob ein Mitarbeiter im angegebenen Zeitraum bereits veröffentlichte
 * Schichten hat, und benachrichtigt ggf. alle mit Schichtplan-Admin-Recht.
 * Aufgerufen, wenn nachträglich — also NACH einer Veröffentlichung — Urlaub
 * genehmigt wird (`setTenantVacationRequestStatus`) oder eine Krankmeldung
 * erfasst wird (`createTenantSicknessReport`/`createMySicknessReport`).
 * `endDate: null` steht für eine noch offene Krankmeldung ohne Enddatum —
 * dann zählt jede veröffentlichte Schicht ab `startDate` als Konflikt.
 */
export async function notifyIfAbsenceConflictsWithPublishedShifts(input: {
  tenantId: string;
  tenantName: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string | null;
  reason: "vacation" | "sickness";
}) {
  const weeks = isoWeeksInRange(input.startDate, input.endDate ?? input.startDate);

  if (weeks.length === 0) {
    return;
  }

  const weekRecords = await prisma.tenantShiftWeek.findMany({
    where: {
      tenantId: input.tenantId,
      status: "published",
      OR: weeks.map(({ year, week }) => ({ year, week })),
    },
    select: { publishedShiftsJson: true },
  });

  const conflicting = weekRecords.some((record) => {
    const entries = (record.publishedShiftsJson ?? []) as Array<{
      employeeId: string;
      date: string;
    }>;

    return entries.some(
      (entry) =>
        entry.employeeId === input.employeeId &&
        entry.date >= input.startDate &&
        (!input.endDate || entry.date <= input.endDate),
    );
  });

  if (!conflicting) {
    return;
  }

  const managers = await getShiftPlanManagers(input.tenantId);

  await notifyShiftPlanManagersOfAbsenceConflict({
    tenantId: input.tenantId,
    tenantName: input.tenantName,
    employeeName: input.employeeName,
    reason: input.reason,
    startDate: input.startDate,
    endDate: input.endDate,
    managers,
  });
}

function shiftDateBy(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Ruhezeit (§5 ArbZG) und Höchstarbeitszeit je Schicht (§3 ArbZG) gegen die
 * Mandanten-Einstellungen (`TenantSettings.minRestHours`/`maxShiftHours`,
 * Default 11h/10h) prüfen. Wirft bei Verstoß, passend zum bestehenden
 * Fehlerverhalten von createTenantShift/updateTenantShift (Server Actions
 * lassen den Fehler bis zum Error Boundary durchreichen).
 */
async function assertArbzgCompliant(input: {
  tenantId: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  excludeShiftId?: string;
}) {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: input.tenantId },
    select: { minRestHours: true, maxShiftHours: true },
  });
  const minRestHours = settings?.minRestHours ?? 11;
  const maxShiftHours = settings?.maxShiftHours ?? 10;
  const candidate = { date: input.date, startTime: input.startTime, endTime: input.endTime };

  if (exceedsMaxShiftHours(candidate, maxShiftHours)) {
    throw new Error(
      `Schicht überschreitet die Höchstarbeitszeit von ${maxShiftHours}h (§3 ArbZG).`,
    );
  }

  // ±2 Kalendertage reichen: eine Ruhezeit-Unterschreitung kann nur
  // zwischen unmittelbar angrenzenden Schichten auftreten.
  const neighborShifts = await prisma.tenantShift.findMany({
    where: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      date: { gte: shiftDateBy(input.date, -2), lte: shiftDateBy(input.date, 2) },
      id: input.excludeShiftId ? { not: input.excludeShiftId } : undefined,
    },
    select: { date: true, startTime: true, endTime: true },
  });

  const violation = findRestPeriodViolation(neighborShifts, candidate, minRestHours);

  if (violation) {
    throw new Error(
      `Ruhezeit unterschritten: nur ${violation.restHours.toFixed(1)}h Abstand zur Schicht am ${violation.neighborDate} ` +
        `(§5 ArbZG verlangt mind. ${minRestHours}h).`,
    );
  }
}

export async function createTenantShift(input: {
  tenantSlug: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  employeeId?: string;
  locationId?: string;
  team?: string;
  note?: string;
}) {
  const access = await requireShiftManager(input.tenantSlug);
  const employee = input.employeeId
    ? await prisma.tenantEmployee.findFirst({
        where: { id: input.employeeId, tenantId: access.tenantId },
        select: { id: true, name: true, team: true },
      })
    : null;
  const key = await createUniqueShiftKey({
    tenantId: access.tenantId,
    date: input.date,
    startTime: input.startTime,
    employeeName: employee?.name,
  });

  if (input.locationId) {
    const location = await prisma.tenantLocation.findFirst({
      where: { id: input.locationId, tenantId: access.tenantId },
      select: { id: true },
    });

    if (!location) {
      throw new Error("Standort nicht gefunden.");
    }
  }

  if (employee) {
    await assertArbzgCompliant({
      tenantId: access.tenantId,
      employeeId: employee.id,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
    });
  }

  const created = await prisma.tenantShift.create({
    data: {
      tenantId: access.tenantId,
      key,
      date: input.date,
      weekday:
        weekdays[(new Date(`${input.date}T00:00:00Z`).getUTCDay() || 7) - 1],
      startTime: input.startTime,
      endTime: input.endTime,
      breakMinutes: input.breakMinutes,
      employeeId: employee?.id,
      locationId: input.locationId || null,
      team: input.team?.trim() || employee?.team || "",
      note: input.note?.trim() || "",
    },
  });

  // Löst bewusst nie selbst eine Benachrichtigung aus — weder im Entwurf
  // (sammelt sich bis zur Veröffentlichung) noch an einer bereits
  // veröffentlichten Woche. Für Letztere verschickt erst ein erneutes
  // `publishShiftWeek` wieder eine Mail, und auch dann nur an Mitarbeiter,
  // für die sich seit der letzten Veröffentlichung tatsächlich etwas
  // geändert hat (siehe dort). Die Schicht selbst ist im Self-Service
  // (`getMyShiftsForCurrentWeek`) unabhängig davon sofort sichtbar — nur der
  // Mail-Versand wartet auf die (erneute) Veröffentlichung.
  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: await getActorName(),
    action: "Schicht angelegt",
    source: "Schichtplanung",
    entityType: "shift",
    entityId: created.id,
    detail: `${employee?.name ?? "Unbesetzt"} · ${input.date} ${input.startTime}–${input.endTime}`,
  });

  return created;
}

export async function updateTenantShift(input: {
  tenantSlug: string;
  shiftId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  employeeId?: string;
  locationId?: string;
  team?: string;
  note?: string;
}) {
  const access = await requireShiftManager(input.tenantSlug);
  const current = await prisma.tenantShift.findFirst({
    where: { id: input.shiftId, tenantId: access.tenantId },
    select: { id: true },
  });

  if (!current) {
    throw new Error("Schicht nicht gefunden.");
  }

  const employee = input.employeeId
    ? await prisma.tenantEmployee.findFirst({
        where: { id: input.employeeId, tenantId: access.tenantId },
        select: { id: true, name: true, team: true },
      })
    : null;
  const key = await createUniqueShiftKey({
    tenantId: access.tenantId,
    date: input.date,
    startTime: input.startTime,
    employeeName: employee?.name,
    excludeShiftId: input.shiftId,
  });

  if (employee) {
    await assertArbzgCompliant({
      tenantId: access.tenantId,
      employeeId: employee.id,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      excludeShiftId: input.shiftId,
    });
  }

  // Löst bewusst nie selbst eine Benachrichtigung aus, siehe createTenantShift.
  await prisma.tenantShift.update({
    where: { id: input.shiftId },
    data: {
      key,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      breakMinutes: input.breakMinutes,
      employeeId: employee?.id ?? null,
      locationId: input.locationId || null,
      team: input.team?.trim() || employee?.team || "",
      note: input.note?.trim() || "",
    },
  });
}

export async function deleteTenantShift(input: {
  tenantSlug: string;
  shiftId: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "shifts", "read");

  if (!access.canDelete) {
    throw new Error("FORBIDDEN");
  }

  const current = await prisma.tenantShift.findFirst({
    where: { id: input.shiftId, tenantId: access.tenantId },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      employee: { select: { name: true } },
    },
  });

  if (!current) {
    throw new Error("Schicht nicht gefunden.");
  }

  // Löst bewusst nie selbst eine Benachrichtigung aus, siehe createTenantShift.
  await prisma.tenantShift.delete({
    where: { id: input.shiftId },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Schicht gelöscht",
    source: "Schichtplanung",
    entityType: "shift",
    entityId: current.id,
    detail: `${current.employee?.name ?? "Unbesetzt"} · ${current.date} ${current.startTime}–${current.endTime}`,
  });
}

/**
 * Veröffentlicht die Schichtplanung einer Woche: markiert sie als
 * "published" (Bearbeitung davor gilt immer als Entwurf, siehe
 * `isShiftWeekPublished`) und verschickt pro betroffenem Mitarbeiter genau
 * eine Sammel-Mail mit allen seinen aktuellen Schichten der Woche — statt
 * einer Einzel-Mail pro Schicht, wie es beim reinen Anlegen/Ändern der Fall
 * wäre (die selbst nie benachrichtigen, siehe `createTenantShift`).
 *
 * Beim allerersten Veröffentlichen bekommt jeder eingeteilte Mitarbeiter
 * diese Mail. Bei jedem weiteren ("erneuten") Veröffentlichen nur die
 * Mitarbeiter, für die sich seit der letzten Veröffentlichung tatsächlich
 * etwas geändert hat (erkannt über `employeeShiftCountsJson`) — sonst bekäme
 * jeder bei jedem erneuten Klick auf "Veröffentlichen" wieder eine Mail,
 * auch wenn nur eine einzige andere Schicht betroffen war.
 */
export async function publishShiftWeek(input: {
  tenantSlug: string;
  year: number;
  week: number;
}) {
  const access = await requireShiftManager(input.tenantSlug);
  const days = buildWeekDays(input.year, input.week);
  const dayIds = days.map((day) => day.id);

  const [tenant, existingWeek, records] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: access.tenantId },
      select: { name: true },
    }),
    prisma.tenantShiftWeek.findUnique({
      where: {
        tenantId_year_week: { tenantId: access.tenantId, year: input.year, week: input.week },
      },
      select: { status: true, publishedAt: true, employeeShiftCountsJson: true },
    }),
    // Auch unbesetzte Schichten: der Schnappschuss ist zugleich die Vorlage
    // fuer "Auf veroeffentlichte Version zuruecksetzen".
    prisma.tenantShift.findMany({
      where: {
        tenantId: access.tenantId,
        date: { in: dayIds },
      },
      select: {
        id: true,
        key: true,
        employeeId: true,
        locationId: true,
        team: true,
        weekday: true,
        date: true,
        startTime: true,
        endTime: true,
        breakMinutes: true,
        note: true,
        updatedAt: true,
        location: { select: { name: true, accentClassName: true } },
      },
    }),
  ]);

  const wasPublished = existingWeek?.status === "published";
  const previousPublishedAt = existingWeek?.publishedAt ?? null;
  const previousCounts = (existingWeek?.employeeShiftCountsJson ?? {}) as Record<string, number>;

  const shiftsByEmployee = new Map<
    string,
    Array<{ date: string; startTime: string; endTime: string; updatedAt: Date }>
  >();
  const publishedSnapshot: PublishedShiftSnapshotEntry[] = [];

  for (const record of records) {
    if (record.employeeId) {
      const list = shiftsByEmployee.get(record.employeeId) ?? [];

      list.push({
        date: record.date,
        startTime: record.startTime,
        endTime: record.endTime,
        updatedAt: record.updatedAt,
      });
      shiftsByEmployee.set(record.employeeId, list);
    }

    publishedSnapshot.push({
      id: record.id,
      key: record.key,
      employeeId: record.employeeId,
      locationId: record.locationId,
      team: record.team,
      weekday: record.weekday,
      date: record.date,
      startTime: record.startTime,
      endTime: record.endTime,
      time: toTimeRange(record.startTime, record.endTime),
      location: record.location?.name ?? "",
      locationAccentClassName: record.location?.accentClassName ?? null,
      note: record.note,
      breakMinutes: record.breakMinutes,
    });
  }

  const currentCounts = Object.fromEntries(
    Array.from(shiftsByEmployee.entries()).map(([employeeId, shifts]) => [employeeId, shifts.length]),
  );

  const weekRecord = await prisma.tenantShiftWeek.upsert({
    where: {
      tenantId_year_week: { tenantId: access.tenantId, year: input.year, week: input.week },
    },
    create: {
      tenantId: access.tenantId,
      year: input.year,
      week: input.week,
      status: "published",
      publishedAt: new Date(),
      publishedBy: access.userId,
      employeeShiftCountsJson: currentCounts,
      publishedShiftsJson: publishedSnapshot,
    },
    update: {
      status: "published",
      publishedAt: new Date(),
      publishedBy: access.userId,
      employeeShiftCountsJson: currentCounts,
      publishedShiftsJson: publishedSnapshot,
    },
  });

  const weekRange = formatWeekRange(getISOWeekStart(input.year, input.week));

  // Beim allerersten Veröffentlichen einer Woche bekommt jeder eingeteilte
  // Mitarbeiter die Sammel-Mail. Bei einem erneuten Veröffentlichen (Woche
  // war schon veröffentlicht) nur die Mitarbeiter, für die sich seit der
  // letzten Veröffentlichung tatsächlich etwas geändert hat — erkannt daran,
  // dass sich ihre Schichtanzahl unterscheidet (Schicht hinzugekommen/
  // entfernt) oder mindestens eine ihrer Schichten seither bearbeitet wurde.
  // Einzelne Schicht-Anlagen/-Änderungen an einer bereits veröffentlichten
  // Woche verschicken selbst keine Mail mehr (siehe createTenantShift/
  // updateTenantShift/deleteTenantShift) — sonst bekäme der Mitarbeiter erst
  // bei jeder Einzeländerung und dann hier nochmal eine Mail.
  const employeeIdsToNotify = wasPublished
    ? new Set(
        Array.from(new Set([...Object.keys(previousCounts), ...Object.keys(currentCounts)])).filter(
          (employeeId) => {
            const previousCount = previousCounts[employeeId] ?? 0;
            const nextCount = currentCounts[employeeId] ?? 0;

            if (previousCount !== nextCount) {
              return true;
            }

            if (nextCount === 0) {
              return false;
            }

            const shifts = shiftsByEmployee.get(employeeId) ?? [];

            return previousPublishedAt
              ? shifts.some((shift) => shift.updatedAt > previousPublishedAt)
              : true;
          },
        ),
      )
    : new Set(shiftsByEmployee.keys());

  await Promise.all(
    Array.from(employeeIdsToNotify).map((employeeId) =>
      notifyEmployeeOfShiftPlanPublished({
        tenantId: access.tenantId,
        tenantName: tenant?.name ?? "",
        employeeId,
        year: input.year,
        week: input.week,
        weekRange,
        shifts: shiftsByEmployee.get(employeeId) ?? [],
      }),
    ),
  );

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: await getActorName(),
    action: "Schichtplan veröffentlicht",
    source: "Schichtplanung",
    entityType: "shift-week",
    entityId: weekRecord.id,
    detail: `KW ${input.week}/${input.year} · ${weekRange} · ${employeeIdsToNotify.size} benachrichtigt`,
  });

  return {
    status: weekRecord.status,
    publishedAt: weekRecord.publishedAt?.toISOString() ?? null,
    notified: employeeIdsToNotify.size,
  };
}

/**
 * Setzt eine veröffentlichte Woche zurück auf Entwurf — z. B. um größere
 * Nachbesserungen vorzunehmen. Verschickt bewusst keine Mail: "zurück auf
 * Entwurf" ist eine interne Planungsaktion, kein für Mitarbeiter sichtbares
 * Ereignis. `employeeShiftCountsJson` bleibt unverändert stehen (der Stand
 * der letzten echten Veröffentlichung) — die nächste Veröffentlichung
 * vergleicht dagegen und benachrichtigt nur, für wen sich seitdem wirklich
 * etwas geändert hat (siehe `publishShiftWeek`).
 */
export async function unpublishShiftWeek(input: {
  tenantSlug: string;
  year: number;
  week: number;
}) {
  const access = await requireShiftManager(input.tenantSlug);

  const weekRecord = await prisma.tenantShiftWeek.upsert({
    where: {
      tenantId_year_week: { tenantId: access.tenantId, year: input.year, week: input.week },
    },
    create: {
      tenantId: access.tenantId,
      year: input.year,
      week: input.week,
      status: "draft",
    },
    update: {
      status: "draft",
    },
  });

  return {
    status: weekRecord.status,
    publishedAt: weekRecord.publishedAt?.toISOString() ?? null,
  };
}

/**
 * Verwirft alle Änderungen seit dem letzten Veröffentlichen und stellt die
 * Woche exakt so wieder her, wie Mitarbeiter sie aktuell sehen
 * (`TenantShiftWeek.publishedShiftsJson`).
 *
 * Bewusst destruktiv und nur über eine Bestätigung in der UI erreichbar: die
 * Live-Zeilen der Woche werden gelöscht und aus dem Schnappschuss neu
 * angelegt. Verschickt keine Benachrichtigung — für Mitarbeiter ändert sich
 * nichts, sie sahen ohnehin nur den Schnappschuss.
 *
 * Alt-Schnappschüsse ohne `key` (siehe `PublishedShiftSnapshotEntry`)
 * enthalten nur besetzte Schichten; ein Zurücksetzen darauf würde unbesetzte
 * Schichten stillschweigend verlieren — deshalb wird es dort abgelehnt statt
 * geraten.
 */
export async function resetShiftWeekToPublished(input: {
  tenantSlug: string;
  year: number;
  week: number;
}) {
  const access = await requireShiftManager(input.tenantSlug);
  const days = buildWeekDays(input.year, input.week);
  const dayIds = days.map((day) => day.id);
  const weekdayByDate = new Map(days.map((day, index) => [day.id, weekdays[index]]));

  const weekRecord = await prisma.tenantShiftWeek.findUnique({
    where: {
      tenantId_year_week: { tenantId: access.tenantId, year: input.year, week: input.week },
    },
    select: { status: true, publishedShiftsJson: true },
  });

  if (weekRecord?.status !== "published") {
    throw new Error("Diese Woche wurde noch nicht veröffentlicht.");
  }

  const snapshot = (weekRecord.publishedShiftsJson ?? []) as PublishedShiftSnapshotEntry[];

  if (snapshot.length > 0 && snapshot.every((entry) => entry.key === undefined)) {
    throw new Error(
      "Der veröffentlichte Stand dieser Woche stammt aus einer älteren Version und lässt sich nicht vollständig wiederherstellen. Bitte einmal neu veröffentlichen.",
    );
  }

  const locationIds = Array.from(
    new Set(snapshot.map((entry) => entry.locationId).filter((id): id is string => Boolean(id))),
  );
  const employeeIds = Array.from(
    new Set(snapshot.map((entry) => entry.employeeId).filter((id): id is string => Boolean(id))),
  );
  const [existingLocations, existingEmployees] = await Promise.all([
    locationIds.length
      ? prisma.tenantLocation.findMany({
          where: { tenantId: access.tenantId, id: { in: locationIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    employeeIds.length
      ? prisma.tenantEmployee.findMany({
          where: { tenantId: access.tenantId, id: { in: employeeIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);
  // Zwischenzeitlich gelöschte Standorte/Mitarbeiter würden den Insert mit
  // einem Fremdschlüsselfehler abbrechen — die Schicht kommt dann ohne die
  // verlorene Zuordnung zurück, statt das ganze Zurücksetzen scheitern zu
  // lassen.
  const knownLocationIds = new Set(existingLocations.map((location) => location.id));
  const knownEmployeeIds = new Set(existingEmployees.map((employee) => employee.id));

  await prisma.$transaction([
    prisma.tenantShift.deleteMany({
      where: { tenantId: access.tenantId, date: { in: dayIds } },
    }),
    ...snapshot.map((entry, index) =>
      prisma.tenantShift.create({
        data: {
          tenantId: access.tenantId,
          key: entry.key ?? `${entry.date}-${index}`,
          date: entry.date,
          weekday:
            weekdayByDate.get(entry.date) ??
            weekdays[(new Date(`${entry.date}T00:00:00Z`).getUTCDay() || 7) - 1],
          startTime: entry.startTime,
          endTime: entry.endTime,
          breakMinutes: entry.breakMinutes,
          team: entry.team ?? "",
          note: entry.note,
          employeeId:
            entry.employeeId && knownEmployeeIds.has(entry.employeeId)
              ? entry.employeeId
              : null,
          locationId:
            entry.locationId && knownLocationIds.has(entry.locationId)
              ? entry.locationId
              : null,
        },
      }),
    ),
  ]);

  return { restored: snapshot.length };
}

export async function getShiftTemplatesForTenant(tenantSlug: string) {
  const tenantId = await getTenantIdForShifts(tenantSlug);

  if (!tenantId) {
    return null;
  }

  const templates = await prisma.tenantShiftTemplate.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
  });

  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    entries: parseShiftTemplateEntries(template.entriesJson),
  }));
}

/** Speichert die aktuell angezeigte Woche als wiederverwendbare Wochenvorlage (ohne Mitarbeiterzuordnung). */
export async function saveShiftTemplateFromWeek(input: {
  tenantSlug: string;
  year: number;
  week: number;
  name: string;
}) {
  const access = await requireShiftManager(input.tenantSlug);
  const name = input.name.trim();

  if (!name) {
    throw new Error("Bitte einen Namen für die Vorlage angeben.");
  }

  const days = buildWeekDays(input.year, input.week);
  const dayIds = days.map((day) => day.id);
  const records = await prisma.tenantShift.findMany({
    where: { tenantId: access.tenantId, date: { in: dayIds } },
    select: {
      weekday: true,
      startTime: true,
      endTime: true,
      breakMinutes: true,
      team: true,
      locationId: true,
    },
  });

  if (records.length === 0) {
    throw new Error(
      "Diese Woche enthält keine Schichten, aus denen eine Vorlage erstellt werden kann.",
    );
  }

  const entries: ShiftTemplateEntry[] = records.map((record) => ({
    weekday: record.weekday,
    startTime: record.startTime,
    endTime: record.endTime,
    breakMinutes: record.breakMinutes,
    team: record.team,
    locationId: record.locationId ?? "",
  }));

  const template = await prisma.tenantShiftTemplate
    .create({
      data: {
        tenantId: access.tenantId,
        name,
        entriesJson: entries,
      },
    })
    .catch((error: unknown) => {
      if (isUniqueConstraintError(error, "name")) {
        throw new Error(`Es gibt bereits eine Vorlage namens "${name}".`);
      }

      throw error;
    });

  return template;
}

/**
 * Bearbeitet eine gespeicherte Vorlage direkt — Name und einzelne
 * Schicht-Einträge, ohne über eine reale Woche zu gehen. Ergänzt
 * `saveShiftTemplateFromWeek` (Anlegen aus der aktuellen Woche) um ein
 * eigenständiges Bearbeiten bestehender Vorlagen.
 */
export async function updateShiftTemplate(input: {
  tenantSlug: string;
  templateId: string;
  name: string;
  entries: ShiftTemplateEntry[];
}) {
  const access = await requireShiftManager(input.tenantSlug);
  const name = input.name.trim();

  if (!name) {
    throw new Error("Bitte einen Namen für die Vorlage angeben.");
  }

  const current = await prisma.tenantShiftTemplate.findFirst({
    where: { id: input.templateId, tenantId: access.tenantId },
    select: { id: true },
  });

  if (!current) {
    throw new Error("Vorlage nicht gefunden.");
  }

  const entries = parseShiftTemplateEntries(input.entries);
  const locationIds = Array.from(
    new Set(entries.map((entry) => entry.locationId).filter(Boolean)),
  );

  if (locationIds.length > 0) {
    const knownLocations = await prisma.tenantLocation.findMany({
      where: { id: { in: locationIds }, tenantId: access.tenantId },
      select: { id: true },
    });
    const knownIds = new Set(knownLocations.map((location) => location.id));
    const unknownLocation = locationIds.some((id) => !knownIds.has(id));

    if (unknownLocation) {
      throw new Error("Mindestens ein Standort in der Vorlage wurde nicht gefunden.");
    }
  }

  return prisma.tenantShiftTemplate
    .update({
      where: { id: input.templateId },
      data: { name, entriesJson: entries },
    })
    .catch((error: unknown) => {
      if (isUniqueConstraintError(error, "name")) {
        throw new Error(`Es gibt bereits eine Vorlage namens "${name}".`);
      }

      throw error;
    });
}

/** Legt für jeden Eintrag der Vorlage eine neue (unbesetzte) Schicht in der Zielwoche an. */
export async function applyShiftTemplateToWeek(input: {
  tenantSlug: string;
  templateId: string;
  year: number;
  week: number;
}) {
  const access = await requireShiftManager(input.tenantSlug);
  const template = await prisma.tenantShiftTemplate.findFirst({
    where: { id: input.templateId, tenantId: access.tenantId },
  });

  if (!template) {
    throw new Error("Vorlage nicht gefunden.");
  }

  const entries = parseShiftTemplateEntries(template.entriesJson);
  const weekStart = getISOWeekStart(input.year, input.week);
  let created = 0;

  for (const entry of entries) {
    const weekdayIndex = weekdays.indexOf(entry.weekday);

    if (weekdayIndex === -1) {
      continue;
    }

    const date = new Date(weekStart);
    date.setUTCDate(weekStart.getUTCDate() + weekdayIndex);
    const dateId = formatDateValue(date);

    const key = await createUniqueShiftKey({
      tenantId: access.tenantId,
      date: dateId,
      startTime: entry.startTime,
    });

    await prisma.tenantShift.create({
      data: {
        tenantId: access.tenantId,
        key,
        date: dateId,
        weekday: entry.weekday,
        startTime: entry.startTime,
        endTime: entry.endTime,
        breakMinutes: entry.breakMinutes,
        locationId: entry.locationId || null,
        team: entry.team,
      },
    });
    created += 1;
  }

  return { created };
}

export async function deleteShiftTemplate(input: {
  tenantSlug: string;
  templateId: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "shifts", "read");

  if (!access.canDelete) {
    throw new Error("FORBIDDEN");
  }

  const template = await prisma.tenantShiftTemplate.findFirst({
    where: { id: input.templateId, tenantId: access.tenantId },
    select: { id: true, name: true },
  });

  if (!template) {
    throw new Error("Vorlage nicht gefunden.");
  }

  await prisma.tenantShiftTemplate.delete({ where: { id: input.templateId } });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Schichtvorlage gelöscht",
    source: "Schichtplanung",
    entityType: "shift-template",
    entityId: template.id,
    detail: template.name,
  });
}
