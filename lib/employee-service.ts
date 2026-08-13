import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { decryptField, encryptField } from "@/lib/encryption";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
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
  type EmployeeFile,
  type EmployeeFileFolder,
  type EmployeeShift,
  type EmployeeStatus,
  type EmployeeTimelineItem,
  type EmergencyContact,
  type InfoRequest,
} from "@/lib/employees";
import { recordTenantAudit } from "@/lib/audit";
import { mapTenantFileToFileItem } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { purgeTenantFiles } from "@/lib/storage/delete";
import { headers } from "next/headers";
import {
  getOptionalTenantAccess,
  requireTenantAccess,
  requireTenantMembership,
  resolveScopeFilter,
  scopeAllowsTarget,
} from "@/lib/tenant-access";
import type { PermissionLevel } from "@/lib/roles";
import { canAccessFileAcl, getOptionalAreaFileAccess } from "@/lib/file-access";
import { getISOWeekFromDate, getISOWeekStart } from "@/lib/shift-service";
import { isStripeConfigured } from "@/lib/stripe/client";
import { checkEmployeeLimit, planEmployeeLimits } from "@/lib/stripe/plans";

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
  emergencyContactsJson: unknown;
  infoRequests?: InfoRequestRecord[];
  timeline?: TimelineRecord[];
  contractDetails?: ContractDetailsRecord | null;
  storageFiles?: TenantFileRecord[];
  storageFileFolders?: TenantFileFolderRecord[];
  shifts?: ThisWeekShiftRecord[];
  payrollStatements?: PayrollStatementRecord[];
};

type InfoRequestRecord = {
  id: string;
  title: string;
  message: string;
  requestedBy: string;
  dueAt: Date | null;
  fileRequested: boolean;
  status: string;
  createdAt: Date;
};

type TimelineRecord = {
  title: string;
  tone: string;
  createdAt: Date;
};

type ContractDetailsRecord = {
  linkedFileName: string;
  linkedFileMeta: string;
  contractType: string;
  entryDate: string;
  exitDate: string;
  fixedTerm: string;
  probation: string;
  position: string;
  department: string;
  supervisor: string;
  workLocation: string;
  parties: string;
  compensation: string;
  workingTime: string;
  vacation: string;
  noticePeriod: string;
  collectiveAgreement: string;
  clauses: string[];
};

type PayrollStatementRecord = {
  id: string;
  period: string;
  issuedAt: Date;
  gross: string;
  net: string;
  status: string;
  file: { id: string; displayName: string };
};

type ThisWeekShiftRecord = {
  weekday: string;
  startTime: string;
  endTime: string;
  note: string;
  location: { name: string } | null;
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
  emergencyContacts?: EmergencyContact[];
};

function asJson<T>(value: unknown, fallback: T): T {
  return (value ?? fallback) as T;
}

function thisWeekDateIds(): string[] {
  const { year, week } = getISOWeekFromDate(new Date());
  const start = getISOWeekStart(year, week);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);

    date.setUTCDate(start.getUTCDate() + index);

    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  });
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

const employeeStatusLabels: Record<EmployeeStatus, string> = {
  active: "Im Dienst",
  vacation: "Urlaub",
  absent: "Abwesend",
};

/**
 * Baut Timeline-Einträge für Änderungen an Vertrag/Standort/Team/Rolle/Status
 * beim Bearbeiten eines bestehenden Mitarbeiters — die Personalakte soll
 * nicht nur die Anlage, sondern auch spätere Änderungen zeigen.
 */
export function buildEditTimelineEntries(
  before: {
    location: string;
    team: string;
    role: string;
    contract: string;
    status: EmployeeStatus;
  },
  after: {
    location: string;
    team: string;
    role: string;
    contract: string;
    status: EmployeeStatus;
  },
): EmployeeTimelineItem[] {
  const date = new Intl.DateTimeFormat("de-DE").format(new Date());
  const changes: string[] = [];

  if (after.location !== before.location) {
    changes.push(`Standort geändert: ${before.location || "–"} → ${after.location || "–"}`);
  }
  if (after.team !== before.team) {
    changes.push(`Team geändert: ${before.team || "–"} → ${after.team || "–"}`);
  }
  if (after.role !== before.role) {
    changes.push(`Rolle geändert: ${before.role || "–"} → ${after.role || "–"}`);
  }
  if (after.contract !== before.contract) {
    changes.push(`Vertragsart geändert: ${before.contract || "–"} → ${after.contract || "–"}`);
  }
  if (after.status !== before.status) {
    changes.push(
      `Status geändert: ${employeeStatusLabels[before.status]} → ${employeeStatusLabels[after.status]}`,
    );
  }

  return changes.map((title) => ({ title, date, tone: "ink" as const }));
}

