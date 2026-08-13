import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveScopeFilter, resolveTenantAccessForUser } from "@/lib/tenant-access";

/**
 * Integrationstest gegen die echte Test-DB für `requireTenantAccess` — die
 * zentrale Autorisierungsgrenze für praktisch jeden DAL-Zugriff. Testet die
 * DB-Kernlogik direkt (resolveTenantAccessForUser), da die öffentliche
 * `requireTenantAccess` an next/headers() hängt und außerhalb eines
 * Next.js-Requests nicht aufgerufen werden kann.
 */

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-tenant-access-${RUN_ID}`;

let tenantId: string;
let restrictedRoleId: string;
let assignedTeamId: string;
let assignedEmployeeId: string;
let unassignedEmployeeUserId: string;
const userIds: Record<string, string> = {};

const twoFactorTenantSlug = `test-tenant-2fa-${RUN_ID}`;
let twoFactorTenantId: string;

async function createUser(label: string) {
  const user = await prisma.user.create({
    data: {
      email: `tenant-access-${RUN_ID}-${label}@ployo.invalid`,
      name: `Test ${label}`,
      emailVerified: true,
    },
  });
  userIds[label] = user.id;

  return user;
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Tenant Access Test ${RUN_ID}` },
  });
  tenantId = tenant.id;

  const owner = await createUser("owner");
  const plainEmployee = await createUser("plain-employee");
  const readerEmployee = await createUser("reader-employee");
  const writerEmployee = await createUser("writer-employee");
  const outsider = await createUser("outsider");
  void outsider;

  const role = await prisma.tenantRole.create({
    data: {
      tenantId,
      key: "vacation-reader",
      name: "Urlaub Leser",
      permissions: {
        create: [{ area: "vacation", level: "read" }],
      },
    },
  });
  restrictedRoleId = role.id;

  const writerRole = await prisma.tenantRole.create({
    data: {
      tenantId,
      key: "vacation-writer",
      name: "Urlaub Schreiber",
      permissions: {
        create: [{ area: "vacation", level: "write" }],
      },
    },
  });

  // --- Fixtures für "assigned"-Scope (Standorte: Namensabgleich, Teams: TenantTeamMember-Relation) ---
  await prisma.tenantLocation.create({
    data: { tenantId, key: `standort-a-${RUN_ID}`, kind: "Filiale", name: "Standort A" },
  });

  const team = await prisma.tenantTeam.create({
    data: { tenantId, key: `team-a-${RUN_ID}`, name: "Team A" },
  });
  assignedTeamId = team.id;

  const assignedEmployeeUser = await createUser("assigned-employee");
  const assignedEmployee = await prisma.tenantEmployee.create({
    data: {
      tenantId,
      key: `assigned-employee-${RUN_ID}`,
      initials: "AE",
      name: "Assigned Employee",
      employeeNumber: `A-${RUN_ID}`,
      location: "Standort A",
      userId: assignedEmployeeUser.id,
    },
  });
  assignedEmployeeId = assignedEmployee.id;

  await prisma.tenantTeamMember.create({
    data: {
      teamId: assignedTeamId,
      employeeId: assignedEmployee.id,
      initials: assignedEmployee.initials,
      name: assignedEmployee.name,
      location: assignedEmployee.location,
      role: "Mitglied",
      contract: "Unbefristet",
    },
  });

  const assignedRole = await prisma.tenantRole.create({
    data: {
      tenantId,
      key: "assigned-scope",
      name: "Zugewiesen",
      permissions: {
        create: [
          { area: "locations", level: "read", scope: "assigned" },
          { area: "teams", level: "read", scope: "assigned" },
        ],
      },
    },
  });

  // Mitglied mit "assigned"-Scope, aber ohne verknüpfte Personalakte — muss
  // ins Leere laufen (fail-closed), nicht auf "alles sehen" zurückfallen.
  const unassignedEmployeeUser = await createUser("unassigned-with-assigned-role");
  unassignedEmployeeUserId = unassignedEmployeeUser.id;

  // --- Fixtures für canDelete/canViewAudit ---
  const fullCapabilityRole = await prisma.tenantRole.create({
    data: {
      tenantId,
      key: "employees-full-capability",
      name: "Mitarbeiter Vollzugriff",
      permissions: {
        create: [
          {
            area: "employees",
            level: "write",
            canDelete: true,
            canViewAudit: true,
          },
        ],
      },
    },
  });

  const restrictedCapabilityRole = await prisma.tenantRole.create({
    data: {
      tenantId,
      key: "employees-restricted-capability",
      name: "Mitarbeiter Eingeschraenkt",
      permissions: {
        create: [
          {
            area: "employees",
            level: "write",
            canDelete: false,
            canViewAudit: false,
          },
        ],
      },
    },
  });

  const fullCapabilityUser = await createUser("full-capability");
  const restrictedCapabilityUser = await createUser("restricted-capability");

  await prisma.tenantMembership.createMany({
    data: [
      { tenantId, userId: owner.id, role: "OWNER" },
      { tenantId, userId: plainEmployee.id, role: "EMPLOYEE" },
      {
        tenantId,
        userId: readerEmployee.id,
        role: "EMPLOYEE",
        roleId: restrictedRoleId,
      },
      {
        tenantId,
        userId: writerEmployee.id,
        role: "EMPLOYEE",
        roleId: writerRole.id,
      },
      {
        tenantId,
        userId: assignedEmployeeUser.id,
        role: "EMPLOYEE",
        roleId: assignedRole.id,
      },
      {
        tenantId,
        userId: unassignedEmployeeUser.id,
        role: "EMPLOYEE",
        roleId: assignedRole.id,
      },
      {
        tenantId,
        userId: fullCapabilityUser.id,
        role: "EMPLOYEE",
        roleId: fullCapabilityRole.id,
      },
      {
        tenantId,
        userId: restrictedCapabilityUser.id,
        role: "EMPLOYEE",
        roleId: restrictedCapabilityRole.id,
      },
    ],
  });

  // --- Fixtures für die Tenant-weite 2FA-Pflicht (eigener Mandant, damit
  // die Pflicht nicht die Fälle oben beeinflusst) ---
  const twoFactorTenant = await prisma.tenant.create({
    data: {
      slug: twoFactorTenantSlug,
      name: `Tenant 2FA Test ${RUN_ID}`,
      settings: { create: { twoFactorRequired: true } },
    },
  });
  twoFactorTenantId = twoFactorTenant.id;

  const withoutTwoFactor = await prisma.user.create({
    data: {
      email: `tenant-access-${RUN_ID}-without-2fa@ployo.invalid`,
      name: "Ohne 2FA",
      emailVerified: true,
      twoFactorEnabled: false,
    },
  });
  userIds["without-2fa"] = withoutTwoFactor.id;

  const withTwoFactor = await prisma.user.create({
    data: {
      email: `tenant-access-${RUN_ID}-with-2fa@ployo.invalid`,
      name: "Mit 2FA",
      emailVerified: true,
      twoFactorEnabled: true,
    },
  });
  userIds["with-2fa"] = withTwoFactor.id;

  await prisma.tenantMembership.createMany({
    data: [
      // OWNER-Rolle darf die Pflicht nicht umgehen — bewusst als OWNER angelegt.
      { tenantId: twoFactorTenantId, userId: withoutTwoFactor.id, role: "OWNER" },
      { tenantId: twoFactorTenantId, userId: withTwoFactor.id, role: "OWNER" },
    ],
  });
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, twoFactorTenantId] } } });
  await prisma.user.deleteMany({
    where: { id: { in: Object.values(userIds) } },
  });
  await prisma.$disconnect();
});

