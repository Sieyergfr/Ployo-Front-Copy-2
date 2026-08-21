"use server";

import {
  applyShiftTemplateToWeek,
  createTenantShift,
  deleteShiftTemplate,
  deleteTenantShift,
  publishShiftWeek,
  saveShiftTemplateFromWeek,
  unpublishShiftWeek,
  updateShiftTemplate,
  updateTenantShift,
} from "@/lib/shift-service";
import type { ShiftTemplateEntry, TemplateWeekday } from "@/lib/shift-templates";
import {
  createTenantWishFreeRequest,
  setTenantWishFreeRequestStatus,
} from "@/lib/wish-free-service";
import { updateTenantShiftSettings } from "@/lib/settings-service";
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

function formStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string");
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

export async function updateShiftSettingsAction(formData: FormData) {
  const tenant = formString(formData, "tenant");

  if (!tenant) {
    throw new Error("Planungseinstellungen konnten nicht gespeichert werden.");
  }

  await updateTenantShiftSettings({
    tenantSlug: tenant,
    weekStart: formString(formData, "weekStart"),
    minStaffing: formString(formData, "minStaffing"),
    breakRule: formString(formData, "breakRule"),
    presetsJson: formString(formData, "presets", "[]"),
    defaultOpeningHoursJson: formString(formData, "defaultOpeningHours", "[]"),
  });

  revalidateShiftViews(formData, tenant);
  redirect(redirectPath(formData, tenant));
}

export async function publishShiftWeekAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const year = Number.parseInt(formString(formData, "year"), 10);
  const week = Number.parseInt(formString(formData, "week"), 10);

  if (!tenant || !year || !week) {
    throw new Error("Schichtplan konnte nicht veröffentlicht werden.");
  }

  await publishShiftWeek({ tenantSlug: tenant, year, week });

  revalidateShiftViews(formData, tenant);
  redirect(redirectPath(formData, tenant));
}

export async function unpublishShiftWeekAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const year = Number.parseInt(formString(formData, "year"), 10);
  const week = Number.parseInt(formString(formData, "week"), 10);

  if (!tenant || !year || !week) {
    throw new Error("Schichtplan konnte nicht auf Entwurf zurückgesetzt werden.");
  }

  await unpublishShiftWeek({ tenantSlug: tenant, year, week });

  revalidateShiftViews(formData, tenant);
  redirect(redirectPath(formData, tenant));
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
    throw new Error("Schicht konnte nicht gelöscht werden.");
  }

  await deleteTenantShift({ tenantSlug: tenant, shiftId });

  revalidateShiftViews(formData, tenant);
  redirect(redirectPath(formData, tenant));
}

export async function saveShiftTemplateAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const year = Number.parseInt(formString(formData, "year"), 10);
  const week = Number.parseInt(formString(formData, "week"), 10);
  const name = formString(formData, "templateName");

  if (!tenant || !year || !week || !name) {
    throw new Error("Vorlage konnte nicht gespeichert werden.");
  }

  await saveShiftTemplateFromWeek({ tenantSlug: tenant, year, week, name });

  revalidateShiftViews(formData, tenant);
  redirect(redirectPath(formData, tenant));
}

export async function applyShiftTemplateAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const year = Number.parseInt(formString(formData, "year"), 10);
  const week = Number.parseInt(formString(formData, "week"), 10);
  const templateId = formString(formData, "templateId");

  if (!tenant || !year || !week || !templateId) {
    throw new Error("Vorlage konnte nicht angewendet werden.");
  }

  await applyShiftTemplateToWeek({ tenantSlug: tenant, templateId, year, week });

  revalidateShiftViews(formData, tenant);
  redirect(redirectPath(formData, tenant));
}

export async function updateShiftTemplateAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const templateId = formString(formData, "templateId");
  const name = formString(formData, "templateName");

  if (!tenant || !templateId || !name) {
    throw new Error("Vorlage konnte nicht gespeichert werden.");
  }

  const weekdays = formStrings(formData, "entryWeekday");
  const startTimes = formStrings(formData, "entryStartTime");
  const endTimes = formStrings(formData, "entryEndTime");
  const breakMinutes = formStrings(formData, "entryBreakMinutes");
  const teams = formStrings(formData, "entryTeam");
  const locationIds = formStrings(formData, "entryLocationId");
  const entries: ShiftTemplateEntry[] = weekdays.map((weekday, index) => ({
    weekday: weekday as TemplateWeekday,
    startTime: startTimes[index] ?? "",
    endTime: endTimes[index] ?? "",
    breakMinutes: Number.parseInt(breakMinutes[index] ?? "0", 10) || 0,
    team: teams[index] ?? "",
    locationId: locationIds[index] ?? "",
  }));

  await updateShiftTemplate({ tenantSlug: tenant, templateId, name, entries });

  revalidateShiftViews(formData, tenant);
  redirect(redirectPath(formData, tenant));
}

export async function deleteShiftTemplateAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const templateId = formString(formData, "templateId");

  if (!tenant || !templateId) {
    throw new Error("Vorlage konnte nicht gelöscht werden.");
  }

  await deleteShiftTemplate({ tenantSlug: tenant, templateId });

  revalidateShiftViews(formData, tenant);
  redirect(redirectPath(formData, tenant));
}

export async function createWishFreeRequestAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const employeeId = formString(formData, "employeeId");
  const date = formString(formData, "date");

  if (!tenant || !employeeId || !date) {
    throw new Error("Wunschfrei Anfrage konnte nicht erstellt werden.");
  }

  await createTenantWishFreeRequest({
    tenantSlug: tenant,
    employeeId,
    date,
    reason: formString(formData, "reason"),
  });

  revalidateShiftViews(formData, tenant);
  redirect(redirectPath(formData, tenant));
}

export async function approveWishFreeRequestAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const requestId = formString(formData, "requestId");

  if (!tenant || !requestId) {
    throw new Error("Wunschfrei Anfrage konnte nicht genehmigt werden.");
  }

  await setTenantWishFreeRequestStatus({
    tenantSlug: tenant,
    requestId,
    status: "approved",
  });

  revalidateShiftViews(formData, tenant);
  redirect(redirectPath(formData, tenant));
}

export async function rejectWishFreeRequestAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const requestId = formString(formData, "requestId");

  if (!tenant || !requestId) {
    throw new Error("Wunschfrei Anfrage konnte nicht abgelehnt werden.");
  }

  await setTenantWishFreeRequestStatus({
    tenantSlug: tenant,
    requestId,
    status: "rejected",
    rejectReason: formString(formData, "rejectReason"),
  });

  revalidateShiftViews(formData, tenant);
  redirect(redirectPath(formData, tenant));
}
