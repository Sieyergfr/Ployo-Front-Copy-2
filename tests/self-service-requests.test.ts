import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * Zugriff anfragen, Inhaber:in erinnern, Einladung ablehnen: Audit-Eintrag,
 * Posteingang der Inhaber:innen, 24-Stunden-Sperre und Einladungsstatus.
 */

let actorUserId: string;

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: actorUserId, name: "Mia Mitarbeiterin", email: `mia-${RUN_ID}@ployo.invalid`, twoFactorEnabled: false },
      }),
    },
  },
}));

const RUN_ID = Math.random().toString(36).slice(2);
const requests = await import("@/lib/self-service-requests");
const tenantSlug = `test-self-requests-${RUN_ID}`;

let tenantId: string;
let ownerUserId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { slug: tenantSlug, name: `Anfragen ${RUN_ID}` } });
  tenantId = tenant.id;

  const [owner, actor] = await Promise.all([
    prisma.user.create({ data: { email: `owner-${RUN_ID}@ployo.invalid`, name: "Olga Owner", emailVerified: true } }),
    prisma.user.create({ data: { email: `mia-${RUN_ID}@ployo.invalid`, name: "Mia Mitarbeiterin", emailVerified: true } }),
  ]);
  ownerUserId = owner.id;
  actorUserId = actor.id;

  await prisma.tenantMembership.createMany({
    data: [
      { tenantId, userId: owner.id, role: "OWNER" },
      { tenantId, userId: actor.id, role: "EMPLOYEE" },
    ],
  });
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, actorUserId] } } });
  await prisma.$disconnect();
});

async function ownerInbox(entityType: string) {
  return prisma.tenantEmployeeNotification.findMany({ where: { tenantId, userId: ownerUserId, entityType } });
}

describe("Zugriff anfragen", () => {
  it("benachrichtigt Inhaber:innen, protokolliert und sperrt 24 Stunden", async () => {
    const recipients = await requests.requestTenantAccess({ tenantSlug, path: `/u/${tenantSlug}/reports?tab=x` });

    expect(recipients).toBe(1);
    expect(await ownerInbox("access-request")).toHaveLength(1);

    const audit = await prisma.tenantAuditLog.findFirst({ where: { tenantId, action: requests.ACCESS_REQUEST_ACTION } });

    expect(audit).toMatchObject({ actorId: actorUserId, detail: "/reports" });
    await expect(requests.requestTenantAccess({ tenantSlug })).rejects.toThrow(/24 Stunden/);
  });
});

describe("Inhaber:in erinnern", () => {
  it("geht an Inhaber:innen und Admins, nicht an die anfragende Person", async () => {
    expect(await requests.requestSubscriptionReminder(tenantSlug)).toBe(1);
    expect(await ownerInbox("billing")).toHaveLength(1);
    await expect(requests.requestSubscriptionReminder(tenantSlug)).rejects.toThrow(/24 Stunden/);
  });

  it("lehnt Nicht-Mitglieder ab", async () => {
    await expect(requests.requestSubscriptionReminder(`gibt-es-nicht-${RUN_ID}`)).rejects.toThrow("FORBIDDEN");
  });
});

describe("Einladung ablehnen", () => {
  it("setzt die Einladung auf abgelaufen und meldet es der Verwaltung", async () => {
    const invitation = await prisma.tenantInvitation.create({
      data: { tenantId, email: `neu-${RUN_ID}@ployo.invalid`, expiresAt: new Date(Date.now() + 86_400_000) },
    });

    await requests.declineInvitationByToken(invitation.token);

    const stored = await prisma.tenantInvitation.findUniqueOrThrow({ where: { id: invitation.id } });

    expect(stored.status).toBe("EXPIRED");
    expect(await ownerInbox("invitation")).toHaveLength(1);
    await expect(requests.declineInvitationByToken(invitation.token)).rejects.toThrow("Einladung nicht gefunden");
  });
});