/**
 * `location`/`team`/`role` sind bei `TenantEmployee` reine Freitext-Spalten
 * (keine Relation) — ohne diese Prüfung könnte ein direkter Server-Action-
 * Aufruf beliebige Strings setzen. Bewusst scope-frei (kein
 * `requireTenantAccess` auf "locations"/"teams"/"roles"), damit ein Nutzer
 * mit `employees:write`, aber ohne Leserecht auf diese Bereiche, weiterhin
 * Mitarbeiter anlegen/bearbeiten kann — nur zur Validierung, nicht für die
 * Anzeige. Nur explizit übergebene, nicht-leere Werte werden geprüft; ein
 * leerer Wert (keine Auswahl) bleibt weiterhin erlaubt.
 */
async function assertKnownOrgReferences(
  tenantId: string,
  refs: { location?: string; team?: string; role?: string },
) {
  const location = refs.location?.trim();
  const team = refs.team?.trim();
  const role = refs.role?.trim();

  const [locationExists, teamExists, roleExists] = await Promise.all([
    location
      ? prisma.tenantLocation.findFirst({ where: { tenantId, name: location }, select: { id: true } })
      : null,
    team
      ? prisma.tenantTeam.findFirst({ where: { tenantId, name: team }, select: { id: true } })
      : null,
    role
      ? prisma.tenantRole.findFirst({ where: { tenantId, name: role }, select: { id: true } })
      : null,
  ]);

  if (location && !locationExists) {
    throw new Error(`Unbekannter Standort: "${location}".`);
  }

  if (team && !teamExists) {
    throw new Error(`Unbekanntes Team: "${team}".`);
  }

  if (role && !roleExists) {
    throw new Error(`Unbekannte Berechtigungsrolle: "${role}".`);
  }
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

const REDACTED = "•••";

/**
 * Persönliche/finanzielle Kennungen (Geburtsdaten, Steuer-ID, Sozial-
 * versicherungsnummer, IBAN, Krankenversicherung, Privatadresse) sind
 * sensibler als der Rest der Personalakte — dafür reicht "employees:read"
 * allein nicht, es braucht zusätzlich "payroll:read" (inkl. dessen Scope).
 * Ohne diese Berechtigung liefert `getEmployeesForTenant`/`getEmployeeForTenant`
 * die restlichen Felder (Name, Team, Standort, Rolle, Status, Kontakt) ganz
 * normal, redigiert aber gezielt diese Felder statt die ganze Anfrage
 * abzulehnen.
 */
function toEmployee(record: EmployeeRecord, sensitiveFieldsVisible = true): Employee {
  const parsedContractDetails: EmployeeContractDetails = record.contractDetails
    ? {
        linkedFileName: record.contractDetails.linkedFileName,
        linkedFileMeta: record.contractDetails.linkedFileMeta,
        contractType: record.contractDetails.contractType,
        entryDate: record.contractDetails.entryDate,
        exitDate: record.contractDetails.exitDate,
        fixedTerm: record.contractDetails.fixedTerm,
        probation: record.contractDetails.probation,
        position: record.contractDetails.position,
        department: record.contractDetails.department,
        supervisor: record.contractDetails.supervisor,
        workLocation: record.contractDetails.workLocation,
        parties: record.contractDetails.parties,
        compensation: record.contractDetails.compensation,
        workingTime: record.contractDetails.workingTime,
        vacation: record.contractDetails.vacation,
        noticePeriod: record.contractDetails.noticePeriod,
        collectiveAgreement: record.contractDetails.collectiveAgreement,
        clauses: record.contractDetails.clauses,
      }
    : defaultContractDetails();
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
  const shifts: EmployeeShift[] = (record.shifts ?? []).map((shift) => ({
    day: shift.weekday,
    label: shift.location?.name || shift.note || "Schicht",
    time: `${shift.startTime}-${shift.endTime}`,
  }));

  return {
    id: record.key,
    dbId: record.id,
    key: record.key,
    initials: record.initials,
    name: record.name,
    employeeNumber: record.employeeNumber,
    birthDate: sensitiveFieldsVisible ? record.birthDate : "",
    birthPlace: sensitiveFieldsVisible ? record.birthPlace : "",
    nationality: sensitiveFieldsVisible ? record.nationality : "",
    maritalStatus: sensitiveFieldsVisible ? record.maritalStatus : "",
    privateAddress: sensitiveFieldsVisible ? formatAddress(record.privateAddress) : "",
    privateAddressFields: sensitiveFieldsVisible
      ? addressDefaults(record.privateAddress)
      : addressDefaults(null),
    taxId: sensitiveFieldsVisible ? decryptField(record.taxId) : REDACTED,
    socialSecurityNumber: sensitiveFieldsVisible
      ? decryptField(record.socialSecurityNumber)
      : REDACTED,
    healthInsurance: sensitiveFieldsVisible ? decryptField(record.healthInsurance) : REDACTED,
    iban: sensitiveFieldsVisible ? decryptField(record.iban) : REDACTED,
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
    fileFolders,
    files,
    emergencyContacts: asJson<EmergencyContact[]>(record.emergencyContactsJson, []),
    payrollStatements: (record.payrollStatements ?? []).map((statement) => ({
      id: statement.id,
      period: statement.period,
      issuedAt: statement.issuedAt.toISOString().slice(0, 10),
      gross: statement.gross,
      net: statement.net,
      fileName: statement.file.displayName,
      storageFileId: statement.file.id,
      status: statement.status === "corrected" ? "corrected" : "available",
    })),
    infoRequests: (record.infoRequests ?? []).map((request) => ({
      id: request.id,
      title: request.title,
      message: request.message || undefined,
      requestedBy: request.requestedBy,
      requestedAt: new Intl.DateTimeFormat("de-DE", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(request.createdAt),
      dueAt: request.dueAt ? new Intl.DateTimeFormat("de-DE").format(request.dueAt) : "",
      fileRequested: request.fileRequested,
      status: request.status as InfoRequest["status"],
    })),
    shifts,
    timeline: (record.timeline ?? []).map((entry) => ({
      title: entry.title,
      date: new Intl.DateTimeFormat("de-DE").format(entry.createdAt),
      tone: entry.tone as EmployeeTimelineItem["tone"],
    })),
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

/**
 * Übersetzt den konfigurierten Scope (own/team/all) der "employees"-
 * Berechtigung in einen zusätzlichen `where`-Filter für
 * `prisma.tenantEmployee`. "own"/"team" ohne verknüpften eigenen
 * Mitarbeiterdatensatz liefert einen Filter, der nichts trifft — nie
 * stillschweigend auf "alles sehen" zurückfallen.
 */
async function employeeScopeWhere(tenantSlug: string, required: PermissionLevel = "read") {
  const access = await requireTenantAccess(tenantSlug, "employees", required);
  const scopeFilter = await resolveScopeFilter(access);

  if (scopeFilter.type === "all") {
    return { tenantId: access.tenantId };
  }

  if (scopeFilter.type === "own") {
    return { tenantId: access.tenantId, id: scopeFilter.employeeId ?? "__none__" };
  }

  if (scopeFilter.type === "team") {
    return { tenantId: access.tenantId, team: scopeFilter.team };
  }

  // "employees" unterstützt (bisher) keinen "assigned"-Scope — sollte er
  // dennoch auftreten, nichts treffen statt stillschweigend alles zu zeigen.
  return { tenantId: access.tenantId, id: "__none__" };
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

/** Maximale aktive Mitarbeiterzahl des aktuellen Plans (Feature-Gating). */
export async function getEmployeeLimitForTenant(tenantSlug: string) {
  const tenantId = await getTenantIdForEmployees(tenantSlug);
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  });

  return tenant ? planEmployeeLimits[tenant.plan] : null;
}

export async function getEmployeesForTenant(tenantSlug: string) {
  const where = await employeeScopeWhere(tenantSlug);
  const fileAccess = await getOptionalAreaFileAccess(tenantSlug, "employees");

  if (!where.tenantId) {
    return null;
  }

  const records = await prisma.tenantEmployee.findMany({
    where,
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
      infoRequests: { orderBy: { createdAt: "desc" } },
      timeline: { orderBy: { createdAt: "desc" } },
      contractDetails: true,
    },
  });

  // Geburtsdaten/Steuer-ID/Sozialversicherungsnummer/IBAN/Krankenversicherung
  // sind sensibler als der Rest der Liste — je Mitarbeiter gegen die
  // "payroll"-Berechtigung (inkl. deren Scope) prüfen, statt sie an jeden mit
  // bloßem "employees:read" auszuliefern.
  const payrollAccess = await getOptionalTenantAccess(tenantSlug, "payroll", "read");
  const payrollScope = payrollAccess ? await resolveScopeFilter(payrollAccess) : null;

  return records.map((record) =>
    toEmployee(
      {
        ...record,
        storageFiles: fileAccess
          ? record.storageFiles.filter((file) => canAccessFileAcl(file.parent ?? file, fileAccess))
          : [],
      },
      payrollScope !== null &&
        scopeAllowsTarget(payrollScope, { id: record.id, team: record.team }),
    ),
  );
}

export async function getEmployeeForTenant(tenantSlug: string, employeeHandle: string) {
  const where = await employeeScopeWhere(tenantSlug);
  const fileAccess = await getOptionalAreaFileAccess(tenantSlug, "employees");

  if (!where.tenantId) {
    return null;
  }

  const record = await prisma.tenantEmployee.findFirst({
    where: {
      ...where,
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
      shifts: {
        where: { date: { in: thisWeekDateIds() } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        select: {
          weekday: true,
          startTime: true,
          endTime: true,
          note: true,
          location: { select: { name: true } },
        },
      },
      infoRequests: { orderBy: { createdAt: "desc" } },
      timeline: { orderBy: { createdAt: "desc" } },
      contractDetails: true,
    },
  });

  if (!record) {
    return null;
  }

  // Gehaltsabrechnungen sind sensibler als der Rest des Profils — separat
  // per "payroll"-Berechtigung (inkl. deren Scope) laden, statt sie
  // ungeprüft an jeden mit "employees:read" auszuliefern.
  const payrollAccess = await getOptionalTenantAccess(tenantSlug, "payroll", "read");
  const payrollScope = payrollAccess ? await resolveScopeFilter(payrollAccess) : null;
  const canViewPayroll =
    payrollScope !== null &&
    scopeAllowsTarget(payrollScope, { id: record.id, team: record.team });
  const payrollStatements = canViewPayroll
    ? await prisma.tenantPayrollStatement.findMany({
        where: { employeeId: record.id },
        orderBy: { issuedAt: "desc" },
        include: { file: { select: { id: true, displayName: true } } },
      })
    : [];

  return toEmployee(
    {
      ...record,
      payrollStatements,
      storageFiles: fileAccess
        ? record.storageFiles.filter((file) => canAccessFileAcl(file.parent ?? file, fileAccess))
        : [],
    },
    canViewPayroll,
  );
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
    return true;
  }

  throw new Error("Keine Berechtigung zum Bearbeiten von Mitarbeitern.");
}

async function nextEmployeeNumber(tenantId: string, prefix: string, suffix: string) {
  const count = await prisma.tenantEmployee.count({ where: { tenantId } });
  let sequence = count + 1;

  while (true) {
    const employeeNumber = `${prefix}${String(sequence).padStart(4, "0")}${suffix}`;
    const exists = await prisma.tenantEmployee.findFirst({
      where: { tenantId, employeeNumber },
      select: { id: true },
    });

    if (!exists) {
      return employeeNumber;
    }

    sequence += 1;
  }
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

async function syncLocationTeamSnapshots(employee: Employee) {
  if (!employee.dbId) {
    return;
  }

  await prisma.tenantLocationMember.updateMany({
    where: { employeeId: employee.dbId },
    data: {
      initials: employee.initials,
      name: employee.name,
    },
  });
}

type CreateEmployeeRecordOptions = {
  tenantId: string;
  actorId: string;
  actorName: string;
  input: EmployeeMutationInput;
  /** Beim Self-Service-Anlegen (siehe `createAndLinkOwnTenantEmployee`) sofort mit dem anlegenden Konto verknüpft. */
  linkUserId?: string;
  auditAction?: string;
  auditSource?: string;
  /** Self-Service-Anlegen erfasst keine Personalnummer manuell — dort greift die Mandantenpflicht nicht. */
  enforceEmployeeNumberRequired?: boolean;
};

export async function createTenantEmployeeRecord({
  tenantId,
  actorId,
  actorName,
  input,
  linkUserId,
  auditAction = "Mitarbeiter angelegt",
  auditSource = "Mitarbeiter",
  enforceEmployeeNumberRequired = true,
}: CreateEmployeeRecordOptions) {
  const name = buildName(input);
  const initials = initialsForName(name);
  const key = await createUniqueEmployeeKey({ tenantId, name });
  const contract = input.contract?.trim() || "Unbefristet";
  const startDate = input.startDate?.trim() || "";
  const role = input.role?.trim() || "Mitarbeiter";
  const team = input.team?.trim() || "";
  const weeklyHours = input.weeklyHours?.trim() || "38 Std/Woche";
  const explicitEmployeeNumber = input.employeeNumber?.trim() || "";

  await assertKnownOrgReferences(tenantId, {
    location: input.location,
    team: input.team,
    role: input.role,
  });

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: {
      employeeNumberRequired: true,
      employeeNumberPrefix: true,
      employeeNumberSuffix: true,
    },
  });

  if (enforceEmployeeNumberRequired && settings?.employeeNumberRequired && !explicitEmployeeNumber) {
    throw new Error(
      "Für diesen Mandanten ist eine Personalnummer verpflichtend. Bitte eine Personalnummer angeben.",
    );
  }

  const tenantForBilling = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { plan: true, stripeSubscriptionStatus: true },
  });
  const activeEmployeeCount = await prisma.tenantEmployee.count({
    where: { tenantId, status: "active" },
  });
  const employeeLimitError = checkEmployeeLimit({
    plan: tenantForBilling.plan,
    activeEmployeeCount,
    stripeConfigured: isStripeConfigured(),
    stripeSubscriptionStatus: tenantForBilling.stripeSubscriptionStatus,
  });

  if (employeeLimitError) {
    throw new Error(employeeLimitError);
  }

  const createRecord = (employeeNumber: string) =>
    prisma.tenantEmployee.create({
    data: {
      tenant: {
        connect: { id: tenantId },
      },
      key,
      userId: linkUserId ?? null,
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
      taxId: encryptField(input.taxId?.trim() || ""),
      socialSecurityNumber: encryptField(input.socialSecurityNumber?.trim() || ""),
      healthInsurance: encryptField(input.healthInsurance?.trim() || ""),
      iban: encryptField(input.iban?.trim() || ""),
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
      emergencyContactsJson: [] satisfies EmergencyContact[],
      timeline: {
        create: [
          {
            title: "Mitarbeiter angelegt",
            tone: "success",
            tenant: { connect: { id: tenantId } },
          },
        ],
      },
      contractDetails: {
        create: {
          tenant: { connect: { id: tenantId } },
        },
      },
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
      infoRequests: { orderBy: { createdAt: "desc" } },
      timeline: { orderBy: { createdAt: "desc" } },
      contractDetails: true,
    },
    });

  // Die automatische Personalnummer wird ohne Sperre ermittelt. Bei
  // gleichzeitigen Anlagen greift der Unique-Constraint – dann neu vergeben.
  let record: Awaited<ReturnType<typeof createRecord>> | null = null;

  for (let attempt = 0; attempt < 5 && !record; attempt += 1) {
    const employeeNumber =
      explicitEmployeeNumber ||
      (await nextEmployeeNumber(
        tenantId,
        settings?.employeeNumberPrefix ?? "MA-",
        settings?.employeeNumberSuffix ?? "",
      ));

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
    actorId,
    actorName,
    action: auditAction,
    source: auditSource,
    entityType: "employee",
    entityId: record.id,
    detail: record.name,
  });

  return toEmployee(record);
}

