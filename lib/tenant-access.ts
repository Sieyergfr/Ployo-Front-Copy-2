import { cache } from "react";
import { permissionLevels, type PermissionLevel } from "@/lib/roles";

export type TenantPermissionArea =
  | "employees" | "payroll" | "locations" | "teams" | "files"
  | "vacation" | "sickness" | "shifts" | "reminders" | "audit"
  | "roles" | "settings";

export type TenantAccess = {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  userName: string;
  membershipRole: string;
  roleId: string | null;
  permissionLevel: PermissionLevel;
};

const getSessionUser = cache(async () => {
  const [{ headers }, { auth }] = await Promise.all([
    import("next/headers"),
    import("@/lib/auth"),
  ]);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session.user;
});

function hasRequiredLevel(actual: PermissionLevel, required: PermissionLevel) {
  return permissionLevels.indexOf(actual) >= permissionLevels.indexOf(required);
}

/** Central authorization boundary for every tenant-scoped DAL read and write. */
export async function requireTenantAccess(
  tenantSlug: string,
  area: TenantPermissionArea,
  required: PermissionLevel = "read",
): Promise<TenantAccess> {
  const { prisma } = await import("@/lib/prisma");
  const user = await getSessionUser();
  const membership = await prisma.tenantMembership.findFirst({
    where: { userId: user.id, tenant: { slug: tenantSlug } },
    select: {
      role: true,
      roleId: true,
      tenant: { select: { id: true, slug: true } },
      roleRef: {
        select: {
          permissions: { where: { area }, select: { level: true }, take: 1 },
        },
      },
    },
  });

  if (!membership) throw new Error("FORBIDDEN");

  const membershipRole = membership.role.toUpperCase();
  const isTenantManager = ["OWNER", "ADMIN", "HR"].includes(membershipRole);
  const rawLevel = membership.roleRef?.permissions[0]?.level;
  const permissionLevel = permissionLevels.includes(rawLevel as PermissionLevel)
    ? (rawLevel as PermissionLevel)
    : "none";

  if (!isTenantManager && !hasRequiredLevel(permissionLevel, required)) {
    throw new Error("FORBIDDEN");
  }

  return {
    tenantId: membership.tenant.id,
    tenantSlug: membership.tenant.slug,
    userId: user.id,
    userName: user.name || user.email,
    membershipRole,
    roleId: membership.roleId,
    permissionLevel: isTenantManager ? "admin" : permissionLevel,
  };
}
