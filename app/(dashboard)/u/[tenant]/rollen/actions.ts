"use server";

import {
  createTenantRole,
  deleteTenantRole,
  permissionsFromFormData,
  updateTenantRole,
} from "@/lib/role-service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : fallback;
}

function rolesPath(tenant: string) {
  return `/u/${tenant}/rollen`;
}

export async function createRoleAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const name = formString(formData, "name");
  const description = formString(formData, "description");

  if (!tenant || !name) {
    throw new Error("Rollenname ist erforderlich.");
  }

  const role = await createTenantRole({
    tenantSlug: tenant,
    name,
    description,
    permissions: permissionsFromFormData(formData),
  });

  revalidatePath(rolesPath(tenant));
  redirect(`${rolesPath(tenant)}/${role.id}`);
}

export async function updateRoleAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const roleId = formString(formData, "roleId");
  const name = formString(formData, "name");
  const description = formString(formData, "description");

  if (!tenant || !roleId || !name) {
    throw new Error("Rollenname ist erforderlich.");
  }

  await updateTenantRole({
    tenantSlug: tenant,
    roleId,
    name,
    description,
    permissions: permissionsFromFormData(formData),
  });

  revalidatePath(rolesPath(tenant));
  revalidatePath(`${rolesPath(tenant)}/${roleId}`);
  redirect(`${rolesPath(tenant)}/${roleId}`);
}

export async function deleteRoleAction(formData: FormData) {
  const tenant = formString(formData, "tenant");
  const roleId = formString(formData, "roleId");

  if (!tenant || !roleId) {
    throw new Error("Rolle konnte nicht geloescht werden.");
  }

  await deleteTenantRole({
    tenantSlug: tenant,
    roleId,
  });

  revalidatePath(rolesPath(tenant));
  redirect(rolesPath(tenant));
}
