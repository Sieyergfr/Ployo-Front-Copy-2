import { auth } from "@/lib/auth";
import {
  addressDefaults,
  assertRequiredAddress,
  formatAddress,
  type AddressInput,
} from "@/lib/address";
import { isKnownLocationColor, isKnownLocationKind } from "@/lib/org-options";
import {
  type Location,
  type LocationActivity,
  type LocationFile,
  type LocationFileFolder,
  type LocationMetric,
  type LocationStatus,
} from "@/lib/locations";
import { recordTenantAudit } from "@/lib/audit";
import { mapTenantFileToFileItem } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import {
  requireTenantAccess,
  resolveScopeFilter,
  type TenantAccess,
} from "@/lib/tenant-access";
import { canAccessFileAcl, getOptionalAreaFileAccess } from "@/lib/file-access";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertValidLocationEmail(email: string) {
  if (email && !EMAIL_PATTERN.test(email)) {
    throw new Error("Bitte eine gültige Kontakt-E-Mail-Adresse angeben.");
  }
}

function assertKnownLocationKind(kind: string) {
  if (kind && !isKnownLocationKind(kind)) {
    throw new Error("Unbekannter Standort-Typ.");
  }
}

function assertKnownLocationColor(accentClassName: string) {
  if (accentClassName && !isKnownLocationColor(accentClassName)) {
    throw new Error("Unbekannte Standortfarbe.");
  }
}

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
  members?: { employeeId: string; initials: string; name: string }[];
  activities?: { actor: string; text: string; tone: string; createdAt: Date }[];
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
  accessRoleIdsJson: unknown;
  accessUserIdsJson: unknown;
  parent?: { accessRoleIdsJson: unknown; accessUserIdsJson: unknown } | null;
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
    team: (record.members ?? []).map((member) => ({
      employeeId: member.employeeId || undefined,
      initials: member.initials,
      name: member.name,
    })),
    activity: (record.activities ?? []).map((entry) => ({
      actor: entry.actor,
      text: entry.text,
      tone: entry.tone as LocationActivity["tone"],
      time: new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(entry.createdAt),
    })),
    fileFolders: Array.from(folderMap.values()),
    files,
  };
}

async function getSessionUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user?.id ?? null;
}

export async function getTenantIdForLocations(tenantSlug: string) {
  return (await requireTenantAccess(tenantSlug, "locations", "read")).tenantId;
}

/**
 * "assigned"-Scope für Standorte: nur der eigene, per Namensabgleich
 * ermittelte Standort. "own"/"team" ergeben für Standorte (bisher) keinen
 * Sinn — sicherheitshalber nichts treffen statt zu raten, welcher Standort
 * gemeint sein könnte.
 */
async function locationScopeWhere(access: TenantAccess) {
  const scopeFilter = await resolveScopeFilter(access);

  if (scopeFilter.type === "all") {
    return { tenantId: access.tenantId };
  }

  if (scopeFilter.type === "assigned" && scopeFilter.area === "locations") {
    return { tenantId: access.tenantId, name: { in: scopeFilter.locationNames } };
  }

  return { tenantId: access.tenantId, id: "__none__" };
}

export async function getLocationsForTenant(tenantSlug: string) {
  const access = await requireTenantAccess(tenantSlug, "locations", "read");
  const where = await locationScopeWhere(access);
  const fileAccess = await getOptionalAreaFileAccess(tenantSlug, "locations");

  const records = await prisma.tenantLocation.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      address: true,
      members: { orderBy: { createdAt: "asc" } },
      activities: { orderBy: { createdAt: "desc" } },
      storageFiles: {
        where: { status: "active" },
        orderBy: { updatedAt: "desc" },
        include: { parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } } },
      },
      storageFileFolders: {
        where: { status: "active" },
        orderBy: { name: "asc" },
      },
    },
  });

  return records.map((record) => toLocation({
    ...record,
    storageFiles: fileAccess
      ? record.storageFiles.filter((file) => canAccessFileAcl(file.parent ?? file, fileAccess))
      : [],
  }));
}

export async function getLocationForTenant(tenantSlug: string, locationHandle: string) {
  const access = await requireTenantAccess(tenantSlug, "locations", "read");
  const where = await locationScopeWhere(access);
  const fileAccess = await getOptionalAreaFileAccess(tenantSlug, "locations");

  const record = await prisma.tenantLocation.findFirst({
    where: {
      ...where,
      key: locationHandle,
    },
    include: {
      address: true,
      members: { orderBy: { createdAt: "asc" } },
      activities: { orderBy: { createdAt: "desc" } },
      storageFiles: {
        where: { status: "active" },
        orderBy: { updatedAt: "desc" },
        include: { parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } } },
      },
      storageFileFolders: {
        where: { status: "active" },
        orderBy: { name: "asc" },
      },
    },
  });

  return record ? toLocation({
    ...record,
    storageFiles: fileAccess
      ? record.storageFiles.filter((file) => canAccessFileAcl(file.parent ?? file, fileAccess))
      : [],
  }) : null;
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
  await requireTenantAccess(tenantSlug, "locations", "write");
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

