import { prisma } from "@/lib/prisma";
import {
  buildRolePermissionCreateData,
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
  appOverviewEnabled: boolean;
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

function toPermissionRole(role: RoleRecord, memberCount: number): PermissionRole {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    members: memberCount,
    isSystem: role.isSystem,
    appOverviewEnabled: role.appOverviewEnabled,
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
            appOverviewEnabled: role.appOverviewEnabled,
            permissions: {
              create: buildRolePermissionCreateData(role),
            },
          },
        }),
      ),
    );
  }

  return access.tenantId;
}

/**
 * Upsert für GENAU EINE System-Rolle per `key`, ohne Tenant-Access-Prüfung —
 * für Aufrufer, die ihre eigene Autorisierung mitbringen (z. B. die
 * Einladungsannahme: der Einladungs-Token selbst ist dort die Autorisierung,
 * der Einladende ist noch kein Tenant-Mitglied und `requireTenantAccess`
 * würde fehlschlagen). Nutzt exakt dasselbe `permissionRoles`-Template und
 * denselben Zeilenaufbau wie `ensureTenantDefaultRoles` — bewusst keine
 * zweite, potenziell unvollständige Kopie mehr (siehe Audit-Finding C01:
 * eine frühere separate Kopie in `invitation-service.ts` ließ dabei
 * `scope`/Fähigkeiten weg und aktivierte so unbeabsichtigt den
 * mandantenweiten Prisma-Feld-Default statt des Templates).
 */
export async function upsertTenantSystemRoleByKey(tenantId: string, key: string) {
  const template = permissionRoles.find((role) => role.key === key);

  if (!template) {
    return null;
  }

  const role = await prisma.tenantRole.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: {},
    create: {
      tenantId,
      key: template.key,
      name: template.name,
      description: template.description,
      isSystem: template.isSystem,
      appOverviewEnabled: template.appOverviewEnabled,
      permissions: {
        create: buildRolePermissionCreateData(template),
      },
    },
    select: { id: true },
  });

  return role.id;
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
    },
  });
  const memberCounts = await countRoleMembersForTenant(tenantId, roles);

  return roles.map((role) => toPermissionRole(role, memberCounts.get(role.id) ?? 0));
}

/**
 * Wie viele reale Personen einer Rolle zugeordnet sind — nicht nur
 * `TenantMembership`-Zeilen mit gesetztem `roleId` (das erfasst nur Personen
 * mit verknüpftem Konto), sondern auch Mitarbeiter ohne Konto, deren
 * "Berechtigungsrolle"-Feld auf der Personalakte (`TenantEmployee.role`) zu
 * dieser Rolle passt (QA-Bug BUG-004: die reine Konto-Zählung zeigte "0
 * zugewiesene Mitarbeiter" für Rollen, die laut Mitarbeiterliste klar
 * mehreren Personen zugewiesen waren — in dieser Demo hat kaum ein
 * Mitarbeiter ein verknüpftes Konto). Ausgeschiedene Mitarbeiter zählen nicht
 * mit (gleiche Definition wie BUG-002). Legacy-Sonderfall bleibt erhalten:
 * Mitgliedschaften mit `role: EMPLOYEE`, aber `roleId: null` (vor Einführung
 * der granularen Rollen eingeladen, kein passender Mitarbeiterdatensatz)
 * zählen weiterhin zur "Mitarbeiter"-Systemrolle.
 *
 * Ein `TenantMembership.roleId`-Treffer ist immer autoritativ (echte
 * Berechtigung) und wird IMMER gezählt, auch wenn das Rollenfeld der
 * verknüpften Personalakte (noch) abweicht. Zusätzlich zählt jeder aktive
 * Mitarbeiter mit passendem Rollenfeld, unabhängig davon, ob dessen
 * Mitgliedschaft (sofern vorhanden) schon dieselbe `roleId` trägt.
 */
async function countRoleMembersForTenant(
  tenantId: string,
  roles: Array<{ id: string; key: string; name: string }>,
): Promise<Map<string, number>> {
  const [memberships, employees, legacyUnlinkedEmployeeMemberships] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { tenantId, roleId: { not: null } },
      select: { userId: true, roleId: true },
    }),
    prisma.tenantEmployee.findMany({
      where: { tenantId, status: { not: "former" } },
      select: { id: true, userId: true, role: true },
    }),
    prisma.tenantMembership.findMany({
      where: { tenantId, role: "EMPLOYEE", roleId: null },
      select: { userId: true },
    }),
  ]);

  const employeeByUserId = new Map(
    employees.filter((employee) => employee.userId).map((employee) => [employee.userId as string, employee]),
  );

  const memberKeysByRoleId = new Map<string, Set<string>>();

  function addMember(roleId: string, key: string) {
    const set = memberKeysByRoleId.get(roleId) ?? new Set<string>();
    set.add(key);
    memberKeysByRoleId.set(roleId, set);
  }

  for (const membership of memberships) {
    const employee = employeeByUserId.get(membership.userId);
    addMember(membership.roleId!, employee ? `e:${employee.id}` : `u:${membership.userId}`);
  }

  for (const employee of employees) {
    const roleName = employee.role.trim();

    if (!roleName) {
      continue;
    }

    const matchingRole = roles.find(
      (role) => role.name.trim().toLowerCase() === roleName.toLowerCase(),
    );

    if (matchingRole) {
      addMember(matchingRole.id, `e:${employee.id}`);
    }
  }

  const employeeSystemRole = roles.find((role) => role.key === "employee");

  if (employeeSystemRole) {
    for (const membership of legacyUnlinkedEmployeeMemberships) {
      const employee = employeeByUserId.get(membership.userId);
      addMember(employeeSystemRole.id, employee ? `e:${employee.id}` : `u:${membership.userId}`);
    }
  }

  return new Map([...memberKeysByRoleId.entries()].map(([roleId, keys]) => [roleId, keys.size]));
}

