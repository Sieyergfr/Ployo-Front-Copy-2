import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  buildReminderMetrics,
  completeTenantReminder,
  createTenantReminder,
  deleteTenantReminder,
  getRemindersForTenant,
} from "@/lib/reminders";

/**
 * Integrationstest für QA-Bug BUG-013: `getRemindersForTenant` filterte
 * bisher hart auf `status: "open"` — erledigte Erinnerungen waren dadurch
 * nirgends mehr auffindbar (kein Archiv, "Erledigt"-Zähler immer 0) und es
 * gab keine Funktion, um eine Erinnerung zu löschen.
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
const tenantSlug = `test-reminders-${RUN_ID}`;

let tenantId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Reminders Test ${RUN_ID}` },
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

describe("getRemindersForTenant / buildReminderMetrics (BUG-013)", () => {
  it("liefert erledigte Erinnerungen mit und zählt sie korrekt in den Metriken", async () => {
    const open = await createTenantReminder({
      tenantSlug,
      title: `Offen ${RUN_ID}`,
      dueDate: "2027-01-01",
    });
    const toComplete = await createTenantReminder({
      tenantSlug,
      title: `Wird erledigt ${RUN_ID}`,
      dueDate: "2027-01-02",
    });

    await completeTenantReminder({ tenantSlug, reminderId: toComplete.id });

    const reminders = await getRemindersForTenant(tenantSlug);
    const done = reminders.filter((reminder) => reminder.status === "done");
    const stillOpen = reminders.filter((reminder) => reminder.status !== "done");

    expect(done.some((reminder) => reminder.id === toComplete.id)).toBe(true);
    expect(stillOpen.some((reminder) => reminder.id === open.id)).toBe(true);

    const metrics = buildReminderMetrics(reminders, (key) => key);
    const doneMetric = metrics.find((metric) => metric.label === "metricDoneLabel");
    const openMetric = metrics.find((metric) => metric.label === "metricOpenTotalLabel");

    expect(doneMetric?.value).toBe(String(done.length));
    expect(Number(doneMetric?.value)).toBeGreaterThan(0);
    expect(openMetric?.value).toBe(String(stillOpen.length));
  });
});

describe("deleteTenantReminder (BUG-013)", () => {
  it("löscht eine Erinnerung endgültig", async () => {
    const reminder = await createTenantReminder({
      tenantSlug,
      title: `Zu löschen ${RUN_ID}`,
      dueDate: "2027-02-01",
    });

    await deleteTenantReminder({ tenantSlug, reminderId: reminder.id });

    const stored = await prisma.tenantReminder.findUnique({ where: { id: reminder.id } });
    expect(stored).toBeNull();
  });

  it("lehnt das Löschen einer nicht existierenden Erinnerung ab", async () => {
    await expect(
      deleteTenantReminder({ tenantSlug, reminderId: "nicht-vorhanden" }),
    ).rejects.toThrow(/nicht gefunden/);
  });
});
