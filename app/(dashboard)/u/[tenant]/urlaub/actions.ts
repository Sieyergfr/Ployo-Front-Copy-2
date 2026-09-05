"use server";

import {
  createTenantVacationRequest,
  deleteTenantVacationRequest,
  setTenantVacationRequestStatus,
  updateTenantVacationRequest,
} from "@/lib/vacation-service";
import { type ActionState, withActionErrorHandling } from "@/lib/action-state";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : fallback;
}

function vacationPath(tenant: string) {
  return `/u/${tenant}/urlaub`;
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;

  return new Date(Number(year), Number(month) - 1, Number(day));
}

function todayDateOnly() {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function createVacationRequestAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const employeeId = formString(formData, "employeeId");
    const startDate = formString(formData, "startDate");
    const endDate = formString(formData, "endDate");

    if (!tenant || !employeeId || !startDate || !endDate) {
      throw new Error("Urlaubsantrag konnte nicht erstellt werden.");
    }

    const parsedStartDate = parseDateOnly(startDate);
    const parsedEndDate = parseDateOnly(endDate);
    const today = todayDateOnly();

    if (!parsedStartDate || !parsedEndDate) {
      throw new Error("Bitte gültige Datumswerte auswählen.");
    }

    if (parsedStartDate < today || parsedEndDate < today) {
      throw new Error("Urlaubsantrag darf nicht in der Vergangenheit liegen.");
    }

    if (parsedEndDate < parsedStartDate) {
      throw new Error("Das Enddatum darf nicht vor dem Startdatum liegen.");
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
  }, "Urlaubsantrag erstellen");
}

export async function updateVacationRequestAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const requestId = formString(formData, "requestId");
    const startDate = formString(formData, "startDate");
    const endDate = formString(formData, "endDate");

    if (!tenant || !requestId || !startDate || !endDate) {
      throw new Error("Urlaubsantrag konnte nicht aktualisiert werden.");
    }

    await updateTenantVacationRequest({
      tenantSlug: tenant,
      requestId,
      startDate,
      endDate,
      note: formString(formData, "note"),
    });

    revalidatePath(vacationPath(tenant));
    redirect(vacationPath(tenant));
  }, "Urlaubsantrag speichern");
}

export async function approveVacationRequestAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
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
  }, "Urlaubsantrag genehmigen");
}

export async function rejectVacationRequestAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
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
  }, "Urlaubsantrag ablehnen");
}

export async function deleteVacationRequestAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const requestId = formString(formData, "requestId");

    if (!tenant || !requestId) {
      throw new Error("Urlaubsantrag konnte nicht gelöscht werden.");
    }

    await deleteTenantVacationRequest({ tenantSlug: tenant, requestId });

    revalidatePath(vacationPath(tenant));
    redirect(vacationPath(tenant));
  }, "Urlaubsantrag löschen");
}
