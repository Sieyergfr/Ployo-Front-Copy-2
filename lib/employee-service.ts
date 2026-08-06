import { auth } from "@/lib/auth";
import {
  addressDefaults,
  formatAddress,
  normalizeAddressInput,
  type AddressInput,
} from "@/lib/address";
import {
  type Employee,
  CONTRACT_FILE_NOT_UPLOADED,
  type EmployeeContractDetails,
  type EmployeeDocument,
  type EmployeeFile,
  type EmployeeFileFolder,
  type EmployeeShift,
  type EmployeeStatus,
  type EmployeeTimelineItem,
  type EmergencyContact,
  type InfoRequest,
  type PayrollStatement,
} from "@/lib/employees";
import { recordTenantAudit } from "@/lib/audit";
import { mapTenantFileToFileItem } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { purgeTenantFiles } from "@/lib/storage/delete";
import { headers } from "next/headers";
import { requireTenantAccess } from "@/lib/tenant-access";
import { canAccessFileAcl, getOptionalFileReadAccess } from "@/lib/file-access";

type EmployeeRecord = {
  id: string;
  key: string;
  userId?: string | null;
  initials: string;
  name: string;
  employeeNumber: string;
  birthDate: string;
  birthPlace: string;
  nationality: string;
  maritalStatus: string;
  privateAddress: {
    street: string;
    houseNumber: string;
    postalCode: string;
    city: string;
    careOf: string;
    country: string;
  } | null;
  taxId: string;
  socialSecurityNumber: string;
  healthInsurance: string;
  iban: string;
  location: string;
  team: string;
  role: string;
  startDate: string;
  contract: string;
  weeklyHours: string;
  tenure: string;
  status: string;
  email: string;
  phone: string;
  workAddress: {
    street: string;
    houseNumber: string;
    postalCode: string;
    city: string;
    careOf: string;
    country: string;
  } | null;
  vacationRemaining: number;
  vacationTotal: number;
  vacationTaken: number;
  documentsJson: string;
  fileFoldersJson: string;
  filesJson: string;
  emergencyContactsJson: string;
  payrollStatementsJson: string;
  infoRequestsJson: string;
  shiftsJson: string;
  timelineJson: string;
  contractDetailsJson: string;
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
  accessRoleIdsJson: string;
  accessUserIdsJson: string;
  parent?: { accessRoleIdsJson: string; accessUserIdsJson: string } | null;
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

type EmployeeMutationInput = {
  tenantSlug: string;
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  employeeNumber?: string;
  birthDate?: string;
  birthPlace?: string;
  nationality?: string;
  maritalStatus?: string;
  privateAddress?: AddressInput;
  taxId?: string;
  socialSecurityNumber?: string;
  healthInsurance?: string;
  iban?: string;
  location?: string;
  team?: string;
  role?: string;
  startDate?: string;
  contract?: string;
  weeklyHours?: string;
  tenure?: string;
  status?: string;
  email?: string;
  phone?: string;
  address?: AddressInput;
  vacationRemaining?: string;
  vacationTotal?: string;
  vacationTaken?: string;
  contractType?: string;
  entryDate?: string;
  exitDate?: string;
  fixedTerm?: string;
  probation?: string;
  noticePeriod?: string;
  position?: string;
  department?: string;
  supervisor?: string;
  workLocation?: string;
  parties?: string;
  collectiveAgreement?: string;
  compensation?: string;
  workingTime?: string;
  vacation?: string;
  contractDetailsSubmitted?: boolean;
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeEmployeeKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function createUniqueEmployeeKey(input: {
  tenantId: string;
  name: string;
  excludeEmployeeId?: string;
}) {
  const keyBase = normalizeEmployeeKey(input.name) || "mitarbeiter";
  let key = keyBase;
  let suffix = 2;

  while (
    await prisma.tenantEmployee.findFirst({
      where: {
        tenantId: input.tenantId,
        key,
        id: input.excludeEmployeeId ? { not: input.excludeEmployeeId } : undefined,
      },
      select: { id: true },
    })
  ) {
    key = `${keyBase}-${suffix}`;
    suffix += 1;
  }

  return key;
}

function normalizeStatus(value?: string): EmployeeStatus {
  return value === "vacation" || value === "absent" ? value : "active";
}

function toInt(value: number | string | undefined, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function buildName(input: Pick<EmployeeMutationInput, "firstName" | "lastName" | "name" | "email">) {
  const name = input.name?.trim();

  if (name) {
    return name;
  }

  const fromParts = [input.firstName?.trim(), input.lastName?.trim()]
    .filter(Boolean)
    .join(" ");

  if (fromParts) {
    return fromParts;
  }

  return input.email?.split("@")[0]?.replace(/[._-]+/g, " ") ?? "Mitarbeiter";
}

function initialsForName(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "--";
}

function defaultContractDetails(): EmployeeContractDetails {
  return {
    linkedFileName: "Keine Vertragsdatei",
    linkedFileMeta: "Noch nicht hochgeladen",
    contractType: "",
    entryDate: "",
    exitDate: "",
    fixedTerm: "",
    probation: "",
    position: "",
    department: "",
    supervisor: "",
    workLocation: "",
    parties: "",
    compensation: "",
    workingTime: "",
    vacation: "",
    noticePeriod: "",
    collectiveAgreement: "",
    clauses: [],
  };
}

function mergeEmployeeFileFolders(
  folders: EmployeeFileFolder[],
  files: EmployeeFile[],
  storageFolders: TenantFileFolderRecord[] = [],
) {
  const folderMap = new Map<string, EmployeeFileFolder>();

  for (const folder of folders) {
    folderMap.set(folder.name, { ...folder });
  }

  for (const folder of storageFolders) {
    folderMap.set(folder.name, {
      name: folder.name,
      path: folder.path,
      fileCount: 0,
      locked: folder.locked,
    });
  }

  for (const file of files) {
    const current = folderMap.get(file.folder);

    if (current) {
      current.fileCount += file.storageFileId ? 1 : 0;
    } else {
      folderMap.set(file.folder, {
        name: file.folder,
        path: file.folder,
        fileCount: 1,
        locked: Boolean(file.storageFileId),
      });
    }
  }

  return Array.from(folderMap.values());
}

function toEmployee(record: EmployeeRecord): Employee {
  const contractDetailsFallback = defaultContractDetails();
  const parsedContractDetails = {
    ...contractDetailsFallback,
    ...parseJson<Partial<EmployeeContractDetails>>(
      record.contractDetailsJson,
      {},
    ),
  };
  const contractDetails =
    parsedContractDetails.linkedFileMeta.trim().toLowerCase() ===
    CONTRACT_FILE_NOT_UPLOADED
      ? {
          ...parsedContractDetails,
          contractType: "",
          entryDate: "",
          exitDate: "",
          fixedTerm: "",
          probation: "",
          position: "",
          department: "",
          supervisor: "",
          workLocation: "",
          parties: "",
          compensation: "",
          workingTime: "",
          vacation: "",
          noticePeriod: "",
          collectiveAgreement: "",
          clauses: [],
        }
      : parsedContractDetails;

  const storedFiles: EmployeeFile[] = (record.storageFiles ?? []).map((file) => {
    const mapped = mapTenantFileToFileItem(file);

    return {
      name: mapped.name,
      folder: mapped.folder,
      type: mapped.type,
      size: mapped.size,
      updatedAt: mapped.updatedAt,
      locked: true,
      storageFileId: mapped.storageFileId,
    };
  });
  const files = storedFiles;
  const fileFolders = mergeEmployeeFileFolders(
    [],
    storedFiles,
    record.storageFileFolders ?? [],
  );

  return {
    id: record.key,
    dbId: record.id,
    key: record.key,
    initials: record.initials,
    name: record.name,
    employeeNumber: record.employeeNumber,
    birthDate: record.birthDate,
    birthPlace: record.birthPlace,
    nationality: record.nationality,
    maritalStatus: record.maritalStatus,
    privateAddress: formatAddress(record.privateAddress),
    privateAddressFields: addressDefaults(record.privateAddress),
    taxId: record.taxId,
    socialSecurityNumber: record.socialSecurityNumber,
    healthInsurance: record.healthInsurance,
    iban: record.iban,
    location: record.location,
    team: record.team,
    role: record.role,
    startDate: record.startDate,
    contract: record.contract,
    weeklyHours: record.weeklyHours,
    tenure: record.tenure,
    status: normalizeStatus(record.status),
    email: record.email,
    phone: record.phone,
    hasAccount: Boolean(record.userId),
    address: formatAddress(record.workAddress),
    addressFields: addressDefaults(record.workAddress),
    vacationRemaining: record.vacationRemaining,
    vacationTotal: record.vacationTotal,
    vacationTaken: record.vacationTaken,
    documents: parseJson<EmployeeDocument[]>(record.documentsJson, []),
    fileFolders,
    files,
    emergencyContacts: parseJson<EmergencyContact[]>(record.emergencyContactsJson, []),
    payrollStatements: parseJson<PayrollStatement[]>(record.payrollStatementsJson, []),
    infoRequests: parseJson<InfoRequest[]>(record.infoRequestsJson, []),
    shifts: parseJson<EmployeeShift[]>(record.shiftsJson, []),
    timeline: parseJson<EmployeeTimelineItem[]>(record.timelineJson, []),
    contractDetails,
  };
}

async function getSessionUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user?.id ?? null;
}

export async function getTenantIdForEmployees(tenantSlug: string) {
  return (await requireTenantAccess(tenantSlug, "employees", "read")).tenantId;
}

/** Steuert, ob beim Anlegen eine Personalnummer eingegeben werden muss. */
export async function isEmployeeNumberRequired(tenantSlug: string) {
  const tenantId = await getTenantIdForEmployees(tenantSlug);
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { employeeNumberRequired: true },
  });

  return settings?.employeeNumberRequired ?? false;
}

