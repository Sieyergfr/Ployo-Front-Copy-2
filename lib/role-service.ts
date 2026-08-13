import { prisma } from "@/lib/prisma";
import {
  emptyBooleanCapabilitySet,
  emptyPermissionSet,
  emptyShiftsLevelSet,
  fullPermissionScopeSet,
  isPermissionLevel,
  normalizePermissionLevel,
  normalizePermissionScope,
  normalizeRoleKey,
  permissionAreas,
  permissionRoles,
  type PermissionLevel,
  type PermissionRole,
  type PermissionScope,
} from "@/lib/roles";
import { requireTenantAccess } from "@/lib/tenant-access";
import { recordTenantAudit } from "@/lib/audit";

type RoleRecord = {
  id: string;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: Array<{
    area: string;
    level: string;
    scope: string;
    canDelete: boolean;
    canUploadFiles: boolean;
    canEditFiles: boolean;
    canViewFiles: boolean;
    canViewAudit: boolean;
    shiftsLevel: string | null;
  }>;
  _count: {
    memberships: number;
  };
};

function toPermissionMap(
  permissions: Array<{ area: string; level: string }>,
): Record<string, PermissionLevel> {
  const permissionMap = emptyPermissionSet();

  for (const permission of permissions) {
    permissionMap[permission.area] = normalizePermissionLevel(permission.level);
  }

  return permissionMap;
}

function toPermissionScopeMap(
  permissions: Array<{ area: string; scope: string }>,
): Record<string, PermissionScope> {
  const scopeMap = fullPermissionScopeSet();

  for (const permission of permissions) {
    scopeMap[permission.area] = normalizePermissionScope(permission.scope);
  }

  return scopeMap;
}

function toBooleanCapabilityMap(
  permissions: RoleRecord["permissions"],
  key: "canDelete" | "canUploadFiles" | "canEditFiles" | "canViewFiles" | "canViewAudit",
): Record<string, boolean> {
  const map = emptyBooleanCapabilitySet();

  for (const permission of permissions) {
    map[permission.area] = permission[key];
  }

  return map;
}

function toShiftsLevelMap(
  permissions: RoleRecord["permissions"],
): Record<string, PermissionLevel | null> {
  const map = emptyShiftsLevelSet();

  for (const permission of permissions) {
    map[permission.area] = permission.shiftsLevel
      ? normalizePermissionLevel(permission.shiftsLevel)
      : null;
  }

  return map;
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
    scopes: toPermissionScopeMap(role.permissions),
    canDelete: toBooleanCapabilityMap(role.permissions, "canDelete"),
    canUploadFiles: toBooleanCapabilityMap(role.permissions, "canUploadFiles"),
    canEditFiles: toBooleanCapabilityMap(role.permissions, "canEditFiles"),
    canViewFiles: toBooleanCapabilityMap(role.permissions, "canViewFiles"),
    canViewAudit: toBooleanCapabilityMap(role.permissions, "canViewAudit"),
    shiftsLevel: toShiftsLevelMap(role.permissions),
  };
}

export async function ensureTenantDefaultRoles(tenantSlug: string) {
  const access = await requireTenantAccess(tenantSlug, "roles", "admin");

  // Läuft bei jedem Rollen-Seitenaufruf — nach dem ersten Mal sind die
  // Standardrollen immer schon da, daher hier billig per count() kurzschließen
  // statt bei jedem Laden erneut 4 Upserts in einer Transaktion zu fahren.
  const existingCount = await prisma.tenantRole.count({
    where: {
      tenantId: access.tenantId,
      key: { in: permissionRoles.map((role) => role.key) },
    },
  });

  if (existingCount < permissionRoles.length) {
    await prisma.$transaction(
      permissionRoles.map((role) =>
        prisma.tenantRole.upsert({
          where: {
            tenantId_key: {
              tenantId: access.tenantId,
              key: role.key,
            },
          },
          update: {},
          create: {
            tenantId: access.tenantId,
            key: role.key,
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
            permissions: {
              create: permissionAreas.map((area) => ({
                area: area.id,
                level: role.permissions[area.id] ?? "none",
                scope: role.scopes[area.id] ?? "all",
                canDelete: role.canDelete[area.id] ?? false,
                canUploadFiles: role.canUploadFiles[area.id] ?? false,
                canEditFiles: role.canEditFiles[area.id] ?? false,
                canViewFiles: role.canViewFiles[area.id] ?? false,
                canViewAudit: role.canViewAudit[area.id] ?? false,
                shiftsLevel: role.shiftsLevel[area.id] ?? null,
              })),
            },
          },
        }),
      ),
    );
  }

  return access.tenantId;
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

export function scopesFromFormData(formData: FormData) {
  return Object.fromEntries(
    permissionAreas.map((area) => [
      area.id,
      normalizePermissionScope(formData.get(`scope-${area.id}`)),
    ]),
  ) as Record<string, PermissionScope>;
}

function booleanCapabilityFromFormData(formData: FormData, fieldPrefix: string) {
  return Object.fromEntries(
    permissionAreas.map((area) => [area.id, formData.get(`${fieldPrefix}-${area.id}`) === "on"]),
  ) as Record<string, boolean>;
}

export function canDeleteFromFormData(formData: FormData) {
  return booleanCapabilityFromFormData(formData, "can-delete");
}

export function canUploadFilesFromFormData(formData: FormData) {
  return booleanCapabilityFromFormData(formData, "can-upload-files");
}

export function canEditFilesFromFormData(formData: FormData) {
  return booleanCapabilityFromFormData(formData, "can-edit-files");
}

export function canViewFilesFromFormData(formData: FormData) {
  return booleanCapabilityFromFormData(formData, "can-view-files");
}

export function canViewAuditFromFormData(formData: FormData) {
  return booleanCapabilityFromFormData(formData, "can-view-audit");
}

/** Nur für Bereiche mit `supportsAssignedScope` (locations/teams) aus dem Formular gesetzt — sonst null. */
export function shiftsLevelFromFormData(formData: FormData) {
  return Object.fromEntries(
    permissionAreas.map((area) => {
      const raw = formData.get(`shifts-level-${area.id}`);

      return [area.id, isPermissionLevel(raw) ? raw : null];
    }),
  ) as Record<string, PermissionLevel | null>;
}

/**
 * `requireTenantAccess(tenantSlug, "roles", "admin")` prüft bereits
 * vollständig (inkl. Tenant-Manager-Bypass und Custom-Role-Level), ob der
 * Nutzer Rollen verwalten darf — die frühere Implementierung hat das
 * Ergebnis danach mit einer zweiten, redundanten Mitgliedschaftsabfrage
 * nochmal nachgeprüft. Das kostete bei jedem Speichern eine unnötige
 * Datenbank-Rundreise und war einer der Gründe für die lange Ladezeit.
 */
export async function requireRoleManager(tenantSlug: string) {
  const access = await requireTenantAccess(tenantSlug, "roles", "admin");

  return {
    tenantId: access.tenantId,
    tenantSlug: access.tenantSlug,
    userId: access.userId,
    userName: access.userName,
  };
}

async function recordRoleAudit(
  access: { tenantId: string; userId: string; userName: string },
  action: string,
  roleId: string,
  detail: string,
) {
  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action,
    source: "Rollen",
    entityType: "role",
    entityId: roleId,
    detail,
  });
}

