import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { deleteTenantLocation } from "@/lib/location-service";
import { addTenantTeamMember, deleteTenantTeam, removeTenantTeamMember } from "@/lib/team-service";
import { resolveScopeFilter, resolveTenantAccessForUser, scopeAllowsTarget } from "@/lib/tenant-access";

/**
 * Integrationstest für den "team"-Scope: Quelle der Team-Zugehörigkeit ist
 * `TenantTeamMember`, nicht mehr die Freitext-Kopie `TenantEmployee.team`
 * (die nur ein Team kannte, beim Hinzufügen über die Team-Seite leer blieb
 * und das Löschen des Teams überlebte — "Geister-Team"). Dazu das Aufräumen
 * der Namenskopien beim Löschen von Teams und Standorten.
 */

let actorUserId: string;

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: actorUserId, name: "Test Actor", email: "actor@test.invalid" },
      }),
    },
  },
}));

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-team-scope-${RUN_ID}`;

let tenantId: string;
let ownerUserId: string;
let managerUserId: string;
let teamAId: string;
let teamBId: string;
const employeeIds: Record<string, string> = {};

async function createEmployee(label: string, data: { team?: string; location?: string; userId?: string } = {}) {
  const employee = await prisma.tenantEmployee.create({
    data: {
      tenantId,
      key: `${label}-${RUN_ID}`,
      initials: label.slice(0, 2).toUpperCase(),
      name: `Employee ${label}`,
      employeeNumber: `${label}-${RUN_ID}`,
      ...data,
    },
  });
  employeeIds[label] = employee.id;

  return employee;
}

async function addMembership(teamId: string, employeeId: string, location = "") {
  await prisma.tenantTeamMember.create({
    data: {
      teamId,
      employeeId,
      initials: "XX",
      name: "Member",
      location,
      role: "Mitglied",
      contract: "Unbefristet",
    },
  });
}

async function managerScope() {
  const access = await resolveTenantAccessForUser(
    { id: managerUserId, email: "x", name: "Manager" },
    tenantSlug,
    "employees",
    "read",
  );

  return resolveScopeFilter(access);
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Team Scope Test ${RUN_ID}` },
  });
  tenantId = tenant.id;

  const owner = await prisma.user.create({
    data: { email: `team-scope-${RUN_ID}-owner@ployo.invalid`, name: "Owner", emailVerified: true },
  });
  ownerUserId = owner.id;
  const manager = await prisma.user.create({
    data: { email: `team-scope-${RUN_ID}-manager@ployo.invalid`, name: "Manager", emailVerified: true },
  });
  managerUserId = manager.id;

  const role = await prisma.tenantRole.create({
    data: {
      tenantId,
      key: "team-lead",
      name: "Teamleitung",
      permissions: { create: [{ area: "employees", level: "read", scope: "team" }] },
    },
  });

  await prisma.tenantMembership.createMany({
    data: [
      { tenantId, userId: owner.id, role: "OWNER" },
      { tenantId, userId: manager.id, role: "EMPLOYEE", roleId: role.id },
    ],
  });

  const teamA = await prisma.tenantTeam.create({ data: { tenantId, key: `a-${RUN_ID}`, name: "Team A" } });
  const teamB = await prisma.tenantTeam.create({ data: { tenantId, key: `b-${RUN_ID}`, name: "Team B" } });
  teamAId = teamA.id;
  teamBId = teamB.id;

  // Manager in zwei Teams; Textfeld kennt nur das erste.
  const manager_ = await createEmployee("mgr", { team: "Team A", userId: manager.id });
  await addMembership(teamAId, manager_.id);
  await addMembership(teamBId, manager_.id);

  const a1 = await createEmployee("a1", { team: "Team A" });
  await addMembership(teamAId, a1.id);

  // Nur über TenantTeamMember im Team, Textfeld leer (wie nach dem
  // Hinzufügen über die Team-Seite vor diesem Fix).
  const b1 = await createEmployee("b1");
  await addMembership(teamBId, b1.id);

  await createEmployee("outsider");
});

afterAll(async () => {
  if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, managerUserId].filter(Boolean) } } });
  await prisma.$disconnect();
});

describe("resolveScopeFilter — 'team'-Scope über TenantTeamMember", () => {
  it("umfasst Kolleg:innen aller eigenen Teams, auch ohne gesetztes Textfeld", async () => {
    const scope = await managerScope();

    expect(scope.type).toBe("team");
    expect(scopeAllowsTarget(scope, { id: employeeIds.mgr })).toBe(true);
    expect(scopeAllowsTarget(scope, { id: employeeIds.a1 })).toBe(true);
    expect(scopeAllowsTarget(scope, { id: employeeIds.b1 })).toBe(true);
    expect(scopeAllowsTarget(scope, { id: employeeIds.outsider })).toBe(false);
  });

  it("filtert die Mitarbeiterliste eines team-gescopten Nutzers entsprechend", async () => {
    actorUserId = managerUserId;
    const employees = (await getEmployeesForTenant(tenantSlug)) ?? [];
    const visible = employees.map((employee) => employee.dbId).sort();

    expect(visible).toEqual([employeeIds.mgr, employeeIds.a1, employeeIds.b1].sort());
  });

  it("trifft ohne eigenes Team niemanden — auch nicht Mitarbeiter ohne Team (H03)", async () => {
    await prisma.tenantTeamMember.deleteMany({ where: { employeeId: employeeIds.mgr } });
    try {
      const scope = await managerScope();

      expect(scope).toMatchObject({ type: "team", teamIds: [], teammateIds: [] });
      expect(scopeAllowsTarget(scope, { id: employeeIds.outsider })).toBe(false);
    } finally {
      await addMembership(teamAId, employeeIds.mgr);
      await addMembership(teamBId, employeeIds.mgr);
    }
  });
});

