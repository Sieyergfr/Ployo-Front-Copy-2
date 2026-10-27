import { computeOvertimeWarnings } from "@/lib/shift-overtime";
import { auth } from "@/lib/auth";
import { recordTenantAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { type Shift, type ShiftDay } from "@/lib/shifts";
import { headers } from "next/headers";
import {
  assertEmployeeInScope,
  requireTenantAccess,
  requireTenantMembership,
  resolveScopeFilter,
  scopeAllowsTarget,
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
import {
  calculateAge,
  findRestPeriodViolation,
  findShiftOverlap,
  isSunday,
  netWorkingMinutes,
  overlapsNightWindow,
  requiredBreakMinutes,
  shiftDurationHours,
} from "@/lib/arbzg-rules";
import { decryptField } from "@/lib/encryption";
import {
  notifyEmployeeOfShiftPlanPublished,
  notifyEmployeeOfShiftPlanWithdrawn,
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

/** "2026-10-08" → "08.10.2026" für Fehlermeldungen. */
function formatGermanDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
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
 * Liefert eine Prüffunktion `(employeeId, date) => "vacation" | "sickness" | null`,
 * die erkennt, ob der Mitarbeiter an diesem Tag genehmigten Urlaub oder eine
 * offene Krankmeldung hat — genutzt, um Schichten als Konflikt zu markieren
 * (samt Grund), wenn eine Abwesenheit NACH der Schichteinteilung hinzukam
 * (siehe `getShiftPlanForTenant`).
 */
export async function buildAbsenceCheck(
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

  return (employeeId: string, date: string): "vacation" | "sickness" | null => {
    const inVacation = vacations.some(
      (v) => v.employeeId === employeeId && v.startDate <= date && v.endDate >= date,
    );

    if (inVacation) {
      return "vacation";
    }

    const dateValue = new Date(`${date}T00:00:00.000Z`);

    const inSickness = sicknesses.some(
      (s) =>
        s.employeeId === employeeId &&
        s.startDate <= dateValue &&
        (!s.endDate || s.endDate >= dateValue),
    );

    return inSickness ? "sickness" : null;
  };
}

const CONFLICT_REASON_LABELS: Record<"vacation" | "sickness" | "overlap", string> = {
  overlap: "Überschneidung mit einer anderen Schicht am selben Tag",
  vacation: "Mitarbeiter hat an diesem Tag genehmigten Urlaub",
  sickness: "Mitarbeiter ist an diesem Tag krankgemeldet",
};

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
    // Kein eigenes Team darf nicht "alle Schichten nicht zugeordneter
    // Kolleg:innen" bedeuten (Audit-Finding H03).
    return { tenantId: access.tenantId, employeeId: { in: scopeFilter.teammateIds } };
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
    // Kein eigenes Team darf nicht "alle nicht zugeordneten Kolleg:innen"
    // bedeuten (Audit-Finding H03).
    const teammateIds = new Set(scopeFilter.teammateIds);

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
  const conflictReasons = new Map<string, string>();
  const conflictKinds = new Map<string, "overlap" | "vacation" | "sickness">();
  const employeeIds = Array.from(
    new Set(records.map((record) => record.employeeId).filter((id): id is string => Boolean(id))),
  );
  const isAbsent = employeeIds.length
    ? await buildAbsenceCheck(tenantId, employeeIds, dayIds[0], dayIds[dayIds.length - 1])
    : () => null;

  for (const record of records) {
    const overlaps = hasConflict({
      employeeId: record.employeeId,
      date: record.date,
      startTime: record.startTime,
      endTime: record.endTime,
      existing: records.filter((item) => item.id !== record.id),
    });
    const absenceReason = record.employeeId ? isAbsent(record.employeeId, record.date) : null;

    if (overlaps || absenceReason) {
      const kind = overlaps ? "overlap" : (absenceReason as "vacation" | "sickness");

      conflictIds.add(record.id);
      conflictReasons.set(record.id, CONFLICT_REASON_LABELS[kind]);
      conflictKinds.set(record.id, kind);
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
      conflictReason: conflictReasons.get(record.id),
      conflictKind: conflictKinds.get(record.id),
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

export type MyRangeShift = MyShift & { date: string };

/**
 * Eigene veröffentlichte Schichten in einem Zeitraum (z. B. Monatskalender
 * in "Mein Bereich"). Liest wie `getMyShiftsForCurrentWeek` ausschließlich
 * den Schnappschuss der Veröffentlichung, nur über mehrere Wochen.
 * `null`, wenn das Konto mit keiner Personalakte verknüpft ist.
 */
export async function getMyPublishedShiftsInRange(
  tenantSlug: string,
  range: { from: string; to: string },
): Promise<MyRangeShift[] | null> {
  const access = await requireTenantMembership(tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true },
  });

  if (!employee) {
    return null;
  }

  const weeks: Array<{ year: number; week: number }> = [];
  const cursor = new Date(`${range.from}T12:00:00Z`);
  const end = new Date(`${range.to}T12:00:00Z`);

  // Höchstens ~6 Wochen je Monat; die Obergrenze schützt vor riesigen Zeiträumen.
  while (cursor <= end && weeks.length < 60) {
    const key = getISOWeekFromDate(cursor);

    if (!weeks.some((item) => item.year === key.year && item.week === key.week)) {
      weeks.push(key);
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const records = await prisma.tenantShiftWeek.findMany({
    where: {
      tenantId: access.tenantId,
      status: "published",
      OR: weeks.map((item) => ({ year: item.year, week: item.week })),
    },
    select: { publishedShiftsJson: true },
  });

  return records
    .flatMap((record) => (record.publishedShiftsJson ?? []) as PublishedShiftSnapshotEntry[])
    .filter(
      (entry) =>
        entry.employeeId === employee.id && entry.date >= range.from && entry.date <= range.to,
    )
    .map((entry) => ({
      id: entry.id,
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      time: entry.time,
      location: entry.location,
      locationAccentClassName: entry.locationAccentClassName,
      note: entry.note,
      breakMinutes: entry.breakMinutes,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getShiftFormOptions(tenantSlug: string) {
  const access = await requireTenantAccess(tenantSlug, "shifts", "read");
  const tenantId = access.tenantId;

  if (!tenantId) {
    return null;
  }

  const scopeFilter = await resolveScopeFilter(access);

  const [employeeRecords, locationRecords, tenantDefaultOpeningHours] = await Promise.all([
    prisma.tenantEmployee.findMany({
      // Ausgeschiedene (status "former") und noch nicht gestartete
      // Mitarbeiter (startDate in der Zukunft) sind nicht einplanbar und
      // sollen auch nicht in "X Mitarbeiter" mitgezählt werden (QA-Bug
      // BUG-002, gleiche Definition wie auf dem Dashboard).
      where: {
        tenantId,
        status: { not: "former" },
        OR: [{ startDate: "" }, { startDate: { lte: todayIsoDate() } }],
      },
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

  // Formularoptionen respektieren denselben shifts-Scope wie die Schichtliste
  // selbst — sonst erhält ein team-/own-gescopter Planer über dieses
  // Auswahlfeld zusätzliche Mitarbeiterstammdaten außerhalb seines Scopes
  // (Audit-Finding H15).
  const employees = employeeRecords.filter((employee) => scopeAllowsTarget(scopeFilter, employee));

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
          minRestHours: true,
        },
      })
    : null;

  return {
    weekStart: settings?.weekStart ?? "monday",
    minStaffing: settings?.shiftMinStaffing ?? 3,
    minRestHours: settings?.minRestHours ?? 11,
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
  const tenantAccess = await requireTenantAccess(tenantSlug, "shifts", "write");
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
      ...tenantAccess,
      tenantId: membership.tenant.id,
      userId,
    };
  }

  throw new Error("Keine Berechtigung zum Bearbeiten von Schichten.");
}

/**
 * Für die atomaren Wochen-Operationen (Veröffentlichen/Zurückziehen/
 * Zurücksetzen, Vorlage auf Woche anwenden): `TenantShiftWeek` ist EINE Zeile
 * pro (Tenant, Jahr, Woche) ohne Team-Dimension, und `resetShiftWeekToPublished`
 * löscht/erstellt dabei ALLE Schichten der Woche neu — über alle Teams
 * hinweg. Ein Team-/Own-Scope kann diese Reichweite nicht sicher einschränken
 * (anders als eine einzelne Schicht), ein Team-Planer könnte sonst fremde
 * Teams derselben Woche veröffentlichen, zurückziehen oder überschreiben
 * (Audit-Finding H05/R08). Deshalb hier ausdrücklich vollen ("all") Scope
 * verlangen statt eine unsichere Teiloperation vorzutäuschen.
 */
async function requireTenantWideShiftManager(tenantSlug: string) {
  const access = await requireShiftManager(tenantSlug);

  if (access.scope !== "all") {
    throw new Error(
      "Diese Aktion wirkt sich auf die gesamte Wochenplanung aller Teams aus und erfordert uneingeschränkte Schichtplan-Berechtigung.",
    );
  }

  return access;
}

/** `requireShiftManager` liefert keinen Namen — hier für Audit-Einträge separat nachgeladen. */
async function getActorName() {
  const session = await auth.api.getSession({ headers: await headers() });

  return session?.user?.name || session?.user?.email || "System";
}

/**
 * Mitglieder mit Schichtplan-Admin-Recht, DEREN Planungsscope den
 * betroffenen Mitarbeiter tatsächlich abdeckt — vorher wurde jeder
 * Schicht-Schreibberechtigte im gesamten Mandanten benachrichtigt,
 * unabhängig von dessen eigenem Team-/Own-Scope (Audit-Finding H14).
 * Liefert zusätzlich je Empfänger, ob er auch `sickness` lesen darf — nur
 * dann bekommt die Konflikt-Meldung den konkreten Krankheitsbezug, sonst
 * einen neutralen Abwesenheits-Hinweis (siehe `notifyShiftPlanManagersOfAbsenceConflict`).
 */
async function getShiftPlanManagers(tenantId: string, targetEmployee: { id: string | null }) {
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId },
    select: {
      userId: true,
      role: true,
      user: { select: { email: true } },
      roleRef: {
        select: {
          permissions: {
            where: { area: { in: ["shifts", "sickness"] } },
            select: { area: true, level: true, scope: true },
          },
        },
      },
    },
  });

  const isLegacyManager = (role: string) => role === "OWNER" || role === "ADMIN" || role === "HR";
  const candidateIds = memberships
    .filter((membership) => {
      const level =
        membership.roleRef?.permissions.find((p) => p.area === "shifts")?.level ?? "none";

      return isLegacyManager(membership.role) || hasPermissionLevel(level, "write");
    })
    .map((membership) => membership.userId);

  // Team-Zugehörigkeit über `TenantTeamMember` (siehe resolveScopeFilter) —
  // ein "team"-gescopter Planer ist zuständig, wenn er mit dem Zielmitarbeiter
  // mindestens ein Team teilt.
  const linkedEmployees = await prisma.tenantEmployee.findMany({
    where: { tenantId, userId: { in: candidateIds } },
    select: { id: true, userId: true },
  });
  const targetTeamIds = new Set(
    targetEmployee.id
      ? (
          await prisma.tenantTeamMember.findMany({
            where: { employeeId: targetEmployee.id, team: { tenantId } },
            select: { teamId: true },
          })
        ).map((membership) => membership.teamId)
      : [],
  );
  const managerMemberships = targetTeamIds.size
    ? await prisma.tenantTeamMember.findMany({
        where: {
          employeeId: { in: linkedEmployees.map((employee) => employee.id) },
          teamId: { in: Array.from(targetTeamIds) },
        },
        select: { employeeId: true },
      })
    : [];
  const employeesSharingTeam = new Set(managerMemberships.map((membership) => membership.employeeId));
  const sharesTeamByUserId = new Map(
    linkedEmployees
      .filter((employee): employee is { id: string; userId: string } => Boolean(employee.userId))
      .map((employee) => [employee.userId, employeesSharingTeam.has(employee.id)]),
  );

  const result: Array<{ userId: string; email: string | null; canViewSicknessReason: boolean }> = [];

  for (const membership of memberships) {
    if (!candidateIds.includes(membership.userId)) {
      continue;
    }

    const shiftsPermission = membership.roleRef?.permissions.find((p) => p.area === "shifts");
    const legacyManager = isLegacyManager(membership.role);
    const scope = legacyManager ? "all" : (shiftsPermission?.scope ?? "all");

    if (scope === "own") {
      // Der eigene Konflikt wird nicht an einen selbst gemeldet.
      continue;
    }

    if (scope === "team" && !sharesTeamByUserId.get(membership.userId)) {
      continue;
    }

    const sicknessPermission = membership.roleRef?.permissions.find((p) => p.area === "sickness");
    const sicknessLevel = sicknessPermission?.level ?? "none";
    const sicknessScope = legacyManager ? "all" : (sicknessPermission?.scope ?? "all");

    // Wie beim shifts-Scope oben reicht das bloße Leserecht nicht — "own"/
    // "team" bei "sickness" muss sich auf DIESEN konkreten Mitarbeiter
    // beziehen, sonst zählte z. B. sickness:read/own fälschlich als Recht auf
    // die Krankheit eines FREMDEN Mitarbeiters (Audit-Finding H14/R08).
    let canViewSicknessReason = legacyManager || hasPermissionLevel(sicknessLevel, "read");

    if (canViewSicknessReason && !legacyManager) {
      if (sicknessScope === "own") {
        // Der Empfänger sieht hier fremde Konflikte (siehe "own"-Continue für
        // shifts oben) — "own" bei sickness kann sich damit nie auf DIESEN
        // Zielmitarbeiter beziehen.
        canViewSicknessReason = false;
      } else if (sicknessScope === "team") {
        canViewSicknessReason = sharesTeamByUserId.get(membership.userId) ?? false;
      }
    }

    result.push({
      userId: membership.userId,
      email: membership.user.email,
      canViewSicknessReason,
    });
  }

  return result;
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

  const targetEmployee = await prisma.tenantEmployee.findFirst({
    where: { id: input.employeeId, tenantId: input.tenantId },
    select: { id: true },
  });
  const managers = await getShiftPlanManagers(input.tenantId, { id: targetEmployee?.id ?? null });

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

/** `dateIso` (YYYY-MM-DD) um `months` Kalendermonate verschieben (UTC-basiert). */
function shiftDateByMonths(dateIso: string, months: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, day));

  return shifted.toISOString().slice(0, 10);
}

/**
 * Ruhezeit (§5 ArbZG), Höchstarbeitszeit je Schicht (§3 ArbZG, jetzt als
 * NETTO-Arbeitszeit — Anwesenheit minus Pause, wie in §2 ArbZG definiert,
 * statt der reinen Anwesenheitsspanne) gegen die Mandanten-Einstellungen
 * (`TenantSettings.minRestHours`/`maxShiftHours`, Default 11h/10h) sowie
 * echte zeitliche Überschneidungen mit anderen Schichten derselben Person,
 * die gesetzlich vorgeschriebene Mindestpause (§4 ArbZG bzw. §11 JArbSchG
 * für Jugendliche) und — sofern ein Geburtsdatum hinterlegt ist und die
 * Person minderjährig ist — Nachtruhe, Sonntagsruhe sowie Tages-/
 * Wochenhöchstarbeitszeit nach JArbSchG (§8: 8h/Tag, 40h/Woche) sowie — bei
 * aktiver Mutterschutz-Kennzeichnung — Nachtruhe und Sonntagsruhe nach
 * MuSchG prüfen. Für Erwachsene zusätzlich eine vereinfachte Prüfung des
 * §3-Ausgleichszeitraums (Durchschnitt der letzten 6 Kalendermonate darf 8h
 * Nettoarbeitszeit je Schichttag nicht überschreiten, wenn ein einzelner Tag
 * über 8h hinausgeht). Wirft bei Verstoß, passend zum bestehenden
 * Fehlerverhalten von createTenantShift/updateTenantShift (Server Actions
 * lassen den Fehler bis zum Error Boundary durchreichen).
 *
 * Deckt bewusst nicht das ganze jeweilige Gesetz ab (siehe lib/arbzg-rules.ts):
 * kein Bundesland-Feiertagskalender, keine behördlichen Ausnahmegenehmigungen
 * (z. B. verlängerte Ausgleichszeiträume), kein Tarifvertrags-Sonderrecht.
 */
export async function assertArbzgCompliant(input: {
  tenantId: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  excludeShiftId?: string;
  /** Verschlüsselter Rohwert aus `TenantEmployee.birthDate` — wird hier entschlüsselt. */
  employeeBirthDate?: string;
  employeeMaternityProtectionActive?: boolean;
}) {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: input.tenantId },
    select: { minRestHours: true, maxShiftHours: true },
  });
  const minRestHours = settings?.minRestHours ?? 11;
  const maxShiftHours = settings?.maxShiftHours ?? 10;
  const candidate = { date: input.date, startTime: input.startTime, endTime: input.endTime };
  const age = input.employeeBirthDate
    ? calculateAge(decryptField(input.employeeBirthDate), new Date(input.date))
    : null;
  const isMinor = age !== null && age < 18;
  const grossMinutes = shiftDurationHours(candidate) * 60;

  // `netWorkingMinutes` klemmt ein zu langes Pausenfeld bisher stillschweigend
  // auf 0 Nettoarbeitszeit, statt die offensichtlich fehlerhafte Eingabe
  // abzulehnen (QA-Bug BUG-008 — z. B. 600 Min. Pause bei einer 60-Min.-Schicht
  // wurde klaglos gespeichert).
  if (input.breakMinutes > grossMinutes) {
    throw new Error(
      `Die Pause (${input.breakMinutes} Min.) darf nicht länger sein als die Schicht selbst (${grossMinutes} Min.).`,
    );
  }

  const netMinutes = netWorkingMinutes(candidate, input.breakMinutes);

  const requiredBreak = requiredBreakMinutes(shiftDurationHours(candidate) * 60, isMinor);

  if (input.breakMinutes < requiredBreak) {
    throw new Error(
      `Pause von ${input.breakMinutes} Min. reicht nicht aus — bei dieser Schichtlänge sind mindestens ` +
        `${requiredBreak} Min. vorgeschrieben (${isMinor ? "§11 JArbSchG" : "§4 ArbZG"}).`,
    );
  }

  if (netMinutes / 60 > maxShiftHours) {
    throw new Error(
      `Schicht überschreitet die Höchstarbeitszeit von ${maxShiftHours}h (§3 ArbZG, Nettoarbeitszeit nach Abzug der Pause).`,
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
    select: {
      date: true,
      startTime: true,
      endTime: true,
      breakMinutes: true,
      location: { select: { name: true } },
    },
  });

  const overlap = findShiftOverlap(neighborShifts, candidate);

  // Vorher nur "überschneidet sich mit einer Schicht am 2026-10-08" — und
  // da die Meldung nicht in der Allowlist von lib/api/self-service-errors.ts
  // stand, kam in der App nur ein generischer 500er an. Jetzt mit Zeiten und
  // Standort der kollidierenden Schicht, damit man sie im Plan findet. Der
  // Präfix "Konflikt mit bestehender Schicht:" wird dort auf 409 gemappt.
  if (overlap) {
    const existing = overlap.shift;
    const where = existing.location?.name ? ` (${existing.location.name})` : "";
    throw new Error(
      `Konflikt mit bestehender Schicht: Die Person ist am ${formatGermanDate(existing.date)} bereits von ` +
        `${existing.startTime} bis ${existing.endTime} Uhr${where} eingeplant. Die neue Schicht ` +
        `(${input.startTime}–${input.endTime} Uhr) überschneidet sich damit.`,
    );
  }

  const violation = findRestPeriodViolation(neighborShifts, candidate, minRestHours);

  if (violation) {
    throw new Error(
      `Ruhezeit unterschritten: nur ${violation.restHours.toFixed(1)}h Abstand zur Schicht am ${formatGermanDate(violation.neighborDate)} ` +
        `(§5 ArbZG verlangt mind. ${minRestHours}h).`,
    );
  }

  if (isMinor) {
    if (overlapsNightWindow(candidate)) {
      throw new Error(
        "Schicht verstößt gegen die Nachtruhe für Jugendliche (§ 14 JArbSchG, keine Beschäftigung 20-6 Uhr).",
      );
    }

    if (isSunday(candidate.date)) {
      throw new Error(
        "Schicht verstößt gegen die Sonntagsruhe für Jugendliche (§ 17/18 JArbSchG).",
      );
    }

    if (netMinutes / 60 > 8) {
      throw new Error(
        "Schicht überschreitet die Höchstarbeitszeit für Jugendliche von 8h/Tag (§ 8 Abs. 1 JArbSchG).",
      );
    }

    const isoWeek = getISOWeekFromDate(new Date(`${input.date}T00:00:00Z`));
    const weekStart = formatDateValue(getISOWeekStart(isoWeek.year, isoWeek.week));
    const weekEnd = shiftDateBy(weekStart, 6);
    const weekShifts = await prisma.tenantShift.findMany({
      where: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        date: { gte: weekStart, lte: weekEnd },
        id: input.excludeShiftId ? { not: input.excludeShiftId } : undefined,
      },
      select: { date: true, startTime: true, endTime: true, breakMinutes: true },
    });
    const weeklyMinutes =
      weekShifts.reduce((sum, shift) => sum + netWorkingMinutes(shift, shift.breakMinutes), 0) +
      netMinutes;

    if (weeklyMinutes / 60 > 40) {
      throw new Error(
        `Schicht überschreitet die Höchstarbeitszeit für Jugendliche von 40h/Woche (§ 8 Abs. 1 JArbSchG) — ` +
          `bereits ${(weeklyMinutes / 60).toFixed(1)}h in dieser Kalenderwoche.`,
      );
    }
  } else if (netMinutes / 60 > 8) {
    // §3 Satz 2 ArbZG: eine Verlängerung über 8h/Tag ist nur zulässig, wenn
    // der Durchschnitt innerhalb von 6 Kalendermonaten 8h/WERKTAG nicht
    // überschreitet — vereinfacht geprüft über das Fenster endend am
    // Schichttag, nicht über jedes beliebige 6-Monats-Fenster.
    //
    // Der Nenner ist die Zahl der Werktage im Fenster (Mo-Sa, ohne Sonntag —
    // kein Bundesland-Feiertagskalender vorhanden, siehe Dateikommentar
    // lib/arbzg-rules.ts), NICHT die Zahl der Tage, an denen zufällig eine
    // Schicht EXISTIERT: eine erste, noch nie zuvor verplante 8,5h-Schicht
    // hatte mit "Tage mit Schicht" als Nenner immer genau 1 Tag im Nenner und
    // wurde dadurch IMMER als Verstoß abgelehnt, unabhängig von möglichen
    // Ausgleichstagen — der ganze Ausgleichsmechanismus lief für neue/dünn
    // verplante Zeitpläne leer (Audit-Finding M03/R08). Werktage ohne Schicht
    // zählen im Nenner korrekt mit 0h und verdünnen den Schnitt.
    const windowStart = shiftDateByMonths(input.date, -6);
    const windowShifts = await prisma.tenantShift.findMany({
      where: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        date: { gte: windowStart, lte: input.date },
        id: input.excludeShiftId ? { not: input.excludeShiftId } : undefined,
      },
      select: { date: true, startTime: true, endTime: true, breakMinutes: true },
    });
    let workdayCount = 0;
    for (let cursor = windowStart; cursor <= input.date; cursor = shiftDateBy(cursor, 1)) {
      if (!isSunday(cursor)) {
        workdayCount += 1;
      }
    }
    const totalMinutes =
      windowShifts.reduce((sum, shift) => sum + netWorkingMinutes(shift, shift.breakMinutes), 0) +
      netMinutes;
    const averageHours = totalMinutes / 60 / Math.max(1, workdayCount);

    if (averageHours > 8) {
      throw new Error(
        `Verlängerung über 8h/Tag ohne ausreichenden Ausgleich: der Durchschnitt der letzten 6 Monate läge bei ` +
          `${averageHours.toFixed(1)}h/Werktag (§3 Satz 2 ArbZG verlangt im Schnitt max. 8h innerhalb von 6 Monaten).`,
      );
    }
  }

  if (input.employeeMaternityProtectionActive) {
    if (overlapsNightWindow(candidate)) {
      throw new Error(
        "Schicht verstößt gegen das Beschäftigungsverbot bei Mutterschutz (§ 5 MuSchG, keine Beschäftigung 20-6 Uhr).",
      );
    }

    if (isSunday(candidate.date)) {
      throw new Error(
        "Schicht verstößt gegen das Beschäftigungsverbot bei Mutterschutz (§ 6 MuSchG, keine Sonntagsbeschäftigung).",
      );
    }
  }
}