describe("resolveTenantAccessForUser (requireTenantAccess-Kernlogik)", () => {
  it("lässt OWNER unabhängig von Rollen-Berechtigungen zu (auch 'admin')", async () => {
    const user = { id: userIds.owner, email: "x", name: "Owner" };
    const access = await resolveTenantAccessForUser(user, tenantSlug, "vacation", "admin");

    expect(access.permissionLevel).toBe("admin");
    expect(access.tenantId).toBe(tenantId);
  });

  it("blockiert einen EMPLOYEE ohne zugewiesene Rolle (FORBIDDEN)", async () => {
    const user = { id: userIds["plain-employee"], email: "x", name: "Plain" };

    await expect(
      resolveTenantAccessForUser(user, tenantSlug, "vacation", "read"),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("lässt einen EMPLOYEE mit 'read'-Rolle nur lesenden Zugriff zu", async () => {
    const user = { id: userIds["reader-employee"], email: "x", name: "Reader" };

    const readAccess = await resolveTenantAccessForUser(
      user,
      tenantSlug,
      "vacation",
      "read",
    );
    expect(readAccess.permissionLevel).toBe("read");

    await expect(
      resolveTenantAccessForUser(user, tenantSlug, "vacation", "write"),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("lässt einen EMPLOYEE mit 'write'-Rolle lesenden und schreibenden Zugriff zu", async () => {
    const user = { id: userIds["writer-employee"], email: "x", name: "Writer" };

    await expect(
      resolveTenantAccessForUser(user, tenantSlug, "vacation", "read"),
    ).resolves.toMatchObject({ permissionLevel: "write" });
    await expect(
      resolveTenantAccessForUser(user, tenantSlug, "vacation", "write"),
    ).resolves.toMatchObject({ permissionLevel: "write" });
  });

  it("gewährt eine Rollen-Berechtigung nur für den zugewiesenen Bereich", async () => {
    const user = { id: userIds["reader-employee"], email: "x", name: "Reader" };

    // Die Rolle hat nur "vacation:read" — für "sickness" gilt sie nicht.
    await expect(
      resolveTenantAccessForUser(user, tenantSlug, "sickness", "read"),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("blockiert Nutzer ohne Mitgliedschaft in diesem Mandanten (FORBIDDEN)", async () => {
    const user = { id: userIds.outsider, email: "x", name: "Outsider" };

    await expect(
      resolveTenantAccessForUser(user, tenantSlug, "vacation", "read"),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("blockiert einen unbekannten Mandanten-Slug (FORBIDDEN statt Crash)", async () => {
    const user = { id: userIds.owner, email: "x", name: "Owner" };

    await expect(
      resolveTenantAccessForUser(user, "does-not-exist-tenant", "vacation", "read"),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("resolveScopeFilter — 'assigned'-Scope (Standorte/Teams)", () => {
  it("löst 'assigned' für Standorte über den Namensabgleich der eigenen Personalakte auf", async () => {
    const user = { id: userIds["assigned-employee"], email: "x", name: "Assigned" };
    const access = await resolveTenantAccessForUser(user, tenantSlug, "locations", "read");

    expect(access.scope).toBe("assigned");

    const scopeFilter = await resolveScopeFilter(access);

    expect(scopeFilter).toMatchObject({
      type: "assigned",
      area: "locations",
      employeeId: assignedEmployeeId,
      locationNames: ["Standort A"],
    });
  });

  it("löst 'assigned' für Teams über die TenantTeamMember-Relation auf", async () => {
    const user = { id: userIds["assigned-employee"], email: "x", name: "Assigned" };
    const access = await resolveTenantAccessForUser(user, tenantSlug, "teams", "read");

    expect(access.scope).toBe("assigned");

    const scopeFilter = await resolveScopeFilter(access);

    expect(scopeFilter).toMatchObject({
      type: "assigned",
      area: "teams",
      employeeId: assignedEmployeeId,
      teamIds: [assignedTeamId],
    });
  });

  it("liefert bei 'assigned'-Scope ohne verknüpfte Personalakte leere Listen statt 'alles sehen'", async () => {
    const user = {
      id: unassignedEmployeeUserId,
      email: "x",
      name: "Unassigned",
    };

    const locationsAccess = await resolveTenantAccessForUser(
      user,
      tenantSlug,
      "locations",
      "read",
    );
    const locationsScopeFilter = await resolveScopeFilter(locationsAccess);

    expect(locationsScopeFilter).toMatchObject({
      type: "assigned",
      area: "locations",
      employeeId: null,
      locationNames: [],
    });

    const teamsAccess = await resolveTenantAccessForUser(user, tenantSlug, "teams", "read");
    const teamsScopeFilter = await resolveScopeFilter(teamsAccess);

    expect(teamsScopeFilter).toMatchObject({
      type: "assigned",
      area: "teams",
      employeeId: null,
      teamIds: [],
    });
  });
});

describe("resolveTenantAccessForUser — canDelete/canViewAudit-Auflösung", () => {
  it("liefert canDelete/canViewAudit=true für eine Rolle mit vollem Zugriff", async () => {
    const user = { id: userIds["full-capability"], email: "x", name: "Full" };
    const access = await resolveTenantAccessForUser(user, tenantSlug, "employees", "read");

    expect(access.canDelete).toBe(true);
    expect(access.canViewAudit).toBe(true);
  });

  it("liefert canDelete/canViewAudit=false für eine eingeschränkte Rolle trotz 'write'-Level", async () => {
    const user = { id: userIds["restricted-capability"], email: "x", name: "Restricted" };
    const access = await resolveTenantAccessForUser(user, tenantSlug, "employees", "read");

    expect(access.permissionLevel).toBe("write");
    expect(access.canDelete).toBe(false);
    expect(access.canViewAudit).toBe(false);
  });

  it("gewährt OWNER canDelete/canViewAudit unabhängig von jeder Rollen-Konfiguration", async () => {
    const user = { id: userIds.owner, email: "x", name: "Owner" };
    const access = await resolveTenantAccessForUser(user, tenantSlug, "employees", "read");

    expect(access.canDelete).toBe(true);
    expect(access.canViewAudit).toBe(true);
  });
});

describe("resolveTenantAccessForUser — Tenant-weite 2FA-Pflicht", () => {
  it("blockiert ein Mitglied ohne aktivierte 2FA (TWO_FACTOR_REQUIRED), auch als OWNER", async () => {
    const user = {
      id: userIds["without-2fa"],
      email: "x",
      name: "Ohne 2FA",
      twoFactorEnabled: false,
    };

    await expect(
      resolveTenantAccessForUser(user, twoFactorTenantSlug, "vacation", "read"),
    ).rejects.toThrow("TWO_FACTOR_REQUIRED");
  });

  it("lässt ein Mitglied mit aktivierter 2FA normal zu", async () => {
    const user = {
      id: userIds["with-2fa"],
      email: "x",
      name: "Mit 2FA",
      twoFactorEnabled: true,
    };

    const access = await resolveTenantAccessForUser(
      user,
      twoFactorTenantSlug,
      "vacation",
      "read",
    );
    expect(access.tenantId).toBe(twoFactorTenantId);
  });

  it("blockiert nicht, wenn twoFactorEnabled fehlt (undefined) und die Pflicht nicht gilt", async () => {
    // Regressionsschutz: ein Mandant ohne 2FA-Pflicht (z. B. der Standard-
    // Testmandant oben) darf durch die neue Prüfung nicht plötzlich Nutzer
    // ohne `twoFactorEnabled`-Feld im Test-Fixture blockieren.
    const user = { id: userIds.owner, email: "x", name: "Owner" };

    await expect(
      resolveTenantAccessForUser(user, tenantSlug, "vacation", "admin"),
    ).resolves.toMatchObject({ tenantId });
  });
});
