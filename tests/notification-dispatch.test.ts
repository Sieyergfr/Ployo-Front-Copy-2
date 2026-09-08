import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * Regressionstest für Sicherheitsaudit-Finding M11: die Kanal-Schalter
 * `TenantSettings.mailNotifications`/`mobilePush`/`inAppNotifications`
 * müssen jeweils NUR ihren eigenen Kanal steuern, nicht alle zugleich (vorher
 * fungierte `mailNotifications` fälschlich als Vorfilter für jeden Kanal, und
 * `mobilePush`/`inAppNotifications` wurden nirgends geprüft).
 *
 * Testet die echte `dispatchNotification` (kein Mock des Moduls selbst,
 * anders als tests/security-audit-critical.test.ts) — nur die externen
 * Versandwege (E-Mail/Expo) sind gemockt.
 */
const sentEmails: Array<{ to: string }> = [];
const sentPushes: Array<{ to: string }> = [];

vi.mock("@/lib/email", () => ({
  isEmailConfigured: () => true,
  sendEmail: async (input: { to: string }) => {
    sentEmails.push({ to: input.to });
  },
}));

vi.mock("@/lib/notifications/expo-push", () => ({
  isExpoPushToken: (token: string) => token.startsWith("ExponentPushToken"),
  toPushBody: (text: string) => text,
  sendExpoPushMessages: async (messages: Array<{ to: string }>) => {
    sentPushes.push(...messages);
    return messages.map((message) => ({ token: message.to, error: undefined }));
  },
}));

const RUN_ID = Math.random().toString(36).slice(2);
const tenantIds: string[] = [];
const userIds: string[] = [];

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

async function setupRecipient(input: {
  mailNotifications: boolean;
  mobilePush: boolean;
  inAppNotifications: boolean;
}) {
  const tenant = await prisma.tenant.create({
    data: { slug: `m11-tenant-${RUN_ID}-${Math.random().toString(36).slice(2)}`, name: `M11 Tenant ${RUN_ID}` },
  });
  tenantIds.push(tenant.id);

  await prisma.tenantSettings.create({
    data: {
      tenantId: tenant.id,
      mailNotifications: input.mailNotifications,
      mobilePush: input.mobilePush,
      inAppNotifications: input.inAppNotifications,
    },
  });

  const user = await prisma.user.create({
    data: { email: `m11-user-${RUN_ID}-${Math.random().toString(36).slice(2)}@ployo.invalid`, name: "Recipient", emailVerified: true },
  });
  userIds.push(user.id);

  await prisma.userPreference.create({
    data: { userId: user.id, notifyVacationEvents: true, notifyShiftEvents: true, pushEnabled: true },
  });
  await prisma.pushSubscription.create({
    data: { userId: user.id, token: `ExponentPushToken[m11-${RUN_ID}-${Math.random().toString(36).slice(2)}]` },
  });

  return { tenant, user };
}

describe("dispatchNotification — Kanal-Schalter je Mandant (Audit-Finding M11)", () => {
  it("mailNotifications=false unterdrückt nur E-Mail, nicht Push/In-App", async () => {
    const { tenant, user } = await setupRecipient({
      mailNotifications: false,
      mobilePush: true,
      inAppNotifications: true,
    });
    const before = { emails: sentEmails.length, pushes: sentPushes.length };

    await dispatchNotification({
      userId: user.id,
      email: user.email,
      message: { key: "vacationDecided", tenantName: tenant.name, startDate: "2027-01-01", endDate: "2027-01-02", status: "approved" },
      tenantId: tenant.id,
      category: "vacation",
    });

    expect(sentEmails.length).toBe(before.emails);
    expect(sentPushes.length).toBe(before.pushes + 1);
    const inAppRow = await prisma.tenantEmployeeNotification.findFirst({ where: { userId: user.id, tenantId: tenant.id } });
    expect(inAppRow).not.toBeNull();
  });

  it("mobilePush=false unterdrückt nur Push, nicht E-Mail/In-App", async () => {
    const { tenant, user } = await setupRecipient({
      mailNotifications: true,
      mobilePush: false,
      inAppNotifications: true,
    });
    const before = { emails: sentEmails.length, pushes: sentPushes.length };

    await dispatchNotification({
      userId: user.id,
      email: user.email,
      message: { key: "vacationDecided", tenantName: tenant.name, startDate: "2027-01-01", endDate: "2027-01-02", status: "approved" },
      tenantId: tenant.id,
      category: "vacation",
    });

    expect(sentEmails.length).toBe(before.emails + 1);
    expect(sentPushes.length).toBe(before.pushes);
    const inAppRow = await prisma.tenantEmployeeNotification.findFirst({ where: { userId: user.id, tenantId: tenant.id } });
    expect(inAppRow).not.toBeNull();
  });

  it("inAppNotifications=false unterdrückt nur die Inbox-Speicherung, nicht E-Mail/Push", async () => {
    const { tenant, user } = await setupRecipient({
      mailNotifications: true,
      mobilePush: true,
      inAppNotifications: false,
    });
    const before = { emails: sentEmails.length, pushes: sentPushes.length };

    await dispatchNotification({
      userId: user.id,
      email: user.email,
      message: { key: "vacationDecided", tenantName: tenant.name, startDate: "2027-01-01", endDate: "2027-01-02", status: "approved" },
      tenantId: tenant.id,
      category: "vacation",
    });

    expect(sentEmails.length).toBe(before.emails + 1);
    expect(sentPushes.length).toBe(before.pushes + 1);
    const inAppRow = await prisma.tenantEmployeeNotification.findFirst({ where: { userId: user.id, tenantId: tenant.id } });
    expect(inAppRow).toBeNull();
  });

  it("mit allen drei Kanälen aktiv gehen alle drei tatsächlich raus", async () => {
    const { tenant, user } = await setupRecipient({
      mailNotifications: true,
      mobilePush: true,
      inAppNotifications: true,
    });
    const before = { emails: sentEmails.length, pushes: sentPushes.length };

    await dispatchNotification({
      userId: user.id,
      email: user.email,
      message: { key: "vacationDecided", tenantName: tenant.name, startDate: "2027-01-01", endDate: "2027-01-02", status: "approved" },
      tenantId: tenant.id,
      category: "vacation",
    });

    expect(sentEmails.length).toBe(before.emails + 1);
    expect(sentPushes.length).toBe(before.pushes + 1);
    const inAppRow = await prisma.tenantEmployeeNotification.findFirst({ where: { userId: user.id, tenantId: tenant.id } });
    expect(inAppRow).not.toBeNull();
  });
});
