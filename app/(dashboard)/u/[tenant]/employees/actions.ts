"use server";

import {
  createTenantEmployee,
  deleteTenantEmployee,
  updateTenantEmployee,
} from "@/lib/employee-service";
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

function employeesPath(tenant: string) {
  return `/u/${tenant}/employees`;
}

function employeePath(tenant: string, employeeHandle: string) {
  return `${employeesPath(tenant)}/${employeeHandle}`;
}

export async function createEmployeeAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const firstName = formString(formData, "firstName");
  const lastName = formString(formData, "lastName");
  const email = formString(formData, "email");

  if (!tenant || (!firstName && !lastName && !email)) {
    throw new Error("Name oder E-Mail ist erforderlich.");
  }

  const employee = await createTenantEmployee({
    tenantSlug: tenant,
    firstName,
    lastName,
    email,
    location: formString(formData, "location"),
    team: formString(formData, "team"),
    role: formString(formData, "role", "Mitarbeiter"),
    startDate: formString(formData, "startDate"),
    contract: formString(formData, "contract", "Unbefristet"),
    weeklyHours: formString(formData, "weeklyHours", "38 Std/Woche"),
    status: formString(formData, "status", "active"),
  });

  revalidatePath(employeesPath(tenant));
  redirect(employeePath(tenant, employee.key ?? employee.id));
}

export async function updateEmployeeAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const employeeId = formString(formData, "employeeId");
  const activeTab = formString(formData, "activeTab");
  const contractDetailsSubmitted = formData.get("contractDetailsSubmitted") === "1";

  if (!tenant || !employeeId) {
    throw new Error("Mitarbeiter konnte nicht gespeichert werden.");
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
    privateAddress: optionalString(formData, "privateAddress"),
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
    address: optionalString(formData, "address"),
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
  });

  revalidatePath(employeesPath(tenant));
  redirect(
    activeTab === "contract"
      ? `${employeePath(tenant, employee.key ?? employee.id)}?tab=contract`
      : employeePath(tenant, employee.key ?? employee.id),
  );
}

export async function deleteEmployeeAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const employeeId = formString(formData, "employeeId");

  if (!tenant || !employeeId) {
    throw new Error("Mitarbeiter konnte nicht geloescht werden.");
  }

  await deleteTenantEmployee({ tenantSlug: tenant, employeeId });

  revalidatePath(employeesPath(tenant));
  redirect(employeesPath(tenant));
}
