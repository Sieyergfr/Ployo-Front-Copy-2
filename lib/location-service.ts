import { auth } from "@/lib/auth";
import { employees } from "@/lib/employees";
import {
  type Location,
  type LocationActivity,
  type LocationFile,
  type LocationFileFolder,
  type LocationMetric,
  type LocationShiftPlan,
  type LocationStatus,
  type LocationTeamMember,
} from "@/lib/locations";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

type LocationRecord = {
  id: string;
  key: string;
  kind: string;
  name: string;
  address: string;
  employeeCount: number;
  activeToday: number;
  shiftCount: number;
  openPositions: number;
  utilization: string;
  utilizationCaption: string;
  status: string;
  accentClassName: string;
  leadInitials: string;
  leadName: string;
  leadPhone: string;
  leadEmail: string;
  teamJson: string;
  activityJson: string;
  fileFoldersJson: string;
  filesJson: string;
  shiftPlanJson: string;
};

const emptyShiftPlan: LocationShiftPlan = {
  week: "KW 1",
  days: [
    { label: "Mo", date: "" },
    { label: "Di", date: "" },
    { label: "Mi", date: "" },
    { label: "Do", date: "" },
    { label: "Fr", date: "" },
    { label: "Sa", date: "", weekend: true },
    { label: "So", date: "", weekend: true },
  ],
  rows: [],
  employees: [],
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeLocationKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function createUniqueLocationKey(input: {
  tenantId: string;
  name: string;
  excludeLocationId?: string;
}) {
  const keyBase = normalizeLocationKey(input.name) || "standort";
  let key = keyBase;
  let suffix = 2;

  while (
    await prisma.tenantLocation.findFirst({
      where: {
        tenantId: input.tenantId,
        key,
        id: input.excludeLocationId ? { not: input.excludeLocationId } : undefined,
      },
      select: { id: true },
    })
  ) {
    key = `${keyBase}-${suffix}`;
    suffix += 1;
  }

  return key;
}

function normalizeStatus(value: string): LocationStatus {
  return value === "inactive" ? "inactive" : "active";
}

function toInt(value: number | string) {
  const parsed = Number.parseInt(String(value), 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function buildAddress(input: {
  street?: string;
  postalCode?: string;
  city?: string;
  address?: string;
}) {
  const address = input.address?.trim();

  if (address) {
    return address;
  }

  return [input.street?.trim(), [input.postalCode?.trim(), input.city?.trim()].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

function employeeLead(employeeId?: string) {
  const employee = employees.find((item) => item.id === employeeId);

  if (!employee) {
    return null;
  }

  return {
    leadInitials: employee.initials,
    leadName: employee.name,
    leadPhone: employee.phone,
    leadEmail: employee.email,
  };
}

function toLocation(record: LocationRecord): Location {
  return {
    id: record.key,
    dbId: record.id,
    key: record.key,
    kind: record.kind,
    name: record.name,
    address: record.address,
    employeeCount: record.employeeCount,
    activeToday: record.activeToday,
    shiftCount: record.shiftCount,
    openPositions: record.openPositions,
    utilization: record.utilization,
    utilizationCaption: record.utilizationCaption,
    status: normalizeStatus(record.status),
    accentClassName: record.accentClassName,
    lead: {
      initials: record.leadInitials,
      name: record.leadName,
      phone: record.leadPhone,
      email: record.leadEmail,
    },
    team: parseJson<LocationTeamMember[]>(record.teamJson, []),
    activity: parseJson<LocationActivity[]>(record.activityJson, []),
    fileFolders: parseJson<LocationFileFolder[]>(record.fileFoldersJson, []),
    files: parseJson<LocationFile[]>(record.filesJson, []),
    shiftPlan: parseJson<LocationShiftPlan>(record.shiftPlanJson, emptyShiftPlan),
  };
}

async function getSessionUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user?.id ?? null;
}

export async function getTenantIdForLocations(tenantSlug: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });

  return tenant?.id ?? null;
}

export async function getLocationsForTenant(tenantSlug: string) {
  const tenantId = await getTenantIdForLocations(tenantSlug);

  if (!tenantId) {
    return null;
  }

  const records = await prisma.tenantLocation.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  return records.map(toLocation);
}

export async function getLocationForTenant(tenantSlug: string, locationHandle: string) {
  const tenantId = await getTenantIdForLocations(tenantSlug);

  if (!tenantId) {
    return null;
  }

  const record = await prisma.tenantLocation.findFirst({
    where: {
      tenantId,
      key: locationHandle,
    },
  });

  return record ? toLocation(record) : null;
}

export function getLocationMetrics(locations: Location[]): LocationMetric[] {
  const active = locations.filter((location) => location.status === "active").length;
  const inactive = locations.length - active;
  const employeeCount = locations.reduce(
    (total, location) => total + location.employeeCount,
    0,
  );
  const openShifts = locations.reduce(
    (total, location) => total + location.openPositions,
    0,
  );

  return [
    {
      label: "Standorte gesamt",
      value: locations.length.toString(),
      caption: `${active} aktiv`,
    },
    {
      label: "Aktive Standorte",
      value: active.toString(),
      caption: `${inactive} inaktiv`,
    },
    {
      label: "Mitarbeiter gesamt",
      value: employeeCount.toString(),
      caption: "aller Standorte",
    },
    {
      label: "Offene Schichten",
      value: openShifts.toString(),
      caption: "diese Woche",
      tone: "danger",
    },
  ];
}

export async function requireLocationManager(tenantSlug: string) {
  const userId = await getSessionUserId();

  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId,
      tenant: {
        slug: tenantSlug,
      },
    },
    include: {
      roleRef: {
        include: {
          permissions: true,
        },
      },
      tenant: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  });

  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  const tenantWideManager = ["OWNER", "ADMIN", "HR"].includes(membership.role);
  const locationPermission = membership.roleRef?.permissions.find(
    (permission) => permission.area === "locations",
  );
  const customLocationManager =
    locationPermission?.level === "write" || locationPermission?.level === "admin";

  if (!tenantWideManager && !customLocationManager) {
    throw new Error("FORBIDDEN");
  }

  return {
    tenantId: membership.tenant.id,
    tenantSlug: membership.tenant.slug,
    userId,
  };
}

