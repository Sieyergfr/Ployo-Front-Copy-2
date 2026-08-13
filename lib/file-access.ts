import {
  requireTenantAccess,
  type TenantAccess,
  type TenantPermissionArea,
} from "@/lib/tenant-access";

export type FileAclRecord = {
  accessRoleIdsJson: unknown;
  accessUserIdsJson: unknown;
};

function parseIds(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function canAccessFileAcl(file: FileAclRecord, access: TenantAccess) {
  if (["OWNER", "ADMIN", "HR"].includes(access.membershipRole)) return true;

  const roleIds = parseIds(file.accessRoleIdsJson);
  const userIds = parseIds(file.accessUserIdsJson);
  if (roleIds.length === 0 && userIds.length === 0) return true;

  return userIds.includes(access.userId) || Boolean(access.roleId && roleIds.includes(access.roleId));
}

export function requireFileAcl(file: FileAclRecord, access: TenantAccess) {
  if (!canAccessFileAcl(file, access)) throw new Error("FORBIDDEN");
}

export async function getOptionalFileReadAccess(tenantSlug: string) {
  try {
    return await requireTenantAccess(tenantSlug, "files", "read");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return null;
    throw error;
  }
}

/**
 * Wie `getOptionalFileReadAccess`, aber für Dokumente, die an einen
 * Fachbereich statt an das eigenständige Dateien-Modul gebunden sind
 * (Personalakte-Dokumente, Standort-Dokumente, ...) — prüft `canViewFiles`
 * des jeweiligen Bereichs statt des globalen `files`-Levels. `null` bedeutet
 * "keine Datei aus diesem Bereich anzeigen", nicht "alle anzeigen".
 */
export async function getOptionalAreaFileAccess(
  tenantSlug: string,
  area: TenantPermissionArea,
) {
  try {
    const access = await requireTenantAccess(tenantSlug, area, "read");

    return access.canViewFiles ? access : null;
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return null;
    throw error;
  }
}
