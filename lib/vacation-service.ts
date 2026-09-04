import { auth } from "@/lib/auth";
import { recordTenantAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  type VacationMetric,
  type VacationRequest,
  type VacationRequestStatus,
} from "@/lib/vacations";
import { headers } from "next/headers";
import {
  requireTenantAccess,
  requireTenantMembership,
  assertEmployeeInScope,
  resolveScopeFilter,
} from "@/lib/tenant-access";
import {
  notifyManagersOfNewVacationRequest,
  notifyVacationRequestDecided,
} from "@/lib/notifications/events";
import { notifyIfAbsenceConflictsWithPublishedShifts } from "@/lib/shift-service";

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

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;

  return new Date(Number(year), Number(month) - 1, Number(day));
}

function validateVacationDateRange(startDate: string, endDate: string) {
  const parsedStartDate = parseDateOnly(startDate);
  const parsedEndDate = parseDateOnly(endDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (!parsedStartDate || !parsedEndDate) {
    throw new Error("Bitte gültige Datumswerte auswählen.");
  }

  if (parsedStartDate < today || parsedEndDate < today) {
    throw new Error("Urlaubsantrag darf nicht in der Vergangenheit liegen.");
  }

  if (parsedEndDate < parsedStartDate) {
    throw new Error("Das Enddatum darf nicht vor dem Startdatum liegen.");
  }
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
    startDateIso: record.startDate,
    endDateIso: record.endDate,
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
  return (await requireTenantAccess(tenantSlug, "vacation", "read")).tenantId;
}

/**
 * Übersetzt den konfigurierten Scope (own/team/all) der "vacation"-
 * Berechtigung in einen zusätzlichen `where`-Filter. "own"/"team" ohne
 * verknüpften eigenen Mitarbeiterdatensatz liefert einen Filter, der nichts
 * trifft — nie stillschweigend auf "alles sehen" zurückfallen.
 */
async function vacationScopeWhere(tenantSlug: string) {
  const access = await requireTenantAccess(tenantSlug, "vacation", "read");
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

  // "vacation" unterstützt (bisher) keinen "assigned"-Scope — sollte er
  // dennoch auftreten, nichts treffen statt stillschweigend alles zu zeigen.
  return { tenantId: access.tenantId, employeeId: "__none__" };
}

export async function getVacationRequestsForTenant(tenantSlug: string) {
  const where = await vacationScopeWhere(tenantSlug);

  if (!where.tenantId) {
    return null;
  }

  const records = await prisma.tenantVacationRequest.findMany({
    where,
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
  t: (key: string) => string,
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
      label: t("metricPendingLabel"),
      value: pending.toString(),
      caption: t("metricPendingCaption"),
      tone: "warning",
    },
    {
      label: t("metricApprovedLabel"),
      value: approved.toString(),
      caption: t("metricApprovedCaption"),
      tone: "success",
    },
    {
      label: t("metricAvgRemainingLabel"),
      value: averageRemaining.toString(),
      caption: t("metricAvgRemainingCaption"),
    },
    {
      label: t("metricRequestedDaysLabel"),
      value: requestedDays.toString(),
      caption: t("metricRequestedDaysCaption"),
    },
  ];
}

export async function requireVacationManager(tenantSlug: string) {
  await requireTenantAccess(tenantSlug, "vacation", "write");
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

  // Mit Scope "nur eigene" ist "Urlaub für jemand anderen eintragen" keine
  // erlaubte Aktion — die Mitarbeiterauswahl der App blendet sie dort auch
  // aus, durchgesetzt wird sie aber erst hier.
  await assertEmployeeInScope(
    await requireTenantAccess(input.tenantSlug, "vacation", "write"),
    employee.id,
  );

  validateVacationDateRange(input.startDate, input.endDate);

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

/**
 * Self-Service-Variante: ein Mitarbeiter beantragt Urlaub für sich selbst.
 * Braucht anders als `createTenantVacationRequest` keine "vacation:write"-
 * Berechtigung auf den gesamten Mandanten — nur eine gültige Mitgliedschaft
 * und eine verknüpfte Personalakte.
 */
export async function createMyVacationRequest(input: {
  tenantSlug: string;
  startDate: string;
  endDate: string;
  note: string;
}) {
  const access = await requireTenantMembership(input.tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true, name: true },
  });

  if (!employee) {
    throw new Error(
      "Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden.",
    );
  }

  validateVacationDateRange(input.startDate, input.endDate);

  const key = await createUniqueVacationKey({
    tenantId: access.tenantId,
    employeeName: employee.name,
    startDate: input.startDate,
  });

  const request = await prisma.tenantVacationRequest.create({
    data: {
      tenantId: access.tenantId,
      employeeId: employee.id,
      key,
      startDate: input.startDate,
      endDate: input.endDate,
      days: calculateVacationDays(input.startDate, input.endDate),
      note: input.note.trim(),
      status: "pending",
    },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Urlaubsantrag gestellt (Self-Service)",
    source: "Urlaub",
    entityType: "vacation",
    entityId: request.id,
    detail: employee.name,
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: access.tenantId },
    select: { name: true },
  });

  await notifyManagersOfNewVacationRequest({
    tenantId: access.tenantId,
    tenantName: tenant?.name ?? input.tenantSlug,
    employeeName: employee.name,
    requestId: request.id,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  return request;
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
    select: {
      id: true,
      employeeId: true,
      startDate: true,
      endDate: true,
      employee: { select: { name: true } },
    },
  });

  if (!request) {
    throw new Error("Urlaubsantrag nicht gefunden.");
  }

  // Über den eigenen Antrag entscheidet man nicht selbst: der Scope begrenzt
  // sonst nur die Liste, nicht das Genehmigen/Ablehnen per requestId.
  await assertEmployeeInScope(
    await requireTenantAccess(input.tenantSlug, "vacation", "write"),
    request.employeeId,
  );

  await prisma.tenantVacationRequest.update({
    where: { id: input.requestId },
    data: {
      status: input.status,
      decidedAt: new Date(),
      decidedBy: access.userId,
    },
  });

  const tenantAccess = await requireTenantAccess(input.tenantSlug, "vacation", "write");

  await recordTenantAudit({
    tenantId,
    actorId: tenantAccess.userId,
    actorName: tenantAccess.userName,
    action:
      input.status === "approved"
        ? "Urlaubsantrag genehmigt"
        : "Urlaubsantrag abgelehnt",
    source: "Urlaub",
    entityType: "vacation",
    entityId: request.id,
    detail: request.employee.name,
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  await notifyVacationRequestDecided({
    tenantId,
    tenantName: tenant?.name ?? input.tenantSlug,
    employeeId: request.employeeId,
    requestId: request.id,
    status: input.status,
    startDate: request.startDate,
    endDate: request.endDate,
  });

  // Nachträglich genehmigter Urlaub kann bereits veröffentlichte Schichten
  // betreffen (Urlaub wurde erst NACH dem Veröffentlichen beantragt/genehmigt)
  // — dann bekommen alle mit Schichtplan-Admin-Recht eine Konflikt-Meldung.
  if (input.status === "approved") {
    await notifyIfAbsenceConflictsWithPublishedShifts({
      tenantId,
      tenantName: tenant?.name ?? input.tenantSlug,
      employeeId: request.employeeId,
      employeeName: request.employee.name,
      startDate: request.startDate,
      endDate: request.endDate,
      reason: "vacation",
    });
  }
}

export async function updateTenantVacationRequest(input: {
  tenantSlug: string;
  requestId: string;
  startDate: string;
  endDate: string;
  note: string;
}) {
  await requireVacationManager(input.tenantSlug);
  const access = await requireTenantAccess(input.tenantSlug, "vacation", "write");
  const tenantId = access.tenantId;

  const request = await prisma.tenantVacationRequest.findFirst({
    where: { id: input.requestId, tenantId },
    select: { id: true, employeeId: true, employee: { select: { name: true } } },
  });

  if (!request) {
    throw new Error("Urlaubsantrag nicht gefunden.");
  }

  await assertEmployeeInScope(access, request.employeeId);

  // Bestehende Anträge dürfen auch auf vergangene Zeiträume korrigiert
  // werden (z. B. nachträgliche Erfassung) – nur das Format und die
  // Reihenfolge der Daten werden geprüft.
  const parsedStartDate = parseDateOnly(input.startDate);
  const parsedEndDate = parseDateOnly(input.endDate);

  if (!parsedStartDate || !parsedEndDate) {
    throw new Error("Bitte gültige Datumswerte auswählen.");
  }

  if (parsedEndDate < parsedStartDate) {
    throw new Error("Das Enddatum darf nicht vor dem Startdatum liegen.");
  }

  await prisma.tenantVacationRequest.update({
    where: { id: input.requestId },
    data: {
      startDate: input.startDate,
      endDate: input.endDate,
      days: calculateVacationDays(input.startDate, input.endDate),
      note: input.note.trim(),
    },
  });

  await recordTenantAudit({
    tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Urlaubsantrag aktualisiert",
    source: "Urlaub",
    entityType: "vacation",
    entityId: request.id,
    detail: `${request.employee.name}: ${formatDate(input.startDate)} – ${formatDate(input.endDate)}`,
  });
}

export async function deleteTenantVacationRequest(input: {
  tenantSlug: string;
  requestId: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "vacation", "read");

  if (!access.canDelete) {
    throw new Error("FORBIDDEN");
  }

  const tenantId = access.tenantId;

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
