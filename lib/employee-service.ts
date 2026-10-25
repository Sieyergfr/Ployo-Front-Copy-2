import {
  deriveInfoRequestTitle,
  normalizeInfoRequestItems,
  type InfoRequestItemInput,
  type InfoRequestItemView,
} from "@/lib/info-request-items";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { decryptField, encryptField } from "@/lib/encryption";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import {
  addressDefaults,
  assertValidAddressFormat,
  formatAddress,
  normalizeAddressInput,
  type AddressInput,
} from "@/lib/address";
import { decryptAddress, encryptAddress } from "@/lib/employee-address";
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
  type InfoRequestStatus,
  infoRequestStatuses,
} from "@/lib/employees";
import { recordTenantAudit } from "@/lib/audit";
import { mapTenantFileToFileItem } from "@/lib/files";
import {
  getEmployeeLocationNames,
  getEmployeeLocationNamesMap,
  syncEmployeeLocationMemberships,
} from "@/lib/location-service";
import { prisma } from "@/lib/prisma";
import { purgeTenantFiles } from "@/lib/storage/delete";
import { ensureEmployeeTemplateFolder } from "@/lib/storage/storage.service";
import { headers } from "next/headers";
import {
  assertEmployeeInScope,
  getOptionalTenantAccess,
  requireTenantAccess,
  requireTenantMembership,
  resolveScopeFilter,
  scopeAllowsTarget,
  type TenantAccess,
} from "@/lib/tenant-access";
import type { PermissionLevel } from "@/lib/roles";
import { canAccessFileAcl } from "@/lib/file-access";
import { getISOWeekFromDate, getISOWeekStart } from "@/lib/shift-service";
import { isStripeConfigured } from "@/lib/stripe/client";
import { checkEmployeeLimit, planEmployeeLimits } from "@/lib/stripe/plans";
import { computeVacationAccount } from "@/lib/vacations";
import { syncMembershipRoleFromEmployeeRole } from "@/lib/role-service";
import { assertEmployeeDeletionAllowed } from "@/lib/retention-service";

import { notifyEmployeeOfInfoRequest } from "@/lib/notifications/events";

type EmployeeRecord = {
  id: string;
  key: string;
  userId?: string | null;
  appAccessLockedAt?: Date | null;
  appAccessLockReason?: string;
  vacationCarryoverExpiresAt?: Date | null;
  vacationCarryoverRemindedAt?: Date | null;
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
  maternityProtectionActive: boolean;
  maternityProtectionNote: string;
  location: string;
  team: string;
  role: string;
  startDate: string;
  endDate: string;
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
  vacationCarryover: number;
  vacationManualCorrection: number;
  emergencyContactsJson: string;
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
  responseMessage: string;
  respondedAt: Date | null;
  responseFileId: string | null;
  responseFile?: { displayName: string } | null;
  items?: InfoRequestItemRecord[];
};

type InfoRequestItemRecord = {
  id: string;
  kind: string;
  label: string;
  required: boolean;
  status: string;
  value: string;
  fileId: string | null;
  respondedAt: Date | null;
  file?: { displayName: string } | null;
};

/** Elemente mehrteiliger Info-Anfragen (M7) — in jeder Abfrage gleich geladen. */
const infoRequestItemsInclude = {
  orderBy: { position: "asc" as const },
  include: { file: { select: { displayName: true } } },
};

function toInfoRequestItemView(item: InfoRequestItemRecord): InfoRequestItemView {
  return {
    id: item.id,
    kind: item.kind === "field" ? "field" : "document",
    label: item.label,
    required: item.required,
    status: item.status === "provided" ? "provided" : "open",
    value: item.value,
    fileId: item.fileId,
    fileName: item.file?.displayName ?? null,
    respondedAt: item.respondedAt?.toISOString() ?? null,
  };
}

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
  compensationGross: string;
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
  firstViewedAt?: Date | null;
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
  hiddenFromEmployee: boolean;
  parent?: { accessRoleIdsJson: unknown; accessUserIdsJson: unknown } | null;
};

type TenantFileFolderRecord = {
  id: string;
  name: string;
  path: string;
  ownerName: string;
  locked: boolean;
  hiddenFromEmployee: boolean;
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
  maternityProtectionActive?: boolean;
  maternityProtectionNote?: string;
  /** Primärstandort — nur wirksam, wenn `locations` nicht mitgeschickt wird. */
  location?: string;
  /** "Mehrere Standorte pro Mitarbeiter" — hat Vorrang vor `location`, wenn beide gesetzt sind. */
  locations?: string[];
  /** Primärteam — nur wirksam, wenn `teams` nicht mitgeschickt wird. */
  team?: string;
  /** "Mehrere Teams pro Mitarbeiter" — hat Vorrang vor `team`, wenn beide gesetzt sind. */
  teams?: string[];
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
  vacationManualCorrection?: string;
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
  compensationGross?: string;
  workingTime?: string;
  vacation?: string;
  contractDetailsSubmitted?: boolean;
  emergencyContacts?: EmergencyContact[];
};

/**
 * `emergencyContactsJson` ist jetzt eine `String`-Spalte (Migration
 * `20260903000000_split_employee_address`), nicht mehr `Json` — die
 * Feldverschlüsselung (`lib/encryption.ts`) arbeitet nur auf Strings.
 * Fehlerhaftes JSON (sollte nicht vorkommen, aber sicherer als ein Crash der
 * ganzen Personalakte) liefert eine leere Liste statt zu werfen.
 */
function parseEmergencyContacts(value: string): EmergencyContact[] {
  const decrypted = decryptField(value);

  if (!decrypted) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(decrypted);

    return Array.isArray(parsed) ? (parsed as EmergencyContact[]) : [];
  } catch {
    return [];
  }
}

function serializeEmergencyContacts(contacts: EmergencyContact[]): string {
  return encryptField(JSON.stringify(contacts));
}

/** Datum/Frist einer Info-Anfrage formatieren — Uhrzeit nur anzeigen, wenn tatsächlich eine gesetzt wurde. */
function formatRequestDate(date: Date | null) {
  if (!date) {
    return "";
  }

  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: hasTime ? "short" : undefined,
  }).format(date);
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

/**
 * Verhindert doppelte E-Mail-Adressen pro Mandant, case-insensitiv (QA-Bug
 * BUG-005) — bisher ließen sich beliebig viele Personalakten mit identischer
 * (bzw. nur in Groß-/Kleinschreibung abweichender) E-Mail anlegen, was
 * Konto-Verknüpfung (`acceptInvitationForUser` matcht per E-Mail) und
 * Einladungen mehrdeutig machte. Eine leere E-Mail ist erlaubt und mehrfach
 * vorkommbar (viele Mitarbeiter haben noch keine hinterlegt).
 */
async function assertUniqueEmployeeEmail(input: {
  tenantId: string;
  email: string;
  excludeEmployeeId?: string;
}) {
  const email = input.email.trim();

  if (!email) {
    return;
  }

  const existing = await prisma.tenantEmployee.findFirst({
    where: {
      tenantId: input.tenantId,
      email: { equals: email, mode: "insensitive" },
      id: input.excludeEmployeeId ? { not: input.excludeEmployeeId } : undefined,
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Diese E-Mail-Adresse ist bereits einer anderen Personalakte zugeordnet.");
  }
}

/** Maximale Namenslänge — ein ca. 250 Zeichen langer Name zerlegte bisher den Kopf der Personalakte (QA-Bug BUG-008). */
const EMPLOYEE_NAME_MAX_LENGTH = 100;

function assertValidEmployeeName(name: string) {
  if (name.length > EMPLOYEE_NAME_MAX_LENGTH) {
    throw new Error(`Der Name darf höchstens ${EMPLOYEE_NAME_MAX_LENGTH} Zeichen lang sein.`);
  }
}

/**
 * Erlaubt Ziffern sowie die international üblichen Trennzeichen (+, Klammern,
 * Leerzeichen, Bindestrich, Schrägstrich) — lehnt Buchstaben/Sonderzeichen ab
 * (QA-Bug BUG-008, Beispiel aus dem Report: "abc!!"). Leer bleibt erlaubt
 * (optionales Feld).
 */
const PHONE_ALLOWED_CHARS_PATTERN = /^[+()\d\s/-]+$/;

function assertValidPhone(phone: string) {
  if (!phone) {
    return;
  }

  const digitCount = phone.replace(/\D/g, "").length;

  if (!PHONE_ALLOWED_CHARS_PATTERN.test(phone) || digitCount < 6 || digitCount > 15) {
    throw new Error("Bitte eine gültige Telefonnummer angeben.");
  }
}

/**
 * Nur Formatprüfung (11 Ziffern, erste Ziffer ≠ 0 — laut BZSt nie 0) statt der
 * vollständigen Prüfziffer-Berechnung der Steuer-Identifikationsnummer: die
 * exakte Prüfziffernregel ist fehleranfällig ohne offizielle Testvektoren,
 * das Format allein deckt den gemeldeten Fall ("123" als Steuer-ID) bereits ab
 * (QA-Bug BUG-008). Leer bleibt erlaubt (optionales Feld).
 */
const TAX_ID_PATTERN = /^[1-9]\d{10}$/;

function assertValidTaxId(taxId: string) {
  if (taxId && !TAX_ID_PATTERN.test(taxId)) {
    throw new Error("Bitte eine gültige 11-stellige Steuer-Identifikationsnummer angeben.");
  }
}

/**
 * IBAN-Prüfsumme nach ISO 7064 (MOD 97-10) — dieselbe Prüfziffer-Berechnung,
 * die jede Bank beim Zahlungsverkehr anwendet (QA-Bug BUG-008: bisher wurde
 * "DE00 1234" klaglos gespeichert). Leer bleibt erlaubt (optionales Feld).
 */
function isValidIbanChecksum(compactIban: string): boolean {
  const rearranged = compactIban.slice(4) + compactIban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let remainder = 0;

  for (const chunk of numeric.match(/\d{1,7}/g) ?? []) {
    remainder = Number(`${remainder}${chunk}`) % 97;
  }

  return remainder === 1;
}

function assertValidIban(iban: string) {
  if (!iban) {
    return;
  }

  const compact = iban.replace(/\s+/g, "").toUpperCase();

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact) || !isValidIbanChecksum(compact)) {
    throw new Error("Bitte eine gültige IBAN angeben.");
  }
}

