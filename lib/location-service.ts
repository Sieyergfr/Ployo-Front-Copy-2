import { parseIdList } from "@/lib/file-folders";
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
import {
  parseOpeningHoursDays,
  resolveEffectiveOpeningHours,
  type OpeningHoursDay,
} from "@/lib/opening-hours";
import { BUNDESLAENDER } from "@/lib/german-holidays";
import { prisma } from "@/lib/prisma";
import { clockQrPayload, generateClockQrToken } from "@/lib/time-clock-qr";
import { getDefaultOpeningHours, getISOWeekFromDate, getISOWeekStart } from "@/lib/shift-service";
import { headers } from "next/headers";

/** Datums-IDs (`YYYY-MM-DD`) der aktuellen ISO-Woche — für die "Schichten diese Woche"-Kennzahl je Standort. */
function thisWeekDateIds(): string[] {
  const { year, week } = getISOWeekFromDate(new Date());
  const start = getISOWeekStart(year, week);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);

    date.setUTCDate(start.getUTCDate() + index);

    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  });
}

/** Datums-ID (`YYYY-MM-DD`) des heutigen Tages — für die "Heute im Dienst"-Kennzahl. */
function todayDateId(): string {
  const now = new Date();

  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}
import {
  assertLocationInScope,
  requireTenantAccess,
  resolveScopeFilter,
  type TenantAccess,
} from "@/lib/tenant-access";
import { canAccessFileAcl, ownerFolderPathAllowed, getOptionalAreaFileAccess } from "@/lib/file-access";

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
  openingHoursJson: unknown;
  shiftMinStaffing: number | null;
  utilization: string;
  utilizationCaption: string;
  status: string;
  accentClassName: string;
  leadInitials: string;
  leadName: string;
  leadPhone: string;
  leadEmail: string;
  contactEmail?: string;
  leadEmployeeId: string | null;
  members?: { employeeId: string; initials: string; name: string }[];
  activities?: { actor: string; text: string; tone: string; createdAt: Date }[];
  shifts?: { id: string; date: string; employeeId: string | null }[];
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
  pinned?: boolean;
  accessRoleIdsJson?: unknown;
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

/**
 * Verhindert doppelte Standortnamen pro Mandant, case-insensitiv (QA-Bug
 * BUG-006) — bisher unterschied sich bei einem Namenskonflikt nur der
 * technische Slug (z. B. `berlin-office-2`), der angezeigte Name blieb
 * identisch und war dadurch in Auswahllisten/Löschdialogen nicht mehr
 * eindeutig zuordenbar.
 */