type RoleCapabilitiesInput = {
  canDelete?: Record<string, boolean>;
  canUploadFiles?: Record<string, boolean>;
  canEditFiles?: Record<string, boolean>;
  canViewFiles?: Record<string, boolean>;
  canViewAudit?: Record<string, boolean>;
  shiftsLevel?: Record<string, PermissionLevel | null>;
};

function permissionRowsFromInput(
  input: {
    permissions: Record<string, PermissionLevel>;
    scopes?: Record<string, PermissionScope>;
  } & RoleCapabilitiesInput,
) {
  return permissionAreas.map((area) => ({
    area: area.id,
    level: input.permissions[area.id] ?? "none",
    scope: input.scopes?.[area.id] ?? "all",
    canDelete: input.canDelete?.[area.id] ?? false,
    canUploadFiles: input.canUploadFiles?.[area.id] ?? false,
    canEditFiles: input.canEditFiles?.[area.id] ?? false,
    canViewFiles: input.canViewFiles?.[area.id] ?? false,
    canViewAudit: input.canViewAudit?.[area.id] ?? false,
    shiftsLevel: input.shiftsLevel?.[area.id] ?? null,
  }));
}

export async function createTenantRole(
  input: {
    tenantSlug: string;
    name: string;
    description: string;
    permissions: Record<string, PermissionLevel>;
    scopes?: Record<string, PermissionScope>;
  } & RoleCapabilitiesInput,
) {
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

  const role = await prisma.tenantRole.create({
    data: {
      tenantId: access.tenantId,
      key,
      name: input.name.trim(),
      description: input.description.trim(),
      permissions: {
        create: permissionRowsFromInput(input),
      },
    },
  });

  await recordRoleAudit(access, "Rolle angelegt", role.id, role.name);

  return role;
}

export async function updateTenantRole(
  input: {
    tenantSlug: string;
    roleId: string;
    name: string;
    description: string;
    permissions: Record<string, PermissionLevel>;
    scopes?: Record<string, PermissionScope>;
  } & RoleCapabilitiesInput,
) {
  const access = await requireRoleManager(input.tenantSlug);
  const role = await prisma.tenantRole.findFirst({
    where: {
      id: input.roleId,
      tenantId: access.tenantId,
    },
    select: { id: true, name: true },
  });

  if (!role) {
    throw new Error("ROLE_NOT_FOUND");
  }

  // Vorher: 1 Update + 12 einzelne upsert()-Aufrufe (einer je Bereich) in
  // einer Transaktion — 13 sequentielle Round-Trips bei jedem Speichern.
  // deleteMany + createMany ersetzt das Bereich-für-Bereich-Upserten durch
  // zwei Bulk-Statements.
  await prisma.$transaction([
    prisma.tenantRole.update({
      where: { id: input.roleId },
      data: {
        name: input.name.trim(),
        description: input.description.trim(),
      },
    }),
    prisma.tenantRolePermission.deleteMany({
      where: { roleId: input.roleId },
    }),
    prisma.tenantRolePermission.createMany({
      data: permissionRowsFromInput(input).map((row) => ({
        ...row,
        roleId: input.roleId,
      })),
    }),
  ]);

  await recordRoleAudit(
    access,
    "Rolle geändert",
    role.id,
    input.name.trim() || role.name,
  );
}

export async function deleteTenantRole(input: {
  tenantSlug: string;
  roleId: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "roles", "read");

  if (!access.canDelete) {
    throw new Error("FORBIDDEN");
  }

  const role = await prisma.tenantRole.findFirst({
    where: {
      id: input.roleId,
      tenantId: access.tenantId,
    },
    select: {
      id: true,
      name: true,
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

  await recordRoleAudit(access, "Rolle gelöscht", role.id, role.name);
}
