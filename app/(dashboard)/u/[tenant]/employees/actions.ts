"use server";

import { z } from "zod";
import {
  createEmployeeInfoRequest,
  createTenantEmployee,
  deleteTenantEmployee,
  getEmployeeForTenant,
  updateTenantEmployee,
} from "@/lib/employee-service";
import { createTenantInvitation } from "@/lib/settings-service";
import {
  contractStatuses,
  createEmployeeContract,
  updateEmployeeContractStatus,
  type ContractStatus,
} from "@/lib/contract-service";
import { uploadPayrollStatement } from "@/lib/payroll-service";
import { type ActionState, parseAction } from "@/lib/action-state";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : fallback;
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function fieldString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : undefined;
}

function requiredFile(formData: FormData, key: string) {
  const value = formData.get(key);

  if (!(value instanceof File) || value.size === 0) {
    throw new Error("Bitte die Vertrags-PDF auswählen.");
  }

  return value;
}

function contractStatus(formData: FormData, fallback: ContractStatus = "draft") {
  const value = formString(formData, "status", fallback);

  return contractStatuses.includes(value as ContractStatus)
    ? (value as ContractStatus)
    : fallback;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function employeesPath(tenant: string) {
  return `/u/${tenant}/employees`;
}

function employeePath(tenant: string, employeeHandle: string) {
  return `${employeesPath(tenant)}/${employeeHandle}`;
}

const createEmployeeSchema = z
  .object({
    tenant: z.string().trim().min(1, "Mandant fehlt."),
    firstName: z.string().trim().default(""),
    lastName: z.string().trim().default(""),
    email: z
      .string()
      .trim()
      .default("")
      .refine((value) => value === "" || EMAIL_PATTERN.test(value), {
        message: "Bitte eine gültige E-Mail-Adresse angeben.",
      }),
    location: z.string().trim().default(""),
    team: z.string().trim().default(""),
    role: z.string().trim().default("Mitarbeiter"),
    startDate: z.string().trim().default(""),
    contract: z.string().trim().default("Unbefristet"),
    weeklyHours: z.string().trim().default("38 Std/Woche"),
    status: z.string().trim().default("active"),
    employeeNumber: z.string().trim().default(""),
  })
  .refine((data) => data.firstName || data.lastName || data.email, {
    message: "Name oder E-Mail ist erforderlich.",
    path: ["email"],
  });

export async function createEmployeeAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseAction(createEmployeeSchema, Object.fromEntries(formData));

  if (!parsed.success) {
    return parsed.state;
  }

  const { tenant, ...employeeInput } = parsed.data;
  let employee: Awaited<ReturnType<typeof createTenantEmployee>>;

  try {
    employee = await createTenantEmployee({ tenantSlug: tenant, ...employeeInput });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Mitarbeiter konnte nicht angelegt werden.",
    };
  }

  revalidatePath(employeesPath(tenant));
  redirect(employeePath(tenant, employee.key ?? employee.id));
}

