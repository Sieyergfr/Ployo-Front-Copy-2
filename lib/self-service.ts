import "server-only";
import { getTimeEntriesForEmployeeExport, type TimeEntryView } from "@/lib/time-tracking-service";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireTenantMembership } from "@/lib/tenant-access";
import { canAccessFileAcl, requireFileAcl } from "@/lib/file-access";
import { decryptField, encryptField } from "@/lib/encryption";
import { normalizeAddressInput, type AddressInput } from "@/lib/address";
import { decryptAddress, encryptAddress } from "@/lib/employee-address";
import { EMPLOYEE_DOCUMENT_SLOTS, employeeDocumentSlotFolders } from "@/lib/employees";
import type { EmergencyContact, InfoRequestStatus } from "@/lib/employees";
import { computeVacationAccount } from "@/lib/vacations";
import { recordTenantAudit } from "@/lib/audit";
import { getStorageBucket } from "@/lib/storage/buckets";
import { buildStorageKey, getFileExtension } from "@/lib/storage/key-builder";
import { createReadSignedUrl } from "@/lib/storage/signed-url";
import { uploadObject } from "@/lib/storage/upload";
import { fileToBuffer } from "@/lib/storage/storage.service";

/**
 * `emergencyContactsJson` ist eine `String`-Spalte (Migration
 * `20260903000000_split_employee_address`) — die Feldverschlüsselung
 * (`lib/encryption.ts`) arbeitet nur auf Strings.
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

export type SelfServiceEmployee = {
  id: string;
  name: string;
  initials: string;
  role: string;
  location: string;
  team: string;
  status: string;
  startDate: string;
  vacationRemaining: number;
  vacationTotal: number;
  vacationTaken: number;
  /** Bereits in `vacationRemaining` enthalten — separat für eine Anzeige "davon X Tage Resturlaub". */
  vacationCarryover: number;
};

/**
 * Felder, die typischerweise NICHT beim Anlegen durch HR erfasst werden,
 * sondern vom Mitarbeiter selbst nachgetragen werden — Grundlage für den
 * "Profil vervollständigen"-Bereich in Mein Bereich.
 */
export type MyProfileFields = {
  birthDate: string;
  birthPlace: string;
  nationality: string;
  maritalStatus: string;
  phone: string;
  privateAddress: AddressInput;
  taxId: string;
  socialSecurityNumber: string;
  healthInsurance: string;
  iban: string;
  emergencyContacts: EmergencyContact[];
};

export type ProfileCompleteness = {
  percent: number;
  filledCount: number;
  totalCount: number;
  missingLabels: string[];
};

/**
 * `t` fehlt beim Aufruf aus `GET /api/me/overview` (kein next-intl-Kontext in
 * Route Handlern) — Default liefert dieselben deutschen Texte wie vor der
 * i18n-Umstellung, damit sich diese API-Antwort für die App nicht ändert.
 */
const defaultProfileFieldLabels: Record<string, string> = {
  birthDateLabel: "Geburtsdatum",
  birthPlaceLabel: "Geburtsort",
  nationalityLabel: "Staatsangehörigkeit",
  maritalStatusLabel: "Familienstand",
  phoneLabel: "Telefonnummer",
  taxIdLabel: "Steuer-ID",
  ssnLabel: "Sozialversicherungsnummer",
  healthInsuranceLabel: "Krankenversicherung",
  ibanLabel: "IBAN",
  privateAddressLabel: "Privatadresse",
  emergencyContactLabel: "Notfallkontakt",
};

function getProfileFieldLabels(
  t: (key: string) => string,
): Record<Exclude<keyof MyProfileFields, "privateAddress" | "emergencyContacts">, string> {
  return {
    birthDate: t("birthDateLabel"),
    birthPlace: t("birthPlaceLabel"),
    nationality: t("nationalityLabel"),
    maritalStatus: t("maritalStatusLabel"),
    phone: t("phoneLabel"),
    taxId: t("taxIdLabel"),
    socialSecurityNumber: t("ssnLabel"),
    healthInsurance: t("healthInsuranceLabel"),
    iban: t("ibanLabel"),
  };
}

