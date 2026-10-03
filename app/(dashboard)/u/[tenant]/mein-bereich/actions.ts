"use server";

import { z } from "zod";
import { createMyVacationRequest } from "@/lib/vacation-service";
import { createMySicknessReport } from "@/lib/sickness";
import { updateMyProfile } from "@/lib/self-service";
import {
  createAndLinkOwnTenantEmployee,
  linkOwnTenantEmployee,
  unlinkOwnTenantEmployee,
} from "@/lib/employee-service";
import { type ActionState, parseAction } from "@/lib/action-state";
import { revalidatePath } from "next/cache";

function selfServicePath(tenant: string) {
  return `/u/${tenant}/mein-bereich`;
}

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : fallback;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const linkOwnEmployeeSchema = z.object({
  tenant: z.string().trim().min(1),
  employeeId: z.string().trim().min(1, "Bitte ein Profil auswählen."),
});

export async function linkOwnEmployeeAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseAction(linkOwnEmployeeSchema, Object.fromEntries(formData));

  if (!parsed.success) {
    return parsed.state;
  }

  try {
    await linkOwnTenantEmployee({
      tenantSlug: parsed.data.tenant,
      employeeId: parsed.data.employeeId,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Profil konnte nicht verknüpft werden.",
    };
  }

  revalidatePath(selfServicePath(parsed.data.tenant));

  return {};
}

const createAndLinkOwnEmployeeSchema = z.object({
  tenant: z.string().trim().min(1),
  firstName: z.string().trim().default(""),
  lastName: z.string().trim().default(""),
  email: z
    .string()
    .trim()
    .default("")
    .refine((value) => value === "" || EMAIL_PATTERN.test(value), {
      message: "Bitte eine gültige E-Mail-Adresse angeben.",
    }),
});

export async function createAndLinkOwnEmployeeAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseAction(createAndLinkOwnEmployeeSchema, Object.fromEntries(formData));

  if (!parsed.success) {
    return parsed.state;
  }

  try {
    await createAndLinkOwnTenantEmployee({
      tenantSlug: parsed.data.tenant,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Profil konnte nicht angelegt werden.",
    };
  }

  revalidatePath(selfServicePath(parsed.data.tenant));

  return {};
}

export async function unlinkOwnEmployeeAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = formString(formData, "tenant");

  if (!tenant) {
    return { error: "Verknüpfung konnte nicht aufgehoben werden." };
  }

  try {
    await unlinkOwnTenantEmployee(tenant);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Verknüpfung konnte nicht aufgehoben werden.",
    };
  }

  revalidatePath(selfServicePath(tenant));

  return {};
}

const vacationRequestSchema = z.object({
  tenant: z.string().trim().min(1),
  startDate: z.string().trim().min(1, "Bitte ein Startdatum wählen."),
  endDate: z.string().trim().min(1, "Bitte ein Enddatum wählen."),
  note: z.string().trim().default(""),
});

/**
 * `values` reicht die zuletzt eingegebenen Werte an das Formular zurück
 * (QA-Bug BUG-018): React setzt unkontrollierte Formularfelder nach JEDER
 * Server-Action-Auflösung zurück — nicht nur bei Erfolg, auch bei einem
 * fachlichen Fehler ("Enddatum vor Startdatum") oder einem stehen
 * gebliebenen Feldfehler. Ohne dieses Echo verlor die Notiz dadurch ihren
 * Inhalt, sobald irgendein Fehler zurückkam.
 */
export type VacationActionState = ActionState & {
  values?: { startDate: string; endDate: string; note: string };
};