export async function updateEmployeeAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const employeeId = formString(formData, "employeeId");
  const activeTab = formString(formData, "activeTab");
  const contractDetailsSubmitted = formData.get("contractDetailsSubmitted") === "1";
  const emergencyContactsSubmitted =
    formData.get("emergencyContactsSubmitted") === "1";
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

  if (!tenant || !employeeId) {
    throw new Error("Mitarbeiter konnte nicht gespeichert werden.");
  }

  const rawName = formData.get("name");
  if (typeof rawName === "string" && rawName.trim() === "") {
    throw new Error("Name darf nicht leer sein.");
  }

  const rawEmail = formData.get("email");
  if (
    typeof rawEmail === "string" &&
    rawEmail.trim() &&
    !EMAIL_PATTERN.test(rawEmail.trim())
  ) {
    throw new Error("Bitte eine gültige E-Mail-Adresse angeben.");
  }

  const employee = await updateTenantEmployee({
    tenantSlug: tenant,
    employeeId,
    name: optionalString(formData, "name"),
    employeeNumber: optionalString(formData, "employeeNumber"),
    birthDate: optionalString(formData, "birthDate"),
    birthPlace: optionalString(formData, "birthPlace"),
    nationality: optionalString(formData, "nationality"),
    maritalStatus: optionalString(formData, "maritalStatus"),
    privateAddress: {
      street: formString(formData, "privateAddressStreet"),
      houseNumber: formString(formData, "privateAddressHouseNumber"),
      postalCode: formString(formData, "privateAddressPostalCode"),
      city: formString(formData, "privateAddressCity"),
      careOf: formString(formData, "privateAddressCareOf"),
      country: formString(formData, "privateAddressCountry", "DE"),
    },
    taxId: optionalString(formData, "taxId"),
    socialSecurityNumber: optionalString(formData, "socialSecurityNumber"),
    healthInsurance: optionalString(formData, "healthInsurance"),
    iban: optionalString(formData, "iban"),
    location: optionalString(formData, "location"),
    team: optionalString(formData, "team"),
    role: optionalString(formData, "role"),
    startDate: optionalString(formData, "startDate"),
    contract: optionalString(formData, "contract"),
    weeklyHours: optionalString(formData, "weeklyHours"),
    tenure: optionalString(formData, "tenure"),
    status: optionalString(formData, "status"),
    email: optionalString(formData, "email"),
    phone: optionalString(formData, "phone"),
    address: {
      street: formString(formData, "addressStreet"),
      houseNumber: formString(formData, "addressHouseNumber"),
      postalCode: formString(formData, "addressPostalCode"),
      city: formString(formData, "addressCity"),
      careOf: formString(formData, "addressCareOf"),
      country: formString(formData, "addressCountry", "DE"),
    },
    vacationRemaining: optionalString(formData, "vacationRemaining"),
    vacationTotal: optionalString(formData, "vacationTotal"),
    vacationTaken: optionalString(formData, "vacationTaken"),
    contractDetailsSubmitted,
    contractType: fieldString(formData, "contractType"),
    entryDate: fieldString(formData, "entryDate"),
    exitDate: fieldString(formData, "exitDate"),
    fixedTerm: fieldString(formData, "fixedTerm"),
    probation: fieldString(formData, "probation"),
    noticePeriod: fieldString(formData, "noticePeriod"),
    position: fieldString(formData, "position"),
    department: fieldString(formData, "department"),
    supervisor: fieldString(formData, "supervisor"),
    workLocation: fieldString(formData, "workLocation"),
    parties: fieldString(formData, "parties"),
    collectiveAgreement: fieldString(formData, "collectiveAgreement"),
    compensation: fieldString(formData, "compensation"),
    workingTime: fieldString(formData, "workingTime"),
    vacation: fieldString(formData, "vacation"),
    emergencyContacts: emergencyContactsSubmitted ? emergencyContacts : undefined,
  });

  revalidatePath(employeesPath(tenant));
  redirect(
    activeTab === "contract"
      ? `${employeePath(tenant, employee.key ?? employee.id)}?tab=contract`
      : employeePath(tenant, employee.key ?? employee.id),
  );
}

export async function inviteEmployeeAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const employeeHandle = formString(formData, "employeeHandle");

  if (!tenant || !employeeHandle) {
    throw new Error("Einladung konnte nicht versendet werden.");
  }

  const employee = await getEmployeeForTenant(tenant, employeeHandle);

  if (!employee) {
    throw new Error("Mitarbeiter wurde nicht gefunden.");
  }

  if (!employee.email) {
    throw new Error(
      "Für diesen Mitarbeiter ist keine E-Mail-Adresse hinterlegt.",
    );
  }

  await createTenantInvitation({
    tenantSlug: tenant,
    email: employee.email,
    role: "EMPLOYEE",
    source: "Personalakte",
  });

  const path = employeePath(tenant, employeeHandle);
  revalidatePath(path);
  redirect(`${path}?invited=1`);
}

export async function createEmployeeInfoRequestAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const employeeId = formString(formData, "employeeId");
  const employeeHandle = formString(formData, "employeeHandle");
  const title = formString(formData, "title");

  if (!tenant || !employeeId || !employeeHandle || !title) {
    throw new Error("Bitte angeben, welche Information benötigt wird.");
  }

  await createEmployeeInfoRequest({
    tenantSlug: tenant,
    employeeId,
    title,
    message: formString(formData, "message"),
    dueAt: formString(formData, "dueAt"),
    fileRequested: formData.get("fileRequested") === "on",
  });

  const path = employeePath(tenant, employeeHandle);
  revalidatePath(path);
  redirect(path);
}

