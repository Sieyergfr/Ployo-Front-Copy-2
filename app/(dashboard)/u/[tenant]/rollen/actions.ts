"use server";

import {
  appOverviewFromFormData,
  canDeleteFromFormData,
  canEditFilesFromFormData,
  canUploadFilesFromFormData,
  canViewAuditFromFormData,
  canViewFilesFromFormData,
  createTenantRole,
  deleteTenantRole,
  permissionsFromFormData,
  scopesFromFormData,
  shiftsLevelFromFormData,
  updateTenantRole,
} from "@/lib/role-service";
import { type ActionState, withActionErrorHandling } from "@/lib/action-state";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : fallback;
}

function rolesPath(tenant: string) {
  return `/u/${tenant}/rollen`;
}

export async function createRoleAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
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
      appOverviewEnabled: appOverviewFromFormData(formData),
      permissions: permissionsFromFormData(formData),
      scopes: scopesFromFormData(formData),
      canDelete: canDeleteFromFormData(formData),
      canUploadFiles: canUploadFilesFromFormData(formData),
      canEditFiles: canEditFilesFromFormData(formData),
      canViewFiles: canViewFilesFromFormData(formData),
      canViewAudit: canViewAuditFromFormData(formData),
      shiftsLevel: shiftsLevelFromFormData(formData),
    });

    revalidatePath(rolesPath(tenant));
    redirect(`${rolesPath(tenant)}/${role.id}`);
  }, "Rolle erstellen");
}

export async function updateRoleAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
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
      appOverviewEnabled: appOverviewFromFormData(formData),
      permissions: permissionsFromFormData(formData),
      scopes: scopesFromFormData(formData),
      canDelete: canDeleteFromFormData(formData),
      canUploadFiles: canUploadFilesFromFormData(formData),
      canEditFiles: canEditFilesFromFormData(formData),
      canViewFiles: canViewFilesFromFormData(formData),
      canViewAudit: canViewAuditFromFormData(formData),
      shiftsLevel: shiftsLevelFromFormData(formData),
    });

    revalidatePath(rolesPath(tenant));
    revalidatePath(`${rolesPath(tenant)}/${roleId}`);
    redirect(`${rolesPath(tenant)}/${roleId}`);
  }, "Rolle speichern");
}

export async function deleteRoleAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");
    const roleId = formString(formData, "roleId");

    if (!tenant || !roleId) {
      throw new Error("Rolle konnte nicht gelöscht werden.");
    }

    await deleteTenantRole({
      tenantSlug: tenant,
      roleId,
    });

    revalidatePath(rolesPath(tenant));
    redirect(rolesPath(tenant));
  }, "Rolle löschen");
}