describe("Team-Mutationen halten das Hauptteam-Textfeld konsistent", () => {
  it("addTenantTeamMember setzt ein leeres Hauptteam, überschreibt aber kein vorhandenes", async () => {
    actorUserId = ownerUserId;
    const fresh = await createEmployee("fresh");
    await addTenantTeamMember({ tenantSlug, teamId: teamBId, employeeId: fresh.id, role: "" });
    await addTenantTeamMember({ tenantSlug, teamId: teamBId, employeeId: employeeIds.a1, role: "" });

    const [freshAfter, a1After] = await Promise.all([
      prisma.tenantEmployee.findUnique({ where: { id: fresh.id }, select: { team: true } }),
      prisma.tenantEmployee.findUnique({ where: { id: employeeIds.a1 }, select: { team: true } }),
    ]);

    expect(freshAfter?.team).toBe("Team B");
    expect(a1After?.team).toBe("Team A");
  });

  it("removeTenantTeamMember lässt das nächste verbliebene Team als Hauptteam nachrücken", async () => {
    actorUserId = ownerUserId;
    const member = await prisma.tenantTeamMember.findFirstOrThrow({
      where: { teamId: teamAId, employeeId: employeeIds.a1 },
    });

    await removeTenantTeamMember({ tenantSlug, teamId: teamAId, memberId: member.id });

    const a1After = await prisma.tenantEmployee.findUnique({
      where: { id: employeeIds.a1 },
      select: { team: true },
    });

    expect(a1After?.team).toBe("Team B");
  });

  it("deleteTenantTeam räumt Namenskopien auf; ein gleichnamiges neues Team erbt niemanden", async () => {
    actorUserId = ownerUserId;
    const shift = await prisma.tenantShift.create({
      data: {
        tenantId,
        key: `shift-${RUN_ID}`,
        date: "2027-01-04",
        weekday: "Mo",
        startTime: "08:00",
        endTime: "16:00",
        team: "Team B",
        employeeId: employeeIds.b1,
      },
    });

    await deleteTenantTeam({ tenantSlug, teamId: teamBId });

    const [b1After, mgrAfter, freshAfter, shiftAfter] = await Promise.all([
      prisma.tenantEmployee.findUnique({ where: { id: employeeIds.b1 }, select: { team: true } }),
      prisma.tenantEmployee.findUnique({ where: { id: employeeIds.mgr }, select: { team: true } }),
      prisma.tenantEmployee.findUnique({ where: { id: employeeIds.fresh }, select: { team: true } }),
      prisma.tenantShift.findUnique({ where: { id: shift.id }, select: { team: true } }),
    ]);

    expect(b1After?.team).toBe("");
    expect(freshAfter?.team).toBe("");
    expect(mgrAfter?.team).toBe("Team A");
    expect(shiftAfter?.team).toBe("");

    await prisma.tenantTeam.create({ data: { tenantId, key: `b2-${RUN_ID}`, name: "Team B" } });
    const scope = await managerScope();

    expect(scopeAllowsTarget(scope, { id: employeeIds.b1 })).toBe(false);
    expect(scopeAllowsTarget(scope, { id: employeeIds.mgr })).toBe(true);
  });
});

describe("deleteTenantLocation räumt Namenskopien des Standorts auf", () => {
  it("setzt Hauptstandort, Team-Schnappschuss, Team-Standortliste und Standardstandort nach", async () => {
    actorUserId = ownerUserId;
    const [l1, l2] = await Promise.all([
      prisma.tenantLocation.create({ data: { tenantId, key: `l1-${RUN_ID}`, kind: "Filiale", name: "Nord" } }),
      prisma.tenantLocation.create({ data: { tenantId, key: `l2-${RUN_ID}`, kind: "Filiale", name: "Süd" } }),
    ]);
    const employee = await createEmployee("loc", { location: "Nord" });
    await prisma.tenantLocationMember.createMany({
      data: [
        { locationId: l1.id, employeeId: employee.id, initials: "LO", name: "Loc" },
        { locationId: l2.id, employeeId: employee.id, initials: "LO", name: "Loc" },
      ],
    });
    await addMembership(teamAId, employee.id, "Nord");
    await prisma.tenantTeam.update({ where: { id: teamAId }, data: { locations: "Nord, Süd" } });
    await prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, defaultLocationId: l1.id },
      update: { defaultLocationId: l1.id },
    });

    await deleteTenantLocation({ tenantSlug, locationId: l1.id });

    const [employeeAfter, memberAfter, teamAfter, settingsAfter] = await Promise.all([
      prisma.tenantEmployee.findUnique({ where: { id: employee.id }, select: { location: true } }),
      prisma.tenantTeamMember.findFirst({
        where: { teamId: teamAId, employeeId: employee.id },
        select: { location: true },
      }),
      prisma.tenantTeam.findUnique({ where: { id: teamAId }, select: { locations: true } }),
      prisma.tenantSettings.findUnique({ where: { tenantId }, select: { defaultLocationId: true } }),
    ]);

    expect(employeeAfter?.location).toBe("Süd");
    expect(memberAfter?.location).toBe("Süd");
    expect(teamAfter?.locations).toBe("Süd");
    expect(settingsAfter?.defaultLocationId).toBe("");
  });
});
