import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * App-Zugang sperren (M2): Sperre greift zentral in jeder Mandanten-Prüfung,
 * wird von der API als 401 gemeldet, beendet Sitzungen (ohne weitere Betriebe)
 * und schützt Inhaber und das eigene Konto.
 */

let currentUserId = "";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: currentUserId, name: "Test Actor", email: "actor@test.invalid" },
      }),
    },
  },
}));

const { setEmployeeAppAccessLock, ACCESS_LOCK_ERRORS } = await import("@/lib/employee-access-lock");
const { requireTenantMembership, TENANT_ACCESS_LOCKED_MESSAGE } = await import("@/lib/tenant-access");
const { mapSelfServiceError } = await import("@/lib/api/self-service-errors");

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-lock-${RUN_ID}`;
let tenantId = "";
let ownerUserId = "";
let employeeUserId = "";
let employeeId = "";
let ownerEmployeeId = "";

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { slug: tenantSlug, name: `Sperre ${RUN_ID}` } });
  tenantId = tenant.id;
  await prisma.tenantSettings.create({ data: { tenantId } });

  const [owner, employeeUser] = await Promise.all(
    ["owner", "employee"].map((name) =>
      prisma.user.create({ data: { email: `${name}-lock-${RUN_ID}@ployo.invalid`, name, emailVerified: true } }),
    ),
  );
  ownerUserId = owner.id;
  employeeUserId = employeeUser.id;

  await prisma.tenantMembership.createMany({
    data: [
      { tenantId, userId: ownerUserId, role: "OWNER" },
      { tenantId, userId: employeeUserId, role: "EMPLOYEE" },
    ],
  });

  const [employee, ownerEmployee] = await Promise.all([
    prisma.tenantEmployee.create({
      data: { tenantId, key: `emp-${RUN_ID}`, userId: employeeUserId, initials: "EM", name: "Erika Muster", employeeNumber: `L-${RUN_ID}` },
    }),
    prisma.tenantEmployee.create({
      data: { tenantId, key: `own-${RUN_ID}`, userId: ownerUserId, initials: "OW", name: "Olaf Owner", employeeNumber: `O-${RUN_ID}` },
    }),
  ]);
  employeeId = employee.id;
  ownerEmployeeId = ownerEmployee.id;

  await prisma.session.create({
    data: { userId: employeeUserId, token: `tok-${RUN_ID}`, expiresAt: new Date(Date.now() + 86_400_000) },
  });
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { slug: tenantSlug } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, employeeUserId] } } });
  await prisma.$disconnect();
});

describe("App-Zugang sperren", () => {
  it("sperrt den Zugang, beendet Sitzungen und meldet 401", async () => {
    currentUserId = ownerUserId;
    await setEmployeeAppAccessLock({ tenantSlug, employeeId, locked: true, reason: "Freistellung" });

    expect(await prisma.session.count({ where: { userId: employeeUserId } })).toBe(0);

    currentUserId = employeeUserId;
    const error = await requireTenantMembership(tenantSlug).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(TENANT_ACCESS_LOCKED_MESSAGE);
    expect(mapSelfServiceError(error).status).toBe(401);
  });

  it("gibt den Zugang wieder frei", async () => {
    currentUserId = ownerUserId;
    await setEmployeeAppAccessLock({ tenantSlug, employeeId, locked: false });

    currentUserId = employeeUserId;
    await expect(requireTenantMembership(tenantSlug)).resolves.toMatchObject({ tenantId });
  });

  it("schützt Inhaber und das eigene Konto", async () => {
    currentUserId = ownerUserId;

    await expect(setEmployeeAppAccessLock({ tenantSlug, employeeId: ownerEmployeeId, locked: true })).rejects.toThrow(
      ACCESS_LOCK_ERRORS.self,
    );
  });
});