export function computeProfileCompleteness(
  fields: MyProfileFields,
  t: (key: string) => string = (key) => defaultProfileFieldLabels[key] ?? key,
): ProfileCompleteness {
  const missingLabels: string[] = [];
  let filledCount = 0;
  const profileFieldLabels = getProfileFieldLabels(t);
  const scalarKeys = Object.keys(profileFieldLabels) as Array<
    keyof typeof profileFieldLabels
  >;
  const totalCount = scalarKeys.length + 2; // + Adresse + Notfallkontakt

  for (const key of scalarKeys) {
    if (fields[key].trim()) {
      filledCount += 1;
    } else {
      missingLabels.push(profileFieldLabels[key]);
    }
  }

  if (fields.privateAddress.street && fields.privateAddress.postalCode && fields.privateAddress.city) {
    filledCount += 1;
  } else {
    missingLabels.push(t("privateAddressLabel"));
  }

  if (fields.emergencyContacts.length > 0) {
    filledCount += 1;
  } else {
    missingLabels.push(t("emergencyContactLabel"));
  }

  return {
    percent: Math.round((filledCount / totalCount) * 100),
    filledCount,
    totalCount,
    missingLabels,
  };
}

export type SelfServiceVacationRequest = {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  note: string;
};

export type SelfServiceSicknessReport = {
  id: string;
  startDate: string;
  endDate: string | null;
  status: string;
  note: string;
};

export type SelfServiceDocument = {
  id: string;
  name: string;
  documentType: string;
  updatedAt: string;
  /** Echter Ordnername (`TenantFile.folderName`) — für die Ordneransicht im Personalakte-Screen der App. */
  folder: string;
  /** Ordnerpfad (`TenantFile.folderSlug`), leer = Wurzel der Akte. Schlüssel gegen `SelfServiceFolder.slug`. */
  folderSlug: string;
};

/**
 * Ordner der eigenen Akte — genau die, die auf dem Mitarbeiterprofil
 * existieren. Bewusst mit Pfad statt nur Name: die App gruppiert Dateien
 * darüber und navigiert in Unterordner, ein Name allein ist dafür nicht
 * eindeutig.
 */
export type SelfServiceFolder = {
  name: string;
  /** Vollständiger Ordnerpfad, `/`-getrennt. */
  slug: string;
};

export type SelfServiceInfoRequest = {
  id: string;
  title: string;
  message: string;
  requestedBy: string;
  requestedAt: string;
  dueAt: string | null;
  fileRequested: boolean;
  status: InfoRequestStatus;
  responseMessage: string;
  respondedAt: string | null;
  hasResponseFile: boolean;
};

export type SelfServiceOverview = {
  employee: SelfServiceEmployee | null;
  vacationRequests: SelfServiceVacationRequest[];
  sicknessReports: SelfServiceSicknessReport[];
  documents: SelfServiceDocument[];
  /** Auch Ordner ohne Datei — sonst zeigte "Meine Personalakte" nur Ordner, die bereits mindestens eine Datei enthalten. */
  folders: SelfServiceFolder[];
  infoRequests: SelfServiceInfoRequest[];
  profileFields: MyProfileFields | null;
  profileCompleteness: ProfileCompleteness | null;
};

/** Löst den Mandanten-Mitarbeiterdatensatz auf, der mit dem eingeloggten Konto verknüpft ist (per `TenantEmployee.userId`). */
export async function getMyEmployeeId(tenantSlug: string) {
  const access = await requireTenantMembership(tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true },
  });

  return employee?.id ?? null;
}

