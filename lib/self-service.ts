import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireTenantMembership } from "@/lib/tenant-access";
import { canAccessFileAcl, requireFileAcl } from "@/lib/file-access";
import { decryptField, encryptField } from "@/lib/encryption";
import { normalizeAddressInput, type AddressInput } from "@/lib/address";
import type { EmergencyContact, InfoRequestStatus } from "@/lib/employees";
import { computeVacationAccount } from "@/lib/vacations";
import { recordTenantAudit } from "@/lib/audit";
import { getStorageBucket } from "@/lib/storage/buckets";
import { buildStorageKey, getFileExtension } from "@/lib/storage/key-builder";
import { createReadSignedUrl } from "@/lib/storage/signed-url";
import { uploadObject } from "@/lib/storage/upload";
import { validateUploadFile } from "@/lib/storage/storage.service";

function asJson<T>(value: unknown, fallback: T): T {
  return (value ?? fallback) as T;
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

const profileFieldLabels: Record<
  Exclude<keyof MyProfileFields, "privateAddress" | "emergencyContacts">,
  string
> = {
  birthDate: "Geburtsdatum",
  birthPlace: "Geburtsort",
  nationality: "Staatsangehörigkeit",
  maritalStatus: "Familienstand",
  phone: "Telefonnummer",
  taxId: "Steuer-ID",
  socialSecurityNumber: "Sozialversicherungsnummer",
  healthInsurance: "Krankenversicherung",
  iban: "IBAN",
};

export function computeProfileCompleteness(fields: MyProfileFields): ProfileCompleteness {
  const missingLabels: string[] = [];
  let filledCount = 0;
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
    missingLabels.push("Privatadresse");
  }

  if (fields.emergencyContacts.length > 0) {
    filledCount += 1;
  } else {
    missingLabels.push("Notfallkontakt");
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
      infoRequests: [],
      profileFields: null,
      profileCompleteness: null,
    };
  }

  const profileFields: MyProfileFields = {
    birthDate: employeeRecord.birthDate,
    birthPlace: employeeRecord.birthPlace,
    nationality: employeeRecord.nationality,
    maritalStatus: employeeRecord.maritalStatus,
    phone: employeeRecord.phone,
    privateAddress: {
      street: employeeRecord.privateAddress?.street ?? "",
      houseNumber: employeeRecord.privateAddress?.houseNumber ?? "",
      postalCode: employeeRecord.privateAddress?.postalCode ?? "",
      city: employeeRecord.privateAddress?.city ?? "",
      careOf: employeeRecord.privateAddress?.careOf ?? "",
      country: employeeRecord.privateAddress?.country ?? "DE",
    },
    taxId: decryptField(employeeRecord.taxId),
    socialSecurityNumber: decryptField(employeeRecord.socialSecurityNumber),
    healthInsurance: decryptField(employeeRecord.healthInsurance),
    iban: decryptField(employeeRecord.iban),
    emergencyContacts: asJson<EmergencyContact[]>(employeeRecord.emergencyContactsJson, []),
  };

  const [vacationRequests, sicknessReports, files, infoRequests] = await Promise.all([
    prisma.tenantVacationRequest.findMany({
      where: { employeeId: employeeRecord.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.tenantSicknessReport.findMany({
      where: { employeeId: employeeRecord.id },
      orderBy: { startDate: "desc" },
    }),
    prisma.tenantFile.findMany({
      where: { employeeId: employeeRecord.id, status: "active" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        displayName: true,
        documentType: true,
        updatedAt: true,
        folderName: true,
        accessRoleIdsJson: true,
        accessUserIdsJson: true,
      },
    }),
    prisma.tenantEmployeeInfoRequest.findMany({
      where: { employeeId: employeeRecord.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
  ]);

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
      note: report.note,
    })),
    documents: files
      .filter((file) => canAccessFileAcl(file, access))
      .map((file) => ({
        id: file.id,
        name: file.displayName,
        documentType: file.documentType,
        updatedAt: file.updatedAt.toISOString(),
        folder: file.folderName,
      })),
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
    profileCompleteness: computeProfileCompleteness(profileFields),
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

  const currentContacts = asJson<EmergencyContact[]>(current.emergencyContactsJson, []);
  const existingContactIds = new Set(currentContacts.map((contact) => contact.id));
  const emergencyContacts = input.emergencyContacts?.map((contact) => ({
    ...contact,
    id: existingContactIds.has(contact.id) ? contact.id : randomUUID(),
  }));

  await prisma.tenantEmployee.update({
    where: { id: current.id },
    data: {
      birthDate: input.birthDate?.trim() ?? current.birthDate,
      birthPlace: input.birthPlace?.trim() ?? current.birthPlace,
      nationality: input.nationality?.trim() ?? current.nationality,
      maritalStatus: input.maritalStatus?.trim() ?? current.maritalStatus,
      phone: input.phone?.trim() ?? current.phone,
      privateAddress: {
        upsert: {
          create: normalizeAddressInput(input.privateAddress),
          update: normalizeAddressInput(input.privateAddress ?? current.privateAddress ?? {}),
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
      emergencyContactsJson: emergencyContacts ?? currentContacts,
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
export async function uploadMyDocument(input: {
  tenantSlug: string;
  file: File;
  documentType: SelfServiceDocumentType;
  description?: string;
}) {
  const access = await requireTenantMembership(input.tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true, name: true },
  });

  if (!employee) {
    throw new Error("Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden.");
  }

  if (!selfServiceDocumentTypes.includes(input.documentType)) {
    throw new Error("Ungültiger Dokumenttyp.");
  }

  validateUploadFile(input.file);

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
    body: Buffer.from(await input.file.arrayBuffer()),
    contentType: input.file.type || "application/octet-stream",
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
      mimeType: input.file.type || "application/octet-stream",
      sizeBytes: input.file.size,
      extension: getFileExtension(originalName),
      folderSlug: "eigene-uploads",
      folderName: "Eigene Uploads",
      ownerName: employee.name,
      uploadedById: access.userId,
      uploadedByName: access.userName,
      documentType: input.documentType,
      description: input.description?.trim() ?? "",
      provider: uploaded.provider,
    },
  });

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
    validateUploadFile(input.file);

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
      body: Buffer.from(await input.file.arrayBuffer()),
      contentType: input.file.type || "application/octet-stream",
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
        mimeType: input.file.type || "application/octet-stream",
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
    },
  });

  if (!file) {
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