/**
 * Hält `TenantMembership.roleId` synchron mit dem "Berechtigungsrolle"-Feld
 * auf der Personalakte (`TenantEmployee.role`, freier String) — dieses Feld
 * sah bisher wie eine echte Rollenzuweisung aus (gleiche Namen wie die
 * Rollenverwaltung, Label "Berechtigungsrolle"), wirkte sich aber nie auf
 * `TenantMembership.roleId` aus und damit weder auf die Mitgliederzahl pro
 * Rolle noch auf tatsächliche Berechtigungen.
 *
 * Nur wirksam, wenn:
 * - die Personalakte mit einem Konto verknüpft ist (`userId` gesetzt) — ohne
 *   Konto gibt es keine `TenantMembership`-Zeile, die aktualisiert werden könnte;
 * - der eingetragene Rollenname exakt (case-insensitiv) zu einer echten Rolle
 *   im Mandanten passt — ein frei eingetippter Jobtitel wie "Kassierer", der
 *   zufällig keiner Rolle entspricht, bleibt unangetastet (keine Zuweisung
 *   erfunden, wo keine gemeint war).
 *
 * Für OWNER/ADMIN/HR (Legacy-Rolle) ändert das nichts an den tatsächlichen
 * Berechtigungen — die haben über `computePermissionLevels` ohnehin immer
 * "admin" auf alles, unabhängig von `roleId`. Es wirkt sich nur auf die
 * Mitgliederzahl der entsprechenden Rolle aus, was korrekt ist: auch eine
 * Admin-Person kann zusätzlich fachlich z. B. "HR-Leitung" sein.
 */
export async function syncMembershipRoleFromEmployeeRole(input: {
  tenantId: string;
  userId: string | null;
  roleName: string;
}) {
  if (!input.userId) {
    return;
  }

  const roleName = input.roleName.trim();

  if (!roleName) {
    return;
  }

  const role = await prisma.tenantRole.findFirst({
    where: { tenantId: input.tenantId, name: { equals: roleName, mode: "insensitive" } },
    select: { id: true },
  });

  if (!role) {
    return;
  }

  await prisma.tenantMembership.updateMany({
    where: { tenantId: input.tenantId, userId: input.userId },
    data: { roleId: role.id },
  });
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
    },
  });

  if (!role) {
    return null;
  }

  const memberCounts = await countRoleMembersForTenant(tenantId, [role]);

  return toPermissionRole(role, memberCounts.get(role.id) ?? 0);
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
/** Checkbox im Rollen-Editor — nicht angehakt heißt "nicht mitgeschickt". */
export function appOverviewFromFormData(formData: FormData) {
  return formData.get("appOverviewEnabled") === "on";
}

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

/** Verhindert doppelte Rollennamen pro Mandant, case-insensitiv (QA-Bug BUG-006, siehe lib/location-service.ts). */
async function assertUniqueRoleName(input: {
  tenantId: string;
  name: string;
  excludeRoleId?: string;
}) {
  const name = input.name.trim();

  if (!name) {
    return;
  }

  const existing = await prisma.tenantRole.findFirst({
    where: {
      tenantId: input.tenantId,
      name: { equals: name, mode: "insensitive" },
      id: input.excludeRoleId ? { not: input.excludeRoleId } : undefined,
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error(`Eine Rolle mit dem Namen "${name}" existiert bereits.`);
  }
}

export async function createTenantRole(
  input: {
    tenantSlug: string;
    name: string;
    description: string;
    appOverviewEnabled?: boolean;
    permissions: Record<string, PermissionLevel>;
    scopes?: Record<string, PermissionScope>;
  } & RoleCapabilitiesInput,
) {
  const access = await requireRoleManager(input.tenantSlug);
  await assertUniqueRoleName({ tenantId: access.tenantId, name: input.name });
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
      appOverviewEnabled: input.appOverviewEnabled ?? false,
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
    appOverviewEnabled?: boolean;
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

  await assertUniqueRoleName({
    tenantId: access.tenantId,
    name: input.name,
    excludeRoleId: input.roleId,
  });

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
        appOverviewEnabled: input.appOverviewEnabled ?? false,
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
      key: true,
      name: true,
      isSystem: true,
    },
  });

  if (!role) {
    throw new Error("ROLE_NOT_FOUND");
  }

  if (role.isSystem) {
    throw new Error("SYSTEM_ROLE");
  }

  // Nicht nur Konto-Mitgliedschaften prüfen, sonst ließe sich eine Rolle
  // löschen, die laut Personalakten noch Mitarbeitern zugewiesen ist (QA-Bug
  // BUG-004 — dieselbe Zählung wie auf der Rollenübersicht).
  const memberCounts = await countRoleMembersForTenant(access.tenantId, [role]);

  if ((memberCounts.get(role.id) ?? 0) > 0) {
    throw new Error("ROLE_IN_USE");
  }

  await prisma.tenantRole.delete({
    where: { id: input.roleId },
  });

  await recordRoleAudit(access, "Rolle gelöscht", role.id, role.name);
}