function normalizeStatus(value?: string): EmployeeStatus {
  return value === "vacation" || value === "absent" || value === "former" ? value : "active";
}

const employeeStatusLabels: Record<EmployeeStatus, string> = {
  active: "Im Dienst",
  vacation: "Urlaub",
  absent: "Abwesend",
  former: "Ausgeschieden",
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
  refs: {
    location?: string;
    locations?: string[];
    team?: string;
    teams?: string[];
    role?: string;
  },
) {
  const location = refs.location?.trim();
  const locations = Array.from(
    new Set((refs.locations ?? []).map((name) => name.trim()).filter(Boolean)),
  );
  const team = refs.team?.trim();
  const teams = Array.from(
    new Set((refs.teams ?? []).map((name) => name.trim()).filter(Boolean)),
  );
  const role = refs.role?.trim();

  const [locationExists, knownLocations, teamExists, knownTeams, roleExists] = await Promise.all([
    location
      ? prisma.tenantLocation.findFirst({ where: { tenantId, name: location }, select: { id: true } })
      : null,
    locations.length
      ? prisma.tenantLocation.findMany({
          where: { tenantId, name: { in: locations } },
          select: { name: true },
        })
      : [],
    team
      ? prisma.tenantTeam.findFirst({ where: { tenantId, name: team }, select: { id: true } })
      : null,
    teams.length
      ? prisma.tenantTeam.findMany({
          where: { tenantId, name: { in: teams } },
          select: { name: true },
        })
      : [],
    role
      ? prisma.tenantRole.findFirst({ where: { tenantId, name: role }, select: { id: true } })
      : null,
  ]);

  if (location && !locationExists) {
    throw new Error(`Unbekannter Standort: "${location}".`);
  }

  const knownLocationNames = new Set(knownLocations.map((entry) => entry.name));
  const unknownLocations = locations.filter((name) => !knownLocationNames.has(name));

  if (unknownLocations.length > 0) {
    throw new Error(`Unbekannte Standorte: ${unknownLocations.join(", ")}.`);
  }

  if (team && !teamExists) {
    throw new Error(`Unbekanntes Team: "${team}".`);
  }

  const knownTeamNames = new Set(knownTeams.map((entry) => entry.name));
  const unknownTeams = teams.filter((name) => !knownTeamNames.has(name));

  if (unknownTeams.length > 0) {
    throw new Error(`Unbekannte Teams: ${unknownTeams.join(", ")}.`);
  }

  if (role && !roleExists) {
    throw new Error(`Unbekannte Berechtigungsrolle: "${role}".`);
  }
}

