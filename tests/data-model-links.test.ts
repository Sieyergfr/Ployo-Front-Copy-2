import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createEmployeeFolderTemplate } from "@/lib/employee-folder-templates";
import { deleteTenantRole } from "@/lib/role-service";
import { createTenantShift } from "@/lib/shift-service";
import { deleteTenantTeam, updateTenantTeam } from "@/lib/team-service";

/**
 * Integrationstest für die Fremdschlüssel aus "Lücken im Datenmodell"
 * Phase 3/4: TenantShift.teamId, Cascade der Team-/Standort-Mitgliedschaften
 * beim Löschen einer Personalakte, Rollen-id in Datei-Freigaben,
 * TenantFileFolder.templateId.
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
const tenantSlug = `test-data-links-${RUN_ID}`;

let tenantId: string;
let counter = 0;

async function createEmployee() {
  counter += 1;

  return prisma.tenantEmployee.create({
    data: {
      tenantId,
      key: `emp-${counter}-${RUN_ID}`,
      initials: "EM",
      name: `Employee ${counter}`,
      employeeNumber: `E${counter}-${RUN_ID}`,
    },
  });
}

async function createFile(label: string, roleIds: string[], userIds: string[] = []) {
  return prisma.tenantFile.create({
    data: {
      tenantId,
      storageKey: `test/${RUN_ID}/${label}`,
      originalName: `${label}.pdf`,
      displayName: `${label}.pdf`,
      uploadedById: actorUserId,
      accessRoleIdsJson: roleIds,
      accessUserIdsJson: userIds,
    },
  });
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Data Links Test ${RUN_ID}` },
  });
  tenantId = tenant.id;

  const owner = await prisma.user.create({
    data: { email: `data-links-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
  });
  actorUserId = owner.id;
  await prisma.tenantMembership.create({ data: { tenantId, userId: owner.id, role: "OWNER" } });
});

afterAll(async () => {
  if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
  if (actorUserId) await prisma.user.deleteMany({ where: { id: actorUserId } });
  await prisma.$disconnect();
});

describe("TenantShift.teamId", () => {
  it("wird beim Anlegen aus dem Teamnamen gesetzt und folgt Umbenennen und Löschen des Teams", async () => {
    const team = await prisma.tenantTeam.create({ data: { tenantId, key: `kueche-${RUN_ID}`, name: "Küche" } });

    const shift = await createTenantShift({
      tenantSlug,
      date: "2027-02-01",
      startTime: "08:00",
      endTime: "12:00",
      breakMinutes: 0,
      team: "Küche",
    });
    const unknown = await createTenantShift({
      tenantSlug,
      date: "2027-02-01",
      startTime: "13:00",
      endTime: "17:00",
      breakMinutes: 0,
      team: "Gibt es nicht",
    });

    const [created, createdUnknown] = await Promise.all([
      prisma.tenantShift.findUniqueOrThrow({ where: { id: shift.id } }),
      prisma.tenantShift.findUniqueOrThrow({ where: { id: unknown.id } }),
    ]);
    expect(created.teamId).toBe(team.id);
    expect(createdUnknown.teamId).toBeNull();
    expect(createdUnknown.team).toBe("Gibt es nicht");

    // Text weicht ab (z. B. Altbestand) — Umbenennen trifft die Schicht trotzdem über teamId.
    await prisma.tenantShift.update({ where: { id: shift.id }, data: { team: "Kueche alt" } });
    await updateTenantTeam({ tenantSlug, teamId: team.id, name: "Küche Nord", locations: [], colorClassName: "bg-[#C9622A]" });

    const renamed = await prisma.tenantShift.findUniqueOrThrow({ where: { id: shift.id } });
    expect(renamed.team).toBe("Küche Nord");

    await prisma.tenantShift.update({ where: { id: shift.id }, data: { team: "Abweichend" } });
    await deleteTenantTeam({ tenantSlug, teamId: team.id });

    const afterDelete = await prisma.tenantShift.findUniqueOrThrow({ where: { id: shift.id } });
    expect(afterDelete.teamId).toBeNull();
    expect(afterDelete.team).toBe("");
  });
});

describe("Mitgliedschaften hängen per Fremdschlüssel an der Personalakte", () => {
  it("fallen beim Löschen der Akte mit weg", async () => {
    const employee = await createEmployee();
    const team = await prisma.tenantTeam.create({ data: { tenantId, key: `t-${RUN_ID}`, name: "Service" } });
    const location = await prisma.tenantLocation.create({
      data: { tenantId, key: `l-${RUN_ID}`, kind: "Filiale", name: "Mitte" },
    });
    await prisma.tenantTeamMember.create({
      data: { teamId: team.id, employeeId: employee.id, initials: "EM", name: "E", location: "", role: "", contract: "" },
    });
    await prisma.tenantLocationMember.create({
      data: { locationId: location.id, employeeId: employee.id, initials: "EM", name: "E" },
    });

    await prisma.tenantEmployee.delete({ where: { id: employee.id } });

    const [teamMembers, locationMembers] = await Promise.all([
      prisma.tenantTeamMember.count({ where: { employeeId: employee.id } }),
      prisma.tenantLocationMember.count({ where: { employeeId: employee.id } }),
    ]);
    expect(teamMembers).toBe(0);
    expect(locationMembers).toBe(0);
  });

  it("lassen sich nicht für eine nicht existierende Akte anlegen", async () => {
    const team = await prisma.tenantTeam.create({ data: { tenantId, key: `t2-${RUN_ID}`, name: "Bar" } });

    await expect(
      prisma.tenantTeamMember.create({
        data: { teamId: team.id, employeeId: "gibt-es-nicht", initials: "X", name: "X", location: "", role: "", contract: "" },
      }),
    ).rejects.toThrow();
  });
});

describe("Rolle löschen räumt Datei-Freigaben auf, ohne sie zu öffnen", () => {
  it("entfernt die id nur, wo danach noch eine Freigabe bleibt", async () => {
    const [role, other] = await Promise.all([
      prisma.tenantRole.create({ data: { tenantId, key: `weg-${RUN_ID}`, name: "Weg" } }),
      prisma.tenantRole.create({ data: { tenantId, key: `bleibt-${RUN_ID}`, name: "Bleibt" } }),
    ]);
    const onlyRole = await createFile("only-role", [role.id]);
    const withOtherRole = await createFile("with-other-role", [role.id, other.id]);
    const withUser = await createFile("with-user", [role.id], [actorUserId]);

    await deleteTenantRole({ tenantSlug, roleId: role.id });

    const files = await prisma.tenantFile.findMany({
      where: { id: { in: [onlyRole.id, withOtherRole.id, withUser.id] } },
      select: { id: true, accessRoleIdsJson: true },
    });
    const roleIdsOf = (id: string) => files.find((file) => file.id === id)?.accessRoleIdsJson;

    expect(roleIdsOf(onlyRole.id)).toEqual([role.id]);
    expect(roleIdsOf(withOtherRole.id)).toEqual([other.id]);
    expect(roleIdsOf(withUser.id)).toEqual([]);
  });
});

describe("TenantFileFolder.templateId", () => {
  it("merkt sich bei Ordnern aus einer Vorlage die Vorlage", async () => {
    const employee = await createEmployee();

    const template = await createEmployeeFolderTemplate({ tenantSlug, name: "Zeugnisse" });

    const folder = await prisma.tenantFileFolder.findFirst({
      where: { tenantId, employeeId: employee.id, name: "Zeugnisse" },
      select: { templateId: true },
    });
    expect(folder?.templateId).toBe(template.id);
  });
});
