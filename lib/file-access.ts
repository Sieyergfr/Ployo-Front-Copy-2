import { requireTenantAccess, type TenantAccess } from "@/lib/tenant-access";

export type FileAclRecord = {
  accessRoleIdsJson: string;
  accessUserIdsJson: string;
};

function parseIds(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
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
