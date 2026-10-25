"use server";

import { z } from "zod";
import {
  addEmergencyContact,
  createEmployeeInfoRequest,
  createTenantEmployee,
  deleteEmergencyContact,
  deleteTenantEmployee,
  getEmployeeForTenant,
  offboardEmployee,
  reactivateEmployee,
  setPrimaryEmergencyContact,
  updateEmergencyContact,
  updateTenantEmployee,
} from "@/lib/employee-service";
import { createTenantInvitation } from "@/lib/settings-service";
import { setEmployeeAppAccessLock } from "@/lib/employee-access-lock";
import { createEmployeeFolderTemplate } from "@/lib/employee-folder-templates";
import {
  contractStatuses,
  createEmployeeContract,
  updateEmployeeContractDetails,
  updateEmployeeContractStatus,
  type ContractStatus,
} from "@/lib/contract-service";
import { uploadPayrollStatement } from "@/lib/payroll-service";
import { deleteEmployeeDataByCategory } from "@/lib/retention-service";
import type { RetentionCategory } from "@/lib/data-retention";
import {
  setTenantFileEmployeeVisibility,
  setTenantFileFolderEmployeeVisibility,
  softDeleteTenantFile,
  uploadTenantFile,
} from "@/lib/storage/storage.service";
import { type ActionState, parseAction, withActionErrorHandling } from "@/lib/action-state";
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

/**
 * Für Checkboxen: ein unangehakter Checkbox-Input sendet gar nichts mit —
 * nicht von "Feld war auf diesem Tab gar nicht gerendert" unterscheidbar.
 * `presenceKey` ist ein verstecktes Zusatzfeld, das nur mitgerendert wird,
 * wenn die Checkbox selbst im Formular vorhanden ist (siehe
 * employees/[employeeId]/page.tsx, Mutterschutz-Feld) — erst wenn das
 * gesetzt ist, zählt eine fehlende Checkbox als "abgehakt entfernt" statt
 * als "unverändert lassen".
 */
function optionalBoolean(formData: FormData, presenceKey: string, valueKey: string) {
  if (formData.get(presenceKey) !== "1") {
    return undefined;
  }

  return formData.get(valueKey) === "on";
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

function formFile(formData: FormData, key = "file") {
  const value = formData.get(key);

  return value instanceof File ? value : null;
}

function formStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
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

  // Mehrfachauswahl kommt als wiederholtes `locations`-/`teams`-Feld —
  // `Object.fromEntries` oben würde davon nur den letzten Wert behalten,
  // daher separat mit `getAll`.
  const locations = formStrings(formData, "locations");
  const teams = formStrings(formData, "teams");
  const { tenant, ...employeeInput } = parsed.data;
  let employee: Awaited<ReturnType<typeof createTenantEmployee>>;

  try {
    employee = await createTenantEmployee({ tenantSlug: tenant, ...employeeInput, locations, teams });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Mitarbeiter konnte nicht angelegt werden.",
    };
  }

  // "Zur Mitarbeiter-App einladen" direkt beim Anlegen (neues Design). Ein
  // Fehler beim Einladen macht das Anlegen nicht rückgängig — die Einladung
  // lässt sich in der Akte jederzeit erneut senden.
  let invited = false;

  if (formData.get("inviteToApp") === "on" && employeeInput.email) {
    try {
      await createTenantInvitation({
        tenantSlug: tenant,
        email: employeeInput.email,
        role: "EMPLOYEE",
        source: "Personalakte",
        employeeId: employee.id,
      });
      invited = true;
    } catch {
      invited = false;
    }
  }

  revalidatePath(employeesPath(tenant));
  redirect(`${employeePath(tenant, employee.key ?? employee.id)}${invited ? "?invited=1" : ""}`);
}