export async function getMySelfServiceOverview(
  tenantSlug: string,
  t?: (key: string) => string,
): Promise<SelfServiceOverview> {
  const access = await requireTenantMembership(tenantSlug);
  const employeeRecord = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    include: { privateAddress: true, contractDetails: true },
  });

  if (!employeeRecord) {
    return {
      employee: null,
      vacationRequests: [],
      sicknessReports: [],
      documents: [],
      folders: [],
      infoRequests: [],
      profileFields: null,
      profileCompleteness: null,
    };
  }

  const decryptedPrivateAddress = decryptAddress(employeeRecord.privateAddress);
  const profileFields: MyProfileFields = {
    birthDate: decryptField(employeeRecord.birthDate),
    birthPlace: decryptField(employeeRecord.birthPlace),
    nationality: decryptField(employeeRecord.nationality),
    maritalStatus: decryptField(employeeRecord.maritalStatus),
    phone: employeeRecord.phone,
    privateAddress: {
      street: decryptedPrivateAddress?.street ?? "",
      houseNumber: decryptedPrivateAddress?.houseNumber ?? "",
      postalCode: decryptedPrivateAddress?.postalCode ?? "",
      city: decryptedPrivateAddress?.city ?? "",
      careOf: decryptedPrivateAddress?.careOf ?? "",
      country: decryptedPrivateAddress?.country ?? "DE",
    },
    taxId: decryptField(employeeRecord.taxId),
    socialSecurityNumber: decryptField(employeeRecord.socialSecurityNumber),
    healthInsurance: decryptField(employeeRecord.healthInsurance),
    iban: decryptField(employeeRecord.iban),
    emergencyContacts: parseEmergencyContacts(employeeRecord.emergencyContactsJson),
  };

  const [vacationRequests, sicknessReports, files, folders, infoRequests] = await Promise.all([
    prisma.tenantVacationRequest.findMany({
      where: { employeeId: employeeRecord.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.tenantSicknessReport.findMany({
      where: { employeeId: employeeRecord.id },
      orderBy: { startDate: "desc" },
    }),
    prisma.tenantFile.findMany({
      // `hiddenFromEmployee`: von HR ausdrücklich vor genau diesem Mitarbeiter
      // verborgen (setTenantFileEmployeeVisibility) — in der Akte vorhanden,
      // in der Selbstauskunft nicht.
      where: {
        employeeId: employeeRecord.id,
        status: "active",
        hiddenFromEmployee: false,
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        displayName: true,
        documentType: true,
        updatedAt: true,
        folderName: true,
        folderSlug: true,
        accessRoleIdsJson: true,
        accessUserIdsJson: true,
      },
    }),
    // Alle Ebenen, nicht nur die oberste: die App navigiert über den Pfad
    // auch in Unterordner — und ein verborgener Ordner muss hier vorkommen,
    // damit die Dateien darunter mitgefiltert werden können.
    prisma.tenantFileFolder.findMany({
      where: { employeeId: employeeRecord.id, status: "active" },
      orderBy: { name: "asc" },
      select: { name: true, path: true, hiddenFromEmployee: true },
    }),
    prisma.tenantEmployeeInfoRequest.findMany({
      where: { employeeId: employeeRecord.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  // Ein verborgener Ordner verbirgt alles darunter: Unterordner und die
  // Dateien beider Ebenen. Geprüft wird über den Pfad-Präfix, damit dafür
  // kein Flag auf jedem einzelnen Datensatz nachgezogen werden muss.
  const hiddenFolderPaths = folders
    .filter((folder) => folder.hiddenFromEmployee)
    .map((folder) => folder.path);
  const isHiddenPath = (path: string) =>
    hiddenFolderPaths.some((hidden) => path === hidden || path.startsWith(`${hidden}/`));

  const currentYear = new Date().getFullYear();
  const approvedDaysThisYear = vacationRequests
    .filter(
      (request) =>
        request.status === "approved" &&
        request.startDate >= `${currentYear}-01-01` &&
        request.startDate <= `${currentYear}-12-31`,
    )
    .reduce((sum, request) => sum + request.days, 0);
  const vacationAccount = computeVacationAccount({
    contractVacation: employeeRecord.contractDetails?.vacation ?? "",
    storedVacationTotal: employeeRecord.vacationTotal,
    approvedDaysThisYear,
    carryover: employeeRecord.vacationCarryover,
    manualCorrection: employeeRecord.vacationManualCorrection,
  });

  return {
    employee: {
      id: employeeRecord.id,
      name: employeeRecord.name,
      initials: employeeRecord.initials,
      role: employeeRecord.role,
      location: employeeRecord.location,
      team: employeeRecord.team,
      status: employeeRecord.status,
      startDate: employeeRecord.startDate,
      vacationRemaining: vacationAccount.vacationRemaining,
      vacationTotal: vacationAccount.vacationTotal,
      vacationTaken: vacationAccount.vacationTaken,
      /** Bereits in `vacationRemaining` enthalten — separat für eine Anzeige "davon X Tage Resturlaub". */
      vacationCarryover: vacationAccount.vacationCarryover,
    },
    vacationRequests: vacationRequests.map((request) => ({
      id: request.id,
      startDate: request.startDate,
      endDate: request.endDate,
      days: request.days,
      status: request.status,
      note: request.note,
    })),
    sicknessReports: sicknessReports.map((report) => ({
      id: report.id,
      startDate: report.startDate.toISOString().slice(0, 10),
      endDate: report.endDate ? report.endDate.toISOString().slice(0, 10) : null,
      status: report.status,
      note: decryptField(report.note),
    })),
    documents: files
      .filter((file) => canAccessFileAcl(file, access))
      .filter((file) => !isHiddenPath(file.folderSlug))
      .map((file) => ({
        id: file.id,
        name: file.displayName,
        documentType: file.documentType,
        updatedAt: file.updatedAt.toISOString(),
        folder: file.folderName,
        folderSlug: file.folderSlug,
      })),
    folders: folders
      .filter((folder) => !isHiddenPath(folder.path))
      .map((folder) => ({ name: folder.name, slug: folder.path })),
    infoRequests: infoRequests.map((request) => ({
      id: request.id,
      title: request.title,
      message: request.message,
      requestedBy: request.requestedBy,
      requestedAt: request.createdAt.toISOString(),
      dueAt: request.dueAt ? request.dueAt.toISOString() : null,
      fileRequested: request.fileRequested,
      status: request.status as InfoRequestStatus,
      responseMessage: request.responseMessage,
      respondedAt: request.respondedAt ? request.respondedAt.toISOString() : null,
      hasResponseFile: Boolean(request.responseFileId),
    })),
    profileFields,
    profileCompleteness: t
      ? computeProfileCompleteness(profileFields, t)
      : computeProfileCompleteness(profileFields),
  };
}

export type SelfServiceContract = {
  id: string;
  title: string;
  contractType: string;
  status: string;
  startDate: string;
  endDate: string;
  position: string;
  department: string;
  workLocation: string;
  weeklyHours: string;
  compensation: string;
  vacationDays: number;
  terminationDate: string;
  terminationReason: string;
};

export type SelfServiceContractDetails = {
  contractType: string;
  entryDate: string;
  exitDate: string;
  position: string;
  department: string;
  workLocation: string;
  compensation: string;
  compensationGross: string;
  workingTime: string;
  vacation: string;
  noticePeriod: string;
  collectiveAgreement: string;
};

export type SelfServiceTimelineEntry = {
  title: string;
  tone: string;
  createdAt: string;
};

export type SelfServiceNotification = {
  category: string;
  title: string;
  detail: string;
  read: boolean;
  createdAt: string;
};

export type SelfServiceConsentRecord = {
  value: string;
  bannerVersion: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
};

export type PersonalakteExport = SelfServiceOverview & {
  contracts: SelfServiceContract[];
  contractDetails: SelfServiceContractDetails | null;
  payrollStatements: SelfServicePayrollStatement[];
  timeline: SelfServiceTimelineEntry[];
  /**
   * Vorher komplett aus dem Export ausgeschlossen (Audit-Finding M06), obwohl
   * `getMySelfServiceOverview` das Feld bereits lädt.
   */
  maternityProtection: { active: boolean; note: string } | null;
  /** In-App-Posteingang (TenantEmployeeNotification) — vorher nicht Teil des Exports. */
  notifications: SelfServiceNotification[];
  /** Eigene Cookie-Consent-Nachweise (ConsentRecord) — vorher nicht Teil des Exports. */
  consentRecords: SelfServiceConsentRecord[];
  /** Gestempelte Arbeitszeiten (Zeiterfassung) inkl. Pausen und Korrekturen. */
  timeEntries: TimeEntryView[];
};

/**
 * Vollständiger Export der eigenen Personalakte (Art. 15 / Art. 20 DSGVO) —
 * Pendant zu `/api/me/export` (Konto-/Mitgliedschaftsdaten), aber für die
 * Mandanten-Personalakte selbst. Baut auf `getMySelfServiceOverview` und
 * `getMyPayrollStatements` auf (gleiche ACL-Filterung: `hiddenFromEmployee`,
 * `canAccessFileAcl`, verborgene Ordner) und ergänzt strukturierte
 * Vertrags-/Verlaufsdaten, die dort nicht für die Bildschirmansicht
 * gebraucht werden — außerdem (Audit-Finding M06, vorher komplett
 * ausgeschlossen): Mutterschutz-Kennzeichnung/-Notiz (entschlüsselt), der
 * eigene In-App-Posteingang (`TenantEmployeeNotification`) und eigene
 * Cookie-Consent-Nachweise (`ConsentRecord`). Bewusst weiterhin
 * ausgeschlossen: `TenantEmployeeContract.notes` (interne HR-Vermerke,
 * keine reine Selbstauskunft) und `linkedFileName`/`linkedFileMeta`
 * (UI-Metadaten, keine personenbezogenen Daten). Weiterhin kein
 * vollständiges DSAR-Datenmanifest mit Drittrechte-Prüfung — siehe
 * Umsetzungsstatus im Audit für den Rest.
 */
export async function getMyPersonalakteExport(tenantSlug: string): Promise<PersonalakteExport> {
  const access = await requireTenantMembership(tenantSlug);
  const overview = await getMySelfServiceOverview(tenantSlug);
  const consentRecords = await prisma.consentRecord.findMany({
    where: { userId: access.userId },
    orderBy: { createdAt: "desc" },
  });
  const mappedConsentRecords: SelfServiceConsentRecord[] = consentRecords.map((record) => ({
    value: record.value,
    bannerVersion: record.bannerVersion,
    ipAddress: record.ipAddress,
    userAgent: record.userAgent,
    createdAt: record.createdAt.toISOString(),
  }));

  if (!overview.employee) {
    return {
      ...overview,
      contracts: [],
      contractDetails: null,
      payrollStatements: [],
      timeline: [],
      maternityProtection: null,
      notifications: [],
      consentRecords: mappedConsentRecords,
      timeEntries: [],
    };
  }

  const employeeId = overview.employee.id;
  const [contracts, contractDetails, payrollStatements, timeline, employeeRecord, notifications, timeEntries] =
    await Promise.all([
      prisma.tenantEmployeeContract.findMany({
        where: { employeeId },
        orderBy: { startDate: "desc" },
      }),
      prisma.tenantEmployeeContractDetails.findUnique({ where: { employeeId } }),
      getMyPayrollStatements(tenantSlug),
      prisma.tenantEmployeeTimeline.findMany({
        where: { employeeId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.tenantEmployee.findUnique({
        where: { id: employeeId },
        select: { maternityProtectionActive: true, maternityProtectionNote: true },
      }),
      prisma.tenantEmployeeNotification.findMany({
        where: { tenantId: access.tenantId, userId: access.userId },
        orderBy: { createdAt: "desc" },
      }),
      getTimeEntriesForEmployeeExport(access.tenantId, employeeId),
    ]);

  return {
    ...overview,
    contracts: contracts.map((contract) => ({
      id: contract.id,
      title: contract.title,
      contractType: contract.contractType,
      status: contract.status,
      startDate: contract.startDate,
      endDate: contract.endDate,
      position: contract.position,
      department: contract.department,
      workLocation: contract.workLocation,
      weeklyHours: contract.weeklyHours,
      compensation: decryptField(contract.compensation),
      vacationDays: contract.vacationDays,
      terminationDate: contract.terminationDate,
      terminationReason: contract.terminationReason,
    })),
    contractDetails: contractDetails
      ? {
          contractType: contractDetails.contractType,
          entryDate: contractDetails.entryDate,
          exitDate: contractDetails.exitDate,
          position: contractDetails.position,
          department: contractDetails.department,
          workLocation: contractDetails.workLocation,
          compensation: decryptField(contractDetails.compensation),
          compensationGross: decryptField(contractDetails.compensationGross),
          workingTime: contractDetails.workingTime,
          vacation: contractDetails.vacation,
          noticePeriod: contractDetails.noticePeriod,
          collectiveAgreement: contractDetails.collectiveAgreement,
        }
      : null,
    payrollStatements,
    timeline: timeline.map((entry) => ({
      title: entry.title,
      tone: entry.tone,
      createdAt: entry.createdAt.toISOString(),
    })),
    maternityProtection: employeeRecord
      ? {
          active: employeeRecord.maternityProtectionActive,
          note: decryptField(employeeRecord.maternityProtectionNote),
        }
      : null,
    notifications: notifications.map((notification) => ({
      category: notification.category,
      title: notification.title,
      detail: notification.detail,
      read: notification.read,
      createdAt: notification.createdAt.toISOString(),
    })),
    consentRecords: mappedConsentRecords,
    timeEntries,
  };
}

/**
 * Aktualisiert die selbst erfassten Profildaten des eingeloggten Nutzers.
 * Bewusst getrennt von `updateTenantEmployee` (Admin-Pfad): der Zugriff ist
 * ausschließlich über `requireTenantMembership` + `userId` aus der Session
 * verknüpft, sodass ein Mitglied unter keinen Umständen den Datensatz eines
 * anderen Mitarbeiters bearbeiten kann — es gibt keine employeeId im Input.
 */
export async function updateMyProfile(tenantSlug: string, input: Partial<MyProfileFields>) {
  const access = await requireTenantMembership(tenantSlug);
  const current = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    include: { privateAddress: true },
  });

  if (!current) {
    throw new Error("Kein Mitarbeiterprofil mit diesem Konto verknüpft.");
  }

  const currentContacts = parseEmergencyContacts(current.emergencyContactsJson);
  const existingContactIds = new Set(currentContacts.map((contact) => contact.id));
  const emergencyContacts = input.emergencyContacts?.map((contact) => ({
    ...contact,
    id: existingContactIds.has(contact.id) ? contact.id : randomUUID(),
  }));

  await prisma.tenantEmployee.update({
    where: { id: current.id },
    data: {
      birthDate: encryptField(input.birthDate?.trim() ?? decryptField(current.birthDate)),
      birthPlace: encryptField(input.birthPlace?.trim() ?? decryptField(current.birthPlace)),
      nationality: encryptField(input.nationality?.trim() ?? decryptField(current.nationality)),
      maritalStatus: encryptField(
        input.maritalStatus?.trim() ?? decryptField(current.maritalStatus),
      ),
      phone: input.phone?.trim() ?? current.phone,
      privateAddress: {
        upsert: {
          create: encryptAddress(normalizeAddressInput(input.privateAddress)),
          update: encryptAddress(
            normalizeAddressInput(
              input.privateAddress ?? decryptAddress(current.privateAddress) ?? {},
            ),
          ),
        },
      },
      taxId: encryptField(input.taxId?.trim() ?? decryptField(current.taxId)),
      socialSecurityNumber: encryptField(
        input.socialSecurityNumber?.trim() ?? decryptField(current.socialSecurityNumber),
      ),
      healthInsurance: encryptField(
        input.healthInsurance?.trim() ?? decryptField(current.healthInsurance),
      ),
      iban: encryptField(input.iban?.trim() ?? decryptField(current.iban)),
      emergencyContactsJson: serializeEmergencyContacts(emergencyContacts ?? currentContacts),
    },
  });
}

export const selfServiceDocumentTypes = ["Krankmeldung", "Sonstiges"] as const;
export type SelfServiceDocumentType = (typeof selfServiceDocumentTypes)[number];

/**
 * Eigenständiger, bewusst schlanker Upload-Pfad für Mitarbeiter-Uploads
 * (z. B. Krankschreibung) — getrennt von `uploadTenantFile`
 * (lib/storage/storage.service.ts), das an die HR/Admin-Berechtigung
 * "files:write" gebunden ist. Hier reicht Mitgliedschaft im Mandanten;
 * `employeeId`/`ownerType` sind serverseitig fest auf das eigene
 * Personalakte-Profil gesetzt (kein Input vom Client), `documentType` ist
 * auf die beiden Self-Service-Kategorien beschränkt, damit ein Mitarbeiter
 * kein Dokument als "Vertrag"/"Gehaltsabrechnung" (HR-reservierte Typen)
 * einschleusen kann.
 */
export type EmployeeDocumentSlotKey = (typeof EMPLOYEE_DOCUMENT_SLOTS)[number]["key"];

export async function uploadMyDocument(input: {
  tenantSlug: string;
  file: File;
  documentType: SelfServiceDocumentType;
  description?: string;
  /**
   * Zielfeld unter "Ausweisdokumente & Zertifikate" (siehe
   * `EMPLOYEE_DOCUMENT_SLOTS`). Ohne Angabe landet die Datei wie bisher in
   * "Eigene Uploads". Der Slug kommt NICHT als freier Ordnername vom Client —
   * nur der Schlüssel wird übergeben, Ordner und Dokumenttyp stammen aus der
   * festen Liste hier.
   */
  slot?: string;
}) {
  const access = await requireTenantMembership(input.tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true, name: true },
  });

  if (!employee) {
    throw new Error("Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden.");
  }

  const slot = input.slot
    ? EMPLOYEE_DOCUMENT_SLOTS.find((entry) => entry.key === input.slot)
    : undefined;

  if (input.slot && !slot) {
    throw new Error("Unbekanntes Dokumentfeld.");
  }

  if (!slot && !selfServiceDocumentTypes.includes(input.documentType)) {
    throw new Error("Ungültiger Dokumenttyp.");
  }

  // Dieselbe Byte-/Signaturprüfung wie beim generischen Upload — der
  // clientseitige `file.type` bzw. eine unbestätigte Endung wird NICHT
  // übernommen (Audit-Finding H08/R04).
  const { buffer, mimeType } = await fileToBuffer(input.file);

  const originalName = input.file.name.trim().replace(/[\\/]+/g, "-").slice(0, 240) || "Datei";
  const bucketConfig = getStorageBucket();
  const storageKey = buildStorageKey(bucketConfig, {
    tenantId: access.tenantId,
    fileName: originalName,
    ownerType: "employee",
    ownerId: employee.id,
  });
  const uploaded = await uploadObject({
    key: storageKey,
    body: buffer,
    contentType: mimeType,
    metadata: { tenantId: access.tenantId, originalName },
  });

  const created = await prisma.tenantFile.create({
    data: {
      tenantId: access.tenantId,
      employeeId: employee.id,
      bucket: uploaded.bucket,
      storageKey: uploaded.key,
      originalName,
      displayName: originalName,
      mimeType,
      sizeBytes: input.file.size,
      extension: getFileExtension(originalName),
      folderSlug: slot ? slot.key : "eigene-uploads",
      folderName: slot ? slot.label : "Eigene Uploads",
      ownerName: employee.name,
      uploadedById: access.userId,
      uploadedByName: access.userName,
      documentType: slot ? slot.label : input.documentType,
      description: input.description?.trim() ?? "",
      provider: uploaded.provider,
    },
  });

  // Ein Feld ohne `multiple` hält genau den aktuell gültigen Nachweis. Ersetzt
  // wird dabei ausschließlich, was der Mitarbeiter selbst hochgeladen hat —
  // eine von HR abgelegte Datei darf ein Upload von hier aus nicht entfernen.
  if (slot && !slot.multiple) {
    await prisma.tenantFile.updateMany({
      where: {
        tenantId: access.tenantId,
        employeeId: employee.id,
        status: "active",
        id: { not: created.id },
        uploadedById: access.userId,
        folderName: { in: [...employeeDocumentSlotFolders(slot)] },
      },
      data: { status: "deleted", deletedAt: new Date() },
    });
  }

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Dokument hochgeladen (Self-Service)",
    source: "Mein Bereich",
    entityType: "file",
    entityId: created.id,
    detail: originalName,
  });

  const document: SelfServiceDocument = {
    id: created.id,
    name: created.displayName,
    documentType: created.documentType,
    updatedAt: created.updatedAt.toISOString(),
    folder: created.folderName,
    folderSlug: created.folderSlug,
  };

  return document;
}

/**
 * Mitarbeiter beantwortet eine EIGENE Info-Anfrage (z. B. "bitte Adresse
 * aktualisieren") — optional mit Datei, Pflicht, sobald die Anfrage
 * `fileRequested` gesetzt hat. Status danach: `uploaded` mit Datei, sonst
 * `review` (Admin muss die reine Textantwort noch sichten).
 */
export async function submitInfoRequestResponse(input: {
  tenantSlug: string;
  requestId: string;
  message?: string;
  file?: File;
}) {
  const access = await requireTenantMembership(input.tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true, name: true },
  });

  if (!employee) {
    throw new Error("Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden.");
  }

  const infoRequest = await prisma.tenantEmployeeInfoRequest.findFirst({
    where: { id: input.requestId, tenantId: access.tenantId, employeeId: employee.id },
  });

  if (!infoRequest) {
    throw new Error("Info-Anfrage nicht gefunden.");
  }

  if (infoRequest.status === "cancelled") {
    throw new Error("Diese Info-Anfrage wurde storniert und kann nicht mehr beantwortet werden.");
  }

  if (infoRequest.fileRequested && !input.file) {
    throw new Error("Bitte eine Datei hochladen.");
  }

  let uploadedFileId = infoRequest.responseFileId;

  if (input.file) {
    // Dieselbe Byte-/Signaturprüfung wie beim generischen Upload — der
    // clientseitige `file.type` bzw. eine unbestätigte Endung wird NICHT
    // übernommen (Audit-Finding H08/R04).
    const { buffer, mimeType } = await fileToBuffer(input.file);

    const originalName =
      input.file.name.trim().replace(/[\\/]+/g, "-").slice(0, 240) || "Datei";
    const bucketConfig = getStorageBucket();
    const storageKey = buildStorageKey(bucketConfig, {
      tenantId: access.tenantId,
      fileName: originalName,
      ownerType: "employee",
      ownerId: employee.id,
    });
    const uploaded = await uploadObject({
      key: storageKey,
      body: buffer,
      contentType: mimeType,
      metadata: { tenantId: access.tenantId, originalName },
    });

    const uploadedFile = await prisma.tenantFile.create({
      data: {
        tenantId: access.tenantId,
        employeeId: employee.id,
        bucket: uploaded.bucket,
        storageKey: uploaded.key,
        originalName,
        displayName: originalName,
        mimeType,
        sizeBytes: input.file.size,
        extension: getFileExtension(originalName),
        folderSlug: "info-anfragen",
        folderName: "Info-Anfragen",
        ownerName: employee.name,
        uploadedById: access.userId,
        uploadedByName: access.userName,
        documentType: "Sonstiges",
        description: `Antwort auf: ${infoRequest.title}`,
        provider: uploaded.provider,
      },
    });

    uploadedFileId = uploadedFile.id;
  }

  const updated = await prisma.tenantEmployeeInfoRequest.update({
    where: { id: infoRequest.id },
    data: {
      responseMessage: input.message?.trim() ?? "",
      respondedAt: new Date(),
      responseFileId: uploadedFileId,
      status: uploadedFileId ? "uploaded" : "review",
    },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Info-Anfrage beantwortet (Self-Service)",
    source: "Mein Bereich",
    entityType: "employee",
    entityId: employee.id,
    detail: infoRequest.title,
  });

  const response: SelfServiceInfoRequest = {
    id: updated.id,
    title: updated.title,
    message: updated.message,
    requestedBy: updated.requestedBy,
    requestedAt: updated.createdAt.toISOString(),
    dueAt: updated.dueAt ? updated.dueAt.toISOString() : null,
    fileRequested: updated.fileRequested,
    status: updated.status as InfoRequestStatus,
    responseMessage: updated.responseMessage,
    respondedAt: updated.respondedAt ? updated.respondedAt.toISOString() : null,
    hasResponseFile: Boolean(updated.responseFileId),
  };

  return response;
}

/**
 * Pfade der Ordner, die HR vor genau diesem Mitarbeiter verborgen hat.
 * Ein verborgener Ordner verbirgt alles darunter, geprüft wird deshalb über
 * den Pfad-Präfix (`isUnderHiddenFolder`).
 */
async function hiddenFolderPathsFor(tenantId: string, employeeId: string) {
  const folders = await prisma.tenantFileFolder.findMany({
    where: { tenantId, employeeId, status: "active", hiddenFromEmployee: true },
    select: { path: true },
  });

  return folders.map((folder) => folder.path);
}

function isUnderHiddenFolder(folderSlug: string, hiddenPaths: string[]) {
  return hiddenPaths.some(
    (hidden) => folderSlug === hidden || folderSlug.startsWith(`${hidden}/`),
  );
}

/**
 * Eigene Gehaltsabrechnungen. Bewusst getrennt von `getPayrollStatements`
 * (payroll-service.ts): das prüft "payroll:read" über beliebige Mitarbeiter
 * hinweg, hier reicht Mitgliedschaft — der Mitarbeiter ist serverseitig fest
 * der eigene Datensatz, und verborgene Abrechnungen fallen wie überall in der
 * Selbstauskunft heraus.
 */
export type SelfServicePayrollStatement = {
  id: string;
  period: string;
  /** `YYYY-MM-DD` */
  issuedAt: string;
  gross: string;
  net: string;
  status: "available" | "corrected";
  /** Für `GET /api/me/documents/[fileId]/download`. */
  fileId: string;
  fileName: string;
};

export async function getMyPayrollStatements(
  tenantSlug: string,
): Promise<SelfServicePayrollStatement[]> {
  const access = await requireTenantMembership(tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true },
  });

  if (!employee) {
    return [];
  }

  const [statements, hiddenPaths] = await Promise.all([
    prisma.tenantPayrollStatement.findMany({
      where: {
        tenantId: access.tenantId,
        employeeId: employee.id,
        file: { status: "active", hiddenFromEmployee: false },
      },
      include: {
        file: {
          include: { parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } } },
        },
      },
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
    }),
    hiddenFolderPathsFor(access.tenantId, employee.id),
  ]);

  return statements
    .filter((statement) => canAccessFileAcl(statement.file.parent ?? statement.file, access))
    .filter((statement) => !isUnderHiddenFolder(statement.file.folderSlug, hiddenPaths))
    .map((statement) => ({
      id: statement.id,
      period: statement.period,
      issuedAt: statement.issuedAt.toISOString().slice(0, 10),
      gross: decryptField(statement.gross),
      net: decryptField(statement.net),
      status: statement.status === "corrected" ? ("corrected" as const) : ("available" as const),
      fileId: statement.fileId,
      fileName: statement.file.displayName || statement.file.originalName,
    }));
}

