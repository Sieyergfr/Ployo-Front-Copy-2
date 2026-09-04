import {
  notifyManagersOfNewWishFreeRequest,
  notifyWishFreeRequestDecided,
} from "@/lib/notifications/events";
import { prisma } from "@/lib/prisma";
import { getTenantIdForShifts, requireShiftManager } from "@/lib/shift-service";
import { assertEmployeeInScope, requireTenantAccess, requireTenantMembership } from "@/lib/tenant-access";
import {
  type WishFreeRequest,
  type WishFreeRequestStatus,
} from "@/lib/wish-free";

type WishFreeRecord = {
  id: string;
  key: string;
  date: string;
  status: string;
  reason: string;
  rejectReason: string;
  employeeId: string;
  employee: {
    name: string;
    location: string;
    role: string;
  };
};

function normalizeWishFreeKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function createUniqueWishFreeKey(input: {
  tenantId: string;
  employeeName: string;
  date: string;
}) {
  const keyBase =
    normalizeWishFreeKey(`${input.employeeName}-${input.date}-wunschfrei`) ||
    "wunschfrei";
  let key = keyBase;
  let suffix = 2;

  while (
    await prisma.tenantWishFreeRequest.findFirst({
      where: {
        tenantId: input.tenantId,
        key,
      },
      select: { id: true },
    })
  ) {
    key = `${keyBase}-${suffix}`;
    suffix += 1;
  }

  return key;
}