function toInt(value: number | string | undefined, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Wie `toInt`, aber erlaubt negative Werte — für vorzeichenbehaftete Korrekturen (z. B. `vacationManualCorrection`). */
function toSignedInt(value: number | string | undefined, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  return Number.isFinite(parsed) ? parsed : fallback;
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
    compensationGross: "",
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
    folderMap.set(folder.path ?? folder.name, { ...folder });
  }

  // Schluessel ist der Ordner-PFAD, nicht der Name (siehe location-service.ts).
  for (const folder of storageFolders) {
    folderMap.set(folder.path, {
      name: folder.name,
      path: folder.path,
      fileCount: 0,
      locked: folder.locked,
      hiddenFromEmployee: folder.hiddenFromEmployee,
    });
  }

  for (const file of files) {
    if (!file.folderSlug) {
      continue;
    }

    const current = folderMap.get(file.folderSlug);

    if (current) {
      current.fileCount += file.storageFileId ? 1 : 0;
    } else {
      // Ordner, den es bisher nur über die Dateien darin gibt: kein
      // Datensatz, also auch kein eigenes Sichtbarkeits-Flag — es wird beim
      // ersten Umschalten nachgetragen (setTenantFileFolderEmployeeVisibility).
      folderMap.set(file.folderSlug, {
        name: file.folder,
        path: file.folderSlug,
        fileCount: 1,
        locked: false,
        hiddenFromEmployee: false,
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
function toEmployee(
  record: EmployeeRecord,
  sensitiveFieldsVisible = true,
  contractsVisible = true,
  mutterschutzVisible = true,
): Employee {
  const decryptedPrivateAddress = decryptAddress(record.privateAddress);
  const decryptedWorkAddress = decryptAddress(record.workAddress);
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
        compensation: decryptField(record.contractDetails.compensation),
        compensationGross: decryptField(record.contractDetails.compensationGross),
        workingTime: record.contractDetails.workingTime,
        vacation: record.contractDetails.vacation,
        noticePeriod: record.contractDetails.noticePeriod,
        collectiveAgreement: record.contractDetails.collectiveAgreement,
        clauses: record.contractDetails.clauses,
      }
    : defaultContractDetails();
  const contractDetails =
    !contractsVisible ||
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
          compensationGross: "",
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
      folderSlug: mapped.folderSlug,
      type: mapped.type,
      size: mapped.size,
      updatedAt: mapped.updatedAt,
      locked: true,
      storageFileId: mapped.storageFileId,
      hiddenFromEmployee: file.hiddenFromEmployee,
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
    birthDate: sensitiveFieldsVisible ? decryptField(record.birthDate) : "",
    birthPlace: sensitiveFieldsVisible ? decryptField(record.birthPlace) : "",
    nationality: sensitiveFieldsVisible ? decryptField(record.nationality) : "",
    maritalStatus: sensitiveFieldsVisible ? decryptField(record.maritalStatus) : "",
    privateAddress: sensitiveFieldsVisible ? formatAddress(decryptedPrivateAddress) : "",
    privateAddressFields: sensitiveFieldsVisible
      ? addressDefaults(decryptedPrivateAddress)
      : addressDefaults(null),
    taxId: sensitiveFieldsVisible ? decryptField(record.taxId) : REDACTED,
    socialSecurityNumber: sensitiveFieldsVisible
      ? decryptField(record.socialSecurityNumber)
      : REDACTED,
    healthInsurance: sensitiveFieldsVisible ? decryptField(record.healthInsurance) : REDACTED,
    iban: sensitiveFieldsVisible ? decryptField(record.iban) : REDACTED,
    maternityProtectionActive: mutterschutzVisible ? record.maternityProtectionActive : false,
    maternityProtectionNote: mutterschutzVisible
      ? decryptField(record.maternityProtectionNote)
      : "",
    location: record.location,
    team: record.team,
    role: record.role,
    startDate: record.startDate,
    endDate: record.endDate,
    contract: record.contract,
    weeklyHours: record.weeklyHours,
    tenure: record.tenure,
    status: normalizeStatus(record.status),
    email: record.email,
    phone: record.phone,
    hasAccount: Boolean(record.userId),
    appAccessLockedAt: record.appAccessLockedAt?.toISOString() ?? null,
    appAccessLockReason: record.appAccessLockReason ?? "",
    vacationCarryoverExpiresAt: record.vacationCarryoverExpiresAt?.toISOString().slice(0, 10) ?? null,
    vacationCarryoverRemindedAt: record.vacationCarryoverRemindedAt?.toISOString() ?? null,
    address: formatAddress(decryptedWorkAddress),
    addressFields: addressDefaults(decryptedWorkAddress),
    vacationRemaining: record.vacationRemaining,
    vacationTotal: record.vacationTotal,
    vacationTaken: record.vacationTaken,
    vacationCarryover: record.vacationCarryover,
    vacationManualCorrection: record.vacationManualCorrection,
    fileFolders,
    files,
    emergencyContacts: parseEmergencyContacts(record.emergencyContactsJson),
    payrollStatements: (record.payrollStatements ?? []).map((statement) => ({
      id: statement.id,
      period: statement.period,
      issuedAt: statement.issuedAt.toISOString().slice(0, 10),
      gross: decryptField(statement.gross),
      net: decryptField(statement.net),
      fileName: statement.file.displayName,
      storageFileId: statement.file.id,
      status: statement.status === "corrected" ? "corrected" : "available",
      firstViewedAt: statement.firstViewedAt?.toISOString() ?? null,
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
      dueAt: formatRequestDate(request.dueAt),
      fileRequested: request.fileRequested,
      status: request.status as InfoRequest["status"],
      responseMessage: request.responseMessage || undefined,
      respondedAt: request.respondedAt ? formatRequestDate(request.respondedAt) : undefined,
      hasResponseFile: Boolean(request.responseFileId),
      responseFileId: request.responseFileId ?? undefined,
      responseFileName: request.responseFile?.displayName || undefined,
      items: (request.items ?? []).map(toInfoRequestItemView),
    })),
    shifts,
    timeline: (record.timeline ?? []).map((entry) => ({
      title: entry.title,
      // `timeZone` verhindert, dass ein kurz vor/nach Mitternacht (Ortszeit)
      // erzeugter Eintrag auf den falschen Kalendertag fällt (gleicher
      // Fehler wie BUG-016, lib/files.ts formatUpdatedAt).
      date: new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin" }).format(
        entry.createdAt,
      ),
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

async function getSessionUserEmail() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user?.email ?? null;
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
    // Kein eigenes Team darf nicht "alle Mitarbeiter ohne Team" bedeuten —
    // sonst sähe ein Team-Scope ohne eigene Teamzuordnung plötzlich alle
    // nicht zugeordneten Kolleg:innen (Audit-Finding H03). Eine leere
    // `teammateIds`-Liste trifft nichts.
    return { tenantId: access.tenantId, id: { in: scopeFilter.teammateIds } };
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

/** Voraussichtliche nächste Personalnummer für das "Mitarbeiter anlegen"-Formular (unter Prefix/Suffix). */
export async function previewNextEmployeeNumber(tenantSlug: string) {
  const tenantId = await getTenantIdForEmployees(tenantSlug);
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { employeeNumberPrefix: true, employeeNumberSuffix: true },
  });

  return nextEmployeeNumber(
    tenantId,
    settings?.employeeNumberPrefix ?? "MA-",
    settings?.employeeNumberSuffix ?? "",
  );
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

/**
 * Filter der Mitarbeiterliste. Beide Felder sind optional; ein leerer oder
 * nur aus Leerzeichen bestehender String zählt als "kein Filter", damit ein
 * geleertes Suchfeld nicht versehentlich alles ausblendet.
 */
export type EmployeeListFilters = {
  /** Freitext über Name, Personalnummer und Team (Teiltreffer, Groß-/Kleinschreibung egal). */
  search?: string;
  /** Exakter Standortname, wie er in `TenantEmployee.location` steht. */
  location?: string;
  /**
   * Live berechneter Status (siehe `computeLiveEmployeeStatus`) — wird erst
   * NACH der Live-Berechnung angewendet (in-memory), nicht als Prisma-`where`,
   * da "vacation"/"absent" nicht direkt aus der DB-Spalte ablesbar sind.
   */
  status?: EmployeeStatus;
};

/** Maximale Länge eines Suchbegriffs — längere werden abgeschnitten. */
const EMPLOYEE_SEARCH_MAX_LENGTH = 100;

/**
 * Escaped `%`, `_` und `\` (Postgres-ILIKE-Metazeichen) in einem
 * Suchbegriff, bevor er an Prismas `contains` übergeben wird — Prisma
 * escaped diese selbst nicht (kein SQLi-Risiko, der Wert bleibt
 * parametrisiert, aber `%`/`_` innerhalb des Suchbegriffs wirkten bisher wie
 * SQL-LIKE-Wildcards statt als literale Zeichen gesucht zu werden, z. B.
 * lieferte die Suche nach "%" oder "L_na" Treffer nach Muster statt 0/1
 * exakten Treffern). QA-Bug BUG-012.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Übersetzt die Freitextsuche in eine Prisma-Bedingung über die drei Felder,
 * die das Suchfeld laut Platzhalter verspricht ("Name, Personal-Nr. oder Team").
 *
 * Bewusst `contains` + `insensitive` statt eines Volltextindex: die Liste ist
 * pro Mandant durch das Plan-Limit klein, und ein `tsvector` bräuchte eine
 * Migration plus Pflege bei jedem Schreibvorgang. Sollte das je zu langsam
 * werden, ist der Austausch auf diese eine Funktion beschraenkt.
 */
function employeeSearchWhere(search: string): Prisma.TenantEmployeeWhereInput {
  const term = escapeLikePattern(search.slice(0, EMPLOYEE_SEARCH_MAX_LENGTH));

  return {
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { employeeNumber: { contains: term, mode: "insensitive" } },
      { team: { contains: term, mode: "insensitive" } },
      // Freitext deckt auch den Standortnamen ab, nicht nur den separaten
      // Exact-Match-Dropdown-Filter ("location" in employeeFilterWhere).
      // Matched den Primär-Standort-String; Mitarbeiter, die nur über eine
      // zusätzliche (nicht-primäre) Standort-Mitgliedschaft dort zugeordnet
      // sind, tauchen weiterhin über den Dropdown-Filter auf, nicht hier.
      { location: { contains: term, mode: "insensitive" } },
    ],
  };
}

/**
 * Baut die Filter-Klauseln, die **zusätzlich** zur Scope-Bedingung gelten.
 * Getrennt gehalten, damit an der Aufrufstelle sichtbar bleibt, dass Filter
 * den Scope nur weiter einengen und ihn nie aufweichen koennen.
 *
 * `location` matcht seit "Mehrere Standorte pro Mitarbeiter" gegen die
 * Standort-Mitgliedschaften (`TenantLocationMember`), nicht mehr gegen den
 * (nur noch als Primär-Anzeige gepflegten) `TenantEmployee.location`-String
 * — sonst würde ein Mitarbeiter mit mehreren Standorten bei allen außer dem
 * ersten aus der gefilterten Liste fallen.
 */
async function employeeFilterWhere(
  tenantId: string,
  filters: EmployeeListFilters,
): Promise<Prisma.TenantEmployeeWhereInput> {
  const search = filters.search?.trim() ?? "";
  const location = filters.location?.trim() ?? "";

  const locationEmployeeIds = location
    ? (
        await prisma.tenantLocationMember.findMany({
          where: { location: { tenantId, name: location } },
          select: { employeeId: true },
        })
      ).map((member) => member.employeeId)
    : null;

  return {
    ...(locationEmployeeIds ? { id: { in: locationEmployeeIds } } : {}),
    ...(search ? employeeSearchWhere(search) : {}),
  };
}

/** `YYYY-MM-DD`-Grenzen des laufenden Kalenderjahres — für "genehmigter Urlaub dieses Jahr". */
function currentYearRange() {
  const year = new Date().getFullYear();

  return { gte: `${year}-01-01`, lte: `${year}-12-31` };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/**
 * "former" ist persistent/autoritativ (nur über das Ausscheiden setzbar) und
 * gewinnt immer — Urlaub/Krankheit werden für ausgeschiedene Mitarbeiter nicht
 * mehr live geprüft. Sonst wie auf der Übersicht (siehe To-Do "Mitarbeiter
 * Aktiv..."): employee.status wird nirgends automatisch synchron gehalten,
 * daher live aus genehmigtem Urlaub (heute im Zeitraum) und offener
 * Krankmeldung (heute im Zeitraum) ableiten statt aus dem Feld zu vertrauen.
 */
function computeLiveEmployeeStatus(input: {
  storedStatus: string;
  onVacationToday: boolean;
  sickToday: boolean;
}): EmployeeStatus {
  if (input.storedStatus === "former") {
    return "former";
  }

  if (input.onVacationToday) {
    return "vacation";
  }

  if (input.sickToday) {
    return "absent";
  }

  return "active";
}

/** Batch-Abfrage: welche der übergebenen Mitarbeiter sind heute krankgemeldet (offen, Zeitraum deckt heute ab)? */
async function getEmployeeIdsSickToday(employeeIds: string[]): Promise<Set<string>> {
  if (employeeIds.length === 0) {
    return new Set();
  }

  const now = startOfUtcDay(new Date());
  const reports = await prisma.tenantSicknessReport.findMany({
    where: { employeeId: { in: employeeIds }, status: "open", startDate: { lte: now } },
    select: { employeeId: true, endDate: true },
  });

  return new Set(
    reports
      .filter((report) => !report.endDate || startOfUtcDay(report.endDate) >= now)
      .map((report) => report.employeeId),
  );
}

export async function getEmployeesForTenant(
  tenantSlug: string,
  filters: EmployeeListFilters = {},
) {
  const where = await employeeScopeWhere(tenantSlug);
  const fileAccess = await getOptionalTenantAccess(tenantSlug, "employeeFiles", "read");

  if (!where.tenantId) {
    return null;
  }

  const records = await prisma.tenantEmployee.findMany({
    // Scope und Filter als eigene AND-Zweige, NICHT flach zusammengespreadet:
    // beide können ein "id"-Feld setzen (Own-Scope vs. Standortfilter), ein
    // flaches { ...where, ...filter } ließe das Filter-"id" das Scope-"id"
    // stillschweigend überschreiben statt es zusätzlich einzuschränken
    // (Audit-Finding H03).
    where: { AND: [where, await employeeFilterWhere(where.tenantId, filters)] },
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
      infoRequests: {
        orderBy: { createdAt: "desc" },
        include: { responseFile: { select: { displayName: true } }, items: infoRequestItemsInclude },
      },
      timeline: { orderBy: { createdAt: "desc" } },
      contractDetails: true,
      vacationRequests: {
        where: { status: "approved", startDate: currentYearRange() },
        select: { days: true, startDate: true, endDate: true },
      },
    },
  });

  // Geburtsdaten/Steuer-ID/Sozialversicherungsnummer/IBAN/Krankenversicherung
  // sind sensibler als der Rest der Liste — je Mitarbeiter gegen die
  // "sensitiveData"-Berechtigung (inkl. deren Scope) prüfen, statt sie an
  // jeden mit bloßem "employees:read" auszuliefern. Verträge (inkl. Gehalt)
  // analog gegen "contracts".
  const sensitiveDataAccess = await getOptionalTenantAccess(tenantSlug, "sensitiveData", "read");
  const sensitiveDataScope = sensitiveDataAccess ? await resolveScopeFilter(sensitiveDataAccess) : null;
  const contractsAccess = await getOptionalTenantAccess(tenantSlug, "contracts", "read");
  const contractsScope = contractsAccess ? await resolveScopeFilter(contractsAccess) : null;
  // Mutterschutz ist ein eigener Berechtigungsbereich, nicht Teil von
  // sensitiveData (siehe lib/roles.ts) — z. B. damit die Lohnbuchhaltung
  // nicht automatisch mitsieht.
  const mutterschutzAccess = await getOptionalTenantAccess(tenantSlug, "mutterschutz", "read");
  const mutterschutzScope = mutterschutzAccess ? await resolveScopeFilter(mutterschutzAccess) : null;
  const locationNamesByEmployeeId = await getEmployeeLocationNamesMap(
    where.tenantId,
    records.map((record) => record.id),
  );
  const teamNamesByEmployeeId = await getEmployeeTeamNamesMap(
    where.tenantId,
    records.map((record) => record.id),
  );
  const today = todayIso();
  const sickEmployeeIds = await getEmployeeIdsSickToday(records.map((record) => record.id));
  const statusFilter = filters.status;

  return records.map((record) => {
    const employee = toEmployee(
      {
        ...record,
        storageFiles: fileAccess
          ? record.storageFiles.filter((file) => canAccessFileAcl(file.parent ?? file, fileAccess))
          : [],
      },
      sensitiveDataScope !== null &&
        scopeAllowsTarget(sensitiveDataScope, { id: record.id }),
      contractsScope !== null &&
        scopeAllowsTarget(contractsScope, { id: record.id }),
      mutterschutzScope !== null &&
        scopeAllowsTarget(mutterschutzScope, { id: record.id }),
    );
    const onVacationToday = record.vacationRequests.some(
      (r) => r.startDate <= today && r.endDate >= today,
    );

    return {
      ...employee,
      ...computeVacationAccount({
        contractVacation: employee.contractDetails.vacation,
        storedVacationTotal: employee.vacationTotal,
        approvedDaysThisYear: record.vacationRequests.reduce((sum, r) => sum + r.days, 0),
        carryover: record.vacationCarryover,
        manualCorrection: record.vacationManualCorrection,
      }),
      status: computeLiveEmployeeStatus({
        storedStatus: record.status,
        onVacationToday,
        sickToday: sickEmployeeIds.has(record.id),
      }),
      locations: locationNamesByEmployeeId.get(record.id) ?? [],
      teams: teamNamesByEmployeeId.get(record.id) ?? [],
    };
  }).filter((employee) => !statusFilter || employee.status === statusFilter);
}

export async function getEmployeeForTenant(tenantSlug: string, employeeHandle: string) {
  const where = await employeeScopeWhere(tenantSlug);
  const fileAccess = await getOptionalTenantAccess(tenantSlug, "employeeFiles", "read");

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
      infoRequests: {
        orderBy: { createdAt: "desc" },
        include: { responseFile: { select: { displayName: true } }, items: infoRequestItemsInclude },
      },
      timeline: { orderBy: { createdAt: "desc" } },
      contractDetails: true,
      vacationRequests: {
        where: { status: "approved", startDate: currentYearRange() },
        select: { days: true, startDate: true, endDate: true },
      },
    },
  });

  if (!record) {
    return null;
  }

  // Gehaltsabrechnungen, sensible Stammdaten und Verträge sind sensibler als
  // der Rest des Profils — je eigene Berechtigung (inkl. Scope) prüfen,
  // statt sie ungeprüft an jeden mit "employees:read" auszuliefern.
  const payrollAccess = await getOptionalTenantAccess(tenantSlug, "payroll", "read");
  const payrollScope = payrollAccess ? await resolveScopeFilter(payrollAccess) : null;
  const canViewPayroll =
    payrollScope !== null &&
    scopeAllowsTarget(payrollScope, { id: record.id });

  const { canViewSensitiveData, canViewContracts, canViewMutterschutz } =
    await employeeVisibilityFlags(tenantSlug, { id: record.id, team: record.team });

  const payrollStatements = canViewPayroll
    ? await prisma.tenantPayrollStatement.findMany({
        where: { employeeId: record.id },
        orderBy: { issuedAt: "desc" },
        include: { file: { select: { id: true, displayName: true } } },
      })
    : [];

  const locations = await getEmployeeLocationNames(where.tenantId, record.id);
  const teams = await getEmployeeTeamNames(where.tenantId, record.id);
  const employee = toEmployee(
    {
      ...record,
      payrollStatements,
      storageFiles: fileAccess
        ? record.storageFiles.filter((file) => canAccessFileAcl(file.parent ?? file, fileAccess))
        : [],
    },
    canViewSensitiveData,
    canViewContracts,
    canViewMutterschutz,
  );

  const today = todayIso();
  const onVacationToday = record.vacationRequests.some(
    (r) => r.startDate <= today && r.endDate >= today,
  );
  const sickToday = (await getEmployeeIdsSickToday([record.id])).has(record.id);

  return {
    ...employee,
    ...computeVacationAccount({
      contractVacation: employee.contractDetails.vacation,
      storedVacationTotal: employee.vacationTotal,
      approvedDaysThisYear: record.vacationRequests.reduce((sum, r) => sum + r.days, 0),
      carryover: record.vacationCarryover,
      manualCorrection: record.vacationManualCorrection,
    }),
    status: computeLiveEmployeeStatus({
      storedStatus: record.status,
      onVacationToday,
      sickToday,
    }),
    locations,
    teams,
  };
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

/** Alle Teamnamen, denen ein Mitarbeiter aktuell zugeordnet ist (`TenantTeamMember`). */
async function getEmployeeTeamNames(tenantId: string, employeeId: string): Promise<string[]> {
  const memberships = await prisma.tenantTeamMember.findMany({
    where: { employeeId, team: { tenantId } },
    select: { team: { select: { name: true } } },
    orderBy: { team: { name: "asc" } },
  });

  return memberships.map((membership) => membership.team.name);
}

/** Teamnamen für mehrere Mitarbeiter auf einmal (Mitarbeiterliste), gruppiert nach `employeeId`. */
async function getEmployeeTeamNamesMap(
  tenantId: string,
  employeeIds: string[],
): Promise<Map<string, string[]>> {
  if (employeeIds.length === 0) {
    return new Map();
  }

  const memberships = await prisma.tenantTeamMember.findMany({
    where: { employeeId: { in: employeeIds }, team: { tenantId } },
    select: { employeeId: true, team: { select: { name: true } } },
    orderBy: { team: { name: "asc" } },
  });

  const map = new Map<string, string[]>();

  for (const membership of memberships) {
    const list = map.get(membership.employeeId) ?? [];
    list.push(membership.team.name);
    map.set(membership.employeeId, list);
  }

  return map;
}

/**
 * Bringt die Team-Mitgliedschaften (`TenantTeamMember`) eines Mitarbeiters auf
 * exakt die übergebene Menge von Teamnamen — Pendant zu
 * `syncEmployeeLocationMemberships` (location-service.ts) für "Mehrere Teams
 * pro Mitarbeiter". Vorher setzte das Anlegen/Bearbeiten über das
 * Mitarbeiterprofil nur die Freitext-Spalte `TenantEmployee.team`, ohne eine
 * `TenantTeamMember`-Zeile anzulegen — der Mitarbeiter tauchte dadurch nicht
 * auf der eigentlichen Team-Detailseite auf. Bestehende Mitgliedschaften
 * (inkl. `isLead`) außerhalb der Menge werden entfernt, fehlende ergänzt.
 * Lebt hier statt in team-service.ts, damit kein Importzyklus entsteht:
 * team-service.ts importiert bereits `getEmployeesForTenant` von hier.
 */
async function syncEmployeeTeamMemberships(input: {
  tenantId: string;
  employeeId: string;
  employeeInitials: string;
  employeeName: string;
  employeeLocation: string;
  employeeRole: string;
  employeeContract: string;
  employeeStatus: EmployeeStatus;
  teamNames: string[];
}) {
  const names = Array.from(
    new Set(input.teamNames.map((name) => name.trim()).filter(Boolean)),
  );

  const [targetTeams, currentMemberships] = await Promise.all([
    names.length
      ? prisma.tenantTeam.findMany({
          where: { tenantId: input.tenantId, name: { in: names } },
          select: { id: true },
        })
      : Promise.resolve([]),
    prisma.tenantTeamMember.findMany({
      where: { employeeId: input.employeeId, team: { tenantId: input.tenantId } },
      select: { id: true, teamId: true },
    }),
  ]);

  const targetTeamIds = new Set(targetTeams.map((team) => team.id));
  const currentTeamIds = new Set(currentMemberships.map((member) => member.teamId));
  const toRemove = currentMemberships.filter((member) => !targetTeamIds.has(member.teamId));
  const toAddTeamIds = targetTeams
    .map((team) => team.id)
    .filter((id) => !currentTeamIds.has(id));

  if (toRemove.length === 0 && toAddTeamIds.length === 0) {
    return;
  }

  await prisma.$transaction([
    ...(toRemove.length
      ? [
          prisma.tenantTeamMember.deleteMany({
            where: { id: { in: toRemove.map((member) => member.id) } },
          }),
        ]
      : []),
    ...(toAddTeamIds.length
      ? [
          prisma.tenantTeamMember.createMany({
            data: toAddTeamIds.map((teamId) => ({
              teamId,
              employeeId: input.employeeId,
              initials: input.employeeInitials,
              name: input.employeeName,
              location: input.employeeLocation,
              role: input.employeeRole,
              contract: input.employeeContract,
              status: input.employeeStatus === "vacation" ? "vacation" : "on-duty",
            })),
          }),
        ]
      : []),
  ]);
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
  const weeklyHours = input.weeklyHours?.trim() || "38 Std/Woche";
  const explicitEmployeeNumber = input.employeeNumber?.trim() || "";
  const locations = input.locations?.length
    ? Array.from(new Set(input.locations.map((value) => value.trim()).filter(Boolean)))
    : input.location?.trim()
      ? [input.location.trim()]
      : [];
  const teams = input.teams?.length
    ? Array.from(new Set(input.teams.map((value) => value.trim()).filter(Boolean)))
    : input.team?.trim()
      ? [input.team.trim()]
      : [];
  const team = teams[0] ?? "";

  await assertKnownOrgReferences(tenantId, {
    locations,
    teams,
    role: input.role,
  });
  await assertUniqueEmployeeEmail({ tenantId, email: input.email ?? "" });
  assertValidEmployeeName(name);
  assertValidPhone(input.phone?.trim() ?? "");
  assertValidTaxId(input.taxId?.trim() ?? "");
  assertValidIban(input.iban?.trim() ?? "");
  assertValidAddressFormat(normalizeAddressInput(input.privateAddress));
  assertValidAddressFormat(normalizeAddressInput(input.address));

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
      ...(linkUserId ? { user: { connect: { id: linkUserId } } } : {}),
      initials,
      name,
      employeeNumber,
      birthDate: encryptField(input.birthDate?.trim() || ""),
      birthPlace: encryptField(input.birthPlace?.trim() || ""),
      nationality: encryptField(input.nationality?.trim() || ""),
      maritalStatus: encryptField(input.maritalStatus?.trim() || ""),
      privateAddress: {
        create: encryptAddress(normalizeAddressInput(input.privateAddress)),
      },
      taxId: encryptField(input.taxId?.trim() || ""),
      socialSecurityNumber: encryptField(input.socialSecurityNumber?.trim() || ""),
      healthInsurance: encryptField(input.healthInsurance?.trim() || ""),
      iban: encryptField(input.iban?.trim() || ""),
      maternityProtectionActive: input.maternityProtectionActive ?? false,
      maternityProtectionNote: encryptField(input.maternityProtectionNote?.trim() || ""),
      location: locations[0] ?? "",
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
        create: encryptAddress(normalizeAddressInput(input.address)),
      },
      vacationRemaining: toInt(input.vacationRemaining, 0),
      vacationTotal: toInt(input.vacationTotal, 30),
      vacationTaken: toInt(input.vacationTaken, 0),
      emergencyContactsJson: serializeEmergencyContacts([]),
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
      infoRequests: {
        orderBy: { createdAt: "desc" },
        include: { responseFile: { select: { displayName: true } }, items: infoRequestItemsInclude },
      },
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

  if (locations.length > 0) {
    await syncEmployeeLocationMemberships({
      tenantId,
      employeeId: record.id,
      employeeInitials: record.initials,
      employeeName: record.name,
      locationNames: locations,
    });
  }

  if (teams.length > 0) {
    await syncEmployeeTeamMemberships({
      tenantId,
      employeeId: record.id,
      employeeInitials: record.initials,
      employeeName: record.name,
      employeeLocation: record.location,
      employeeRole: record.role,
      employeeContract: record.contract,
      employeeStatus: record.status,
      teamNames: teams,
    });
  }

  // Ordnervorlagen (`TenantEmployeeFolderTemplate`) automatisch anwenden —
  // jeder neue Mitarbeiter bekommt dieselben Ordner wie alle bestehenden.
  const folderTemplates = await prisma.tenantEmployeeFolderTemplate.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });

  if (folderTemplates.length > 0) {
    await Promise.all(
      folderTemplates.map((template) =>
        ensureEmployeeTemplateFolder({
          tenantId,
          employeeId: record.id,
          name: template.name,
          ownerName: actorName,
          templateId: template.id,
        }),
      ),
    );
  }

  if (await canManageMembershipRoles(input.tenantSlug)) {
    await syncMembershipRoleFromEmployeeRole({
      tenantId,
      userId: record.userId,
      roleName: record.role,
    });
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

  const { canViewSensitiveData, canViewContracts, canViewMutterschutz } =
    await employeeVisibilityFlags(input.tenantSlug, { id: record.id, team: record.team });

  return {
    ...toEmployee(record, canViewSensitiveData, canViewContracts, canViewMutterschutz),
    locations,
    teams,
  };
}

export async function createTenantEmployee(input: EmployeeMutationInput) {
  await requireEmployeeManager(input.tenantSlug);

  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");

  if (!access.tenantId) {
    throw new Error("Mandant nicht gefunden.");
  }

  // "employees:write" deckt nur Name/Team/Standort/Kontakt ab — sensible
  // Stammdaten und Vertragsfelder beim Anlegen brauchen zusätzlich die
  // jeweils eigene Berechtigung, sonst werden sie aus der Eingabe verworfen.
  const newEmployeeTarget = {
    id: "",
    team: (input.teams?.length ? input.teams[0] : input.team)?.trim() || "",
  };
  const canEditSensitiveData = await canWriteEmployeeSubarea(
    input.tenantSlug,
    "sensitiveData",
    newEmployeeTarget,
  );
  const canEditContracts = await canWriteEmployeeSubarea(
    input.tenantSlug,
    "contracts",
    newEmployeeTarget,
  );
  const canEditMutterschutz = await canWriteEmployeeSubarea(
    input.tenantSlug,
    "mutterschutz",
    newEmployeeTarget,
  );

  if (!canEditMutterschutz) {
    input = {
      ...input,
      maternityProtectionActive: undefined,
      maternityProtectionNote: undefined,
    };
  }

  if (!canEditSensitiveData) {
    input = {
      ...input,
      birthDate: undefined,
      birthPlace: undefined,
      nationality: undefined,
      maritalStatus: undefined,
      privateAddress: undefined,
      taxId: undefined,
      socialSecurityNumber: undefined,
      healthInsurance: undefined,
      iban: undefined,
    };
  }

  if (!canEditContracts) {
    input = {
      ...input,
      contractType: undefined,
      entryDate: undefined,
      exitDate: undefined,
      fixedTerm: undefined,
      probation: undefined,
      noticePeriod: undefined,
      position: undefined,
      department: undefined,
      supervisor: undefined,
      workLocation: undefined,
      parties: undefined,
      collectiveAgreement: undefined,
      compensation: undefined,
      compensationGross: undefined,
      workingTime: undefined,
      vacation: undefined,
      contractDetailsSubmitted: undefined,
    };
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
    select: { id: true, userId: true, name: true, role: true, email: true },
  });

  if (!target) {
    throw new Error("Personalakte wurde nicht gefunden.");
  }

  if (target.userId) {
    throw new Error("Diese Personalakte ist bereits mit einem Konto verknüpft.");
  }

  // Verhindert, dass sich ein beliebiges Mitglied eine fremde, noch nicht
  // verknüpfte Personalakte aneignet: die Akte muss nachweislich zur
  // anfragenden Person gehören, nicht nur zum selben Mandanten.
  const sessionEmail = await getSessionUserEmail();

  if (!sessionEmail || target.email.trim().toLowerCase() !== sessionEmail.trim().toLowerCase()) {
    throw new Error("Diese Personalakte gehört nicht zu Ihrem Konto.");
  }

  await prisma.tenantEmployee.update({
    where: { id: target.id },
    data: { userId: access.userId },
  });

  // Absichtlich KEIN automatischer syncMembershipRoleFromEmployeeRole hier
  // mehr (Audit-Finding H01/R02): `target.role` kann von jedem Aufrufer mit
  // bloßem `employees:write` gesetzt worden sein, ohne `roles:write`. Ein
  // Angreifer mit `employees:write` könnte sich sonst selbst eine noch nicht
  // verknüpfte Akte mit einem privilegierten Rollennamen anlegen und beim
  // Verknüpfen (hier, nur `requireTenantMembership` nötig) unautorisiert die
  // echte `TenantMembership.roleId` erhalten. Eine vorab von HR hinterlegte
  // Berechtigungsrolle wird erst wirksam, wenn jemand mit `roles:write` sie
  // NACH der Verknüpfung ausdrücklich (erneut) über `updateTenantEmployee`
  // bestätigt.

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

/**
 * Personalakten im Mandanten ohne verknüpftes Konto — Auswahl für "Bestehendes
 * Profil verknüpfen". Nur Akten, deren hinterlegte E-Mail zur anfragenden
 * Person passt: sonst könnte jedes Mitglied die noch offene Akte einer
 * beliebigen anderen (z. B. noch nicht aktivierten) Person sehen und
 * verknüpfen (siehe `linkOwnTenantEmployee`, das denselben Abgleich als
 * eigentliche Sicherheitsgrenze durchsetzt — diese Liste ist nur die
 * Komfort-Vorauswahl dazu).
 */
export async function getUnlinkedEmployeesForTenant(tenantSlug: string) {
  const access = await requireTenantMembership(tenantSlug);
  const sessionEmail = await getSessionUserEmail();

  if (!sessionEmail) {
    return [];
  }

  return prisma.tenantEmployee.findMany({
    where: {
      tenantId: access.tenantId,
      userId: null,
      email: { equals: sessionEmail, mode: "insensitive" },
    },
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

/**
 * Ob der Aufrufer die sensiblen Stammdaten bzw. Vertragsfelder DIESES
 * konkreten Mitarbeiters schreiben darf — getrennt von "employees:write",
 * das nur Name/Team/Standort/Kontakt abdeckt (siehe `sensitiveData`/
 * `contracts`-Bereiche in lib/roles.ts).
 */
async function canWriteEmployeeSubarea(
  tenantSlug: string,
  area: "sensitiveData" | "contracts" | "mutterschutz",
  target: { id: string; team: string },
) {
  const access = await getOptionalTenantAccess(tenantSlug, area, "write");

  if (!access) {
    return false;
  }

  return scopeAllowsTarget(await resolveScopeFilter(access), target);
}

/**
 * Ob der Aufrufer echte Rollenverwaltung darf — Voraussetzung dafür, dass das
 * freie "Berechtigungsrolle"-Feld auf der Personalakte tatsächlich die
 * TenantMembership.roleId verändert (siehe syncMembershipRoleFromEmployeeRole
 * in lib/role-service.ts). Ohne diese Prüfung genügte "employees:write" allein
 * — auch im eigenen own-Scope —, um die eigene Berechtigungsrolle
 * hochzustufen, indem einfach ein bekannter Rollenname eingetragen wurde
 * (Audit-Finding H01).
 */
async function canManageMembershipRoles(tenantSlug: string) {
  const access = await getOptionalTenantAccess(tenantSlug, "roles", "write");

  return Boolean(access);
}

/**
 * Dieselbe Sichtbarkeitsprüfung wie in `getEmployeeForTenant` (sensible
 * Stammdaten/Verträge/Mutterschutz brauchen je eine eigene Leseberechtigung,
 * "employees:read" allein reicht nicht) — hier zusätzlich für die
 * Create-/Update-Antwort verwendet. Ohne das lieferten Anlegen und Bearbeiten
 * diese Felder unabhängig von der tatsächlichen Leseberechtigung des
 * Aufrufers immer entschlüsselt zurück (Audit-Finding H04).
 */
async function employeeVisibilityFlags(tenantSlug: string, target: { id: string; team: string }) {
  const sensitiveDataAccess = await getOptionalTenantAccess(tenantSlug, "sensitiveData", "read");
  const sensitiveDataScope = sensitiveDataAccess ? await resolveScopeFilter(sensitiveDataAccess) : null;
  const canViewSensitiveData =
    sensitiveDataScope !== null && scopeAllowsTarget(sensitiveDataScope, target);

  const contractsAccess = await getOptionalTenantAccess(tenantSlug, "contracts", "read");
  const contractsScope = contractsAccess ? await resolveScopeFilter(contractsAccess) : null;
  const canViewContracts =
    contractsScope !== null && scopeAllowsTarget(contractsScope, target);

  const mutterschutzAccess = await getOptionalTenantAccess(tenantSlug, "mutterschutz", "read");
  const mutterschutzScope = mutterschutzAccess ? await resolveScopeFilter(mutterschutzAccess) : null;
  const canViewMutterschutz =
    mutterschutzScope !== null && scopeAllowsTarget(mutterschutzScope, target);

  return { canViewSensitiveData, canViewContracts, canViewMutterschutz };
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

  // Scope (own/team/all) begrenzt sonst nur Leselisten — ohne diesen Check
  // könnte eine team-gescopte Rolle trotzdem jeden Mitarbeiter mandantenweit
  // per bekannter ID bearbeiten.
  await assertEmployeeInScope(access, input.employeeId);

  // "employees:write" deckt nur Name/Team/Standort/Kontakt ab — sensible
  // Stammdaten und Vertragsfelder brauchen zusätzlich die jeweils eigene
  // Berechtigung. Ohne sie werden die betroffenen Felder aus der Eingabe
  // verworfen (Rest der Speicherung geht normal durch), statt die ganze
  // Aktualisierung mit einem Fehler abzubrechen.
  const canEditSensitiveData = await canWriteEmployeeSubarea(input.tenantSlug, "sensitiveData", {
    id: current.id,
    team: current.team,
  });
  const canEditContracts = await canWriteEmployeeSubarea(input.tenantSlug, "contracts", {
    id: current.id,
    team: current.team,
  });
  const canEditMutterschutz = await canWriteEmployeeSubarea(input.tenantSlug, "mutterschutz", {
    id: current.id,
    team: current.team,
  });

  if (!canEditMutterschutz) {
    input = {
      ...input,
      maternityProtectionActive: undefined,
      maternityProtectionNote: undefined,
    };
  }

  if (!canEditSensitiveData) {
    input = {
      ...input,
      birthDate: undefined,
      birthPlace: undefined,
      nationality: undefined,
      maritalStatus: undefined,
      privateAddress: undefined,
      taxId: undefined,
      socialSecurityNumber: undefined,
      healthInsurance: undefined,
      iban: undefined,
    };
  }

  if (!canEditContracts) {
    input = {
      ...input,
      contractType: undefined,
      entryDate: undefined,
      exitDate: undefined,
      fixedTerm: undefined,
      probation: undefined,
      noticePeriod: undefined,
      position: undefined,
      department: undefined,
      supervisor: undefined,
      workLocation: undefined,
      parties: undefined,
      collectiveAgreement: undefined,
      compensation: undefined,
      compensationGross: undefined,
      workingTime: undefined,
      vacation: undefined,
      contractDetailsSubmitted: undefined,
    };
  }

  const currentLocationNames = await getEmployeeLocationNames(tenantId, input.employeeId);
  const locations =
    input.locations !== undefined
      ? Array.from(new Set(input.locations.map((value) => value.trim()).filter(Boolean)))
      : input.location !== undefined
        ? input.location.trim()
          ? [input.location.trim()]
          : []
        : currentLocationNames;

  // Anders als bei `locations` NICHT unbedingt auf die bestehenden
  // `TenantTeamMember`-Mitgliedschaften zurückfallen, wenn dieser Request gar
  // kein Team-Feld mitschickt: bis zu diesem Fix wurde `TenantEmployee.team`
  // nie mit `TenantTeamMember` synchronisiert (siehe `syncEmployeeTeamMemberships`
  // unten), Bestandsdaten können also munter auseinanderlaufen. Ein
  // unbeteiligtes Feld zu ändern (z. B. Telefonnummer) darf dadurch weder die
  // Team-Zuordnung stillschweigend leeren noch überraschend Mitgliedschaften
  // anlegen/entfernen — nur ein Request, der `team`/`teams` ausdrücklich
  // mitschickt, fasst die Zuordnung an.
  const teamsProvided = input.teams !== undefined || input.team !== undefined;
  const currentTeamNames = teamsProvided ? [] : await getEmployeeTeamNames(tenantId, input.employeeId);
  const teams = input.teams !== undefined
    ? Array.from(new Set(input.teams.map((value) => value.trim()).filter(Boolean)))
    : input.team !== undefined
      ? input.team.trim()
        ? [input.team.trim()]
        : []
      : currentTeamNames;

  await assertKnownOrgReferences(tenantId, {
    locations,
    teams: teamsProvided ? teams : undefined,
    role: input.role,
  });
  await assertUniqueEmployeeEmail({
    tenantId,
    email: input.email?.trim() ?? current.email,
    excludeEmployeeId: input.employeeId,
  });

  const currentEmployee = toEmployee(current);
  const name = buildName({ name: input.name || current.name, email: input.email });

  // Nur tatsächlich mitgeschickte Felder validieren, nicht den (ggf. schon
  // vor dieser Validierung gespeicherten) Bestandswert — sonst würde jede
  // Speicherung eines unbeteiligten Felds an einer Alt-Personalakte mit
  // ungültigem Format (z. B. der im QA-Report genannte Name mit ~250
  // Zeichen) plötzlich fehlschlagen (QA-Bug BUG-008).
  if (input.name || input.firstName || input.lastName) {
    assertValidEmployeeName(name);
  }
  if (input.phone !== undefined) {
    assertValidPhone(input.phone.trim());
  }
  if (input.taxId !== undefined) {
    assertValidTaxId(input.taxId.trim());
  }
  if (input.iban !== undefined) {
    assertValidIban(input.iban.trim());
  }
  if (input.privateAddress !== undefined) {
    assertValidAddressFormat(normalizeAddressInput(input.privateAddress));
  }
  if (input.address !== undefined) {
    assertValidAddressFormat(normalizeAddressInput(input.address));
  }
  const contract = input.contract?.trim() || current.contract;
  const startDate = input.startDate?.trim() || current.startDate;
  const role = input.role?.trim() || current.role;
  const team = teamsProvided ? (teams[0] ?? "") : current.team;
  const weeklyHours = input.weeklyHours?.trim() || current.weeklyHours;
  const location = locations[0] ?? "";
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
    compensationGross: contractValue(
      input.compensationGross,
      currentEmployee.contractDetails.compensationGross,
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
      birthDate: encryptField(input.birthDate?.trim() ?? currentEmployee.birthDate),
      birthPlace: encryptField(input.birthPlace?.trim() ?? currentEmployee.birthPlace),
      nationality: encryptField(input.nationality?.trim() ?? currentEmployee.nationality),
      maritalStatus: encryptField(input.maritalStatus?.trim() ?? currentEmployee.maritalStatus),
      privateAddress: {
        upsert: {
          create: encryptAddress(normalizeAddressInput(input.privateAddress)),
          update: encryptAddress(
            normalizeAddressInput(input.privateAddress ?? currentEmployee.privateAddressFields),
          ),
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
      maternityProtectionActive:
        input.maternityProtectionActive ?? currentEmployee.maternityProtectionActive,
      maternityProtectionNote: encryptField(
        input.maternityProtectionNote?.trim() ?? currentEmployee.maternityProtectionNote,
      ),
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
          create: encryptAddress(normalizeAddressInput(input.address)),
          update: encryptAddress(
            normalizeAddressInput(input.address ?? currentEmployee.addressFields),
          ),
        },
      },
      vacationRemaining: toInt(input.vacationRemaining, current.vacationRemaining),
      vacationTotal: toInt(input.vacationTotal, current.vacationTotal),
      vacationTaken: toInt(input.vacationTaken, current.vacationTaken),
      vacationManualCorrection: toSignedInt(input.vacationManualCorrection, current.vacationManualCorrection),
      contractDetails: {
        upsert: {
          create: {
            ...contractDetails,
            compensation: encryptField(contractDetails.compensation),
            compensationGross: encryptField(contractDetails.compensationGross),
            tenant: { connect: { id: tenantId } },
          },
          update: {
            ...contractDetails,
            compensation: encryptField(contractDetails.compensation),
            compensationGross: encryptField(contractDetails.compensationGross),
          },
        },
      },
      emergencyContactsJson: serializeEmergencyContacts(
        emergencyContacts ?? currentEmployee.emergencyContacts,
      ),
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
      infoRequests: {
        orderBy: { createdAt: "desc" },
        include: { responseFile: { select: { displayName: true } }, items: infoRequestItemsInclude },
      },
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
  const { canViewSensitiveData, canViewContracts, canViewMutterschutz } =
    await employeeVisibilityFlags(input.tenantSlug, { id: record.id, team: record.team });
  const employee = toEmployee(record, canViewSensitiveData, canViewContracts, canViewMutterschutz);

  await syncTeamMemberSnapshots(employee);
  await syncLocationTeamSnapshots(employee);
  await syncEmployeeLocationMemberships({
    tenantId,
    employeeId: record.id,
    employeeInitials: record.initials,
    employeeName: record.name,
    locationNames: locations,
  });
  // Nur syncen, wenn DIESER Request ausdrücklich `team`/`teams` mitgeschickt
  // hat (siehe `teamsProvided` oben) — sonst würde jede unbeteiligte
  // Bearbeitung (z. B. Telefonnummer) Bestandsdaten anfassen, bei denen
  // `TenantEmployee.team` und `TenantTeamMember` bislang (vor diesem Fix)
  // munter auseinanderlaufen konnten.
  if (teamsProvided) {
    await syncEmployeeTeamMemberships({
      tenantId,
      employeeId: record.id,
      employeeInitials: record.initials,
      employeeName: record.name,
      employeeLocation: record.location,
      employeeRole: record.role,
      employeeContract: record.contract,
      employeeStatus: record.status,
      teamNames: teams,
    });
  }
  // Nur syncen, wenn DIESER Request ausdrücklich ein neues `role`-Feld
  // mitgeschickt hat — niemals anhand von `record.role`/`current.role`, der
  // auch ein zuvor unautorisiert eingetragener Altwert sein kann (z. B. weil
  // dieser Aufruf nur ein anderes Formularfeld auf einem anderen Tab
  // geändert hat). Ohne diese Einschränkung reichte eine spätere, mit
  // `roles:write` autorisierte, aber fachlich unabhängige Bearbeitung (etwa
  // Telefonnummer ändern) aus, um einen vorab von einem Unprivilegierten
  // eingetragenen Rollennamen nachträglich wirksam werden zu lassen
  // (Audit-Finding H01/R02).
  if (input.role !== undefined && (await canManageMembershipRoles(input.tenantSlug))) {
    await syncMembershipRoleFromEmployeeRole({
      tenantId,
      userId: record.userId,
      roleName: role,
    });
  }

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
    input.maternityProtectionActive !== undefined &&
    input.maternityProtectionActive !== currentEmployee.maternityProtectionActive
      ? "Mutterschutz-Kennzeichnung"
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

  return { ...employee, locations, teams };
}

/**
 * Markiert einen Mitarbeiter als ausgeschieden — persistenter, autoritativer
 * Status (siehe `computeLiveEmployeeStatus`), setzt sich nicht von selbst
 * zurück wie Urlaub/Krankheit. Löscht die Personalakte nicht (siehe
 * `deleteTenantEmployee` für die DSGVO-Löschung); bleibt sichtbar, damit
 * historische Daten (Verträge, Abrechnungen, Zeitleiste) erhalten bleiben.
 */
export async function offboardEmployee(input: {
  tenantSlug: string;
  employeeId: string;
  endDate: string;
  reason?: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");
  const current = await prisma.tenantEmployee.findFirst({
    where: { id: input.employeeId, tenantId: access.tenantId },
    select: { name: true, status: true },
  });

  if (!current) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  await assertEmployeeInScope(access, input.employeeId);

  const endDate = input.endDate.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error("Bitte ein gültiges Austrittsdatum angeben.");
  }

  const reason = input.reason?.trim();

  await prisma.tenantEmployee.update({
    where: { id: input.employeeId },
    data: {
      status: "former",
      endDate,
      // Startpunkt der Löschfristen-Uhr für die Kategorie-1-Anonymisierung
      // (lib/data-retention.ts) — separat von endDate, damit eine spätere
      // Korrektur des Textfelds die Frist nicht verschiebt.
      offboardedAt: new Date(),
      timeline: {
        create: {
          title: reason
            ? `Ausgeschieden zum ${endDate}: ${reason}`
            : `Ausgeschieden zum ${endDate}`,
          tone: "danger",
          tenant: { connect: { id: access.tenantId } },
        },
      },
    },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Mitarbeiter ausgeschieden",
    source: "Mitarbeiter",
    entityType: "employee",
    entityId: input.employeeId,
    detail: `${current.name}: Austritt zum ${endDate}`,
  });
}

/**
 * Entzieht den Zugang zu GENAU DIESEM Mandanten: löscht die
 * `TenantMembership` in diesem Tenant und hängt die Personalakte von der
 * `userId` ab. Das globale Konto (Login, Passwort, Sitzungen,
 * Social-Login-Verknüpfungen, Zugänge zu anderen Mandanten) bleibt
 * unangetastet — eine Person kann Mitarbeiter in mehreren Mandanten sein,
 * und ein Zugangsentzug in Mandant A darf niemals Mandant B betreffen.
 * Die Personalakte (Stammdaten) in diesem Mandanten bleibt vollständig
 * erhalten. Eine vollständige, globale Kontolöschung ist ausschließlich
 * über den gesonderten Kontoinhaber-Self-Service möglich, s.
 * lib/account-service.ts `deleteUserAccessImmediately`.
 */
export async function deleteEmployeeAccess(input: { tenantSlug: string; employeeId: string }) {
  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");

  const employee = await prisma.tenantEmployee.findFirst({
    where: { id: input.employeeId, tenantId: access.tenantId },
    select: { id: true, name: true, userId: true },
  });

  if (!employee) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  await assertEmployeeInScope(access, input.employeeId);

  if (!employee.userId) {
    throw new Error("EMPLOYEE_ACCESS_NOT_LINKED");
  }

  const employeeUserId = employee.userId;

  await prisma.$transaction(async (tx) => {
    // Sole-Owner-Schutz (Audit-Finding R01): Ein Zugangsentzug darf den
    // Mandanten nicht ohne verbleibenden OWNER zurücklassen. Rolle und
    // Owner-Anzahl werden innerhalb derselben Transaktion gelesen, damit ein
    // gleichzeitiger zweiter Entzug nicht beide Prüfungen bestehen kann.
    const membership = await tx.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: access.tenantId, userId: employeeUserId } },
      select: { role: true },
    });

    if (membership?.role === "OWNER") {
      const otherOwners = await tx.tenantMembership.count({
        where: { tenantId: access.tenantId, userId: { not: employeeUserId }, role: "OWNER" },
      });
      if (otherOwners === 0) {
        throw new Error(
          "Diese Person ist die/der einzige Inhaber/in dieses Mandanten. Bitte zuerst eine andere Person als Inhaber/in eintragen, bevor der Zugang entzogen wird.",
        );
      }
    }

    // Nur die Mitgliedschaft in DIESEM Mandanten entfernen — Mitgliedschaften
    // in anderen Mandanten desselben Users bleiben unangetastet.
    await tx.tenantMembership.deleteMany({
      where: { tenantId: access.tenantId, userId: employeeUserId },
    });
    await tx.tenantEmployee.update({
      where: { id: employee.id },
      data: {
        userId: null,
        timeline: {
          create: {
            title: "Konto-Zugang gelöscht",
            tone: "danger",
            tenant: { connect: { id: access.tenantId } },
          },
        },
      },
    });
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Konto-Zugang gelöscht",
    source: "Personalakte",
    entityType: "employee",
    entityId: employee.id,
    detail: employee.name,
  });
}

/** Macht ein versehentliches Ausscheiden rückgängig — Status zurück auf aktiv, Austrittsdatum gelöscht. */
export async function reactivateEmployee(input: { tenantSlug: string; employeeId: string }) {
  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");
  const current = await prisma.tenantEmployee.findFirst({
    where: { id: input.employeeId, tenantId: access.tenantId },
    select: { name: true },
  });

  if (!current) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  await assertEmployeeInScope(access, input.employeeId);

  await prisma.tenantEmployee.update({
    where: { id: input.employeeId },
    data: {
      status: "active",
      endDate: "",
      // Reaktivierung setzt die Löschfristen-Uhr zurück — die Person ist
      // wieder aktiv, "seit wann ausgeschieden" ist nicht mehr aussagekräftig.
      offboardedAt: null,
      timeline: {
        create: {
          title: "Reaktiviert",
          tone: "success",
          tenant: { connect: { id: access.tenantId } },
        },
      },
    },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Mitarbeiter reaktiviert",
    source: "Mitarbeiter",
    entityType: "employee",
    entityId: input.employeeId,
    detail: current.name,
  });
}

/**
 * Löscht einen Mitarbeiter vollständig (DSGVO-Löschkonzept):
 * inkl. Adressen, Ordnern, Dateien und den zugehörigen S3-Objekten.
 */
export async function deleteTenantEmployee(input: {
  tenantSlug: string;
  employeeId: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "employees", "read");

  if (!access.canDelete) {
    throw new Error("FORBIDDEN");
  }

  await assertEmployeeInScope(access, input.employeeId);

  // Vorher konnte dieser direkte Alles-Löschen-Pfad Legal Hold und
  // gesetzliche Aufbewahrungsfristen (Lohn/SV, Gesundheits-Freitext)
  // vollständig umgehen (Audit-Finding H12).
  await assertEmployeeDeletionAllowed(access.tenantId, input.employeeId);

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
    // Team-/Standort-Mitgliedschaften fallen per Fremdschlüssel (Cascade) mit weg.
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
    await prisma.employeeAddress.deleteMany({ where: { id: { in: addressIds } } });
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

type TenantInfoRequestRecord = {
  id: string;
  title: string;
  message: string;
  requestedBy: string;
  dueAt: Date | null;
  fileRequested: boolean;
  status: string;
  createdAt: Date;
  responseMessage: string;
  respondedAt: Date | null;
  responseFileId: string | null;
  responseFile?: { displayName: string } | null;
  items?: InfoRequestItemRecord[];
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

function toTenantInfoRequest(record: TenantInfoRequestRecord) {
  return {
    id: record.id,
    title: record.title,
    message: record.message || undefined,
    requestedBy: record.requestedBy,
    requestedAt: new Intl.DateTimeFormat("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(record.createdAt),
    dueAt: formatRequestDate(record.dueAt),
    fileRequested: record.fileRequested,
    status: record.status as InfoRequest["status"],
    responseMessage: record.responseMessage || undefined,
    respondedAt: record.respondedAt ? formatRequestDate(record.respondedAt) : undefined,
    hasResponseFile: Boolean(record.responseFileId),
    responseFileId: record.responseFileId ?? undefined,
    responseFileName: record.responseFile?.displayName || undefined,
    items: (record.items ?? []).map(toInfoRequestItemView),
    employeeId: record.employee.id,
    employeeKey: record.employee.key,
    employeeInitials: record.employee.initials,
    employeeName: record.employee.name,
    location: record.employee.location,
    team: record.employee.team,
  };
}

/**
 * Übersetzt den konfigurierten Scope (own/team/all) der "employees"-
 * Berechtigung in einen `where`-Filter für `prisma.tenantEmployeeInfoRequest`.
 * "own"/"team" ohne verknüpften eigenen Mitarbeiterdatensatz liefert einen
 * Filter, der nichts trifft — nie stillschweigend auf "alles sehen" zurückfallen.
 */
async function infoRequestScopeWhere(tenantSlug: string) {
  const access = await requireTenantAccess(tenantSlug, "employees", "read");
  const scopeFilter = await resolveScopeFilter(access);

  if (scopeFilter.type === "all") {
    return { tenantId: access.tenantId };
  }

  if (scopeFilter.type === "own") {
    return { tenantId: access.tenantId, employeeId: scopeFilter.employeeId ?? "__none__" };
  }

  if (scopeFilter.type === "team") {
    // Siehe employeeScopeWhere: kein eigenes Team darf nicht "alle
    // Info-Anfragen nicht zugeordneter Mitarbeiter" bedeuten.
    return { tenantId: access.tenantId, employeeId: { in: scopeFilter.teammateIds } };
  }

  // "employees" unterstützt (bisher) keinen "assigned"-Scope — sollte er
  // dennoch auftreten, nichts treffen statt stillschweigend alles zu zeigen.
  return { tenantId: access.tenantId, employeeId: "__none__" };
}

/** Alle Info-Anfragen des Tenants inkl. Status (own/team/all-Scope je nach Rolle). */
export async function getInfoRequestsForTenant(tenantSlug: string) {
  const where = await infoRequestScopeWhere(tenantSlug);

  const records = await prisma.tenantEmployeeInfoRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
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
      responseFile: { select: { displayName: true } },
      items: infoRequestItemsInclude,
    },
  });

  return records.map(toTenantInfoRequest);
}

export async function createEmployeeInfoRequest(input: {
  tenantSlug: string;
  employeeId: string;
  title: string;
  message?: string;
  dueAt?: string;
  dueTime?: string;
  fileRequested: boolean;
  /** Mehrteilige Anfrage (M7): Dokumente/Angaben, je Pflicht oder optional. */
  items?: Array<Partial<InfoRequestItemInput>>;
}) {
  await requireEmployeeManager(input.tenantSlug);

  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");
  const items = normalizeInfoRequestItems(input.items);
  const title = deriveInfoRequestTitle(input.title, items);

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

  await assertEmployeeInScope(access, employee.id);

  const dueAtIso = input.dueAt?.trim() ?? "";
  const dueTimeIso = /^\d{2}:\d{2}$/.test(input.dueTime?.trim() ?? "")
    ? input.dueTime!.trim()
    : "00:00";
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(dueAtIso)
    ? new Date(`${dueAtIso}T${dueTimeIso}:00`)
    : null;

  const request = await prisma.tenantEmployeeInfoRequest.create({
    data: {
      tenant: { connect: { id: access.tenantId } },
      employee: { connect: { id: employee.id } },
      title,
      message: input.message?.trim() || "",
      requestedBy: access.userName,
      dueAt,
      // Für die alte App (TODO(app-multi-item-requests)): ein Pflicht-Dokument
      // unter den Elementen heißt "Datei erforderlich".
      fileRequested: input.fileRequested || items.some((item) => item.kind === "document" && item.required),
      status: "open",
      items: items.length
        ? { create: items.map((item, position) => ({ ...item, position })) }
        : undefined,
    },
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: access.tenantId },
    select: { name: true },
  });

  await notifyEmployeeOfInfoRequest({
    tenantId: access.tenantId,
    tenantName: tenant?.name ?? "",
    employeeId: employee.id,
    requestId: request.id,
    title,
    dueAt,
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

async function findTenantInfoRequest(tenantSlug: string, requestId: string) {
  const access = await requireTenantAccess(tenantSlug, "employees", "write");
  const request = await prisma.tenantEmployeeInfoRequest.findFirst({
    where: { id: requestId, tenantId: access.tenantId },
    include: { employee: { select: { id: true, name: true } } },
  });

  if (!request) {
    throw new Error("Info-Anfrage nicht gefunden.");
  }

  await assertEmployeeInScope(access, request.employee.id);

  return { access, request };
}

/** Status manuell setzen (Admin/Manager) — z. B. Anfrage stornieren oder eine offline erhaltene Antwort nachtragen. */
export async function updateInfoRequestStatus(input: {
  tenantSlug: string;
  requestId: string;
  status: InfoRequestStatus;
}) {
  await requireEmployeeManager(input.tenantSlug);

  if (!infoRequestStatuses.includes(input.status)) {
    throw new Error("Ungültiger Status.");
  }

  const { access, request } = await findTenantInfoRequest(input.tenantSlug, input.requestId);

  const updated = await prisma.tenantEmployeeInfoRequest.update({
    where: { id: request.id },
    data: { status: input.status },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action:
      input.status === "cancelled" ? "Info-Anfrage storniert" : "Info-Anfrage-Status geändert",
    source: "Mitarbeiter",
    entityType: "employee",
    entityId: request.employee.id,
    detail: `${request.employee.name}: ${request.title} → ${input.status}`,
  });

  return updated;
}

/** Info-Anfrage endgültig löschen (Admin/Manager) — die verknüpfte Antwortdatei bleibt in der Personalakte erhalten. */
export async function deleteEmployeeInfoRequest(input: { tenantSlug: string; requestId: string }) {
  await requireEmployeeManager(input.tenantSlug);

  const { access, request } = await findTenantInfoRequest(input.tenantSlug, input.requestId);

  await prisma.tenantEmployeeInfoRequest.delete({ where: { id: request.id } });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Info-Anfrage gelöscht",
    source: "Mitarbeiter",
    entityType: "employee",
    entityId: request.employee.id,
    detail: `${request.employee.name}: ${request.title}`,
  });
}

export type EmergencyContactInput = {
  name: string;
  relation: string;
  phone: string;
  email?: string;
  note?: string;
};

async function loadEmergencyContacts(access: TenantAccess, employeeId: string) {
  const employee = await prisma.tenantEmployee.findFirst({
    where: { id: employeeId, tenantId: access.tenantId },
    select: { id: true, name: true, emergencyContactsJson: true },
  });

  if (!employee) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  await assertEmployeeInScope(access, employee.id);

  return {
    employee,
    contacts: parseEmergencyContacts(employee.emergencyContactsJson),
  };
}

async function saveEmergencyContacts(
  access: { tenantId: string; userId: string; userName: string },
  employee: { id: string; name: string },
  contacts: EmergencyContact[],
  auditAction: string,
) {
  await prisma.tenantEmployee.update({
    where: { id: employee.id },
    data: { emergencyContactsJson: serializeEmergencyContacts(contacts) },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: auditAction,
    source: "Mitarbeiter",
    entityType: "employee",
    entityId: employee.id,
    detail: employee.name,
  });
}

export async function addEmergencyContact(input: {
  tenantSlug: string;
  employeeId: string;
  contact: EmergencyContactInput;
}) {
  await requireEmployeeManager(input.tenantSlug);
  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");
  const { employee, contacts } = await loadEmergencyContacts(access, input.employeeId);

  const name = input.contact.name.trim();
  const phone = input.contact.phone.trim();

  if (!name || !phone) {
    throw new Error("Name und Telefonnummer sind erforderlich.");
  }

  const newContact: EmergencyContact = {
    id: randomUUID(),
    name,
    relation: input.contact.relation.trim(),
    phone,
    email: input.contact.email?.trim() || undefined,
    note: input.contact.note?.trim() || undefined,
    isPrimary: contacts.length === 0,
  };

  await saveEmergencyContacts(
    access,
    employee,
    [...contacts, newContact],
    "Notfallkontakt hinzugefügt",
  );

  return newContact;
}

export async function updateEmergencyContact(input: {
  tenantSlug: string;
  employeeId: string;
  contactId: string;
  contact: EmergencyContactInput;
}) {
  await requireEmployeeManager(input.tenantSlug);
  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");
  const { employee, contacts } = await loadEmergencyContacts(access, input.employeeId);

  const name = input.contact.name.trim();
  const phone = input.contact.phone.trim();

  if (!name || !phone) {
    throw new Error("Name und Telefonnummer sind erforderlich.");
  }

  if (!contacts.some((contact) => contact.id === input.contactId)) {
    throw new Error("Notfallkontakt nicht gefunden.");
  }

  const nextContacts = contacts.map((contact) =>
    contact.id === input.contactId
      ? {
          ...contact,
          name,
          relation: input.contact.relation.trim(),
          phone,
          email: input.contact.email?.trim() || undefined,
          note: input.contact.note?.trim() || undefined,
        }
      : contact,
  );

  await saveEmergencyContacts(access, employee, nextContacts, "Notfallkontakt bearbeitet");
}

export async function deleteEmergencyContact(input: {
  tenantSlug: string;
  employeeId: string;
  contactId: string;
}) {
  await requireEmployeeManager(input.tenantSlug);
  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");
  const { employee, contacts } = await loadEmergencyContacts(access, input.employeeId);

  const removed = contacts.find((contact) => contact.id === input.contactId);
  let nextContacts = contacts.filter((contact) => contact.id !== input.contactId);

  if (removed?.isPrimary && nextContacts.length > 0 && !nextContacts.some((c) => c.isPrimary)) {
    nextContacts = nextContacts.map((contact, index) =>
      index === 0 ? { ...contact, isPrimary: true } : contact,
    );
  }

  await saveEmergencyContacts(access, employee, nextContacts, "Notfallkontakt gelöscht");
}

export async function setPrimaryEmergencyContact(input: {
  tenantSlug: string;
  employeeId: string;
  contactId: string;
}) {
  await requireEmployeeManager(input.tenantSlug);
  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");
  const { employee, contacts } = await loadEmergencyContacts(access, input.employeeId);

  if (!contacts.some((contact) => contact.id === input.contactId)) {
    throw new Error("Notfallkontakt nicht gefunden.");
  }

  const nextContacts = contacts.map((contact) => ({
    ...contact,
    isPrimary: contact.id === input.contactId,
  }));

  await saveEmergencyContacts(access, employee, nextContacts, "Hauptkontakt geändert");
}