export async function updateEmployeeAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeId = formString(formData, "employeeId");
    const activeTab = formString(formData, "activeTab");
    const contractDetailsSubmitted = formData.get("contractDetailsSubmitted") === "1";

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
      maternityProtectionActive: optionalBoolean(
        formData,
        "maternityProtectionActive_present",
        "maternityProtectionActive",
      ),
      maternityProtectionNote: optionalString(formData, "maternityProtectionNote"),
      location: optionalString(formData, "location"),
      // Immer explizit mitgeschickt (nicht `undefined` bei leerer Auswahl!) —
      // das Bearbeiten-Formular rendert den Mehrfachauswahl-Standort-Bereich
      // immer mit, ein leeres Array bedeutet also "alle Standorte entfernt",
      // nicht "Feld nicht angetastet".
      locations: formStrings(formData, "locations"),
      team: optionalString(formData, "team"),
      // Wie `locations`: immer explizit mitgeschickt, da das Bearbeiten-
      // Formular den Mehrfachauswahl-Team-Bereich immer mit rendert.
      teams: formStrings(formData, "teams"),
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
      vacationManualCorrection: optionalString(formData, "vacationManualCorrection"),
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
      compensationGross: fieldString(formData, "compensationGross"),
      workingTime: fieldString(formData, "workingTime"),
      vacation: fieldString(formData, "vacation"),
    });

    revalidatePath(employeesPath(tenant));
    redirect(
      activeTab === "contract"
        ? `${employeePath(tenant, employee.key ?? employee.id)}?tab=contract`
        : activeTab === "data"
          ? `${employeePath(tenant, employee.key ?? employee.id)}?tab=data`
          : employeePath(tenant, employee.key ?? employee.id),
    );
  }, "Mitarbeiter speichern");
}

export async function inviteEmployeeAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
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
      employeeId: employee.dbId,
    });

    const path = employeePath(tenant, employeeHandle);
    revalidatePath(path);
    redirect(`${path}?invited=1`);
  }, "Einladung versenden");
}

/**
 * Kein Redirect: das Formular wird auf derselben Mitarbeiterseite geöffnet,
 * auf der es sitzt — nur `revalidatePath`, das Popup schließt sich clientseitig
 * über `useCloseOnSuccess`, sobald diese Action fehlerfrei durchläuft.
 */
export async function createEmployeeInfoRequestAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = formString(formData, "tenant");
  const employeeId = formString(formData, "employeeId");
  const employeeHandle = formString(formData, "employeeHandle");
  const title = formString(formData, "title");
  // Mehrteilige Anfrage (M7): je Zeile Typ, Bezeichnung und Pflicht.
  const kinds = formData.getAll("itemKind").map(String);
  const labels = formData.getAll("itemLabel").map(String);
  const required = formData.getAll("itemRequired").map(String);
  const items = labels
    .map((label, index) => ({
      kind: kinds[index] === "field" ? ("field" as const) : ("document" as const),
      label: label.trim(),
      required: required[index] !== "0",
    }))
    .filter((item) => item.label);

  if (!tenant || !employeeId || !employeeHandle || (!title && items.length === 0)) {
    return { error: "Bitte angeben, welche Information benötigt wird." };
  }

  try {
    await createEmployeeInfoRequest({
      tenantSlug: tenant,
      employeeId,
      title,
      message: formString(formData, "message"),
      dueAt: formString(formData, "dueAt"),
      dueTime: formString(formData, "dueTime"),
      fileRequested: formData.get("fileRequested") === "on",
      items,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Anfrage konnte nicht gespeichert werden.",
    };
  }

  revalidatePath(employeePath(tenant, employeeHandle));

  return {};
}

function emergencyContactInputFromForm(formData: FormData) {
  return {
    name: formString(formData, "name"),
    relation: formString(formData, "relation"),
    phone: formString(formData, "phone"),
    email: optionalString(formData, "email"),
    note: optionalString(formData, "note"),
  };
}

export async function addEmergencyContactAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeId = formString(formData, "employeeId");
    const employeeHandle = formString(formData, "employeeHandle");

    if (!tenant || !employeeId || !employeeHandle) {
      throw new Error("Notfallkontakt konnte nicht gespeichert werden.");
    }

    await addEmergencyContact({
      tenantSlug: tenant,
      employeeId,
      contact: emergencyContactInputFromForm(formData),
    });

    const path = employeePath(tenant, employeeHandle);
    revalidatePath(path);
    redirect(path);
  }, "Notfallkontakt speichern");
}

export async function updateEmergencyContactAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeId = formString(formData, "employeeId");
    const employeeHandle = formString(formData, "employeeHandle");
    const contactId = formString(formData, "contactId");

    if (!tenant || !employeeId || !employeeHandle || !contactId) {
      throw new Error("Notfallkontakt konnte nicht gespeichert werden.");
    }

    await updateEmergencyContact({
      tenantSlug: tenant,
      employeeId,
      contactId,
      contact: emergencyContactInputFromForm(formData),
    });

    const path = employeePath(tenant, employeeHandle);
    revalidatePath(path);
    redirect(path);
  }, "Notfallkontakt speichern");
}

export async function deleteEmergencyContactAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeId = formString(formData, "employeeId");
    const employeeHandle = formString(formData, "employeeHandle");
    const contactId = formString(formData, "contactId");

    if (!tenant || !employeeId || !employeeHandle || !contactId) {
      throw new Error("Notfallkontakt konnte nicht gelöscht werden.");
    }

    await deleteEmergencyContact({ tenantSlug: tenant, employeeId, contactId });

    const path = employeePath(tenant, employeeHandle);
    revalidatePath(path);
    redirect(path);
  }, "Notfallkontakt löschen");
}

export async function setPrimaryEmergencyContactAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeId = formString(formData, "employeeId");
    const employeeHandle = formString(formData, "employeeHandle");
    const contactId = formString(formData, "contactId");

    if (!tenant || !employeeId || !employeeHandle || !contactId) {
      throw new Error("Hauptkontakt konnte nicht festgelegt werden.");
    }

    await setPrimaryEmergencyContact({ tenantSlug: tenant, employeeId, contactId });

    const path = employeePath(tenant, employeeHandle);
    revalidatePath(path);
    redirect(path);
  }, "Hauptkontakt festlegen");
}

export async function createEmployeeFolderTemplateAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const name = formString(formData, "name");

    if (!tenant || !name) {
      throw new Error("Ordnername ist erforderlich.");
    }

    await createEmployeeFolderTemplate({ tenantSlug: tenant, name });

    revalidatePath(employeesPath(tenant));
    redirect(employeesPath(tenant));
  }, "Ordnervorlage erstellen");
}

export async function deleteEmployeeAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeId = formString(formData, "employeeId");

    if (!tenant || !employeeId) {
      throw new Error("Mitarbeiter konnte nicht gelöscht werden.");
    }

    await deleteTenantEmployee({ tenantSlug: tenant, employeeId });

    revalidatePath(employeesPath(tenant));
    redirect(employeesPath(tenant));
  }, "Mitarbeiter löschen");
}

const RETENTION_CATEGORIES: RetentionCategory[] = [
  "personaldaten",
  "lohn_sozialversicherung",
  "gesundheit_freitext",
];

/**
 * Gezielter Einzelfall-Löschantrag (Löschkonzept, Teil 4.3): löscht/anonymisiert
 * ausschließlich die vom Bedienenden ausgewählten Kategorien, und nur, soweit
 * `getDeletionEligibilityForEmployee` sie als tatsächlich löschfähig ausweist
 * — nie mehr, unabhängig von der Auswahl. Ersatz für das
 * Alles-oder-nichts von `deleteEmployeeAction` bei laufender
 * Aufbewahrungspflicht.
 */
export async function deleteEmployeeDataByCategoryAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeId = formString(formData, "employeeId");
    const employeeHandle = formString(formData, "employeeHandle");
    const categories = formData
      .getAll("categories")
      .filter((value): value is RetentionCategory =>
        typeof value === "string" && RETENTION_CATEGORIES.includes(value as RetentionCategory),
      );

    if (!tenant || !employeeId || !employeeHandle || categories.length === 0) {
      throw new Error("Bitte mindestens eine Kategorie auswählen.");
    }

    await deleteEmployeeDataByCategory(tenant, employeeId, categories);

    revalidatePath(employeePath(tenant, employeeHandle));
    redirect(employeePath(tenant, employeeHandle));
  }, "Löschantrag ausführen");
}

export async function offboardEmployeeAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeId = formString(formData, "employeeId");
    const employeeHandle = formString(formData, "employeeHandle");
    const endDate = formString(formData, "endDate");

    if (!tenant || !employeeId || !employeeHandle || !endDate) {
      throw new Error("Bitte ein Austrittsdatum angeben.");
    }

    await offboardEmployee({
      tenantSlug: tenant,
      employeeId,
      endDate,
      reason: formString(formData, "reason"),
    });

    revalidatePath(employeesPath(tenant));
    redirect(employeePath(tenant, employeeHandle));
  }, "Mitarbeiter offboarden");
}

export async function reactivateEmployeeAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeId = formString(formData, "employeeId");
    const employeeHandle = formString(formData, "employeeHandle");

    if (!tenant || !employeeId || !employeeHandle) {
      throw new Error("Mitarbeiter konnte nicht reaktiviert werden.");
    }

    await reactivateEmployee({ tenantSlug: tenant, employeeId });

    revalidatePath(employeesPath(tenant));
    redirect(employeePath(tenant, employeeHandle));
  }, "Mitarbeiter reaktivieren");
}

