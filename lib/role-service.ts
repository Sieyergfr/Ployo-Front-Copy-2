import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  defaultPermissionRoles,
  emptyPermissionSet,
  normalizePermissionLevel,
  normalizeRoleKey,
  permissionAreas,
  type PermissionLevel,
  type PermissionRole,
} from "@/lib/roles";
import { headers } from "next/headers";

type RoleRecord = {
  id: string;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: Array<{ area: string; level: string }>;
  _count: {
    memberships: number;
  };
};

async function getSessionUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user?.id ?? null;
}

function toPermissionMap(
  permissions: Array<{ area: string; level: string }>,
): Record<string, PermissionLevel> {
  const permissionMap = emptyPermissionSet();

  for (const permission of permissions) {
    permissionMap[permission.area] = normalizePermissionLevel(permission.level);
  }

  return permissionMap;
}

function toPermissionRole(role: RoleRecord): PermissionRole {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    members: role._count.memberships,
    isSystem: role.isSystem,
    permissions: toPermissionMap(role.permissions),
  };
}

export async function ensureTenantDefaultRoles(tenantSlug: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });

  if (!tenant) {
    return null;
  }

  await prisma.$transaction(
    defaultPermissionRoles.map((role) =>
      prisma.tenantRole.upsert({
        where: {
          tenantId_key: {
            tenantId: tenant.id,
            key: role.key,
          },
        },
        update: {},
        create: {
          tenantId: tenant.id,
          key: role.key,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          permissions: {
            create: permissionAreas.map((area) => ({
              area: area.id,
              level: role.permissions[area.id] ?? "none",
            })),
          },
        },
      }),
    ),
  );

  return tenant.id;
}

export async function getRolesForTenant(tenantSlug: string) {
  const tenantId = await ensureTenantDefaultRoles(tenantSlug);

  if (!tenantId) {
    return null;
  }

  const roles = await prisma.tenantRole.findMany({
    where: { tenantId },
    orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
    include: {
      permissions: true,
      _count: {
        select: {
          memberships: true,
        },
      },
    },
  });

  return roles.map(toPermissionRole);
}

export async function getRoleForTenant(tenantSlug: string, roleId: string) {
  const tenantId = await ensureTenantDefaultRoles(tenantSlug);

  if (!tenantId) {
    return null;
  }

  const role = await prisma.tenantRole.findFirst({
    where: {
      id: roleId,
      tenantId,
    },
    include: {
      permissions: true,
      _count: {
        select: {
          memberships: true,
        },
      },
    },
  });

  return role ? toPermissionRole(role) : null;
}

export function permissionsFromFormData(formData: FormData) {
  return Object.fromEntries(
    permissionAreas.map((area) => [
      area.id,
      normalizePermissionLevel(formData.get(`permission-${area.id}`)),
    ]),
  ) as Record<string, PermissionLevel>;
}

export async function requireRoleManager(tenantSlug: string) {
  const userId = await getSessionUserId();

  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId,
      tenant: {
        slug: tenantSlug,
      },
    },
    include: {
      roleRef: {
        include: {
          permissions: true,
        },
      },
      tenant: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  });

  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  const tenantWideManager = ["OWNER", "ADMIN", "HR"].includes(membership.role);
  const rolePermission = membership.roleRef?.permissions.find(
    (permission) => permission.area === "roles",
  );
  const customRoleManager = rolePermission?.level === "admin";

  if (!tenantWideManager && !customRoleManager) {
    throw new Error("FORBIDDEN");
  }

  return {
    tenantId: membership.tenant.id,
    tenantSlug: membership.tenant.slug,
    userId,
  };
}

export async function createTenantRole(input: {
  tenantSlug: string;
  name: string;
  description: string;
  permissions: Record<string, PermissionLevel>;
}) {
  const access = await requireRoleManager(input.tenantSlug);
  const keyBase = normalizeRoleKey(input.name) || "rolle";
  let key = keyBase;
  let suffix = 2;

  while (
    await prisma.tenantRole.findUnique({
      where: {
        tenantId_key: {
          tenantId: access.tenantId,
          key,
        },
      },
      select: { id: true },
    })
  ) {
    key = `${keyBase}-${suffix}`;
    suffix += 1;
  }

  return prisma.tenantRole.create({
    data: {
      tenantId: access.tenantId,
      key,
      name: input.name.trim(),
      description: input.description.trim(),
      permissions: {
        create: permissionAreas.map((area) => ({
          area: area.id,
          level: input.permissions[area.id] ?? "none",
        })),
      },
    },
  });
}

export async function updateTenantRole(input: {
  tenantSlug: string;
  roleId: string;
  name: string;
  description: string;
  permissions: Record<string, PermissionLevel>;
}) {
  const access = await requireRoleManager(input.tenantSlug);
  const role = await prisma.tenantRole.findFirst({
    where: {
      id: input.roleId,
      tenantId: access.tenantId,
    },
    select: { id: true },
  });

  if (!role) {
    throw new Error("ROLE_NOT_FOUND");
  }

  await prisma.$transaction([
    prisma.tenantRole.update({
      where: { id: input.roleId },
      data: {
        name: input.name.trim(),
        description: input.description.trim(),
      },
    }),
    ...permissionAreas.map((area) =>
      prisma.tenantRolePermission.upsert({
        where: {
          roleId_area: {
            roleId: input.roleId,
            area: area.id,
          },
        },
        update: {
          level: input.permissions[area.id] ?? "none",
        },
        create: {
          roleId: input.roleId,
          area: area.id,
          level: input.permissions[area.id] ?? "none",
        },
      }),
    ),
  ]);
}

export async function deleteTenantRole(input: {
  tenantSlug: string;
  roleId: string;
}) {
  const access = await requireRoleManager(input.tenantSlug);
  const role = await prisma.tenantRole.findFirst({
    where: {
      id: input.roleId,
      tenantId: access.tenantId,
    },
    select: {
      id: true,
      isSystem: true,
      _count: {
        select: {
          memberships: true,
        },
      },
    },
  });

  if (!role) {
    throw new Error("ROLE_NOT_FOUND");
  }

  if (role.isSystem) {
    throw new Error("SYSTEM_ROLE");
  }

  if (role._count.memberships > 0) {
    throw new Error("ROLE_IN_USE");
  }

  await prisma.tenantRole.delete({
    where: { id: input.roleId },
  });
}
