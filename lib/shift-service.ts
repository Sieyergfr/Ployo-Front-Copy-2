import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { type Shift, type ShiftDay } from "@/lib/shifts";
import { headers } from "next/headers";
import { requireTenantAccess } from "@/lib/tenant-access";
import { parseShiftPresets } from "@/lib/shift-presets";

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
};

const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

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

export async function getShiftPlanForTenant(input: {
  tenantSlug: string;
  year: number;
  week: number;
}) {
  const tenantId = await getTenantIdForShifts(input.tenantSlug);

  if (!tenantId) {
    return null;
  }

  const days = buildWeekDays(input.year, input.week);
  const dayIds = days.map((day) => day.id);
  const records = await prisma.tenantShift.findMany({
    where: {
      tenantId,
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
  });
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
    days: days.map((day) => ({
      ...day,
      shifts: shiftsByDate.get(day.id) ?? [],
    })) satisfies ShiftDay[],
  };
}

export async function getShiftFormOptions(tenantSlug: string) {
  const tenantId = await getTenantIdForShifts(tenantSlug);

  if (!tenantId) {
    return null;
  }

  const [employees, locations] = await Promise.all([
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
      },
    }),
  ]);

  return {
    employees: employees satisfies ShiftEmployeeOption[],
    locations: locations satisfies ShiftLocationOption[],
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
        },
      })
    : null;

  return {
    weekStart: settings?.weekStart ?? "monday",
    minStaffing: settings?.shiftMinStaffing ?? 3,
    breakRule: settings?.shiftBreakRule ?? "30-6",
    presets: parseShiftPresets(settings?.shiftPresetsJson ?? "[]"),
  };
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
    throw new Error("Keine Berechtigung fuer diesen Mandanten.");
  }

  const legacyRole = membership.role.toUpperCase();
  const permission = membership.roleRef?.permissions[0]?.level ?? "none";

  if (
    legacyRole === "OWNER" ||
    legacyRole === "ADMIN" ||
    legacyRole === "HR" ||
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

  return prisma.tenantShift.create({
    data: {
      tenantId: access.tenantId,
      key,
      date: input.date,
      weekday:
        weekdays[(new Date(`${input.date}T00:00:00Z`).getUTCDay() || 7) - 1] ?? "",
      startTime: input.startTime,
      endTime: input.endTime,
      breakMinutes: input.breakMinutes,
      employeeId: employee?.id,
      locationId: input.locationId || null,
      team: input.team?.trim() || employee?.team || "",
      note: input.note?.trim() || "",
    },
  });
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
}

export async function deleteTenantShift(input: {
  tenantSlug: string;
  shiftId: string;
}) {
  const access = await requireShiftManager(input.tenantSlug);
  const current = await prisma.tenantShift.findFirst({
    where: { id: input.shiftId, tenantId: access.tenantId },
    select: { id: true },
  });

  if (!current) {
    throw new Error("Schicht nicht gefunden.");
  }

  await prisma.tenantShift.delete({
    where: { id: input.shiftId },
  });
}
