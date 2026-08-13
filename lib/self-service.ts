import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireTenantMembership } from "@/lib/tenant-access";
import { canAccessFileAcl } from "@/lib/file-access";
import { decryptField, encryptField } from "@/lib/encryption";
import { normalizeAddressInput, type AddressInput } from "@/lib/address";
import type { EmergencyContact } from "@/lib/employees";

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
};

export type SelfServiceOverview = {
  employee: SelfServiceEmployee | null;
  vacationRequests: SelfServiceVacationRequest[];
  sicknessReports: SelfServiceSicknessReport[];
  documents: SelfServiceDocument[];
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
    include: { privateAddress: true },
  });

  if (!employeeRecord) {
    return {
      employee: null,
      vacationRequests: [],
      sicknessReports: [],
      documents: [],
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

  const [vacationRequests, sicknessReports, files] = await Promise.all([
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
        accessRoleIdsJson: true,
        accessUserIdsJson: true,
      },
    }),
  ]);

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
      vacationRemaining: employeeRecord.vacationRemaining,
      vacationTotal: employeeRecord.vacationTotal,
      vacationTaken: employeeRecord.vacationTaken,
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
