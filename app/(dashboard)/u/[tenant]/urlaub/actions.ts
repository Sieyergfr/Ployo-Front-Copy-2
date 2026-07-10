"use server";

import {
  createTenantVacationRequest,
  deleteTenantVacationRequest,
  setTenantVacationRequestStatus,
} from "@/lib/vacation-service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : fallback;
}

function vacationPath(tenant: string) {
  return `/u/${tenant}/urlaub`;
}

export async function createVacationRequestAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const employeeId = formString(formData, "employeeId");
  const startDate = formString(formData, "startDate");
  const endDate = formString(formData, "endDate");

  if (!tenant || !employeeId || !startDate || !endDate) {
    throw new Error("Urlaubsantrag konnte nicht erstellt werden.");
  }

  await createTenantVacationRequest({
    tenantSlug: tenant,
    employeeId,
    startDate,
    endDate,
    note: formString(formData, "note"),
  });

  revalidatePath(vacationPath(tenant));
  redirect(vacationPath(tenant));
}

export async function approveVacationRequestAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const requestId = formString(formData, "requestId");

  if (!tenant || !requestId) {
    throw new Error("Urlaubsantrag konnte nicht genehmigt werden.");
  }

  await setTenantVacationRequestStatus({
    tenantSlug: tenant,
    requestId,
    status: "approved",
  });

  revalidatePath(vacationPath(tenant));
  redirect(vacationPath(tenant));
}

export async function rejectVacationRequestAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const requestId = formString(formData, "requestId");

  if (!tenant || !requestId) {
    throw new Error("Urlaubsantrag konnte nicht abgelehnt werden.");
  }

  await setTenantVacationRequestStatus({
    tenantSlug: tenant,
    requestId,
    status: "rejected",
  });

  revalidatePath(vacationPath(tenant));
  redirect(vacationPath(tenant));
}

export async function deleteVacationRequestAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const requestId = formString(formData, "requestId");

  if (!tenant || !requestId) {
    throw new Error("Urlaubsantrag konnte nicht geloescht werden.");
  }

  await deleteTenantVacationRequest({ tenantSlug: tenant, requestId });

  revalidatePath(vacationPath(tenant));
  redirect(vacationPath(tenant));
}