export async function createEmployeeContractAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
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
      // Arbeitsort ist im Formular ein Multi-Select (LocationMultiSelectDropdown,
      // mehrere gleichnamige Hidden-Inputs) — analog zu `TenantTeam.locations`
      // als kommagetrennter String gespeichert, da `workLocation` auf
      // `TenantEmployeeContract` ein einzelnes String-Feld ist, keine Relation.
      workLocation: formStrings(formData, "workLocation").join(", "),
      weeklyHours: formString(formData, "weeklyHours"),
      compensation: formString(formData, "compensation"),
      vacationDays: Math.max(0, Number(formString(formData, "vacationDays", "0")) || 0),
      notes: formString(formData, "notes"),
    });

    const path = `${employeePath(tenant, employeeHandle)}?tab=contract`;
    revalidatePath(path);
    redirect(path);
  }, "Vertrag anlegen");
}

export async function updateEmployeeContractStatusAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
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
  }, "Vertragsstatus speichern");
}

export async function updateEmployeeContractDetailsAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeId = formString(formData, "employeeId");
    const employeeHandle = formString(formData, "employeeHandle");
    const contractId = formString(formData, "contractId");
    const title = formString(formData, "title");
    const startDate = formString(formData, "startDate");

    if (!tenant || !employeeId || !employeeHandle || !contractId || !title || !startDate) {
      throw new Error("Titel und Vertragsbeginn sind erforderlich.");
    }

    await updateEmployeeContractDetails({
      tenantSlug: tenant,
      employeeId,
      contractId,
      title,
      contractType: formString(formData, "contractType", "Arbeitsvertrag"),
      startDate,
      endDate: formString(formData, "endDate"),
      probationEndDate: formString(formData, "probationEndDate"),
      noticePeriod: formString(formData, "noticePeriod"),
      position: formString(formData, "position"),
      department: formString(formData, "department"),
      workLocation: formStrings(formData, "workLocation").join(", "),
      weeklyHours: formString(formData, "weeklyHours"),
      compensation: formString(formData, "compensation"),
      vacationDays: Math.max(0, Number(formString(formData, "vacationDays", "0")) || 0),
      notes: formString(formData, "notes"),
    });

    const path = `${employeePath(tenant, employeeHandle)}?tab=contract`;
    revalidatePath(path);
    redirect(path);
  }, "Vertragsdetails speichern");
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

/**
 * Upload für die strukturierten Ausweisdokument-/Zertifikat-Felder
 * (`EMPLOYEE_DOCUMENT_SLOTS`, siehe Mitarbeiter-Detailseite): fester
 * `folderSlug`/`folderName` statt freier Ordnerwahl — jedes Feld ist
 * ausschließlich für seine eine Kategorie gedacht. Bei Nicht-Mehrfach-Feldern
 * wird die vorherige Datei nach erfolgreichem Upload entfernt
 * (`replaceFileIds`, aus der bereits geladenen Dateiliste befüllt), damit
 * immer nur der aktuell gültige Nachweis besteht.
 */
export async function uploadEmployeeDocumentSlotAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeId = formString(formData, "employeeId");
    const employeeHandle = formString(formData, "employeeHandle");
    const folderSlug = formString(formData, "folderSlug");
    const folderName = formString(formData, "folderName");
    const documentType = formString(formData, "documentType");
    const replaceFileIds = formStrings(formData, "replaceFileIds");
    const file = formFile(formData);

    if (!tenant || !employeeId || !employeeHandle || !folderSlug || !file) {
      throw new Error("Datei konnte nicht hochgeladen werden.");
    }

    await uploadTenantFile({
      tenantSlug: tenant,
      file,
      ownerType: "employee",
      ownerId: employeeId,
      folderSlug,
      folderName,
      documentType,
    });

    for (const fileId of replaceFileIds) {
      await softDeleteTenantFile({ tenantSlug: tenant, fileId }).catch(() => {});
    }

    const path = `${employeePath(tenant, employeeHandle)}?tab=files`;
    revalidatePath(path);
    redirect(path);
  }, "Dokument hochladen");
}

/**
 * Einzelne Datei der Personalakte vor dem Mitarbeiter verbergen bzw. wieder
 * freigeben. Bewusst ohne `redirect`: der Aufrufer ist ein Umschalter mitten
 * in der Dateiliste, der danach nur neu laden soll — nicht die Seite wechseln.
 */
export async function setEmployeeFileVisibilityAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeHandle = formString(formData, "employeeHandle");
    const fileId = formString(formData, "fileId");
    const hidden = formString(formData, "hidden") === "true";

    if (!tenant || !employeeHandle || !fileId) {
      throw new Error("Sichtbarkeit konnte nicht geändert werden.");
    }

    await setTenantFileEmployeeVisibility({ tenantSlug: tenant, fileId, hidden });

    revalidatePath(`${employeePath(tenant, employeeHandle)}?tab=files`);
  }, "Sichtbarkeit ändern");
}