export async function requestMyVacationAction(
  _prevState: VacationActionState,
  formData: FormData,
): Promise<VacationActionState> {
  const values = {
    startDate: formString(formData, "startDate"),
    endDate: formString(formData, "endDate"),
    note: formString(formData, "note"),
  };
  const parsed = parseAction(vacationRequestSchema, Object.fromEntries(formData));

  if (!parsed.success) {
    return { ...parsed.state, values };
  }

  try {
    await createMyVacationRequest({
      tenantSlug: parsed.data.tenant,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      note: parsed.data.note,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Urlaubsantrag konnte nicht gestellt werden.",
      values,
    };
  }

  revalidatePath(selfServicePath(parsed.data.tenant));

  return {};
}

const myProfileSchema = z.object({
  tenant: z.string().trim().min(1),
  birthDate: z.string().trim().default(""),
  birthPlace: z.string().trim().default(""),
  nationality: z.string().trim().default(""),
  maritalStatus: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  privateAddressStreet: z.string().trim().default(""),
  privateAddressHouseNumber: z.string().trim().default(""),
  privateAddressPostalCode: z.string().trim().default(""),
  privateAddressCity: z.string().trim().default(""),
  privateAddressCareOf: z.string().trim().default(""),
  privateAddressCountry: z.string().trim().default("DE"),
  taxId: z.string().trim().default(""),
  socialSecurityNumber: z.string().trim().default(""),
  healthInsurance: z.string().trim().default(""),
  iban: z.string().trim().default(""),
});

export async function updateMyProfileAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseAction(myProfileSchema, Object.fromEntries(formData));

  if (!parsed.success) {
    return parsed.state;
  }

  const emergencyContactIds = formData.getAll("emergencyContactId").map(String);
  const emergencyContactNames = formData.getAll("emergencyContactName").map(String);
  const emergencyContactRelations = formData
    .getAll("emergencyContactRelation")
    .map(String);
  const emergencyContactPhones = formData.getAll("emergencyContactPhone").map(String);
  const emergencyContactEmails = formData.getAll("emergencyContactEmail").map(String);
  const emergencyContacts = emergencyContactNames
    .map((rawName, index) => ({
      id: emergencyContactIds[index] ?? "",
      name: rawName.trim(),
      relation: (emergencyContactRelations[index] ?? "").trim(),
      phone: (emergencyContactPhones[index] ?? "").trim(),
      email: (emergencyContactEmails[index] ?? "").trim() || undefined,
    }))
    .filter((contact) => contact.name || contact.phone);

  try {
    await updateMyProfile(parsed.data.tenant, {
      birthDate: parsed.data.birthDate,
      birthPlace: parsed.data.birthPlace,
      nationality: parsed.data.nationality,
      maritalStatus: parsed.data.maritalStatus,
      phone: parsed.data.phone,
      privateAddress: {
        street: parsed.data.privateAddressStreet,
        houseNumber: parsed.data.privateAddressHouseNumber,
        postalCode: parsed.data.privateAddressPostalCode,
        city: parsed.data.privateAddressCity,
        careOf: parsed.data.privateAddressCareOf,
        country: parsed.data.privateAddressCountry,
      },
      taxId: parsed.data.taxId,
      socialSecurityNumber: parsed.data.socialSecurityNumber,
      healthInsurance: parsed.data.healthInsurance,
      iban: parsed.data.iban,
      emergencyContacts,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Profil konnte nicht gespeichert werden.",
    };
  }

  revalidatePath(selfServicePath(parsed.data.tenant));

  return {};
}

const sicknessReportSchema = z.object({
  tenant: z.string().trim().min(1),
  startDate: z.string().trim().min(1, "Bitte ein Startdatum wählen."),
  endDate: z.string().trim().default(""),
  note: z.string().trim().default(""),
});

export async function reportMySicknessAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseAction(sicknessReportSchema, Object.fromEntries(formData));

  if (!parsed.success) {
    return parsed.state;
  }

  try {
    await createMySicknessReport({
      tenantSlug: parsed.data.tenant,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate || undefined,
      note: parsed.data.note,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Krankmeldung konnte nicht erfasst werden.",
    };
  }

  revalidatePath(selfServicePath(parsed.data.tenant));

  return {};
}