export async function deleteEmployeeAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const employeeId = formString(formData, "employeeId");

  if (!tenant || !employeeId) {
    throw new Error("Mitarbeiter konnte nicht gelöscht werden.");
  }

  await deleteTenantEmployee({ tenantSlug: tenant, employeeId });

  revalidatePath(employeesPath(tenant));
  redirect(employeesPath(tenant));
}

export async function createEmployeeContractAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const employeeId = formString(formData, "employeeId");
  const employeeHandle = formString(formData, "employeeHandle");
  const title = formString(formData, "title");
  const startDate = formString(formData, "startDate");

  if (!tenant || !employeeId || !employeeHandle || !title || !startDate) {
    throw new Error("Titel, Mitarbeiter und Vertragsbeginn sind erforderlich.");
  }

  await createEmployeeContract({
    tenantSlug: tenant,
    employeeId,
    file: requiredFile(formData, "contractFile"),
    title,
    contractType: formString(formData, "contractType", "Arbeitsvertrag"),
    status: contractStatus(formData),
    startDate,
    endDate: formString(formData, "endDate"),
    probationEndDate: formString(formData, "probationEndDate"),
    noticePeriod: formString(formData, "noticePeriod"),
    position: formString(formData, "position"),
    department: formString(formData, "department"),
    workLocation: formString(formData, "workLocation"),
    weeklyHours: formString(formData, "weeklyHours"),
    compensation: formString(formData, "compensation"),
    vacationDays: Math.max(0, Number(formString(formData, "vacationDays", "0")) || 0),
    notes: formString(formData, "notes"),
  });

  const path = `${employeePath(tenant, employeeHandle)}?tab=contract`;
  revalidatePath(path);
  redirect(path);
}

export async function updateEmployeeContractStatusAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const employeeId = formString(formData, "employeeId");
  const employeeHandle = formString(formData, "employeeHandle");
  const contractId = formString(formData, "contractId");
  const status = contractStatus(formData, "inactive");
  const terminationDate = formString(formData, "terminationDate");
  const terminationReason = formString(formData, "terminationReason");

  if (!tenant || !employeeId || !employeeHandle || !contractId) {
    throw new Error("Vertrag konnte nicht aktualisiert werden.");
  }

  if (status === "terminated" && !terminationDate) {
    throw new Error("Bitte ein Kündigungsdatum auswählen.");
  }

  if (status === "terminated" && !terminationReason) {
    throw new Error("Bitte einen Kündigungsgrund angeben.");
  }

  await updateEmployeeContractStatus({
    tenantSlug: tenant,
    employeeId,
    contractId,
    status,
    terminationDate,
    terminationReason,
  });

  const path = `${employeePath(tenant, employeeHandle)}?tab=contract`;
  revalidatePath(path);
  redirect(path);
}

const uploadPayrollStatementSchema = z.object({
  tenant: z.string().trim().min(1),
  employeeId: z.string().trim().min(1),
  employeeHandle: z.string().trim().min(1),
  period: z.string().trim().min(1, "Bitte einen Zeitraum angeben (z. B. \"Januar 2026\")."),
  gross: z.string().trim().default(""),
  net: z.string().trim().default(""),
  file: z
    .instanceof(File)
    .refine((file) => file.size > 0, "Bitte eine PDF-Datei auswählen."),
});

export async function uploadPayrollStatementAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseAction(
    uploadPayrollStatementSchema,
    Object.fromEntries(formData),
  );

  if (!parsed.success) {
    return parsed.state;
  }

  try {
    await uploadPayrollStatement({
      tenantSlug: parsed.data.tenant,
      employeeId: parsed.data.employeeId,
      file: parsed.data.file,
      period: parsed.data.period,
      gross: parsed.data.gross,
      net: parsed.data.net,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Gehaltsabrechnung konnte nicht hochgeladen werden.",
    };
  }

  const path = `${employeePath(parsed.data.tenant, parsed.data.employeeHandle)}?tab=payroll`;
  revalidatePath(path);
  redirect(path);
}