async function recordLocationAudit(
  access: { tenantId: string; tenantSlug: string },
  action: string,
  locationId: string,
  detail: string,
) {
  const tenantAccess = await requireTenantAccess(
    access.tenantSlug,
    "locations",
    "write",
  );

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: tenantAccess.userId,
    actorName: tenantAccess.userName,
    action,
    source: "Standorte",
    entityType: "location",
    entityId: locationId,
    detail,
  });
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
  assertValidLocationEmail(input.email.trim());
  assertKnownLocationKind(input.kind.trim());
  assertKnownLocationColor(input.accentClassName);
  const address = assertRequiredAddress(input.address);

  const access = await requireLocationManager(input.tenantSlug);
  const key = await createUniqueLocationKey({
    tenantId: access.tenantId,
    name: input.name,
  });
  const lead = await employeeLead({
    tenantId: access.tenantId,
    employeeId: input.leadEmployeeId,
  });

  const location = await prisma.tenantLocation.create({
    data: {
      tenant: {
        connect: { id: access.tenantId },
      },
      key,
      name: input.name.trim(),
      kind: input.kind.trim() || "Standort",
      status: normalizeStatus(input.status),
      address: {
        create: address,
      },
      accentClassName: input.accentClassName,
      leadInitials: lead?.leadInitials ?? "--",
      leadName: lead?.leadName ?? "Keine Leitung",
      leadPhone: lead?.leadPhone ?? "",
      leadEmail: input.email.trim() || lead?.leadEmail || "",
    },
    include: { address: true },
  });

  await recordLocationAudit(
    access,
    "Standort angelegt",
    location.id,
    location.name,
  );

  return location;
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
  assertValidLocationEmail(input.leadEmail.trim());
  assertKnownLocationKind(input.kind.trim());
  assertKnownLocationColor(input.accentClassName.trim());
  const address = assertRequiredAddress(input.address);

  const access = await requireLocationManager(input.tenantSlug);
  const key = await createUniqueLocationKey({
    tenantId: access.tenantId,
    name: input.name,
    excludeLocationId: input.locationId,
  });
  const current = await prisma.tenantLocation.findFirst({
    where: { id: input.locationId, tenantId: access.tenantId },
    select: { name: true },
  });
  const nextName = input.name.trim();

  const updated = await prisma.tenantLocation.update({
    where: {
      id: input.locationId,
      tenantId: access.tenantId,
    },
    data: {
      key,
      name: nextName,
      kind: input.kind.trim() || "Standort",
      address: {
        upsert: {
          create: address,
          update: address,
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

  // TenantEmployee.location / TenantTeamMember.location sind Freitext-Kopien
  // des Standortnamens (keine Relation) — bei Umbenennung überall nachziehen.
  if (current && current.name !== nextName) {
    await Promise.all([
      prisma.tenantEmployee.updateMany({
        where: { tenantId: access.tenantId, location: current.name },
        data: { location: nextName },
      }),
      prisma.tenantTeamMember.updateMany({
        where: { team: { tenantId: access.tenantId }, location: current.name },
        data: { location: nextName },
      }),
    ]);
  }

  await recordLocationAudit(
    access,
    "Standort geändert",
    updated.id,
    updated.name,
  );

  return updated;
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
  const currentMembers = await prisma.tenantLocationMember.findMany({
    where: { locationId: input.locationId },
    select: { employeeId: true, name: true },
  });
  const existingKeys = new Set(
    currentMembers.map((member) => member.employeeId || member.name),
  );
  const newMembers = employees
    .filter((employee) => !existingKeys.has(employee.id) && !existingKeys.has(employee.name))
    .map((employee) => ({
      employeeId: employee.id,
      initials: employee.initials,
      name: employee.name,
    }));
  const actorName = (
    await requireTenantAccess(input.tenantSlug, "locations", "write")
  ).userName;
  const totalMembers = currentMembers.length + newMembers.length;

  if (newMembers.length > 0) {
    await prisma.$transaction([
      prisma.tenantLocationMember.createMany({
        data: newMembers.map((member) => ({ ...member, locationId: input.locationId })),
      }),
      prisma.tenantLocationActivity.create({
        data: {
          tenantId: access.tenantId,
          locationId: input.locationId,
          actor: actorName,
          text:
            newMembers.length === 1
              ? `hat ${newMembers[0].name} dem Standort hinzugefügt`
              : `hat ${newMembers.length} Mitarbeiter dem Standort hinzugefügt`,
          tone: "success",
        },
      }),
      prisma.tenantLocation.update({
        where: { id: input.locationId, tenantId: access.tenantId },
        data: {
          employeeCount: totalMembers,
          activeToday: Math.max(
            totalMembers,
            employees.filter((employee) => employee.status === "active").length,
          ),
        },
      }),
    ]);
  }

  const updated = await prisma.tenantLocation.findFirstOrThrow({
    where: { id: input.locationId, tenantId: access.tenantId },
  });

  await recordLocationAudit(
    access,
    "Mitarbeiter zu Standort hinzugefügt",
    input.locationId,
    newMembers.map((member) => member.name).join(", "),
  );

  return updated;
}

export async function deleteTenantLocation(input: {
  tenantSlug: string;
  locationId: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "locations", "read");

  if (!access.canDelete) {
    throw new Error("FORBIDDEN");
  }

  const location = await prisma.tenantLocation.delete({
    where: {
      id: input.locationId,
      tenantId: access.tenantId,
    },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Standort gelöscht",
    source: "Standorte",
    entityType: "location",
    entityId: location.id,
    detail: location.name,
  });
}