/**
 * Signierte Download-URL für ein EIGENES Personalakte-Dokument. Bewusst
 * enger als `getTenantFileSignedUrl` (Admin-Pfad, "files:read" + ACL über
 * beliebige Mitarbeiter hinweg) — hier zusätzlich zur ACL-Prüfung eine
 * harte Eigentümer-Prüfung (`employeeId` muss der eigene Datensatz sein),
 * damit Mitgliedschaft allein niemals für fremde Dateien reicht.
 */
export async function getMyDocumentDownloadUrl(input: {
  tenantSlug: string;
  fileId: string;
}) {
  const access = await requireTenantMembership(input.tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true },
  });

  if (!employee) {
    throw new Error("Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden.");
  }

  const file = await prisma.tenantFile.findFirst({
    where: {
      id: input.fileId,
      tenantId: access.tenantId,
      employeeId: employee.id,
      status: { not: "deleted" },
      // Vor dem Mitarbeiter verborgen heißt auch: nicht über die ID abrufbar.
      // Ohne diese Zeile bliebe die Datei jedem erreichbar, der sie einmal
      // gesehen hat.
      hiddenFromEmployee: false,
    },
  });

  if (!file) {
    throw new Error("Datei nicht gefunden.");
  }

  const hiddenPaths = await hiddenFolderPathsFor(access.tenantId, employee.id);

  if (isUnderHiddenFolder(file.folderSlug, hiddenPaths)) {
    throw new Error("Datei nicht gefunden.");
  }

  requireFileAcl(file, access);

  return createReadSignedUrl({
    bucket: file.bucket,
    key: file.storageKey,
    fileName: file.displayName,
    disposition: "attachment",
    contentType: file.mimeType,
  });
}
