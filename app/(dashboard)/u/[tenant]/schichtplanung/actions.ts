"use server";

import {
  createTenantShift,
  deleteTenantShift,
  updateTenantShift,
} from "@/lib/shift-service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : fallback;
}

function formInt(formData: FormData, key: string, fallback = 0) {
  const parsed = Number.parseInt(formString(formData, key), 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function shiftsPath(tenant: string, year?: string, week?: string) {
  const path = `/u/${tenant}/schichtplanung`;

  return year && week ? `${path}?year=${year}&week=${week}` : path;
}

function redirectPath(formData: FormData, tenant: string) {
  const returnTo = formString(formData, "returnTo");

  if (returnTo.startsWith(`/u/${tenant}/`)) {
    return returnTo;
  }

  return shiftsPath(tenant, formString(formData, "year"), formString(formData, "week"));
}

function revalidateShiftViews(formData: FormData, tenant: string) {
  revalidatePath(`/u/${tenant}/schichtplanung`);

  const returnTo = formString(formData, "returnTo");

  if (returnTo.startsWith(`/u/${tenant}/`)) {
    revalidatePath(returnTo.split("?")[0]);
  }
}

export async function createShiftAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const date = formString(formData, "date");
  const startTime = formString(formData, "startTime");
  const endTime = formString(formData, "endTime");

  if (!tenant || !date || !startTime || !endTime) {
    throw new Error("Schicht konnte nicht erstellt werden.");
  }

  await createTenantShift({
    tenantSlug: tenant,
    date,
    startTime,
    endTime,
    breakMinutes: formInt(formData, "breakMinutes", 30),
    employeeId: formString(formData, "employeeId") || undefined,
    locationId: formString(formData, "locationId") || undefined,
    team: formString(formData, "team"),
    note: formString(formData, "note"),
  });

  revalidateShiftViews(formData, tenant);
  redirect(redirectPath(formData, tenant));
}

export async function updateShiftAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const shiftId = formString(formData, "shiftId");
  const date = formString(formData, "date");
  const startTime = formString(formData, "startTime");
  const endTime = formString(formData, "endTime");

  if (!tenant || !shiftId || !date || !startTime || !endTime) {
    throw new Error("Schicht konnte nicht gespeichert werden.");
  }

  await updateTenantShift({
    tenantSlug: tenant,
    shiftId,
    date,
    startTime,
    endTime,
    breakMinutes: formInt(formData, "breakMinutes", 30),
    employeeId: formString(formData, "employeeId") || undefined,
    locationId: formString(formData, "locationId") || undefined,
    team: formString(formData, "team"),
    note: formString(formData, "note"),
  });

  revalidateShiftViews(formData, tenant);
  redirect(redirectPath(formData, tenant));
}

export async function deleteShiftAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const shiftId = formString(formData, "shiftId");

  if (!tenant || !shiftId) {
    throw new Error("Schicht konnte nicht geloescht werden.");
  }

  await deleteTenantShift({ tenantSlug: tenant, shiftId });

  revalidateShiftViews(formData, tenant);
  redirect(redirectPath(formData, tenant));
}
