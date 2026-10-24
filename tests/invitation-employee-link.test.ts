import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { acceptInvitationForUser } from "@/lib/invitation-service";
import { createTenantInvitation } from "@/lib/settings-service";

/**
 * Integrationstest für die Verknüpfung Personalakte ↔ Konto beim Annehmen
 * einer Einladung. Vorher verknüpfte `updateMany` per exaktem E-Mail-Abgleich
 * alle freien Akten mit dem Konto (bei Dubletten mehrere, bei geänderter oder
 * anders geschriebener E-Mail keine). Jetzt: Einladung aus der Akte merkt sich
 * die Akte, ein Konto hängt pro Mandant an höchstens einer Akte.
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

vi.mock("@/lib/email", () => ({
  isEmailConfigured: () => false,
  sendInvitationEmail: async () => undefined,
}));

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-invite-link-${RUN_ID}`;

let tenantId: string;
const userIds: string[] = [];
let counter = 0;

async function createUser(email: string) {
  const user = await prisma.user.create({ data: { email, name: email, emailVerified: true } });
  userIds.push(user.id);

  return user;
}

async function createEmployee(email: string) {
  counter += 1;

  return prisma.tenantEmployee.create({
    data: {
      tenantId,
      key: `emp-${counter}-${RUN_ID}`,
      initials: "EM",
      name: `Employee ${counter}`,
      employeeNumber: `E${counter}-${RUN_ID}`,
      email,
    },
  });
}

function mail(label: string) {
  return `invite-link-${RUN_ID}-${label}@ployo.invalid`;
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Invite Link Test ${RUN_ID}` },
  });
  tenantId = tenant.id;

  const owner = await createUser(mail("owner"));
  actorUserId = owner.id;
  await prisma.tenantMembership.create({ data: { tenantId, userId: owner.id, role: "OWNER" } });
});

afterAll(async () => {
  if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("Einladung aus der Personalakte", () => {
  it("merkt sich die Akte und verknüpft genau sie, auch wenn die E-Mail in der Akte geändert wurde", async () => {
    const employee = await createEmployee(mail("anna"));
    const invitation = await createTenantInvitation({
      tenantSlug,
      email: mail("anna"),
      role: "EMPLOYEE",
      employeeId: employee.id,
    });

    expect(invitation.employeeId).toBe(employee.id);

    await prisma.tenantEmployee.update({
      where: { id: employee.id },
      data: { email: mail("anna-neu") },
    });

    const user = await createUser(mail("anna"));
    const result = await acceptInvitationForUser(invitation.token, { id: user.id, email: user.email });

    expect(result.ok).toBe(true);
    const linked = await prisma.tenantEmployee.findUnique({ where: { id: employee.id }, select: { userId: true } });
    expect(linked?.userId).toBe(user.id);
  });

  it("lehnt eine Akte aus einem anderen Mandanten ab", async () => {
    const other = await prisma.tenant.create({ data: { slug: `${tenantSlug}-other`, name: "Other" } });
    try {
      const foreign = await prisma.tenantEmployee.create({
        data: { tenantId: other.id, key: `f-${RUN_ID}`, initials: "FO", name: "Foreign", employeeNumber: "F1" },
      });

      await expect(
        createTenantInvitation({ tenantSlug, email: mail("foreign"), role: "EMPLOYEE", employeeId: foreign.id }),
      ).rejects.toThrow("Mitarbeiter wurde nicht gefunden.");
    } finally {
      await prisma.tenant.delete({ where: { id: other.id } });
    }
  });

  it("verknüpft nichts, wenn die gemerkte Akte schon an einem anderen Konto hängt — die Mitgliedschaft entsteht trotzdem", async () => {
    const holder = await createUser(mail("holder"));
    const employee = await createEmployee(mail("taken"));
    await prisma.tenantEmployee.update({ where: { id: employee.id }, data: { userId: holder.id } });
    const invitation = await createTenantInvitation({
      tenantSlug,
      email: mail("taken"),
      role: "EMPLOYEE",
      employeeId: employee.id,
    });

    const user = await createUser(mail("taken"));
    const result = await acceptInvitationForUser(invitation.token, { id: user.id, email: user.email });

    expect(result.ok).toBe(true);
    const [after, membership] = await Promise.all([
      prisma.tenantEmployee.findUnique({ where: { id: employee.id }, select: { userId: true } }),
      prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId: user.id } } }),
    ]);
    expect(after?.userId).toBe(holder.id);
    expect(membership).not.toBeNull();
  });
});

describe("Einladung ohne Akte (Einstellungen)", () => {
  it("verknüpft die einzige freie Akte mit passender E-Mail, unabhängig von Groß-/Kleinschreibung", async () => {
    const employee = await createEmployee(mail("Bert"));
    const invitation = await createTenantInvitation({ tenantSlug, email: mail("bert"), role: "EMPLOYEE" });

    expect(invitation.employeeId).toBeNull();

    const user = await createUser(mail("bert"));
    await acceptInvitationForUser(invitation.token, { id: user.id, email: user.email });

    const linked = await prisma.tenantEmployee.findUnique({ where: { id: employee.id }, select: { userId: true } });
    expect(linked?.userId).toBe(user.id);
  });

  it("verknüpft bei zwei freien Akten mit derselben E-Mail keine von beiden", async () => {
    const first = await createEmployee(mail("dup"));
    const second = await createEmployee(mail("dup"));
    const invitation = await createTenantInvitation({ tenantSlug, email: mail("dup"), role: "EMPLOYEE" });

    const user = await createUser(mail("dup"));
    const result = await acceptInvitationForUser(invitation.token, { id: user.id, email: user.email });

    expect(result.ok).toBe(true);
    const linked = await prisma.tenantEmployee.findMany({
      where: { id: { in: [first.id, second.id] } },
      select: { userId: true },
    });
    expect(linked.every((employee) => employee.userId === null)).toBe(true);
  });

  it("lässt ein bereits verknüpftes Konto bei seiner Akte", async () => {
    const user = await createUser(mail("carla"));
    const own = await createEmployee(mail("carla-alt"));
    await prisma.tenantEmployee.update({ where: { id: own.id }, data: { userId: user.id } });
    const other = await createEmployee(mail("carla"));
    const invitation = await createTenantInvitation({ tenantSlug, email: mail("carla"), role: "EMPLOYEE" });

    const result = await acceptInvitationForUser(invitation.token, { id: user.id, email: user.email });

    expect(result.ok).toBe(true);
    const otherAfter = await prisma.tenantEmployee.findUnique({ where: { id: other.id }, select: { userId: true } });
    expect(otherAfter?.userId).toBeNull();
  });
});

describe("Schema: Konto ↔ Akte", () => {
  it("erlaubt pro Mandant nur eine Akte je Konto", async () => {
    const user = await createUser(mail("unique"));
    const first = await createEmployee(mail("unique-1"));
    const second = await createEmployee(mail("unique-2"));
    await prisma.tenantEmployee.update({ where: { id: first.id }, data: { userId: user.id } });

    await expect(
      prisma.tenantEmployee.update({ where: { id: second.id }, data: { userId: user.id } }),
    ).rejects.toThrow();
  });

  it("löst die Verknüpfung beim Löschen des Kontos per Fremdschlüssel (SET NULL)", async () => {
    const user = await prisma.user.create({
      data: { email: mail("deleted"), name: "Deleted", emailVerified: true },
    });
    const employee = await createEmployee(mail("deleted"));
    await prisma.tenantEmployee.update({ where: { id: employee.id }, data: { userId: user.id } });

    await prisma.user.delete({ where: { id: user.id } });

    const after = await prisma.tenantEmployee.findUnique({ where: { id: employee.id }, select: { userId: true } });
    expect(after?.userId).toBeNull();
  });
});