export async function getEmployeesForTenant(tenantSlug: string) {
  const tenantId = await getTenantIdForEmployees(tenantSlug);
  const fileAccess = await getOptionalFileReadAccess(tenantSlug);

  if (!tenantId) {
    return null;
  }

  const records = await prisma.tenantEmployee.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    include: {
      privateAddress: true,
      workAddress: true,
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

  return records.map((record) => toEmployee({
    ...record,
    storageFiles: fileAccess
      ? record.storageFiles.filter((file) => canAccessFileAcl(file.parent ?? file, fileAccess))
      : [],
  }));
}

export async function getEmployeeForTenant(tenantSlug: string, employeeHandle: string) {
  const tenantId = await getTenantIdForEmployees(tenantSlug);
  const fileAccess = await getOptionalFileReadAccess(tenantSlug);

  if (!tenantId) {
    return null;
  }

  const record = await prisma.tenantEmployee.findFirst({
    where: {
      tenantId,
      key: employeeHandle,
    },
    include: {
      privateAddress: true,
      workAddress: true,
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

  return record ? toEmployee({
    ...record,
    storageFiles: fileAccess
      ? record.storageFiles.filter((file) => canAccessFileAcl(file.parent ?? file, fileAccess))
      : [],
  }) : null;
}

export async function requireEmployeeManager(tenantSlug: string) {
  await requireTenantAccess(tenantSlug, "employees", "write");
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
            where: { area: "employees" },
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
    return true;
  }

  throw new Error("Keine Berechtigung zum Bearbeiten von Mitarbeitern.");
}

async function nextEmployeeNumber(tenantId: string) {
  const count = await prisma.tenantEmployee.count({ where: { tenantId } });
  let suffix = count + 1;

  while (true) {
    const employeeNumber = `MA-${String(suffix).padStart(4, "0")}`;
    const exists = await prisma.tenantEmployee.findFirst({
      where: { tenantId, employeeNumber },
      select: { id: true },
    });

    if (!exists) {
      return employeeNumber;
    }

    suffix += 1;
  }
}

/** Prisma-Fehlercode für die Verletzung eines Unique-Constraints. */
function isUniqueConstraintError(error: unknown, target: string) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const { code, meta } = error as { code?: string; meta?: { target?: unknown } };

  return code === "P2002" && JSON.stringify(meta?.target ?? "").includes(target);
}

async function syncTeamMemberSnapshots(employee: Employee) {
  if (!employee.dbId) {
    return;
  }

  await prisma.tenantTeamMember.updateMany({
    where: { employeeId: employee.dbId },
    data: {
      initials: employee.initials,
      name: employee.name,
      location: employee.location,
      role: employee.role,
      contract: employee.contract,
      status: employee.status === "vacation" ? "vacation" : "on-duty",
    },
  });
}

export async function createTenantEmployee(input: EmployeeMutationInput) {
  await requireEmployeeManager(input.tenantSlug);

  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");
  const tenantId = access.tenantId;

  if (!tenantId) {
    throw new Error("Mandant nicht gefunden.");
  }

  const name = buildName(input);
  const initials = initialsForName(name);
  const key = await createUniqueEmployeeKey({ tenantId, name });
  const contract = input.contract?.trim() || "Unbefristet";
  const startDate = input.startDate?.trim() || "";
  const role = input.role?.trim() || "Mitarbeiter";
  const team = input.team?.trim() || "";
  const weeklyHours = input.weeklyHours?.trim() || "38 Std/Woche";
  const explicitEmployeeNumber = input.employeeNumber?.trim() || "";
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { employeeNumberRequired: true },
  });

  if (settings?.employeeNumberRequired && !explicitEmployeeNumber) {
    throw new Error(
      "Für diesen Mandanten ist eine Personalnummer verpflichtend. Bitte eine Personalnummer angeben.",
    );
  }

  const createRecord = (employeeNumber: string) =>
    prisma.tenantEmployee.create({
    data: {
      tenant: {
        connect: { id: tenantId },
      },
      key,
      initials,
      name,
      employeeNumber,
      birthDate: input.birthDate?.trim() || "",
      birthPlace: input.birthPlace?.trim() || "",
      nationality: input.nationality?.trim() || "",
      maritalStatus: input.maritalStatus?.trim() || "",
      privateAddress: {
        create: normalizeAddressInput(input.privateAddress),
      },
      taxId: input.taxId?.trim() || "",
      socialSecurityNumber: input.socialSecurityNumber?.trim() || "",
      healthInsurance: input.healthInsurance?.trim() || "",
      iban: input.iban?.trim() || "",
      location: input.location?.trim() || "",
      team,
      role,
      startDate,
      contract,
      weeklyHours,
      tenure: input.tenure?.trim() || "",
      status: normalizeStatus(input.status),
      email: input.email?.trim() || "",
      phone: input.phone?.trim() || "",
      workAddress: {
        create: normalizeAddressInput(input.address),
      },
      vacationRemaining: toInt(input.vacationRemaining, 0),
      vacationTotal: toInt(input.vacationTotal, 30),
      vacationTaken: toInt(input.vacationTaken, 0),
      documentsJson: JSON.stringify([] satisfies EmployeeDocument[]),
      fileFoldersJson: JSON.stringify([] satisfies EmployeeFileFolder[]),
      filesJson: JSON.stringify([] satisfies EmployeeFile[]),
      emergencyContactsJson: JSON.stringify([] satisfies EmergencyContact[]),
      payrollStatementsJson: JSON.stringify([] satisfies PayrollStatement[]),
      infoRequestsJson: JSON.stringify([] satisfies InfoRequest[]),
      shiftsJson: JSON.stringify([] satisfies EmployeeShift[]),
      timelineJson: JSON.stringify([
        {
          title: "Mitarbeiter angelegt",
          date: new Intl.DateTimeFormat("de-DE").format(new Date()),
          tone: "success",
        },
      ] satisfies EmployeeTimelineItem[]),
      contractDetailsJson: JSON.stringify(defaultContractDetails()),
    },
    include: {
      privateAddress: true,
      workAddress: true,
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

  // Die automatische Personalnummer wird ohne Sperre ermittelt. Bei
  // gleichzeitigen Anlagen greift der Unique-Constraint – dann neu vergeben.
  let record: Awaited<ReturnType<typeof createRecord>> | null = null;

  for (let attempt = 0; attempt < 5 && !record; attempt += 1) {
    const employeeNumber =
      explicitEmployeeNumber || (await nextEmployeeNumber(tenantId));

    try {
      record = await createRecord(employeeNumber);
    } catch (error) {
      const isCollision = isUniqueConstraintError(error, "employeeNumber");

      if (!isCollision || explicitEmployeeNumber) {
        if (isCollision) {
          throw new Error(
            `Die Personalnummer "${explicitEmployeeNumber}" ist bereits vergeben.`,
          );
        }

        throw error;
      }
    }
  }

  if (!record) {
    throw new Error("Personalnummer konnte nicht vergeben werden.");
  }

  await recordTenantAudit({
    tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Mitarbeiter angelegt",
    source: "Mitarbeiter",
    entityType: "employee",
    entityId: record.id,
    detail: record.name,
  });

  return toEmployee(record);
}

export async function updateTenantEmployee(input: EmployeeMutationInput & { employeeId: string }) {
  await requireEmployeeManager(input.tenantSlug);

  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");
  const tenantId = access.tenantId;

  if (!tenantId) {
    throw new Error("Mandant nicht gefunden.");
  }

  const current = await prisma.tenantEmployee.findFirst({
    where: { tenantId, id: input.employeeId },
    include: {
      privateAddress: true,
      workAddress: true,
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

  if (!current) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  const currentEmployee = toEmployee(current);
  const name = buildName({ name: input.name || current.name, email: input.email });
  const contract = input.contract?.trim() || current.contract;
  const startDate = input.startDate?.trim() || current.startDate;
  const role = input.role?.trim() || current.role;
  const team = input.team?.trim() || current.team;
  const weeklyHours = input.weeklyHours?.trim() || current.weeklyHours;
  const contractDetailsSubmitted = input.contractDetailsSubmitted === true;
  const contractValue = (value: string | undefined, fallback: string) =>
    contractDetailsSubmitted ? value?.trim() ?? "" : value?.trim() || fallback;
  const contractDetails: EmployeeContractDetails = {
    ...currentEmployee.contractDetails,
    linkedFileMeta: contractDetailsSubmitted
      ? "Vertragsdetails manuell erfasst"
      : currentEmployee.contractDetails.linkedFileMeta,
    contractType: contractValue(
      input.contractType,
      currentEmployee.contractDetails.contractType,
    ),
    entryDate: contractValue(input.entryDate, currentEmployee.contractDetails.entryDate),
    exitDate: contractValue(input.exitDate, currentEmployee.contractDetails.exitDate),
    fixedTerm: contractValue(input.fixedTerm, currentEmployee.contractDetails.fixedTerm),
    probation: contractValue(input.probation, currentEmployee.contractDetails.probation),
    noticePeriod: contractValue(
      input.noticePeriod,
      currentEmployee.contractDetails.noticePeriod,
    ),
    position: contractValue(input.position, currentEmployee.contractDetails.position),
    department: contractValue(
      input.department,
      currentEmployee.contractDetails.department,
    ),
    supervisor: contractValue(
      input.supervisor,
      currentEmployee.contractDetails.supervisor,
    ),
    workLocation: contractValue(
      input.workLocation,
      currentEmployee.contractDetails.workLocation,
    ),
    parties: contractValue(input.parties, currentEmployee.contractDetails.parties),
    collectiveAgreement: contractValue(
      input.collectiveAgreement,
      currentEmployee.contractDetails.collectiveAgreement,
    ),
    compensation: contractValue(
      input.compensation,
      currentEmployee.contractDetails.compensation,
    ),
    workingTime: contractValue(
      input.workingTime,
      currentEmployee.contractDetails.workingTime,
    ),
    vacation: contractValue(input.vacation, currentEmployee.contractDetails.vacation),
  };
  // Der Key bleibt bei Umbenennungen stabil, damit URLs und Verweise
  // (Erinnerungen, Bookmarks) nicht brechen.
  const key = current.key;

  const nextNumber = input.employeeNumber?.trim() || current.employeeNumber;
  const record = await prisma.tenantEmployee
    .update({
    where: { id: input.employeeId },
    data: {
      key,
      initials: initialsForName(name),
      name,
      employeeNumber: nextNumber,
      birthDate: input.birthDate?.trim() ?? current.birthDate,
      birthPlace: input.birthPlace?.trim() ?? current.birthPlace,
      nationality: input.nationality?.trim() ?? current.nationality,
      maritalStatus: input.maritalStatus?.trim() ?? current.maritalStatus,
      privateAddress: {
        upsert: {
          create: normalizeAddressInput(input.privateAddress),
          update: normalizeAddressInput(input.privateAddress ?? current.privateAddress ?? {}),
        },
      },
      taxId: input.taxId?.trim() ?? current.taxId,
      socialSecurityNumber:
        input.socialSecurityNumber?.trim() ?? current.socialSecurityNumber,
      healthInsurance: input.healthInsurance?.trim() ?? current.healthInsurance,
      iban: input.iban?.trim() ?? current.iban,
      location: input.location?.trim() ?? current.location,
      team,
      role,
      startDate,
      contract,
      weeklyHours,
      tenure: input.tenure?.trim() ?? current.tenure,
      status: normalizeStatus(input.status ?? current.status),
      email: input.email?.trim() ?? current.email,
      phone: input.phone?.trim() ?? current.phone,
      workAddress: {
        upsert: {
          create: normalizeAddressInput(input.address),
          update: normalizeAddressInput(input.address ?? current.workAddress ?? {}),
        },
      },
      vacationRemaining: toInt(input.vacationRemaining, current.vacationRemaining),
      vacationTotal: toInt(input.vacationTotal, current.vacationTotal),
      vacationTaken: toInt(input.vacationTaken, current.vacationTaken),
      contractDetailsJson: JSON.stringify(contractDetails),
    },
    include: {
      privateAddress: true,
      workAddress: true,
    },
    })
    .catch((error: unknown) => {
      if (isUniqueConstraintError(error, "employeeNumber")) {
        throw new Error(
          `Die Personalnummer "${nextNumber}" ist bereits an einen anderen Mitarbeiter vergeben.`,
        );
      }

      throw error;
    });
  const employee = toEmployee(record);

  await syncTeamMemberSnapshots(employee);

  const sensitiveChanges = [
    input.iban !== undefined && input.iban !== current.iban ? "IBAN" : null,
    input.socialSecurityNumber !== undefined &&
    input.socialSecurityNumber !== current.socialSecurityNumber
      ? "SV-Nummer"
      : null,
    input.taxId !== undefined && input.taxId !== current.taxId ? "Steuer-ID" : null,
    input.healthInsurance !== undefined &&
    input.healthInsurance !== current.healthInsurance
      ? "Krankenkasse"
      : null,
  ].filter(Boolean);

  await recordTenantAudit({
    tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Mitarbeiterdaten geändert",
    source: "Mitarbeiter",
    entityType: "employee",
    entityId: record.id,
    detail: sensitiveChanges.length
      ? `${record.name} (sensibel: ${sensitiveChanges.join(", ")})`
      : record.name,
  });

  return employee;
}

/**
 * Löscht einen Mitarbeiter vollständig (DSGVO-Löschkonzept):
 * inkl. Adressen, Ordnern, Dateien und den zugehörigen S3-Objekten.
 */
export async function deleteTenantEmployee(input: {
  tenantSlug: string;
  employeeId: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");
  const tenantId = access.tenantId;

  const employee = await prisma.tenantEmployee.findFirst({
    where: { id: input.employeeId, tenantId },
    select: {
      id: true,
      name: true,
      privateAddressId: true,
      workAddressId: true,
    },
  });

  if (!employee) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  const files = await prisma.tenantFile.findMany({
    where: { tenantId, employeeId: input.employeeId },
    select: { id: true, bucket: true, storageKey: true },
  });

  await prisma.$transaction([
    // Verträge zuerst: deren fileId-Relation ist Restrict und würde das
    // Löschen der Dateien blockieren.
    prisma.tenantEmployeeContract.deleteMany({
      where: { employeeId: input.employeeId },
    }),
    prisma.tenantTeamMember.deleteMany({ where: { employeeId: input.employeeId } }),
    prisma.tenantFileFolder.deleteMany({
      where: { tenantId, employeeId: input.employeeId },
    }),
    prisma.tenantEmployee.delete({ where: { id: input.employeeId } }),
  ]);

  // Adressen sind über SetNull verknüpft und blieben sonst als PII-Waisen zurück.
  const addressIds = [employee.privateAddressId, employee.workAddressId].filter(
    (id): id is string => Boolean(id),
  );

  if (addressIds.length) {
    await prisma.address.deleteMany({ where: { id: { in: addressIds } } });
  }

  await purgeTenantFiles(files);

  await recordTenantAudit({
    tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Mitarbeiter gelöscht",
    source: "Mitarbeiter",
    entityType: "employee",
    entityId: employee.id,
    detail: `${employee.name} inkl. ${files.length} Datei(en)`,
  });
}

export async function createEmployeeInfoRequest(input: {
  tenantSlug: string;
  employeeId: string;
  title: string;
  message?: string;
  dueAt?: string;
  fileRequested: boolean;
}) {
  await requireEmployeeManager(input.tenantSlug);

  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");
  const title = input.title.trim();

  if (!title) {
    throw new Error("Bitte angeben, welche Information benötigt wird.");
  }

  const employee = await prisma.tenantEmployee.findFirst({
    where: { id: input.employeeId, tenantId: access.tenantId },
    select: { id: true, name: true, infoRequestsJson: true },
  });

  if (!employee) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  const dueAtIso = input.dueAt?.trim() ?? "";
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(dueAtIso)
    ? new Intl.DateTimeFormat("de-DE").format(new Date(`${dueAtIso}T00:00:00`))
    : "";
  const request: InfoRequest = {
    id: `info-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    message: input.message?.trim() || undefined,
    requestedBy: access.userName,
    requestedAt: new Intl.DateTimeFormat("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date()),
    dueAt,
    fileRequested: input.fileRequested,
    status: "open",
  };
  const existing = parseJson<InfoRequest[]>(employee.infoRequestsJson, []);

  await prisma.tenantEmployee.update({
    where: { id: employee.id },
    data: { infoRequestsJson: JSON.stringify([request, ...existing]) },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Info-Anfrage erstellt",
    source: "Mitarbeiter",
    entityType: "employee",
    entityId: employee.id,
    detail: `${employee.name}: ${title}`,
  });

  return request;
}