async function assertUniqueLocationName(input: {
  tenantId: string;
  name: string;
  excludeLocationId?: string;
}) {
  const name = input.name.trim();

  if (!name) {
    return;
  }

  const existing = await prisma.tenantLocation.findFirst({
    where: {
      tenantId: input.tenantId,
      name: { equals: name, mode: "insensitive" },
      id: input.excludeLocationId ? { not: input.excludeLocationId } : undefined,
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error(`Ein Standort mit dem Namen "${name}" existiert bereits.`);
  }
}

function normalizeStatus(value: string): LocationStatus {
  return value === "inactive" ? "inactive" : "active";
}

function toInt(value: number | string) {
  const parsed = Number.parseInt(String(value), 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Mindestbesetzung eines Standorts. `null`/leer bedeutet ausdrücklich
 * "Unternehmensvorgabe verwenden" und ist etwas anderes als eine
 * eingetragene 0 ("dieser Standort braucht keine Mindestbesetzung") — deshalb
 * bleibt der Wert nullable statt auf 0 normalisiert zu werden.
 */
function normalizeMinStaffing(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);

  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 99) : null;
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

function toLocation(
  record: LocationRecord,
  tenantDefaultOpeningHours: OpeningHoursDay[],
  tenantMinStaffing: number,
): Location {
  const openingHoursOverride = parseOpeningHoursDays(record.openingHoursJson);
  const openingHours = resolveEffectiveOpeningHours(openingHoursOverride, tenantDefaultOpeningHours);
  const storedFiles: LocationFile[] = (record.storageFiles ?? []).map((file) => {
    const mapped = mapTenantFileToFileItem(file);

    return {
      name: mapped.name,
      folder: mapped.folder,
      folderSlug: mapped.folderSlug,
      updatedAt: mapped.updatedAt,
      size: mapped.size,
      type: mapped.type,
      locked: true,
      storageFileId: mapped.storageFileId,
      version: mapped.version,
    };
  });
  const files = storedFiles;
  const folderMap = new Map<string, LocationFileFolder>();

  // Schluessel ist der Ordner-PFAD, nicht der Name: nur so lassen sich
  // gleichnamige Unterordner in verschiedenen Zweigen auseinanderhalten und
  // die Ordnernavigation (components/OwnerFilesTab.tsx) verschachteln.
  for (const folder of record.storageFileFolders ?? []) {
    folderMap.set(folder.path, {
      name: folder.name,
      path: folder.path,
      fileCount: 0,
      locked: folder.locked,
      pinned: folder.pinned,
      accessRoleIds: parseIdList(folder.accessRoleIdsJson),
    });
  }

  for (const file of storedFiles) {
    if (!file.folderSlug) {
      continue;
    }

    const current = folderMap.get(file.folderSlug);

    if (current) {
      current.fileCount += 1;
    } else {
      folderMap.set(file.folderSlug, {
        name: file.folder,
        path: file.folderSlug,
        fileCount: 1,
        locked: false,
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
    // Live aus der tatsächlichen Mitgliederliste statt aus dem
    // denormalisierten `employeeCount`-Feld — das driftete auseinander,
    // sobald Mitgliedschaften außerhalb von `addEmployeesToTenantLocation`/
    // `syncEmployeeLocationMemberships` entstanden (z. B. direkt in der DB
    // angelegte Bestandsdaten), siehe To-Do "Standorte: Mitarbeiter-Anzahl falsch".
    employeeCount: (record.members ?? []).length,
    // Live: Anzahl unterschiedlicher Mitarbeiter mit einer heutigen Schicht
    // an diesem Standort — statt des nie aktualisierten `activeToday`-Felds
    // (blieb i. d. R. bei 0), siehe To-Do "Heute im Dienst ist immer 0".
    activeToday: new Set(
      (record.shifts ?? [])
        .filter((shift) => shift.date === todayDateId())
        .map((shift) => shift.employeeId)
        .filter((employeeId): employeeId is string => Boolean(employeeId)),
    ).size,
    // Live aus tatsächlich geplanten Schichten dieser Woche statt aus dem nie
    // aktualisierten `shiftCount`-Feld — siehe To-Do "Standorte: Schichten-Anzahl falsch".
    shiftCount: (record.shifts ?? []).length,
    openPositions: record.openPositions,
    // Live wie `shiftCount`: unbesetzte Schichten dieser Woche. Eigenes Feld,
    // weil die App `openPositions` als "Offene Stellen" anzeigt.
    openShiftCount: (record.shifts ?? []).filter((shift) => !shift.employeeId).length,
    openingHours,
    usesDefaultOpeningHours: openingHoursOverride.length === 0,
    shiftMinStaffing: record.shiftMinStaffing,
    effectiveMinStaffing: record.shiftMinStaffing ?? tenantMinStaffing,
    utilization: record.utilization,
    utilizationCaption: record.utilizationCaption,
    status: normalizeStatus(record.status),
    accentClassName: record.accentClassName,
    contactEmail: record.contactEmail ?? "",
    lead: {
      employeeId: record.leadEmployeeId,
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
      // Ohne `timeZone` formatiert in Serverzeit (UTC) statt Ortszeit,
      // gleicher Fehler wie BUG-016 (lib/files.ts formatUpdatedAt).
      time: new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Berlin",
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
export async function locationScopeWhere(access: TenantAccess) {
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
  const tenantDefaultOpeningHours = await getDefaultOpeningHours(tenantSlug);
  const tenantMinStaffing = await getTenantMinStaffing(access.tenantId);

  const records = await prisma.tenantLocation.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      address: true,
      members: { orderBy: { createdAt: "asc" } },
      shifts: {
        where: { tenantId: access.tenantId, date: { in: thisWeekDateIds() } },
        select: { id: true, date: true, employeeId: true },
      },
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
      ? record.storageFiles.filter((file) => canAccessFileAcl(file.parent ?? file, fileAccess) && ownerFolderPathAllowed(fileAccess, record.storageFileFolders, file.folderSlug))
      : [],
    storageFileFolders: fileAccess ? record.storageFileFolders.filter((folder) => ownerFolderPathAllowed(fileAccess, record.storageFileFolders, folder.path)) : [],
  }, tenantDefaultOpeningHours, tenantMinStaffing));
}

/** Unternehmensweite Mindestbesetzung — Rückfallwert für Standorte ohne eigenen Wert. */
async function getTenantMinStaffing(tenantId: string) {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { shiftMinStaffing: true },
  });

  return settings?.shiftMinStaffing ?? 3;
}

export async function getLocationForTenant(tenantSlug: string, locationHandle: string) {
  const access = await requireTenantAccess(tenantSlug, "locations", "read");
  const where = await locationScopeWhere(access);
  const fileAccess = await getOptionalAreaFileAccess(tenantSlug, "locations");
  const tenantDefaultOpeningHours = await getDefaultOpeningHours(tenantSlug);
  const tenantMinStaffing = await getTenantMinStaffing(access.tenantId);

  const record = await prisma.tenantLocation.findFirst({
    where: {
      ...where,
      key: locationHandle,
    },
    include: {
      address: true,
      members: { orderBy: { createdAt: "asc" } },
      shifts: {
        where: { tenantId: access.tenantId, date: { in: thisWeekDateIds() } },
        select: { id: true, date: true, employeeId: true },
      },
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
      ? record.storageFiles.filter((file) => canAccessFileAcl(file.parent ?? file, fileAccess) && ownerFolderPathAllowed(fileAccess, record.storageFileFolders, file.folderSlug))
      : [],
    storageFileFolders: fileAccess ? record.storageFileFolders.filter((folder) => ownerFolderPathAllowed(fileAccess, record.storageFileFolders, folder.path)) : [],
  }, tenantDefaultOpeningHours, tenantMinStaffing) : null;
}

/** `t` kommt aus dem Namespace "LocationMetrics" (next-intl) — bewusst nur als generische Funktionssignatur getippt, damit dieses lib-Modul next-intl nicht selbst importieren muss. */
export function getLocationMetrics(
  locations: Location[],
  t: (key: string, values?: Record<string, string | number>) => string,
): LocationMetric[] {
  const active = locations.filter((location) => location.status === "active").length;
  const inactive = locations.length - active;
  const employeeCount = locations.reduce(
    (total, location) => total + location.employeeCount,
    0,
  );
  const openShifts = locations.reduce(
    (total, location) => total + (location.openShiftCount ?? 0),
    0,
  );

  return [
    {
      label: t("locationsTotal"),
      value: locations.length.toString(),
      caption: t("activeCount", { count: active }),
    },
    {
      label: t("activeLocations"),
      value: active.toString(),
      caption: t("inactiveCount", { count: inactive }),
    },
    {
      label: t("employeesTotal"),
      value: employeeCount.toString(),
      caption: t("allLocationsCaption"),
    },
    {
      label: t("openShifts"),
      value: openShifts.toString(),
      caption: t("thisWeek"),
      tone: "danger",
    },
  ];
}

/**
 * Payload für die App-seitigen `/api/tenants/[tenant]/locations`-Routen —
 * analog zu `toTeamAdminPayload` (lib/team-service.ts). Die App erwartet
 * flache `leadName`/`leadInitials`/`leadPhone`/`leadEmail`-Felder und eine
 * strukturierte Adresse (`addressFields`), nicht das für die Web-Anzeige
 * vorformatierte `lead`-Objekt bzw. den `address`-String — ohne dieses
 * Mapping blieben Leitung und Adresse in der App leer (siehe To-Do
 * "Standort Detail: Leitung wird nicht angezeigt" / "Adresse laden").
 */
export function toLocationAdminPayload(location: Location) {
  const hasRealLead = Boolean(location.lead.name && location.lead.name !== "Keine Leitung");

  return {
    id: location.id,
    dbId: location.dbId ?? null,
    key: location.key ?? location.id,
    name: location.name,
    kind: location.kind,
    status: location.status,
    address: location.addressFields ?? null,
    leadEmployeeId: location.lead.employeeId,
    leadName: hasRealLead ? location.lead.name : null,
    leadInitials: hasRealLead ? location.lead.initials : null,
    leadPhone: hasRealLead ? location.lead.phone : null,
    leadEmail: hasRealLead ? location.lead.email : null,
    email: location.contactEmail || location.lead.email || null,
    contactEmail: location.contactEmail || null,
    accentClassName: location.accentClassName,
    employeeCount: location.employeeCount,
    activeToday: location.activeToday,
    shiftCount: location.shiftCount,
    openPositions: location.openPositions,
    utilization: location.utilization,
    utilizationCaption: location.utilizationCaption,
    openingHours: location.openingHours,
    usesDefaultOpeningHours: location.usesDefaultOpeningHours,
    shiftMinStaffing: location.shiftMinStaffing,
    effectiveMinStaffing: location.effectiveMinStaffing,
  };
}

export async function requireLocationManager(tenantSlug: string) {
  const tenantAccess = await requireTenantAccess(tenantSlug, "locations", "write");
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
    ...tenantAccess,
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
  /** Leer = Mandanten-Standard verwenden, siehe resolveEffectiveOpeningHours(). */
  openingHours?: OpeningHoursDay[];
  /** `null` = Unternehmensvorgabe (TenantSettings.shiftMinStaffing) gilt weiter. */
  shiftMinStaffing?: number | null;
  /** Bundesland für Feiertage (optional, Dashboard); leer = nur bundesweite Feiertage. */
  bundesland?: string;
}) {
  assertValidLocationEmail(input.email.trim());
  assertKnownLocationKind(input.kind.trim());
  assertKnownLocationColor(input.accentClassName);
  const address = assertRequiredAddress(input.address);

  const access = await requireLocationManager(input.tenantSlug);
  await assertUniqueLocationName({ tenantId: access.tenantId, name: input.name });
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
      leadEmployee: lead ? { connect: { id: input.leadEmployeeId } } : undefined,
      leadInitials: lead?.leadInitials ?? "--",
      leadName: lead?.leadName ?? "Keine Leitung",
      leadPhone: lead?.leadPhone ?? "",
      leadEmail: input.email.trim() || lead?.leadEmail || "",
      contactEmail: input.email.trim(),
      openingHoursJson: input.openingHours ?? [],
      shiftMinStaffing: normalizeMinStaffing(input.shiftMinStaffing),
      bundesland: BUNDESLAENDER.find((entry) => entry.code === input.bundesland)?.code ?? null,
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
  /** Kennzahlen werden automatisch aus Team-/Schichtdaten berechnet — nur überschreiben, wenn explizit mitgegeben. */
  employeeCount?: string;
  activeToday?: string;
  shiftCount?: string;
  openPositions?: string;
  utilization?: string;
  utilizationCaption?: string;
  /**
   * Leitung wird aus dem Mitarbeiterprofil übernommen (Name/Initialen/
   * Telefon/E-Mail) — leer = Leitung entfernen. Die freien Textfelder
   * darunter bleiben nur als Fallback für Aufrufer, die (noch) keine
   * Mitarbeiter-Zuordnung schicken.
   */
  leadEmployeeId?: string;
  leadName?: string;
  leadInitials?: string;
  leadPhone?: string;
  leadEmail?: string;
  /** Kontakt-E-Mail des Standorts (M5); `undefined` = unverändert. */
  contactEmail?: string;
  accentClassName: string;
  /** Leer = Mandanten-Standard verwenden, siehe resolveEffectiveOpeningHours(). */
  openingHours?: OpeningHoursDay[];
  /** `null` = Unternehmensvorgabe (TenantSettings.shiftMinStaffing) gilt weiter. */
  shiftMinStaffing?: number | null;
}) {
  if (input.contactEmail !== undefined) {
    assertValidLocationEmail(input.contactEmail.trim());
  }

  assertKnownLocationKind(input.kind.trim());
  assertKnownLocationColor(input.accentClassName.trim());
  const address = assertRequiredAddress(input.address);

  const access = await requireLocationManager(input.tenantSlug);
  await assertLocationInScope(access, input.locationId);
  const lead = input.leadEmployeeId
    ? await employeeLead({ tenantId: access.tenantId, employeeId: input.leadEmployeeId })
    : null;
  const leadName = lead?.leadName ?? input.leadName ?? "";
  const leadInitials = lead?.leadInitials ?? input.leadInitials ?? "";
  const leadPhone = lead?.leadPhone ?? input.leadPhone ?? "";
  const leadEmail = lead?.leadEmail ?? input.leadEmail ?? "";

  assertValidLocationEmail(leadEmail.trim());
  await assertUniqueLocationName({
    tenantId: access.tenantId,
    name: input.name,
    excludeLocationId: input.locationId,
  });
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
      ...(input.employeeCount !== undefined ? { employeeCount: toInt(input.employeeCount) } : {}),
      ...(input.activeToday !== undefined ? { activeToday: toInt(input.activeToday) } : {}),
      ...(input.shiftCount !== undefined ? { shiftCount: toInt(input.shiftCount) } : {}),
      ...(input.openPositions !== undefined ? { openPositions: toInt(input.openPositions) } : {}),
      ...(input.utilization !== undefined
        ? { utilization: input.utilization.trim() || "0%" }
        : {}),
      ...(input.utilizationCaption !== undefined
        ? { utilizationCaption: input.utilizationCaption.trim() }
        : {}),
      // Leer/kein gültiger Mitarbeiter = Leitung entfernen — Fremdschlüssel
      // ist jetzt die Quelle der Wahrheit, die Namensfelder darunter bleiben
      // nur der Anzeige-Schnappschuss (siehe To-Do "Leitung ist Namensabgleich").
      leadEmployee: lead ? { connect: { id: input.leadEmployeeId } } : { disconnect: true },
      leadName: leadName.trim() || "Keine Leitung",
      leadInitials: leadInitials.trim() || "--",
      leadPhone: leadPhone.trim(),
      leadEmail: leadEmail.trim(),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail.trim() } : {}),
      accentClassName: input.accentClassName.trim() || "bg-ink",
      ...(input.openingHours !== undefined ? { openingHoursJson: input.openingHours } : {}),
      ...(input.shiftMinStaffing !== undefined
        ? { shiftMinStaffing: normalizeMinStaffing(input.shiftMinStaffing) }
        : {}),
    },
    include: { address: true },
  });

  // TenantEmployee.location / TenantTeamMember.location / TenantTeam.locations
  // sind Freitext-Kopien des Standortnamens (keine Relation) — bei
  // Umbenennung überall nachziehen.
  if (current && current.name !== nextName) {
    await prisma.$transaction(async (tx) => {
      await tx.tenantEmployee.updateMany({
        where: { tenantId: access.tenantId, location: current.name },
        data: { location: nextName },
      });
      await tx.tenantTeamMember.updateMany({
        where: { team: { tenantId: access.tenantId }, location: current.name },
        data: { location: nextName },
      });
      await rewriteTeamLocationLists(tx, access.tenantId, current.name, nextName);
    });
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
  await assertLocationInScope(access, input.locationId);
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

/**
 * Entfernt Mitarbeiter aus einem Standort (Gegenstück zu
 * `addEmployeesToTenantLocation`) — für die "Mitarbeiter zuweisen"-Ansicht,
 * die Standort-Mitgliedschaften als Multiselect abbildet: bereits
 * zugewiesene Mitarbeiter erscheinen dort vorausgewählt, ein Abwählen muss
 * sie also wieder entfernen können.
 */
export async function removeEmployeesFromTenantLocation(input: {
  tenantSlug: string;
  locationId: string;
  employeeIds: string[];
}) {
  const access = await requireLocationManager(input.tenantSlug);
  await assertLocationInScope(access, input.locationId);
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

  const members = await prisma.tenantLocationMember.findMany({
    where: { locationId: input.locationId, employeeId: { in: employeeIds } },
    select: { id: true, name: true },
  });

  if (members.length === 0) {
    return location;
  }

  const actorName = (
    await requireTenantAccess(input.tenantSlug, "locations", "write")
  ).userName;

  await prisma.$transaction([
    prisma.tenantLocationMember.deleteMany({
      where: { id: { in: members.map((member) => member.id) } },
    }),
    prisma.tenantLocationActivity.create({
      data: {
        tenantId: access.tenantId,
        locationId: input.locationId,
        actor: actorName,
        text:
          members.length === 1
            ? `hat ${members[0].name} vom Standort entfernt`
            : `hat ${members.length} Mitarbeiter vom Standort entfernt`,
        tone: "danger",
      },
    }),
  ]);

  const remaining = await prisma.tenantLocationMember.count({
    where: { locationId: input.locationId },
  });

  const updated = await prisma.tenantLocation.update({
    where: { id: input.locationId, tenantId: access.tenantId },
    data: { employeeCount: remaining },
  });

  await recordLocationAudit(
    access,
    "Mitarbeiter von Standort entfernt",
    input.locationId,
    members.map((member) => member.name).join(", "),
  );

  return updated;
}

/**
 * Bringt die Standort-Mitgliedschaften (`TenantLocationMember`) eines
 * Mitarbeiters auf exakt die übergebene Menge von Standortnamen — Teil von
 * "Mehrere Standorte pro Mitarbeiter" (aufgerufen aus
 * `createTenantEmployeeRecord`/`updateTenantEmployee` in employee-service.ts).
 * Bestehende Mitgliedschaften außerhalb der Menge werden entfernt, fehlende
 * ergänzt; `TenantLocation.employeeCount` wird für jeden betroffenen
 * Standort neu gezählt (`activeToday` bewusst unangetastet — das ist ein
 * eigener, noch offener Bug, siehe To-Do "Heute im Dienst ist immer 0").
 */
export async function syncEmployeeLocationMemberships(input: {
  tenantId: string;
  employeeId: string;
  employeeInitials: string;
  employeeName: string;
  locationNames: string[];
}) {
  const names = Array.from(
    new Set(input.locationNames.map((name) => name.trim()).filter(Boolean)),
  );

  const [targetLocations, currentMemberships] = await Promise.all([
    names.length
      ? prisma.tenantLocation.findMany({
          where: { tenantId: input.tenantId, name: { in: names } },
          select: { id: true },
        })
      : Promise.resolve([]),
    prisma.tenantLocationMember.findMany({
      where: { employeeId: input.employeeId, location: { tenantId: input.tenantId } },
      select: { id: true, locationId: true },
    }),
  ]);

  const targetLocationIds = new Set(targetLocations.map((location) => location.id));
  const currentLocationIds = new Set(currentMemberships.map((member) => member.locationId));
  const toRemove = currentMemberships.filter((member) => !targetLocationIds.has(member.locationId));
  const toAddLocationIds = targetLocations
    .map((location) => location.id)
    .filter((id) => !currentLocationIds.has(id));

  if (toRemove.length === 0 && toAddLocationIds.length === 0) {
    return;
  }

  await prisma.$transaction([
    ...(toRemove.length
      ? [
          prisma.tenantLocationMember.deleteMany({
            where: { id: { in: toRemove.map((member) => member.id) } },
          }),
        ]
      : []),
    ...(toAddLocationIds.length
      ? [
          prisma.tenantLocationMember.createMany({
            data: toAddLocationIds.map((locationId) => ({
              locationId,
              employeeId: input.employeeId,
              initials: input.employeeInitials,
              name: input.employeeName,
            })),
          }),
        ]
      : []),
  ]);

  const affectedLocationIds = new Set([
    ...toRemove.map((member) => member.locationId),
    ...toAddLocationIds,
  ]);

  for (const locationId of affectedLocationIds) {
    const count = await prisma.tenantLocationMember.count({ where: { locationId } });
    await prisma.tenantLocation.update({ where: { id: locationId }, data: { employeeCount: count } });
  }
}

/** Alle Standortnamen, denen ein Mitarbeiter aktuell zugeordnet ist. */
export async function getEmployeeLocationNames(
  tenantId: string,
  employeeId: string,
): Promise<string[]> {
  const memberships = await prisma.tenantLocationMember.findMany({
    where: { employeeId, location: { tenantId } },
    select: { location: { select: { name: true } } },
    orderBy: { location: { name: "asc" } },
  });

  return memberships.map((membership) => membership.location.name);
}

/** Standortnamen für mehrere Mitarbeiter auf einmal (Mitarbeiterliste), gruppiert nach `employeeId`. */
export async function getEmployeeLocationNamesMap(
  tenantId: string,
  employeeIds: string[],
): Promise<Map<string, string[]>> {
  if (employeeIds.length === 0) {
    return new Map();
  }

  const memberships = await prisma.tenantLocationMember.findMany({
    where: { employeeId: { in: employeeIds }, location: { tenantId } },
    select: { employeeId: true, location: { select: { name: true } } },
    orderBy: { location: { name: "asc" } },
  });

  const map = new Map<string, string[]>();

  for (const membership of memberships) {
    const list = map.get(membership.employeeId) ?? [];
    list.push(membership.location.name);
    map.set(membership.employeeId, list);
  }

  return map;
}

type LocationCopyDb = Pick<
  typeof prisma,
  "tenantEmployee" | "tenantTeamMember" | "tenantTeam" | "tenantLocationMember" | "tenantSettings"
>;

/**
 * `TenantTeam.locations` ist eine kommagetrennte Freitext-Liste von
 * Standortnamen. Ersetzt `from` darin durch `to` — oder entfernt es, wenn
 * `to` null ist (Standort gelöscht).
 */
async function rewriteTeamLocationLists(
  db: LocationCopyDb,
  tenantId: string,
  from: string,
  to: string | null,
) {
  const teams = await db.tenantTeam.findMany({
    where: { tenantId, locations: { contains: from } },
    select: { id: true, locations: true },
  });

  for (const team of teams) {
    const names = team.locations
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

    if (!names.includes(from)) {
      continue;
    }

    const next = Array.from(
      new Set(names.flatMap((name) => (name === from ? (to ? [to] : []) : [name]))),
    );

    await db.tenantTeam.update({
      where: { id: team.id },
      data: { locations: next.join(", ") },
    });
  }
}

/**
 * Räumt nach dem Löschen eines Standorts die Freitext-Kopien seines Namens
 * auf: der Hauptstandort der Mitarbeiter rückt auf ihren nächsten
 * verbliebenen Standort (`TenantLocationMember`) nach, die Team-Mitglied-
 * Schnappschüsse ziehen mit, Team-Standortlisten und der Mandanten-
 * Standardstandort verlieren den Eintrag.
 */
async function clearDeletedLocationCopies(
  db: LocationCopyDb,
  tenantId: string,
  location: { id: string; key: string; name: string },
) {
  const affected = await db.tenantEmployee.findMany({
    where: { tenantId, location: location.name },
    select: { id: true },
  });

  for (const employee of affected) {
    const next = await db.tenantLocationMember.findFirst({
      where: { employeeId: employee.id, location: { tenantId, name: { not: location.name } } },
      orderBy: { location: { name: "asc" } },
      select: { location: { select: { name: true } } },
    });
    const nextName = next?.location.name ?? "";

    await db.tenantEmployee.update({ where: { id: employee.id }, data: { location: nextName } });
    await db.tenantTeamMember.updateMany({
      where: { employeeId: employee.id, team: { tenantId }, location: location.name },
      data: { location: nextName },
    });
  }

  // Schnappschüsse ohne passenden Mitarbeiter-Hauptstandort (z. B. veraltet)
  await db.tenantTeamMember.updateMany({
    where: { team: { tenantId }, location: location.name },
    data: { location: "" },
  });
  await rewriteTeamLocationLists(db, tenantId, location.name, null);
  await db.tenantSettings.updateMany({
    where: { tenantId, defaultLocationId: { in: [location.id, location.key] } },
    data: { defaultLocationId: "" },
  });
}

export async function deleteTenantLocation(input: {
  tenantSlug: string;
  locationId: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "locations", "read");

  if (!access.canDelete) {
    throw new Error("FORBIDDEN");
  }

  await assertLocationInScope(access, input.locationId);

  const location = await prisma.$transaction(async (tx) => {
    const deleted = await tx.tenantLocation.delete({
      where: {
        id: input.locationId,
        tenantId: access.tenantId,
      },
    });

    await clearDeletedLocationCopies(tx, access.tenantId, deleted);

    return deleted;
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

/**
 * Stempel-QR-Code eines Standorts (Zeiterfassung mit QR-Pflicht). Wie das
 * Bearbeiten des Standorts nur für Standort-Verwalter — der Code ist zwar
 * kein Passwort, soll aber nicht jedem Mitglied zum Ausdrucken offenstehen.
 */
export type LocationClockQr = {
  locationId: string;
  locationKey: string;
  locationName: string;
  token: string | null;
  /** Inhalt des QR-Codes (URL), `null` solange keiner erzeugt wurde. */
  payload: string | null;
  /** Zeiterfassung aktiv und QR-Scan in der App Pflicht (Ein- und/oder Ausstempeln). */
  qrRequired: boolean;
};

export async function getLocationClockQr(
  tenantSlug: string,
  locationHandle: string,
): Promise<LocationClockQr | null> {
  const access = await requireLocationManager(tenantSlug);
  const where = await locationScopeWhere(access);
  const location = await prisma.tenantLocation.findFirst({
    where: { ...where, OR: [{ key: locationHandle }, { id: locationHandle }] },
    select: { id: true, key: true, name: true, clockQrToken: true },
  });

  if (!location) return null;

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: access.tenantId },
    select: { timeTrackingEnabled: true, timeTrackingQrRequired: true, timeTrackingQrRequiredClockOut: true },
  });

  return {
    locationId: location.id,
    locationKey: location.key,
    locationName: location.name,
    token: location.clockQrToken,
    payload: location.clockQrToken ? clockQrPayload(location.clockQrToken) : null,
    qrRequired: Boolean(
      settings?.timeTrackingEnabled && (settings.timeTrackingQrRequired || settings.timeTrackingQrRequiredClockOut),
    ),
  };
}

/**
 * Erzeugt (bzw. ersetzt) das Token. Ein bereits ausgehängter Ausdruck wird
 * dadurch ungültig — gedacht für "Code ist nach außen gelangt".
 */
export async function regenerateLocationClockQr(input: { tenantSlug: string; locationId: string }) {
  const access = await requireLocationManager(input.tenantSlug);
  await assertLocationInScope(access, input.locationId);

  const existing = await prisma.tenantLocation.findFirst({
    where: { id: input.locationId, tenantId: access.tenantId },
    select: { id: true, key: true, name: true, clockQrToken: true },
  });

  if (!existing) {
    throw new Error("Standort nicht gefunden.");
  }

  const location = await prisma.tenantLocation.update({
    where: { id: existing.id },
    data: { clockQrToken: generateClockQrToken() },
    select: { id: true, key: true },
  });

  await recordLocationAudit(
    access,
    existing.clockQrToken ? "Stempel-QR-Code neu erzeugt" : "Stempel-QR-Code erzeugt",
    location.id,
    existing.clockQrToken
      ? `${existing.name} — der bisherige QR-Code ist ab sofort ungültig.`
      : existing.name,
  );

  return location;
}
