import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createTenantVacationRequest,
  updateTenantVacationRequest,
} from "@/lib/vacation-service";

/**
 * Integrationstest gegen die echte Test-DB für QA-Bug BUG-001 (überlappende
 * Urlaubsanträge wurden bisher klaglos angenommen und doppelt genehmigt) und
 * BUG-009 (Urlaub außerhalb der Beschäftigungsdauer wurde bisher akzeptiert).
 * Setup-Muster wie tests/employee-service.test.ts.
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
const tenantSlug = `test-vacation-overlap-${RUN_ID}`;

let tenantId: string;

async function createEmployee(overrides: {
  name: string;
  startDate?: string;
  endDate?: string;
  status?: "active" | "former";
}) {
  return prisma.tenantEmployee.create({
    data: {
      tenantId,
      key: `${overrides.name.toLowerCase().replace(/\s+/g, "-")}-${RUN_ID}`,
      initials: overrides.name.slice(0, 2).toUpperCase(),
      name: overrides.name,
      employeeNumber: `${overrides.name}-${RUN_ID}`,
      startDate: overrides.startDate ?? "",
      endDate: overrides.endDate ?? "",
      status: overrides.status ?? "active",
    },
  });
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Vacation Overlap Test ${RUN_ID}` },
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
});

afterAll(async () => {
  if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
  if (actorUserId) await prisma.user.deleteMany({ where: { id: actorUserId } });
  await prisma.$disconnect();
});

describe("createTenantVacationRequest — Überschneidungsprüfung (BUG-001)", () => {
  it("lehnt einen zweiten, identischen Antrag für denselben Zeitraum ab", async () => {
    const employee = await createEmployee({ name: "Overlap Eins" });

    await createTenantVacationRequest({
      tenantSlug,
      employeeId: employee.id,
      startDate: "2027-09-30",
      endDate: "2027-09-30",
      note: "",
    });

    await expect(
      createTenantVacationRequest({
        tenantSlug,
        employeeId: employee.id,
        startDate: "2027-09-30",
        endDate: "2027-09-30",
        note: "",
      }),
    ).rejects.toThrow(/bereits ein offener oder genehmigter Urlaubsantrag/);
  });

  it("lehnt einen nur teilweise überlappenden Zeitraum ab, erlaubt aber einen direkt anschließenden", async () => {
    const employee = await createEmployee({ name: "Overlap Zwei" });

    await createTenantVacationRequest({
      tenantSlug,
      employeeId: employee.id,
      startDate: "2027-10-10",
      endDate: "2027-10-15",
      note: "",
    });

    // Überlappt am Rand (10-12).
    await expect(
      createTenantVacationRequest({
        tenantSlug,
        employeeId: employee.id,
        startDate: "2027-10-08",
        endDate: "2027-10-12",
        note: "",
      }),
    ).rejects.toThrow(/bereits ein offener oder genehmigter Urlaubsantrag/);

    // Direkt anschließend (ab 16.), keine Überschneidung — erlaubt.
    await expect(
      createTenantVacationRequest({
        tenantSlug,
        employeeId: employee.id,
        startDate: "2027-10-16",
        endDate: "2027-10-18",
        note: "",
      }),
    ).resolves.toBeTruthy();
  });

  it("erlaubt eine Überschneidung mit einem bereits abgelehnten Antrag", async () => {
    const employee = await createEmployee({ name: "Overlap Drei" });

    const rejected = await createTenantVacationRequest({
      tenantSlug,
      employeeId: employee.id,
      startDate: "2027-11-01",
      endDate: "2027-11-05",
      note: "",
    });
    await prisma.tenantVacationRequest.update({
      where: { id: rejected.id },
      data: { status: "rejected" },
    });

    await expect(
      createTenantVacationRequest({
        tenantSlug,
        employeeId: employee.id,
        startDate: "2027-11-02",
        endDate: "2027-11-03",
        note: "",
      }),
    ).resolves.toBeTruthy();
  });

  it("berücksichtigt die Überschneidungsprüfung auch beim Bearbeiten eines Antrags", async () => {
    const employee = await createEmployee({ name: "Overlap Vier" });

    await createTenantVacationRequest({
      tenantSlug,
      employeeId: employee.id,
      startDate: "2027-12-01",
      endDate: "2027-12-05",
      note: "",
    });
    const second = await createTenantVacationRequest({
      tenantSlug,
      employeeId: employee.id,
      startDate: "2027-12-10",
      endDate: "2027-12-12",
      note: "",
    });

    // Den zweiten Antrag so verschieben, dass er den ersten überlappt.
    await expect(
      updateTenantVacationRequest({
        tenantSlug,
        requestId: second.id,
        startDate: "2027-12-04",
        endDate: "2027-12-06",
        note: "",
      }),
    ).rejects.toThrow(/bereits ein offener oder genehmigter Urlaubsantrag/);
  });
});

describe("createTenantVacationRequest — Beschäftigungsdauer (BUG-009)", () => {
  it("lehnt einen Antrag vor dem Eintrittsdatum ab", async () => {
    const employee = await createEmployee({
      name: "Zukuenftig Eins",
      startDate: "2027-10-01",
    });

    await expect(
      createTenantVacationRequest({
        tenantSlug,
        employeeId: employee.id,
        startDate: "2027-09-28",
        endDate: "2027-09-28",
        note: "",
      }),
    ).rejects.toThrow(/vor dem Eintrittsdatum/);

    await expect(
      createTenantVacationRequest({
        tenantSlug,
        employeeId: employee.id,
        startDate: "2027-10-05",
        endDate: "2027-10-06",
        note: "",
      }),
    ).resolves.toBeTruthy();
  });

  it("lehnt einen Antrag nach dem Austrittsdatum eines ausgeschiedenen Mitarbeiters ab", async () => {
    const employee = await createEmployee({
      name: "Ausgeschieden Eins",
      startDate: "2020-01-01",
      endDate: "2027-06-30",
      status: "former",
    });

    await expect(
      createTenantVacationRequest({
        tenantSlug,
        employeeId: employee.id,
        startDate: "2027-07-05",
        endDate: "2027-07-06",
        note: "",
      }),
    ).rejects.toThrow(/nach dem Austrittsdatum/);
  });
});