export async function createTenantEmployee(input: EmployeeMutationInput) {
  await requireEmployeeManager(input.tenantSlug);

  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");

  if (!access.tenantId) {
    throw new Error("Mandant nicht gefunden.");
  }

  return createTenantEmployeeRecord({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    input,
  });
}

/**
 * Self-Service-Variante von `createTenantEmployee`: kein `employees:write`
 * nötig (jedes Tenant-Mitglied darf sich selbst eine Personalakte anlegen),
 * dafür ohne manuelle Personalnummer-Eingabe und mit sofortiger, erzwungener
 * Verknüpfung zum anlegenden Konto — es gibt keine `employeeId`/`userId` im
 * Input, ein Mitglied kann also nie ein fremdes Profil anlegen oder verknüpfen.
 */
export async function createAndLinkOwnTenantEmployee(
  input: Pick<EmployeeMutationInput, "tenantSlug" | "firstName" | "lastName" | "email">,
) {
  const access = await requireTenantMembership(input.tenantSlug);

  const existing = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Ihr Konto ist bereits mit einer Personalakte verknüpft.");
  }

  return createTenantEmployeeRecord({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    input: { ...input, name: buildName(input) || access.userName },
    linkUserId: access.userId,
    auditAction: "Konto mit neuer Personalakte verknüpft",
    auditSource: "Mein Bereich",
    enforceEmployeeNumberRequired: false,
  });
}