/** Wie oben, aber für einen ganzen Ordner (inkl. Inhalt und Unterordnern). */
export async function setEmployeeFolderVisibilityAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeHandle = formString(formData, "employeeHandle");
    const employeeId = formString(formData, "employeeId");
    const path = formString(formData, "path");
    const hidden = formString(formData, "hidden") === "true";

    if (!tenant || !employeeHandle || !employeeId || !path) {
      throw new Error("Sichtbarkeit konnte nicht geändert werden.");
    }

    await setTenantFileFolderEmployeeVisibility({
      tenantSlug: tenant,
      employeeId,
      path,
      hidden,
    });

    revalidatePath(`${employeePath(tenant, employeeHandle)}?tab=files`);
  }, "Sichtbarkeit ändern");
}

export async function deleteEmployeeDocumentSlotFileAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeHandle = formString(formData, "employeeHandle");
    const fileId = formString(formData, "fileId");

    if (!tenant || !employeeHandle || !fileId) {
      throw new Error("Datei konnte nicht entfernt werden.");
    }

    await softDeleteTenantFile({ tenantSlug: tenant, fileId });

    const path = `${employeePath(tenant, employeeHandle)}?tab=files`;
    revalidatePath(path);
    redirect(path);
  }, "Datei entfernen");
}

/** App-Zugang sperren bzw. freigeben (M2). Ohne Weiterleitung — die Akte lädt neu. */
export async function setEmployeeAccessLockAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeId = formString(formData, "employeeId");
    const employeeHandle = formString(formData, "employeeHandle");

    if (!tenant || !employeeId) {
      throw new Error("Mitarbeiter wurde nicht gefunden.");
    }

    await setEmployeeAppAccessLock({
      tenantSlug: tenant,
      employeeId,
      locked: formString(formData, "locked") === "1",
      reason: formString(formData, "reason"),
    });

    revalidatePath(employeesPath(tenant));

    if (employeeHandle) {
      revalidatePath(employeePath(tenant, employeeHandle));
    }

    return { success: true };
  }, "App-Zugang ändern");
}

export type EmployeeImportRow = {
  firstName: string;
  lastName: string;
  email?: string;
  employeeNumber?: string;
  location?: string;
  team?: string;
  contract?: string;
  weeklyHours?: string;
  startDate?: string;
};

export type EmployeeImportResult = {
  error?: string;
  created?: number;
  failed?: Array<{ row: number; name: string; error: string }>;
};

/**
 * CSV-Import (neues Design, "Importieren"): legt jede Zeile wie das
 * Anlegen-Formular über `createTenantEmployee` an — gleiche Prüfungen
 * (Pflichtfelder, eindeutige E-Mail, Tarifgrenze, bekannte Standorte/Teams).
 * Fehlerhafte Zeilen werden übersprungen und gemeldet.
 */
export async function importEmployeesAction(
  _prevState: EmployeeImportResult,
  formData: FormData,
): Promise<EmployeeImportResult> {
  const tenant = formString(formData, "tenant");
  let rows: EmployeeImportRow[] = [];

  try {
    rows = JSON.parse(formString(formData, "rows") || "[]") as EmployeeImportRow[];
  } catch {
    return { error: "Die Importdaten konnten nicht gelesen werden." };
  }

  if (!tenant || !Array.isArray(rows) || rows.length === 0) {
    return { error: "Keine Zeilen zum Importieren." };
  }

  if (rows.length > 500) {
    return { error: "Bitte höchstens 500 Zeilen auf einmal importieren." };
  }

  let created = 0;
  const failed: NonNullable<EmployeeImportResult["failed"]> = [];

  for (const [index, row] of rows.entries()) {
    const name = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();

    try {
      await createTenantEmployee({
        tenantSlug: tenant,
        firstName: String(row.firstName ?? "").trim(),
        lastName: String(row.lastName ?? "").trim(),
        email: String(row.email ?? "").trim(),
        employeeNumber: String(row.employeeNumber ?? "").trim(),
        location: String(row.location ?? "").trim(),
        team: String(row.team ?? "").trim(),
        contract: String(row.contract ?? "").trim() || "Unbefristet",
        weeklyHours: String(row.weeklyHours ?? "").trim(),
        startDate: String(row.startDate ?? "").trim(),
        role: "Mitarbeiter",
        status: "active",
      });
      created += 1;
    } catch (error) {
      failed.push({
        row: index + 2,
        name: name || "–",
        error: error instanceof Error ? error.message : "Unbekannter Fehler",
      });
    }
  }

  revalidatePath(employeesPath(tenant));

  return { created, failed };
}