/**
 * `TenantShift.teamId` zum Teamnamen der Schicht. Der Name bleibt als
 * Anzeige-Text in `team` stehen (Vorlagen, veröffentlichte Wochen und die App
 * arbeiten mit Namen); ein Name ohne passendes Team ergibt keine id.
 */
async function resolveShiftTeamIds(tenantId: string, names: string[]) {
  const unique = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
  const teams = unique.length
    ? await prisma.tenantTeam.findMany({
        where: { tenantId, name: { in: unique } },
        select: { id: true, name: true },
      })
    : [];

  return new Map(teams.map((team) => [team.name, team.id]));
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
        select: {
          id: true,
          name: true,
          team: true,
          birthDate: true,
          maternityProtectionActive: true,
        },
      })
    : null;

  // Ein team-gescopter Schichtplaner darf nur Mitarbeiter des eigenen Teams
  // einteilen, nicht mandantenweit (Audit-Finding H05).
  if (employee) {
    await assertEmployeeInScope(access, employee.id);
  }

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
      breakMinutes: input.breakMinutes,
      employeeBirthDate: employee.birthDate,
      employeeMaternityProtectionActive: employee.maternityProtectionActive,
    });
  }

  const team = input.team?.trim() || employee?.team || "";
  const teamIds = await resolveShiftTeamIds(access.tenantId, [team]);
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
      team,
      teamId: teamIds.get(team) ?? null,
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
    select: { id: true, employeeId: true },
  });

  if (!current) {
    throw new Error("Schicht nicht gefunden.");
  }

  // Ein team-gescopter Schichtplaner darf weder eine fremde Schicht ändern
  // noch sie einem Mitarbeiter außerhalb des eigenen Teams zuweisen
  // (Audit-Finding H05). Eine noch unbesetzte Schicht hat keinen
  // Zielmitarbeiter, den der Scope einschränken könnte.
  if (current.employeeId) {
    await assertEmployeeInScope(access, current.employeeId);
  }

  const employee = input.employeeId
    ? await prisma.tenantEmployee.findFirst({
        where: { id: input.employeeId, tenantId: access.tenantId },
        select: {
          id: true,
          name: true,
          team: true,
          birthDate: true,
          maternityProtectionActive: true,
        },
      })
    : null;

  if (employee && employee.id !== current.employeeId) {
    await assertEmployeeInScope(access, employee.id);
  }

  if (input.locationId) {
    const location = await prisma.tenantLocation.findFirst({
      where: { id: input.locationId, tenantId: access.tenantId },
      select: { id: true },
    });

    if (!location) {
      throw new Error("Standort nicht gefunden.");
    }
  }

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
      breakMinutes: input.breakMinutes,
      excludeShiftId: input.shiftId,
      employeeBirthDate: employee.birthDate,
      employeeMaternityProtectionActive: employee.maternityProtectionActive,
    });
  }

  const team = input.team?.trim() || employee?.team || "";
  const teamIds = await resolveShiftTeamIds(access.tenantId, [team]);

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
      team,
      teamId: teamIds.get(team) ?? null,
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
      employeeId: true,
      employee: { select: { name: true } },
    },
  });

  if (!current) {
    throw new Error("Schicht nicht gefunden.");
  }

  // Siehe updateTenantShift (Audit-Finding H05).
  if (current.employeeId) {
    await assertEmployeeInScope(access, current.employeeId);
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

/**
 * Revalidiert jede eingeteilte Schicht einer Woche gegen `assertArbzgCompliant`
 * unmittelbar vor dem Veröffentlichen/Zurücksetzen (Audit-Finding M03) —
 * bisher wurde beim Anlegen/Ändern einzelner Schichten geprüft, aber weder
 * beim Veröffentlichen noch beim Zurücksetzen erneut, obwohl sich seither
 * z. B. eine Mutterschutz-/Jugendschutz-relevante Eigenschaft geändert haben
 * kann. Sammelt alle Verstöße statt beim ersten abzubrechen, damit HR alle
 * betroffenen Schichten auf einmal sieht statt sie einzeln nacheinander zu
 * entdecken.
 */
async function assertPublishedShiftsArbzgCompliant(
  tenantId: string,
  shifts: Array<{
    id: string;
    employeeId: string | null;
    date: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
  }>,
) {
  const employeeIds = Array.from(
    new Set(shifts.map((shift) => shift.employeeId).filter((id): id is string => Boolean(id))),
  );

  if (employeeIds.length === 0) {
    return;
  }

  const employees = await prisma.tenantEmployee.findMany({
    where: { id: { in: employeeIds }, tenantId },
    select: { id: true, name: true, birthDate: true, maternityProtectionActive: true },
  });
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

  const violations: string[] = [];

  for (const shift of shifts) {
    if (!shift.employeeId) {
      continue;
    }

    const employee = employeeById.get(shift.employeeId);

    try {
      await assertArbzgCompliant({
        tenantId,
        employeeId: shift.employeeId,
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        breakMinutes: shift.breakMinutes,
        excludeShiftId: shift.id,
        employeeBirthDate: employee?.birthDate,
        employeeMaternityProtectionActive: employee?.maternityProtectionActive,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      violations.push(`${employee?.name ?? shift.employeeId} (${shift.date}): ${message}`);
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Veröffentlichung abgebrochen — ${violations.length} Schicht(en) verstoßen gegen geltende Arbeitszeitregeln:\n` +
        violations.join("\n"),
    );
  }
}
export async function publishShiftWeek(input: {
  tenantSlug: string;
  year: number;
  week: number;
}) {
  const access = await requireTenantWideShiftManager(input.tenantSlug);
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

  await assertPublishedShiftsArbzgCompliant(access.tenantId, records);

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

  // Einstellung "Bei Veröffentlichung benachrichtigen" (Standard: an, wie bisher).
  const publishSettings = await prisma.tenantSettings.findUnique({
    where: { tenantId: access.tenantId },
    select: { shiftNotifyOnPublish: true },
  });
  const notifyRecipients = publishSettings?.shiftNotifyOnPublish === false ? [] : Array.from(employeeIdsToNotify);

  await Promise.all(
    notifyRecipients.map((employeeId) =>
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
  /** "Team benachrichtigen": alle im veröffentlichten Stand eingeteilten Personen erhalten einen Hinweis. */
  notifyTeam?: boolean;
}) {
  const access = await requireTenantWideShiftManager(input.tenantSlug);
  const previous = input.notifyTeam
    ? await prisma.tenantShiftWeek.findUnique({
        where: {
          tenantId_year_week: { tenantId: access.tenantId, year: input.year, week: input.week },
        },
        select: { status: true, publishedShiftsJson: true },
      })
    : null;

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

  let notified = 0;

  if (previous?.status === "published") {
    const snapshot = (previous.publishedShiftsJson ?? []) as PublishedShiftSnapshotEntry[];
    const employeeIds = Array.from(
      new Set(snapshot.map((entry) => entry.employeeId).filter((id): id is string => Boolean(id))),
    );
    const tenant = await prisma.tenant.findUnique({
      where: { id: access.tenantId },
      select: { name: true },
    });
    const weekRange = formatWeekRange(getISOWeekStart(input.year, input.week));

    await Promise.all(
      employeeIds.map((employeeId) =>
        notifyEmployeeOfShiftPlanWithdrawn({
          tenantId: access.tenantId,
          tenantName: tenant?.name ?? "",
          employeeId,
          year: input.year,
          week: input.week,
          weekRange,
        }),
      ),
    );
    notified = employeeIds.length;

    await recordTenantAudit({
      tenantId: access.tenantId,
      actorId: access.userId,
      actorName: await getActorName(),
      action: "Schichtplan zurückgezogen",
      source: "Schichtplanung",
      entityType: "shift-week",
      entityId: weekRecord.id,
      detail: `KW ${input.week}/${input.year} · ${weekRange} · ${notified} benachrichtigt`,
    });
  }

  return {
    notified,
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
  const access = await requireTenantWideShiftManager(input.tenantSlug);
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

  // Bewusst KEINE ArbZG-Revalidierung hier (anders als publishShiftWeek):
  // die wiederherzustellenden Schnappschuss-Einträge existieren zu diesem
  // Zeitpunkt noch nicht als eigene Datenbankzeilen, während die aktuellen
  // (gleich zu löschenden) Schichten der Woche noch da sind — eine Prüfung
  // über dieselbe DB-Nachbarschaftsabfrage wie assertArbzgCompliant würde
  // einen Eintrag fälschlich als Überschneidung mit seinem eigenen,
  // gleich ersetzten Vorgänger melden. Verstöße, die erst NACH der letzten
  // Veröffentlichung entstanden sind, fallen mit dem Zurücksetzen ohnehin weg.
  const snapshotTeamIds = await resolveShiftTeamIds(
    access.tenantId,
    snapshot.map((entry) => entry.team ?? ""),
  );

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
          teamId: snapshotTeamIds.get(entry.team?.trim() ?? "") ?? null,
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
  // Anders als publish/unpublish/reset ist das hier eine reine Leseoperation
  // ohne destruktiven Seiteneffekt auf fremde Teams — deshalb genügt eine
  // echte scopesichere Teiloperation statt vollen Scopes zu verlangen: bei
  // "own"/"team" fließen nur die eigenen bzw. Team-Schichten dieser Woche in
  // die neue Vorlage ein (Audit-Finding H05/R08).
  const scopeFilter = await resolveScopeFilter(access);
  const scopeWhere =
    scopeFilter.type === "all"
      ? {}
      : scopeFilter.type === "own"
        ? { employeeId: scopeFilter.employeeId ?? "__none__" }
        : scopeFilter.type === "team"
          ? { employeeId: { in: scopeFilter.teammateIds } }
          : { employeeId: "__none__" };
  const records = await prisma.tenantShift.findMany({
    where: { tenantId: access.tenantId, date: { in: dayIds }, ...scopeWhere },
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
  const access = await requireTenantWideShiftManager(input.tenantSlug);
  const template = await prisma.tenantShiftTemplate.findFirst({
    where: { id: input.templateId, tenantId: access.tenantId },
  });

  if (!template) {
    throw new Error("Vorlage nicht gefunden.");
  }

  const entries = parseShiftTemplateEntries(template.entriesJson);
  const weekStart = getISOWeekStart(input.year, input.week);
  const templateTeamIds = await resolveShiftTeamIds(
    access.tenantId,
    entries.map((entry) => entry.team),
  );
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
        teamId: templateTeamIds.get(entry.team.trim()) ?? null,
      },
    });
    created += 1;
  }

  return { created };
}

/**
 * "Vorwoche kopieren": übernimmt alle Schichten der Vorwoche (gleicher
 * Wochentag, gleiche Zeiten, Standort, Team, Person) in die gewählte Woche.
 * Ist die Person in der Zielwoche an dem Tag abwesend (Urlaub/Krankheit),
 * wird die Schicht offen übernommen statt ihr zugeteilt. Schichten, die es
 * in der Zielwoche schon genau so gibt, werden nicht doppelt angelegt —
 * ein versehentlicher zweiter Klick bleibt damit folgenlos.
 */
export async function copyPreviousShiftWeek(input: {
  tenantSlug: string;
  year: number;
  week: number;
}) {
  const access = await requireTenantWideShiftManager(input.tenantSlug);
  const targetStart = getISOWeekStart(input.year, input.week);
  const sourceStart = new Date(targetStart);

  sourceStart.setUTCDate(targetStart.getUTCDate() - 7);

  const sourceFrom = formatDateValue(sourceStart);
  const sourceTo = shiftDateBy(sourceFrom, 6);
  const targetFrom = formatDateValue(targetStart);
  const targetTo = shiftDateBy(targetFrom, 6);
  const [sourceShifts, targetShifts] = await Promise.all([
    prisma.tenantShift.findMany({
      where: { tenantId: access.tenantId, date: { gte: sourceFrom, lte: sourceTo } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: { employee: { select: { name: true, status: true } } },
    }),
    prisma.tenantShift.findMany({
      where: { tenantId: access.tenantId, date: { gte: targetFrom, lte: targetTo } },
      select: { date: true, startTime: true, endTime: true, employeeId: true, locationId: true },
    }),
  ]);
  const employeeIds = Array.from(
    new Set(sourceShifts.map((shift) => shift.employeeId).filter((id): id is string => Boolean(id))),
  );
  const isAbsent = employeeIds.length
    ? await buildAbsenceCheck(access.tenantId, employeeIds, targetFrom, targetTo)
    : () => null;
  const existing = new Set(
    targetShifts.map((shift) =>
      [shift.date, shift.startTime, shift.endTime, shift.employeeId ?? "", shift.locationId ?? ""].join("|"),
    ),
  );
  let created = 0;
  let unassigned = 0;
  let skipped = 0;

  for (const shift of sourceShifts) {
    const date = shiftDateBy(shift.date, 7);
    const keepEmployee =
      shift.employeeId && shift.employee?.status !== "former" && !isAbsent(shift.employeeId, date);
    const employeeId = keepEmployee ? shift.employeeId : null;
    const signature = [date, shift.startTime, shift.endTime, employeeId ?? "", shift.locationId ?? ""].join("|");

    if (existing.has(signature)) {
      skipped += 1;
      continue;
    }

    existing.add(signature);

    const key = await createUniqueShiftKey({
      tenantId: access.tenantId,
      date,
      startTime: shift.startTime,
      employeeName: employeeId ? shift.employee?.name : undefined,
    });

    await prisma.tenantShift.create({
      data: {
        tenantId: access.tenantId,
        key,
        date,
        weekday: shift.weekday,
        startTime: shift.startTime,
        endTime: shift.endTime,
        breakMinutes: shift.breakMinutes,
        employeeId,
        locationId: shift.locationId,
        team: shift.team,
        teamId: shift.teamId,
        note: shift.note,
      },
    });
    created += 1;

    if (shift.employeeId && !employeeId) {
      unassigned += 1;
    }
  }

  if (created > 0) {
    await recordTenantAudit({
      tenantId: access.tenantId,
      actorId: access.userId,
      actorName: await getActorName(),
      action: "Vorwoche kopiert",
      source: "Schichtplanung",
      entityType: "shift-week",
      entityId: `${input.year}-W${String(input.week).padStart(2, "0")}`,
      detail: `${created} Schichten übernommen, davon ${unassigned} offen wegen Abwesenheit`,
    });
  }

  return { created, unassigned, skipped };
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

export type ShiftWeekAbsence = {
  date: string;
  employeeId: string;
  name: string;
  initials: string;
  kind: "vacation" | "sickness";
};

/**
 * Wer an welchem Tag der Woche fehlt (genehmigter Urlaub, offene
 * Krankmeldung) — für die "Abwesend"-Liste unter jeder Tagesspalte. Nur für
 * Planer; berücksichtigt den Schichtplan-Scope. Den Krankheitsbezug blendet
 * die Seite für Planer ohne Leserecht auf Krankmeldungen aus.
 */
export async function getShiftWeekAbsences(input: {
  tenantSlug: string;
  year: number;
  week: number;
}): Promise<ShiftWeekAbsence[]> {
  const access = await requireShiftManager(input.tenantSlug);
  const days = buildWeekDays(input.year, input.week).map((day) => day.id);
  const from = days[0];
  const to = days[days.length - 1];
  const scopeFilter = await resolveScopeFilter(access);
  const [vacations, sicknesses] = await Promise.all([
    prisma.tenantVacationRequest.findMany({
      where: { tenantId: access.tenantId, status: "approved", startDate: { lte: to }, endDate: { gte: from } },
      select: { startDate: true, endDate: true, employee: { select: { id: true, name: true, initials: true } } },
    }),
    prisma.tenantSicknessReport.findMany({
      where: {
        tenantId: access.tenantId,
        status: "open",
        startDate: { lte: new Date(`${to}T23:59:59.999Z`) },
        OR: [{ endDate: null }, { endDate: { gte: new Date(`${from}T00:00:00.000Z`) } }],
      },
      select: { startDate: true, endDate: true, employee: { select: { id: true, name: true, initials: true } } },
    }),
  ]);
  const result: ShiftWeekAbsence[] = [];
  const seen = new Set<string>();
  const push = (date: string, employee: { id: string; name: string; initials: string } | null, kind: ShiftWeekAbsence["kind"]) => {
    if (!employee || seen.has(`${date}|${employee.id}`)) return;
    if (scopeFilter.type !== "all" && !scopeAllowsTarget(scopeFilter, employee)) return;

    seen.add(`${date}|${employee.id}`);
    result.push({ date, employeeId: employee.id, name: employee.name, initials: employee.initials, kind });
  };

  for (const date of days) {
    for (const sickness of sicknesses) {
      const start = sickness.startDate.toISOString().slice(0, 10);
      const end = sickness.endDate?.toISOString().slice(0, 10) ?? "9999-12-31";

      if (start <= date && end >= date) push(date, sickness.employee, "sickness");
    }

    for (const vacation of vacations) {
      if (vacation.startDate <= date && vacation.endDate >= date) push(date, vacation.employee, "vacation");
    }
  }

  return result;
}

/**
 * Überstunden-Warnung für eine Planwoche (Einstellung „Überstunden-Warnung“,
 * `TenantSettings.overtimeWarningPercent`). Nur für Planer (shifts:write).
 */
export async function getShiftWeekOvertimeWarnings(input: {
  tenantSlug: string;
  shifts: Array<{ employeeId?: string; startTime?: string; endTime?: string; breakMinutes?: number }>;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "shifts", "write");
  const ids = [...new Set(input.shifts.map((shift) => shift.employeeId).filter((id): id is string => Boolean(id)))];

  if (ids.length === 0) return [];

  const [settings, employees] = await Promise.all([
    prisma.tenantSettings.findUnique({ where: { tenantId: access.tenantId }, select: { overtimeWarningPercent: true } }),
    prisma.tenantEmployee.findMany({ where: { tenantId: access.tenantId, id: { in: ids } }, select: { id: true, name: true, weeklyHours: true } }),
  ]);

  return computeOvertimeWarnings({ shifts: input.shifts, employees, thresholdPercent: settings?.overtimeWarningPercent ?? 10 });
}