/**
 * Verknüpft das eingeloggte Konto mit einer bestehenden, noch nicht
 * verknüpften Personalakte im selben Mandanten (z. B. eine von HR ohne
 * Konto vorangelegte Akte). Kein `employees:write` nötig — dafür strikt auf
 * unverknüpfte Datensätze beschränkt, damit niemand ein fremdes,
 * bereits genutztes Profil übernehmen kann.
 */
export async function linkOwnTenantEmployee(input: { tenantSlug: string; employeeId: string }) {
  const access = await requireTenantMembership(input.tenantSlug);

  const existing = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Ihr Konto ist bereits mit einer Personalakte verknüpft.");
  }

  const target = await prisma.tenantEmployee.findFirst({
    where: { id: input.employeeId, tenantId: access.tenantId },
    select: { id: true, userId: true, name: true },
  });

  if (!target) {
    throw new Error("Personalakte wurde nicht gefunden.");
  }

  if (target.userId) {
    throw new Error("Diese Personalakte ist bereits mit einem Konto verknüpft.");
  }

  await prisma.tenantEmployee.update({
    where: { id: target.id },
    data: { userId: access.userId },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Konto mit Personalakte verknüpft",
    source: "Mein Bereich",
    entityType: "employee",
    entityId: target.id,
    detail: target.name,
  });
}