function normalizeStatus(value: string): WishFreeRequestStatus {
  if (value === "approved" || value === "rejected") {
    return value;
  }

  return "open";
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}.${month}.${year}`;
}

function toWishFreeRequest(record: WishFreeRecord): WishFreeRequest {
  return {
    id: record.key,
    dbId: record.id,
    employeeId: record.employeeId,
    employeeName: record.employee.name,
    role: record.employee.role,
    location: record.employee.location,
    date: record.date,
    dateLabel: formatDate(record.date),
    status: normalizeStatus(record.status),
    reason: record.reason,
    rejectReason: record.rejectReason || undefined,
  };
}

export async function getWishFreeRequestsForTenant(input: {
  tenantSlug: string;
  dates?: string[];
}) {
  const tenantId = await getTenantIdForShifts(input.tenantSlug);

  if (!tenantId) {
    return [];
  }

  const records = await prisma.tenantWishFreeRequest.findMany({
    where: {
      tenantId,
      date: input.dates ? { in: input.dates } : undefined,
    },
    orderBy: [{ status: "desc" }, { date: "asc" }, { createdAt: "desc" }],
    include: {
      employee: {
        select: {
          name: true,
          location: true,
          role: true,
        },
      },
    },
  });

  return records.map(toWishFreeRequest);
}

export async function createTenantWishFreeRequest(input: {
  tenantSlug: string;
  employeeId: string;
  date: string;
  reason: string;
}) {
  const access = await requireShiftManager(input.tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: {
      id: input.employeeId,
      tenantId: access.tenantId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!employee) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  const key = await createUniqueWishFreeKey({
    tenantId: access.tenantId,
    employeeName: employee.name,
    date: input.date,
  });

  return prisma.tenantWishFreeRequest.create({
    data: {
      tenantId: access.tenantId,
      employeeId: employee.id,
      key,
      date: input.date,
      reason: input.reason.trim(),
      status: "approved",
      decidedAt: new Date(),
      decidedBy: access.userId,
    },
  });
}

export async function setTenantWishFreeRequestStatus(input: {
  tenantSlug: string;
  requestId: string;
  status: "approved" | "rejected";
  rejectReason?: string;
}) {
  const access = await requireShiftManager(input.tenantSlug);
  const request = await prisma.tenantWishFreeRequest.findFirst({
    where: {
      id: input.requestId,
      tenantId: access.tenantId,
    },
    select: { id: true, date: true, employeeId: true },
  });

  if (!request) {
    throw new Error("Wunschfrei Anfrage nicht gefunden.");
  }

  // Der Scope begrenzt sonst nur die Liste, nicht das Genehmigen/Ablehnen per
  // requestId (gleiches Muster wie setTenantVacationRequestStatus).
  await assertEmployeeInScope(
    await requireTenantAccess(input.tenantSlug, "shifts", "write"),
    request.employeeId,
  );

  const rejectReason = input.status === "rejected" ? input.rejectReason?.trim() || "" : "";

  await prisma.tenantWishFreeRequest.update({
    where: { id: input.requestId },
    data: {
      status: input.status,
      rejectReason,
      decidedAt: new Date(),
      decidedBy: access.userId,
    },
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: access.tenantId },
    select: { name: true },
  });

  await notifyWishFreeRequestDecided({
    tenantId: access.tenantId,
    tenantName: tenant?.name ?? "",
    employeeId: request.employeeId,
    requestId: request.id,
    date: request.date,
    status: input.status,
    rejectReason,
  });
}

/**
 * Wunschfrei-Anfragen des eingeloggten Mitarbeiters (Self-Service der App).
 *
 * Bewusst getrennt von getWishFreeRequestsForTenant: das ist die
 * mandantenweite Planungssicht und verlangt Schichtplan-Rechte, während hier
 * jedes Mitglied ohne Zusatzrecht seine *eigenen* Anfragen sieht — dieselbe
 * Trennung wie bei Urlaub (/api/me/vacation-requests gegenüber
 * /api/tenants/[tenant]/vacation-requests).
 */
export async function getMyWishFreeRequests(tenantSlug: string) {
  const access = await requireTenantMembership(tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true },
  });

  if (!employee) {
    throw new Error("Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden.");
  }

  const records = await prisma.tenantWishFreeRequest.findMany({
    where: { tenantId: access.tenantId, employeeId: employee.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      employee: {
        select: {
          name: true,
          location: true,
          role: true,
        },
      },
    },
  });

  return records.map(toWishFreeRequest);
}

/**
 * Wunschfrei aus der App beantragen. Anders als createTenantWishFreeRequest
 * (Planungspfad, trägt direkt "approved" ein) entsteht hier eine *offene*
 * Anfrage, über die die Schichtplanung noch entscheidet.
 */
export async function createMyWishFreeRequest(input: {
  tenantSlug: string;
  date: string;
  reason: string;
}) {
  const access = await requireTenantMembership(input.tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true, name: true },
  });

  if (!employee) {
    throw new Error("Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("Bitte ein gültiges Datum angeben.");
  }

  const existing = await prisma.tenantWishFreeRequest.findFirst({
    where: {
      tenantId: access.tenantId,
      employeeId: employee.id,
      date: input.date,
      status: { in: ["open", "approved"] },
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Für diesen Tag liegt bereits eine Wunschfrei-Anfrage vor.");
  }

  const key = await createUniqueWishFreeKey({
    tenantId: access.tenantId,
    employeeName: employee.name,
    date: input.date,
  });

  const created = await prisma.tenantWishFreeRequest.create({
    data: {
      tenantId: access.tenantId,
      employeeId: employee.id,
      key,
      date: input.date,
      reason: input.reason.trim(),
      status: "open",
    },
    include: {
      employee: {
        select: {
          name: true,
          location: true,
          role: true,
        },
      },
    },
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: access.tenantId },
    select: { name: true },
  });

  await notifyManagersOfNewWishFreeRequest({
    tenantId: access.tenantId,
    tenantName: tenant?.name ?? "",
    employeeName: employee.name,
    requestId: created.id,
    date: created.date,
    reason: created.reason,
  });

  return toWishFreeRequest(created);
}

/** Eigene, noch offene Anfrage zurückziehen. Entschiedene bleiben stehen. */
export async function deleteMyWishFreeRequest(input: {
  tenantSlug: string;
  requestId: string;
}) {
  const access = await requireTenantMembership(input.tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true },
  });

  if (!employee) {
    throw new Error("Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden.");
  }

  const request = await prisma.tenantWishFreeRequest.findFirst({
    where: {
      tenantId: access.tenantId,
      employeeId: employee.id,
      OR: [{ id: input.requestId }, { key: input.requestId }],
    },
    select: { id: true, status: true },
  });

  if (!request) {
    throw new Error("Wunschfrei Anfrage nicht gefunden.");
  }

  if (request.status !== "open") {
    throw new Error("Bereits entschiedene Anfragen lassen sich nicht mehr zurückziehen.");
  }

  await prisma.tenantWishFreeRequest.delete({ where: { id: request.id } });
}
