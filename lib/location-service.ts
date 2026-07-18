import { auth } from "@/lib/auth";
import {
  addressDefaults,
  formatAddress,
  normalizeAddressInput,
  type AddressInput,
} from "@/lib/address";
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
import { mapTenantFileToFileItem } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

type LocationRecord = {
  id: string;
  key: string;
  kind: string;
  name: string;
  address: {
    street: string;
    houseNumber: string;
    postalCode: string;
    city: string;
    careOf: string;
    country: string;
  } | null;
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
  storageFiles?: TenantFileRecord[];
  storageFileFolders?: TenantFileFolderRecord[];
};

type TenantFileRecord = {
  id: string;
  displayName: string;
  originalName: string;
  folderName: string;
  folderSlug: string;
  ownerName: string;
  updatedAt: Date;
  createdAt: Date;
  sizeBytes: number;
  mimeType: string;
  extension: string;
  version: number;
};

type TenantFileFolderRecord = {
  id: string;
  name: string;
  path: string;
  ownerName: string;
  locked: boolean;
  updatedAt: Date;
  createdAt: Date;
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

async function employeeLead(input: { tenantId: string; employeeId?: string }) {
  if (!input.employeeId) {
    return null;
  }

  const employee = await prisma.tenantEmployee.findFirst({
    where: {
      id: input.employeeId,
      tenantId: input.tenantId,
    },
    select: {
      initials: true,
      name: true,
      phone: true,
      email: true,
    },
  });

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
  const storedFiles: LocationFile[] = (record.storageFiles ?? []).map((file) => {
    const mapped = mapTenantFileToFileItem(file);

    return {
      name: mapped.name,
      folder: mapped.folder,
      updatedAt: mapped.updatedAt,
      size: mapped.size,
      type: mapped.type,
      locked: true,
      storageFileId: mapped.storageFileId,
    };
  });
  const files = storedFiles;
  const folderMap = new Map<string, LocationFileFolder>();

  for (const folder of record.storageFileFolders ?? []) {
    folderMap.set(folder.name, {
      name: folder.name,
      path: folder.path,
      fileCount: 0,
      locked: folder.locked,
    });
  }

  for (const file of storedFiles) {
    const current = folderMap.get(file.folder);

    if (current) {
      current.fileCount += 1;
    } else {
      folderMap.set(file.folder, {
        name: file.folder,
        fileCount: 1,
        locked: true,
      });
    }
  }

  return {
    id: record.key,
    dbId: record.id,
    key: record.key,
    kind: record.kind,
    name: record.name,
    address: formatAddress(record.address),
    addressFields: addressDefaults(record.address),
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
    fileFolders: Array.from(folderMap.values()),
    files,
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
    include: {
      address: true,
      storageFiles: {
        where: { status: "active" },
        orderBy: { updatedAt: "desc" },
      },
      storageFileFolders: {
        where: { status: "active" },
        orderBy: { name: "asc" },
      },
    },
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
    include: {
      address: true,
      storageFiles: {
        where: { status: "active" },
        orderBy: { updatedAt: "desc" },
      },
      storageFileFolders: {
        where: { status: "active" },
        orderBy: { name: "asc" },
      },
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
  address: AddressInput;
  leadEmployeeId?: string;
  email: string;
  accentClassName: string;
}) {
  const access = await requireLocationManager(input.tenantSlug);
  const key = await createUniqueLocationKey({
    tenantId: access.tenantId,
    name: input.name,
  });
  const lead = await employeeLead({
    tenantId: access.tenantId,
    employeeId: input.leadEmployeeId,
  });

  return prisma.tenantLocation.create({
    data: {
      tenant: {
        connect: { id: access.tenantId },
      },
      key,
      name: input.name.trim(),
      kind: input.kind.trim() || "Standort",
      status: normalizeStatus(input.status),
      address: {
        create: normalizeAddressInput(input.address),
      },
      accentClassName: input.accentClassName,
      leadInitials: lead?.leadInitials ?? "--",
      leadName: lead?.leadName ?? "Keine Leitung",
      leadPhone: lead?.leadPhone ?? "",
      leadEmail: input.email.trim() || lead?.leadEmail || "",
      shiftPlanJson: JSON.stringify(emptyShiftPlan),
    },
    include: { address: true },
  });
}

export async function updateTenantLocation(input: {
  tenantSlug: string;
  locationId: string;
  name: string;
  kind: string;
  address: AddressInput;
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
  accentClassName: string;
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
      address: {
        upsert: {
          create: normalizeAddressInput(input.address),
          update: normalizeAddressInput(input.address),
        },
      },
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
      accentClassName: input.accentClassName.trim() || "bg-ink",
    },
    include: { address: true },
  });
}

