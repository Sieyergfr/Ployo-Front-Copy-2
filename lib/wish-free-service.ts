import { prisma } from "@/lib/prisma";
import { getTenantIdForShifts, requireShiftManager } from "@/lib/shift-service";
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
    select: { id: true },
  });

  if (!request) {
    throw new Error("Wunschfrei Anfrage nicht gefunden.");
  }

  await prisma.tenantWishFreeRequest.update({
    where: { id: input.requestId },
    data: {
      status: input.status,
      rejectReason: input.status === "rejected" ? input.rejectReason?.trim() || "" : "",
      decidedAt: new Date(),
      decidedBy: access.userId,
    },
  });
}
