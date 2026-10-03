import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTenantFileFolder } from "@/lib/storage/storage.service";

/**
 * Integrationstest für QA-Bug BUG-024: ein Ordnername, der bereits als
 * AKTIVER Ordner existiert, wurde bisher klaglos verworfen — der zugrunde
 * liegende `upsert` ist eigentlich dafür gedacht, einen zuvor gelöschten
 * (soft-deleted) Ordner unter demselben Namen wiederzubeleben, griff aber
 * auch bei einer echten Namenskollision.
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
const tenantSlug = `test-folder-dup-${RUN_ID}`;

let tenantId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Folder Dup Test ${RUN_ID}` },
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
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { id: actorUserId } });
  await prisma.$disconnect();
});

describe("createTenantFileFolder — Namenskollision (BUG-024)", () => {
  it("lehnt einen bereits existierenden aktiven Ordnernamen ab, statt ihn klaglos zu verwerfen", async () => {
    const name = `Test-${RUN_ID}`;
    await createTenantFileFolder({ tenantSlug, name });

    await expect(createTenantFileFolder({ tenantSlug, name })).rejects.toThrow(
      /existiert bereits/,
    );
  });

  it("erlaubt weiterhin, einen zuvor archivierten (soft-deleted) Ordner unter demselben Namen wiederzubeleben", async () => {
    const name = `Archiviert-${RUN_ID}`;
    const created = await createTenantFileFolder({ tenantSlug, name });

    await prisma.tenantFileFolder.update({
      where: { id: created.id },
      data: { status: "inactive" },
    });

    const revived = await createTenantFileFolder({ tenantSlug, name });
    expect(revived.id).toBe(created.id);

    const stored = await prisma.tenantFileFolder.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.status).toBe("active");
  });

  it("erlaubt denselben Namen unter verschiedenen Owner-Scopes (kein globaler Konflikt)", async () => {
    const name = `Geteilt-${RUN_ID}`;
    const employee = await prisma.tenantEmployee.create({
      data: {
        tenantId,
        key: `owner-${RUN_ID}`,
        initials: "OW",
        name: `Owner ${RUN_ID}`,
        employeeNumber: `owner-${RUN_ID}`,
      },
    });

    await createTenantFileFolder({ tenantSlug, name });
    await expect(
      createTenantFileFolder({
        tenantSlug,
        name,
        ownerType: "employee",
        ownerId: employee.id,
      }),
    ).resolves.toBeTruthy();
  });
});
