import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createTenantEmployeeRecord,
  updateTenantEmployee,
} from "@/lib/employee-service";

/**
 * Integrationstest gegen die echte Test-DB für die Kern-Schreibpfade der
 * Mitarbeiterverwaltung — insbesondere die auf JOIN-Tabellen normalisierten
 * Relationen (timeline, contractDetails; siehe Migration
 * 20260812000000_normalize_legacy_json_columns), die zuvor als reine
 * JSON-Blob-Spalten liefen und dafür keinerlei Testabdeckung hatten.
 *
 * `updateTenantEmployee` hängt (anders als `createTenantEmployeeRecord`)
 * über `requireEmployeeManager` an next/headers()/der echten Session — dafür
 * wird hier minimal gemockt, mit einem echten OWNER-Fixture-Nutzer als
 * "angemeldetem" Akteur.
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
const tenantSlug = `test-employee-service-${RUN_ID}`;

let tenantId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Employee Service Test ${RUN_ID}` },
  });
  tenantId = tenant.id;

  const actor = await prisma.user.create({
    data: {
      email: `actor-${RUN_ID}@ployo.invalid`,
      name: "Test Actor",
      emailVerified: true,
    },
  });
  actorUserId = actor.id;

  await prisma.tenantMembership.create({
    data: { tenantId, userId: actor.id, role: "OWNER" },
  });

  await prisma.tenantLocation.createMany({
    data: [
      { tenantId, key: `standort-a-${RUN_ID}`, kind: "Filiale", name: "Standort A" },
      { tenantId, key: `standort-b-${RUN_ID}`, kind: "Filiale", name: "Standort B" },
    ],
  });

  await prisma.tenantRole.createMany({
    data: [
      { tenantId, key: `entwicklerin-${RUN_ID}`, name: "Entwicklerin" },
      { tenantId, key: `tech-lead-${RUN_ID}`, name: "Tech Lead" },
    ],
  });
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { id: actorUserId } });
  await prisma.$disconnect();
});

describe("createTenantEmployeeRecord", () => {
  it("legt einen Mitarbeiter mit Timeline- und ContractDetails-Relation an", async () => {
    const employee = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Ada",
        lastName: "Lovelace",
        email: `ada-${RUN_ID}@ployo.invalid`,
        location: "",
        team: "",
        role: "",
      },
    });

    expect(employee.name).toBe("Ada Lovelace");
    expect(employee.timeline).toHaveLength(1);
    expect(employee.timeline[0]).toMatchObject({
      title: "Mitarbeiter angelegt",
      tone: "success",
    });
    expect(employee.contractDetails.linkedFileMeta).toBe("Noch nicht hochgeladen");
    expect(employee.contractDetails.clauses).toEqual([]);

    const stored = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: employee.dbId },
      include: { timeline: true, contractDetails: true },
    });
    expect(stored.timeline).toHaveLength(1);
    expect(stored.contractDetails).not.toBeNull();
  });
});

describe("updateTenantEmployee", () => {
  it("hängt bei Standort-/Rollenänderung neue Timeline-Einträge an, ohne alte zu verlieren", async () => {
    const created = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Grace",
        lastName: "Hopper",
        email: `grace-${RUN_ID}@ployo.invalid`,
        location: "Standort A",
        role: "Entwicklerin",
      },
    });

    const updated = await updateTenantEmployee({
      tenantSlug,
      employeeId: created.dbId!,
      location: "Standort B",
      role: "Tech Lead",
    });

    expect(updated.timeline).toHaveLength(3);
    const titles = updated.timeline.map((entry) => entry.title);
    expect(titles).toContain("Mitarbeiter angelegt");
    expect(titles).toContain("Standort geändert: Standort A → Standort B");
    expect(titles).toContain("Rolle geändert: Entwicklerin → Tech Lead");

    // Neueste zuerst.
    expect(updated.timeline[0].title).not.toBe("Mitarbeiter angelegt");
  });

  it("bewahrt manuell erfasste Vertragsdetails über ein Update hinweg", async () => {
    const created = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Katherine",
        lastName: "Johnson",
        email: `katherine-${RUN_ID}@ployo.invalid`,
      },
    });

    await updateTenantEmployee({
      tenantSlug,
      employeeId: created.dbId!,
      contractDetailsSubmitted: true,
      position: "Mathematikerin",
      department: "Forschung",
    });

    const secondUpdate = await updateTenantEmployee({
      tenantSlug,
      employeeId: created.dbId!,
      // Kein contractDetailsSubmitted-Flag: bestehende Werte sollen bleiben.
      phone: "+49 30 1234567",
    });

    expect(secondUpdate.contractDetails.position).toBe("Mathematikerin");
    expect(secondUpdate.contractDetails.department).toBe("Forschung");
    expect(secondUpdate.phone).toBe("+49 30 1234567");
  });
});
