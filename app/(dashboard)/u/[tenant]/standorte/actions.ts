"use server";

import {
  createTenantLocation,
  deleteTenantLocation,
  updateTenantLocation,
} from "@/lib/location-service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : fallback;
}

function locationsPath(tenant: string) {
  return `/u/${tenant}/standorte`;
}

function locationPath(tenant: string, locationHandle: string) {
  return `${locationsPath(tenant)}/${locationHandle}`;
}

export async function createLocationAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const name = formString(formData, "name");

  if (!tenant || !name) {
    throw new Error("Standortname ist erforderlich.");
  }

  const location = await createTenantLocation({
    tenantSlug: tenant,
    name,
    kind: formString(formData, "kind", "Standort"),
    status: formString(formData, "status", "active"),
    street: formString(formData, "address"),
    postalCode: formString(formData, "postalCode"),
    city: formString(formData, "city"),
    leadEmployeeId: formString(formData, "lead") || undefined,
    email: formString(formData, "email"),
    accentClassName: formString(formData, "color", "bg-ink"),
  });

  revalidatePath(locationsPath(tenant));
  redirect(locationPath(tenant, location.key));
}

export async function updateLocationAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const locationId = formString(formData, "locationId");
  const name = formString(formData, "name");

  if (!tenant || !locationId || !name) {
    throw new Error("Standort konnte nicht gespeichert werden.");
  }

  const location = await updateTenantLocation({
    tenantSlug: tenant,
    locationId,
    name,
    kind: formString(formData, "kind", "Standort"),
    address: formString(formData, "address"),
    status: formString(formData, "status", "active"),
    employeeCount: formString(formData, "employeeCount"),
    activeToday: formString(formData, "activeToday"),
    shiftCount: formString(formData, "shiftCount"),
    openPositions: formString(formData, "openPositions"),
    utilization: formString(formData, "utilization"),
    utilizationCaption: formString(formData, "utilizationCaption"),
    leadName: formString(formData, "leadName"),
    leadInitials: formString(formData, "leadInitials"),
    leadPhone: formString(formData, "leadPhone"),
    leadEmail: formString(formData, "leadEmail"),
  });

  revalidatePath(locationsPath(tenant));
  redirect(locationPath(tenant, location.key));
}

export async function deleteLocationAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const locationId = formString(formData, "locationId");

  if (!tenant || !locationId) {
    throw new Error("Standort konnte nicht geloescht werden.");
  }

  await deleteTenantLocation({
    tenantSlug: tenant,
    locationId,
  });

  revalidatePath(locationsPath(tenant));
  redirect(locationsPath(tenant));
}