export async function addEmployeesToTenantLocation(input: {
  tenantSlug: string;
  locationId: string;
  employeeIds: string[];
}) {
  const access = await requireLocationManager(input.tenantSlug);
  const employeeIds = Array.from(
    new Set(input.employeeIds.map((id) => id.trim()).filter(Boolean)),
  );

  if (employeeIds.length === 0) {
    throw new Error("Keine Mitarbeiter ausgewählt.");
  }

  const location = await prisma.tenantLocation.findFirst({
    where: {
      id: input.locationId,
      tenantId: access.tenantId,
    },
  });

  if (!location) {
    throw new Error("Standort nicht gefunden.");
  }

  const employees = await prisma.tenantEmployee.findMany({
    where: {
      id: { in: employeeIds },
      tenantId: access.tenantId,
    },
    select: {
      id: true,
      initials: true,
      name: true,
      status: true,
    },
  });
  const currentTeam = parseJson<Array<LocationTeamMember & { employeeId?: string }>>(
    location.teamJson,
    [],
  );
  const existingKeys = new Set(
    currentTeam.map((member) => member.employeeId ?? member.name),
  );
  const newMembers = employees
    .filter((employee) => !existingKeys.has(employee.id) && !existingKeys.has(employee.name))
    .map((employee) => ({
      employeeId: employee.id,
      initials: employee.initials,
      name: employee.name,
    }));
  const nextTeam = [...currentTeam, ...newMembers];
  const currentShiftPlan = parseJson<LocationShiftPlan>(
    location.shiftPlanJson,
    emptyShiftPlan,
  );
  const existingShiftKeys = new Set(
    currentShiftPlan.employees.map((employee) => employee.employeeId ?? employee.name),
  );
  const shiftEmployees = employees
    .filter(
      (employee) =>
        !existingShiftKeys.has(employee.id) && !existingShiftKeys.has(employee.name),
    )
    .map((employee) => ({
      employeeId: employee.id,
      initials: employee.initials,
      name: employee.name,
      days: currentShiftPlan.days.map(() => null),
    }));
  const nextShiftPlan: LocationShiftPlan = {
    ...currentShiftPlan,
    employees: [...currentShiftPlan.employees, ...shiftEmployees],
  };
  const activity = parseJson<LocationActivity[]>(location.activityJson, []);
  const now = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return prisma.tenantLocation.update({
    where: {
      id: input.locationId,
      tenantId: access.tenantId,
    },
    data: {
      teamJson: JSON.stringify(nextTeam),
      shiftPlanJson: JSON.stringify(nextShiftPlan),
      employeeCount: nextTeam.length,
      activeToday: Math.max(
        nextTeam.length,
        employees.filter((employee) => employee.status === "active").length,
      ),
      activityJson: JSON.stringify([
        {
          actor: "Carla Brandt",
          text:
            newMembers.length === 1
              ? `hat ${newMembers[0].name} dem Standort hinzugefügt`
              : `hat ${newMembers.length} Mitarbeiter dem Standort hinzugefügt`,
          time: now,
          tone: "success",
        },
        ...activity,
      ]),
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