/** Löst die Verknüpfung des eingeloggten Kontos von der eigenen Personalakte — die Akte selbst bleibt erhalten. */
export async function unlinkOwnTenantEmployee(tenantSlug: string) {
  const access = await requireTenantMembership(tenantSlug);

  const target = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true, name: true },
  });

  if (!target) {
    throw new Error("Ihr Konto ist mit keiner Personalakte verknüpft.");
  }

  await prisma.tenantEmployee.update({
    where: { id: target.id },
    data: { userId: null },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Verknüpfung zur Personalakte aufgehoben",
    source: "Mein Bereich",
    entityType: "employee",
    entityId: target.id,
    detail: target.name,
  });
}

/**
 * Routing-Handle (`key`) der mit dem eingeloggten Konto verknüpften
 * Personalakte — für den Redirect auf das eigene Profil bei
 * `employees`-Scope "own" (siehe employees/page.tsx).
 */
export async function getMyEmployeeHandle(tenantSlug: string) {
  const access = await requireTenantMembership(tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { key: true },
  });

  return employee?.key ?? null;
}

/** Personalakten im Mandanten ohne verknüpftes Konto — Auswahl für "Bestehendes Profil verknüpfen". */
export async function getUnlinkedEmployeesForTenant(tenantSlug: string) {
  const access = await requireTenantMembership(tenantSlug);

  return prisma.tenantEmployee.findMany({
    where: { tenantId: access.tenantId, userId: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      initials: true,
      name: true,
      employeeNumber: true,
      location: true,
      team: true,
      role: true,
    },
  });
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
      contractDetails: true,
    },
  });

  if (!current) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  await assertKnownOrgReferences(tenantId, {
    location: input.location,
    team: input.team,
    role: input.role,
  });

  const currentEmployee = toEmployee(current);
  const name = buildName({ name: input.name || current.name, email: input.email });
  const contract = input.contract?.trim() || current.contract;
  const startDate = input.startDate?.trim() || current.startDate;
  const role = input.role?.trim() || current.role;
  const team = input.team?.trim() || current.team;
  const weeklyHours = input.weeklyHours?.trim() || current.weeklyHours;
  const location = input.location?.trim() ?? current.location;
  const status = normalizeStatus(input.status ?? current.status);
  const timelineEntries = buildEditTimelineEntries(
    {
      location: current.location,
      team: current.team,
      role: current.role,
      contract: current.contract,
      status: normalizeStatus(current.status),
    },
    { location, team, role, contract, status },
  );
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
  const existingContactIds = new Set(
    currentEmployee.emergencyContacts.map((contact) => contact.id),
  );
  const emergencyContacts: EmergencyContact[] | undefined = input.emergencyContacts?.map(
    (contact) => ({
      ...contact,
      id: existingContactIds.has(contact.id) ? contact.id : randomUUID(),
    }),
  );

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
      taxId: encryptField(input.taxId?.trim() ?? currentEmployee.taxId),
      socialSecurityNumber: encryptField(
        input.socialSecurityNumber?.trim() ?? currentEmployee.socialSecurityNumber,
      ),
      healthInsurance: encryptField(
        input.healthInsurance?.trim() ?? currentEmployee.healthInsurance,
      ),
      iban: encryptField(input.iban?.trim() ?? currentEmployee.iban),
      location,
      team,
      role,
      startDate,
      contract,
      weeklyHours,
      tenure: input.tenure?.trim() ?? current.tenure,
      status,
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
      contractDetails: {
        upsert: {
          create: { ...contractDetails, tenant: { connect: { id: tenantId } } },
          update: { ...contractDetails },
        },
      },
      emergencyContactsJson: emergencyContacts ?? currentEmployee.emergencyContacts,
      timeline: {
        create: timelineEntries.map((entry) => ({
          title: entry.title,
          tone: entry.tone,
          tenant: { connect: { id: tenantId } },
        })),
      },
    },
    include: {
      privateAddress: true,
      workAddress: true,
      infoRequests: { orderBy: { createdAt: "desc" } },
      timeline: { orderBy: { createdAt: "desc" } },
      contractDetails: true,
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
  await syncLocationTeamSnapshots(employee);

  const sensitiveChanges = [
    input.iban !== undefined && input.iban !== currentEmployee.iban ? "IBAN" : null,
    input.socialSecurityNumber !== undefined &&
    input.socialSecurityNumber !== currentEmployee.socialSecurityNumber
      ? "SV-Nummer"
      : null,
    input.taxId !== undefined && input.taxId !== currentEmployee.taxId
      ? "Steuer-ID"
      : null,
    input.healthInsurance !== undefined &&
    input.healthInsurance !== currentEmployee.healthInsurance
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
    prisma.tenantLocationMember.deleteMany({ where: { employeeId: input.employeeId } }),
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
    select: { id: true, name: true },
  });

  if (!employee) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  const dueAtIso = input.dueAt?.trim() ?? "";
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(dueAtIso)
    ? new Date(`${dueAtIso}T00:00:00`)
    : null;

  const request = await prisma.tenantEmployeeInfoRequest.create({
    data: {
      tenant: { connect: { id: access.tenantId } },
      employee: { connect: { id: employee.id } },
      title,
      message: input.message?.trim() || "",
      requestedBy: access.userName,
      dueAt,
      fileRequested: input.fileRequested,
      status: "open",
    },
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
