import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  type VacationMetric,
  type VacationRequest,
  type VacationRequestStatus,
} from "@/lib/vacations";
import { headers } from "next/headers";

type VacationRecord = {
  id: string;
  key: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  note: string;
  employeeId: string;
  employee: {
    id: string;
    key: string;
    initials: string;
    name: string;
    location: string;
    team: string;
  };
};

function normalizeVacationKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function createUniqueVacationKey(input: {
  tenantId: string;
  employeeName: string;
  startDate: string;
  excludeRequestId?: string;
}) {
  const keyBase =
    normalizeVacationKey(`${input.employeeName}-${input.startDate}`) ||
    "urlaubsantrag";
  let key = keyBase;
  let suffix = 2;

  while (
    await prisma.tenantVacationRequest.findFirst({
      where: {
        tenantId: input.tenantId,
        key,
        id: input.excludeRequestId ? { not: input.excludeRequestId } : undefined,
      },
      select: { id: true },
    })
  ) {
    key = `${keyBase}-${suffix}`;
    suffix += 1;
  }

  return key;
}

function normalizeStatus(value: string): VacationRequestStatus {
  if (value === "approved" || value === "rejected") {
    return value;
  }

  return "pending";
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}.${month}.${year}`;
}

function daysLabel(days: number) {
  return days === 1 ? "1 Tag" : `${days} Tage`;
}

function calculateVacationDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = end.getTime() - start.getTime();

  if (!Number.isFinite(diff) || diff < 0) {
    return 1;
  }

  return Math.max(1, Math.floor(diff / 86_400_000) + 1);
}

function toVacationRequest(record: VacationRecord): VacationRequest {
  return {
    id: record.key,
    dbId: record.id,
    key: record.key,
    employeeId: record.employeeId,
    initials: record.employee.initials,
    name: record.employee.name,
    location: record.employee.location,
    team: record.employee.team,
    startDate: formatDate(record.startDate),
    endDate: formatDate(record.endDate),
    days: daysLabel(record.days),
    note: record.note,
    status: normalizeStatus(record.status),
  };
}

async function getSessionUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user?.id ?? null;
}

export async function getTenantIdForVacation(tenantSlug: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });

  return tenant?.id ?? null;
}

export async function getVacationRequestsForTenant(tenantSlug: string) {
  const tenantId = await getTenantIdForVacation(tenantSlug);

  if (!tenantId) {
    return null;
  }

  const records = await prisma.tenantVacationRequest.findMany({
    where: { tenantId },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    include: {
      employee: {
        select: {
          id: true,
          key: true,
          initials: true,
          name: true,
          location: true,
          team: true,
        },
      },
    },
  });

  return records.map(toVacationRequest);
}

export function getVacationMetrics(
  requests: VacationRequest[],
  employees: Array<{ vacationRemaining: number }>,
): VacationMetric[] {
  const pending = requests.filter((request) => request.status === "pending").length;
  const approved = requests.filter((request) => request.status === "approved").length;
  const requestedDays = requests.reduce((total, request) => {
    const parsed = Number.parseInt(request.days, 10);

    return total + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
  const averageRemaining =
    employees.length > 0
      ? Math.round(
          employees.reduce((total, employee) => total + employee.vacationRemaining, 0) /
            employees.length,
        )
      : 0;

  return [
    {
      label: "Ausstehend",
      value: pending.toString(),
      caption: "warten auf Genehmigung",
      tone: "warning",
    },
    {
      label: "Genehmigt",
      value: approved.toString(),
      caption: "gesamt",
      tone: "success",
    },
    {
      label: "\u00d8 Resturlaub",
      value: averageRemaining.toString(),
      caption: "Tage \u00b7 alle Mitarbeiter",
    },
    {
      label: "Beantragte Tage",
      value: requestedDays.toString(),
      caption: "gesamt",
    },
  ];
}

export async function requireVacationManager(tenantSlug: string) {
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
      roleRef: {
        select: {
          permissions: {
            where: { area: "vacation" },
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
    return { userId };
  }

  throw new Error("Keine Berechtigung zum Bearbeiten von Urlaub.");
}

export async function createTenantVacationRequest(input: {
  tenantSlug: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  note: string;
}) {
  await requireVacationManager(input.tenantSlug);

  const tenantId = await getTenantIdForVacation(input.tenantSlug);

  if (!tenantId) {
    throw new Error("Mandant nicht gefunden.");
  }

  const employee = await prisma.tenantEmployee.findFirst({
    where: {
      tenantId,
      id: input.employeeId,
    },
    select: { id: true, name: true },
  });

  if (!employee) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  const key = await createUniqueVacationKey({
    tenantId,
    employeeName: employee.name,
    startDate: input.startDate,
  });

  return prisma.tenantVacationRequest.create({
    data: {
      tenantId,
      employeeId: employee.id,
      key,
      startDate: input.startDate,
      endDate: input.endDate,
      days: calculateVacationDays(input.startDate, input.endDate),
      note: input.note.trim(),
      status: "pending",
    },
  });
}

export async function setTenantVacationRequestStatus(input: {
  tenantSlug: string;
  requestId: string;
  status: "approved" | "rejected";
}) {
  const access = await requireVacationManager(input.tenantSlug);
  const tenantId = await getTenantIdForVacation(input.tenantSlug);

  if (!tenantId) {
    throw new Error("Mandant nicht gefunden.");
  }

  const request = await prisma.tenantVacationRequest.findFirst({
    where: {
      id: input.requestId,
      tenantId,
    },
    select: { id: true },
  });

  if (!request) {
    throw new Error("Urlaubsantrag nicht gefunden.");
  }

  await prisma.tenantVacationRequest.update({
    where: { id: input.requestId },
    data: {
      status: input.status,
      decidedAt: new Date(),
      decidedBy: access.userId,
    },
  });
}

export async function deleteTenantVacationRequest(input: {
  tenantSlug: string;
  requestId: string;
}) {
  await requireVacationManager(input.tenantSlug);
  const tenantId = await getTenantIdForVacation(input.tenantSlug);

  if (!tenantId) {
    throw new Error("Mandant nicht gefunden.");
  }

  const request = await prisma.tenantVacationRequest.findFirst({
    where: {
      id: input.requestId,
      tenantId,
    },
    select: { id: true },
  });

  if (!request) {
    throw new Error("Urlaubsantrag nicht gefunden.");
  }

  await prisma.tenantVacationRequest.delete({
    where: { id: input.requestId },
  });
}