export async function createTenantLocation(input: {
  tenantSlug: string;
  name: string;
  kind: string;
  status: string;
  street: string;
  postalCode: string;
  city: string;
  leadEmployeeId?: string;
  email: string;
  accentClassName: string;
}) {
  const access = await requireLocationManager(input.tenantSlug);
  const key = await createUniqueLocationKey({
    tenantId: access.tenantId,
    name: input.name,
  });
  const lead = employeeLead(input.leadEmployeeId);

  return prisma.tenantLocation.create({
    data: {
      tenantId: access.tenantId,
      key,
      name: input.name.trim(),
      kind: input.kind.trim() || "Standort",
      status: normalizeStatus(input.status),
      address: buildAddress({
        street: input.street,
        postalCode: input.postalCode,
        city: input.city,
      }),
      accentClassName: input.accentClassName,
      leadInitials: lead?.leadInitials ?? "--",
      leadName: lead?.leadName ?? "Keine Leitung",
      leadPhone: lead?.leadPhone ?? "",
      leadEmail: input.email.trim() || lead?.leadEmail || "",
      shiftPlanJson: JSON.stringify(emptyShiftPlan),
    },
  });
}

export async function updateTenantLocation(input: {
  tenantSlug: string;
  locationId: string;
  name: string;
  kind: string;
  address: string;
  status: string;
  employeeCount: string;
  activeToday: string;
  shiftCount: string;
  openPositions: string;
  utilization: string;
  utilizationCaption: string;
  leadName: string;
  leadInitials: string;
  leadPhone: string;
  leadEmail: string;
}) {
  const access = await requireLocationManager(input.tenantSlug);
  const key = await createUniqueLocationKey({
    tenantId: access.tenantId,
    name: input.name,
    excludeLocationId: input.locationId,
  });

  return prisma.tenantLocation.update({
    where: {
      id: input.locationId,
      tenantId: access.tenantId,
    },
    data: {
      key,
      name: input.name.trim(),
      kind: input.kind.trim() || "Standort",
      address: buildAddress({ address: input.address }),
      status: normalizeStatus(input.status),
      employeeCount: toInt(input.employeeCount),
      activeToday: toInt(input.activeToday),
      shiftCount: toInt(input.shiftCount),
      openPositions: toInt(input.openPositions),
      utilization: input.utilization.trim() || "0%",
      utilizationCaption: input.utilizationCaption.trim(),
      leadName: input.leadName.trim() || "Keine Leitung",
      leadInitials: input.leadInitials.trim() || "--",
      leadPhone: input.leadPhone.trim(),
      leadEmail: input.leadEmail.trim(),
    },
  });
}

export async function deleteTenantLocation(input: {
  tenantSlug: string;
  locationId: string;
}) {
  const access = await requireLocationManager(input.tenantSlug);

  await prisma.tenantLocation.delete({
    where: {
      id: input.locationId,
      tenantId: access.tenantId,
    },
  });
}
