import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

/** Globale Suche (⌘K): Treffer je Bereich und Rechte des Aufrufers. */

let currentUserId = "";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: currentUserId, name: "Test Actor", email: "actor@test.invalid" },
      }),
    },
  },
}));

const { searchTenant } = await import("@/lib/global-search");

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-search-${RUN_ID}`;

let tenantId: string;
let ownerUserId: string;
let plainUserId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { slug: tenantSlug, name: `Suche ${RUN_ID}` } });
  tenantId = tenant.id;

  const [owner, plain] = await Promise.all(
    ["owner", "plain"].map((name) =>
      prisma.user.create({ data: { email: `${name}-search-${RUN_ID}@ployo.invalid`, name, emailVerified: true } }),
    ),
  );
  ownerUserId = owner.id;
  plainUserId = plain.id;

  const plainRole = await prisma.tenantRole.create({
    data: {
      tenantId,
      key: "plain",
      name: "Ohne Rechte",
      permissions: {
        create: ["employees", "locations", "teams", "files"].map((area) => ({ area, level: "none", scope: "all" })),
      },
    },
  });

  await prisma.tenantMembership.createMany({
    data: [
      { tenantId, userId: ownerUserId, role: "OWNER" },
      { tenantId, userId: plainUserId, role: "EMPLOYEE", roleId: plainRole.id },
    ],
  });

  await prisma.tenantEmployee.create({
    data: { tenantId, key: `rosa-${RUN_ID}`, employeeNumber: `S-${RUN_ID}`, initials: "RR", name: "Rosa Rosenthal", role: "Köchin" },
  });
  await prisma.tenantTeam.create({ data: { tenantId, key: `rosen-${RUN_ID}`, name: "Rosengarten" } });
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { slug: tenantSlug } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, plainUserId] } } });
  await prisma.$disconnect();
});

describe("Globale Suche", () => {
  it("findet Mitarbeiter und Teams mit Link", async () => {
    currentUserId = ownerUserId;
    const results = await searchTenant(tenantSlug, "ros");

    expect(results.map((result) => [result.kind, result.title])).toEqual([
      ["employee", "Rosa Rosenthal"],
      ["team", "Rosengarten"],
    ]);
    expect(results[0].href).toBe(`/u/${tenantSlug}/employees/rosa-${RUN_ID}`);
    expect(await searchTenant(tenantSlug, "r")).toEqual([]);
  });

  it("zeigt ohne Berechtigung nichts aus den Bereichen", async () => {
    currentUserId = plainUserId;

    expect(await searchTenant(tenantSlug, "ros")).toEqual([]);
  });
});
