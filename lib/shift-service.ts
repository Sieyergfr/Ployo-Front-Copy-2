import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { type Shift, type ShiftDay } from "@/lib/shifts";
import { headers } from "next/headers";
import {
  requireTenantAccess,
  requireTenantMembership,
  resolveScopeFilter,
} from "@/lib/tenant-access";
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
import { notifyEmployeeOfShiftPlanPublished } from "@/lib/notifications/events";

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

async function getShiftWeekForDate(tenantId: string, date: string) {
  const { year, week } = getISOWeekFromDate(new Date(`${date}T00:00:00Z`));
  const record = await getShiftWeekRecord(tenantId, year, week);

  return { year, week, published: record?.status === "published" };
}

/**
 * Sammel-Mail mit allen aktuellen Schichten eines Mitarbeiters in einer
 * Woche — dieselbe Mail wie beim Veröffentlichen (`publishShiftWeek`), nur
 * für einen einzelnen Mitarbeiter. Wird für jede Änderung an einer bereits
 * veröffentlichten Woche verwendet (Anlegen/Ändern/Löschen einer Schicht),
 * damit Betroffene immer den vollständigen, aktuellen Stand sehen statt nur
 * der isolierten Einzeländerung.
 */
async function notifyEmployeeWeekOverview(input: {
  tenantId: string;
  employeeId: string;
  year: number;
  week: number;
}) {
  const days = buildWeekDays(input.year, input.week);
  const dayIds = days.map((day) => day.id);

  const [tenant, shifts] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { name: true },
    }),
    prisma.tenantShift.findMany({
      where: { tenantId: input.tenantId, employeeId: input.employeeId, date: { in: dayIds } },
      select: { date: true, startTime: true, endTime: true },
    }),
  ]);

  await notifyEmployeeOfShiftPlanPublished({
    tenantId: input.tenantId,
    tenantName: tenant?.name ?? "",
    employeeId: input.employeeId,
    weekLabel: `KW ${input.week}`,
    weekRange: formatWeekRange(getISOWeekStart(input.year, input.week)),
    shifts,
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
  const [records, settings, weekRecord] = await Promise.all([
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
  const minStaffing = settings?.shiftMinStaffing ?? 0;
  const conflictIds = new Set<string>();

  for (const record of records) {
    if (
      hasConflict({
        employeeId: record.employeeId,
        date: record.date,
        startTime: record.startTime,
        endTime: record.endTime,
        existing: records.filter((item) => item.id !== record.id),
      })
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

  return {
    label: `KW ${input.week}`,
    range: formatWeekRange(getISOWeekStart(input.year, input.week)),
    conflictCount: conflictIds.size + records.filter((record) => record.conflict).length,
    minStaffing,
    status: weekRecord?.status ?? "draft",
    publishedAt: weekRecord?.publishedAt?.toISOString() ?? null,
    days: days.map((day) => {
      const dayShifts = shiftsByDate.get(day.id) ?? [];
      const staffedCount = dayShifts.filter((shift) => shift.employeeId).length;

      return {
        ...day,
        shifts: dayShifts,
        staffedCount,
        understaffed: minStaffing > 0 && staffedCount < minStaffing,
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
 * Read-only Variante von `getShiftPlanForTenant` für "Mein Bereich" —
 * bewusst ohne `shifts:read`-Berechtigung (nur `requireTenantMembership`),
 * damit jedes Mitglied seine eigenen Schichten der laufenden Woche sehen
 * kann, unabhängig vom konfigurierten "shifts"-Scope der eigenen Rolle.
 * Liefert nur die eigenen Schichten, kein Bearbeiten — dafür gibt es die
 * reguläre Schichtplanung mit den passenden Berechtigungen.
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
  const dayIds = days.map((day) => day.id);

  const records = await prisma.tenantShift.findMany({
    where: { tenantId: access.tenantId, employeeId: employee.id, date: { in: dayIds } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      note: true,
      breakMinutes: true,
      location: { select: { name: true, accentClassName: true } },
    },
  });
  const shiftsByDate = new Map<string, MyShift[]>();

  for (const record of records) {
    const shift: MyShift = {
      id: record.id,
      startTime: record.startTime,
      endTime: record.endTime,
      time: toTimeRange(record.startTime, record.endTime),
      location: record.location?.name ?? "",
      locationAccentClassName: record.location?.accentClassName ?? null,
      note: record.note,
      breakMinutes: record.breakMinutes,
    };
    const dateShifts = shiftsByDate.get(record.date) ?? [];

    dateShifts.push(shift);
    shiftsByDate.set(record.date, dateShifts);
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

  // Solange die Woche noch Entwurf ist, würde jede einzelne Schicht beim
  // Anlegen eine eigene Mail auslösen — stattdessen sammelt sich alles bis
  // zur einmaligen Veröffentlichung (`publishShiftWeek`). Ist die Woche
  // bereits veröffentlicht, ist eine neue Schicht eine echte nachträgliche
  // Änderung — der Mitarbeiter bekommt dieselbe Wochenübersicht-Mail wie
  // beim Veröffentlichen, mit dem aktuellen Gesamtstand seiner Schichten.
  if (employee) {
    const shiftWeek = await getShiftWeekForDate(access.tenantId, input.date);

    if (shiftWeek.published) {
      await notifyEmployeeWeekOverview({
        tenantId: access.tenantId,
        employeeId: employee.id,
        year: shiftWeek.year,
        week: shiftWeek.week,
      });
    }
  }

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

  if (employee) {
    const shiftWeek = await getShiftWeekForDate(access.tenantId, input.date);

    if (shiftWeek.published) {
      await notifyEmployeeWeekOverview({
        tenantId: access.tenantId,
        employeeId: employee.id,
        year: shiftWeek.year,
        week: shiftWeek.week,
      });
    }
  }
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
    select: { id: true, employeeId: true, date: true, startTime: true, endTime: true },
  });

  if (!current) {
    throw new Error("Schicht nicht gefunden.");
  }

  await prisma.tenantShift.delete({
    where: { id: input.shiftId },
  });

  if (current.employeeId) {
    const shiftWeek = await getShiftWeekForDate(access.tenantId, current.date);

    if (shiftWeek.published) {
      await notifyEmployeeWeekOverview({
        tenantId: access.tenantId,
        employeeId: current.employeeId,
        year: shiftWeek.year,
        week: shiftWeek.week,
      });
    }
  }
}

/**
 * Veröffentlicht die Schichtplanung einer Woche: markiert sie als
 * "published" (Bearbeitung davor gilt immer als Entwurf, siehe
 * `isShiftWeekPublished`) und verschickt pro betroffenem Mitarbeiter genau
 * eine Sammel-Mail mit allen seinen Schichten der Woche — statt einer
 * Einzel-Mail pro Schicht, wie es beim reinen Anlegen/Ändern der Fall wäre.
 */
export async function publishShiftWeek(input: {
  tenantSlug: string;
  year: number;
  week: number;
}) {
  const access = await requireShiftManager(input.tenantSlug);
  const days = buildWeekDays(input.year, input.week);
  const dayIds = days.map((day) => day.id);

  const [tenant, records] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: access.tenantId },
      select: { name: true },
    }),
    prisma.tenantShift.findMany({
      where: {
        tenantId: access.tenantId,
        date: { in: dayIds },
        employeeId: { not: null },
      },
      select: { employeeId: true, date: true, startTime: true, endTime: true },
    }),
  ]);

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
    },
    update: {
      status: "published",
      publishedAt: new Date(),
      publishedBy: access.userId,
    },
  });

  const shiftsByEmployee = new Map<string, Array<{ date: string; startTime: string; endTime: string }>>();

  for (const record of records) {
    if (!record.employeeId) {
      continue;
    }

    const list = shiftsByEmployee.get(record.employeeId) ?? [];

    list.push({ date: record.date, startTime: record.startTime, endTime: record.endTime });
    shiftsByEmployee.set(record.employeeId, list);
  }

  const weekLabel = `KW ${input.week}`;
  const weekRange = formatWeekRange(getISOWeekStart(input.year, input.week));

  await Promise.all(
    Array.from(shiftsByEmployee.entries()).map(([employeeId, shifts]) =>
      notifyEmployeeOfShiftPlanPublished({
        tenantId: access.tenantId,
        tenantName: tenant?.name ?? "",
        employeeId,
        weekLabel,
        weekRange,
        shifts,
      }),
    ),
  );

  return {
    status: weekRecord.status,
    publishedAt: weekRecord.publishedAt?.toISOString() ?? null,
    notified: shiftsByEmployee.size,
  };
}

/**
 * Setzt eine veröffentlichte Woche zurück auf Entwurf — z. B. um größere
 * Nachbesserungen vorzunehmen, ohne dass jede einzelne Änderung sofort eine
 * Wochenübersicht-Mail auslöst (siehe `notifyEmployeeWeekOverview`). Verschickt
 * bewusst keine Mail: "zurück auf Entwurf" ist eine interne Planungsaktion,
 * kein für Mitarbeiter sichtbares Ereignis — die nächste Veröffentlichung
 * verschickt wie gewohnt wieder die vollständige Übersicht.
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
    select: { id: true },
  });

  if (!template) {
    throw new Error("Vorlage nicht gefunden.");
  }

  await prisma.tenantShiftTemplate.delete({ where: { id: input.templateId } });
}
