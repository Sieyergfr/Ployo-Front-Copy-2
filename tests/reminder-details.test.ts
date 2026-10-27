import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { nextReminderDueDate, normalizeReminderChecklist } from "@/lib/reminders-shared";

/**
 * Erinnerungen im neuen Dashboard: Bezug, Zuständigkeit, Wiederholung,
 * Checkliste, Vorschläge — und dass die App (ohne die neuen Felder) beim
 * Bearbeiten nichts davon überschreibt.
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

const reminders = await import("@/lib/reminders");
const dashboard = await import("@/lib/reminder-dashboard");

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-reminder-details-${RUN_ID}`;

let tenantId: string;
let employeeId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { slug: tenantSlug, name: `Erinnerungen ${RUN_ID}` } });
  tenantId = tenant.id;

  const actor = await prisma.user.create({ data: { email: `actor-details-${RUN_ID}@ployo.invalid`, name: "Test Actor", emailVerified: true } });
  actorUserId = actor.id;

  await prisma.tenantMembership.create({ data: { tenantId, userId: actor.id, role: "OWNER" } });

  const employee = await prisma.tenantEmployee.create({
    data: {
      tenantId,
      key: `leon-${RUN_ID}`,
      employeeNumber: `R-${RUN_ID}`,
      initials: "LS",
      name: "Leon Schulz",
      startDate: new Date(Date.now() - 150 * 86_400_000).toISOString().slice(0, 10),
      contractDetails: { create: { tenantId, probation: "6 Monate" } },
    },
  });
  employeeId = employee.id;
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { id: actorUserId } });
  await prisma.$disconnect();
});

describe("Regeln", () => {
  it("rechnet die nächste Fälligkeit", () => {
    expect(nextReminderDueDate("2026-10-23", "yearly")).toBe("2027-10-23");
    expect(nextReminderDueDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextReminderDueDate("2026-10-23", "weekly")).toBe("2026-10-30");
    expect(nextReminderDueDate("2026-10-23", "none")).toBeNull();
  });

  it("bereinigt Checklisten", () => {
    expect(normalizeReminderChecklist([{ label: " A " }, { label: "" }, { id: "x", label: "B", done: true }, "kaputt"])).toEqual([
      { id: "c1", label: "A", done: false },
      { id: "x", label: "B", done: true },
    ]);
  });
});

describe("Zusatzfelder", () => {
  it("speichert Bezug, Zuständigkeit und Checkliste und legt die nächste Wiederholung an", async () => {
    const created = await reminders.createTenantReminder({
      tenantSlug,
      title: "Hygieneschulung",
      dueDate: "2026-10-23",
      subjectType: "employee",
      subjectId: employeeId,
      ownerUserId: actorUserId,
      recurrence: "yearly",
      remindDaysBefore: 14,
      checklist: [{ label: "Liste sammeln", done: true }, { label: "Nachweise hochladen" }],
    });

    expect(created).toMatchObject({ subject: "Leon Schulz", subjectType: "employee", recurrence: "yearly", remindDaysBefore: 14 });

    // So schickt die App eine Änderung — ohne die neuen Felder.
    await reminders.updateTenantReminder({ tenantSlug, reminderId: created.id, title: "Hygieneschulung", dueDate: "2026-10-24", subject: "Leon Schulz" });

    let list = await reminders.getRemindersForTenant(tenantSlug);
    const updated = list.find((item) => item.id === created.id)!;

    expect(updated).toMatchObject({ dueDate: "2026-10-24", subjectId: employeeId, ownerName: "Test Actor", recurrence: "yearly" });
    expect(updated.checklist).toHaveLength(2);

    await reminders.completeTenantReminder({ tenantSlug, reminderId: created.id });
    list = await reminders.getRemindersForTenant(tenantSlug);

    const nextOne = list.find((item) => item.status === "open" && item.title === "Hygieneschulung");

    expect(nextOne).toMatchObject({ dueDate: "2027-10-24", recurrence: "yearly" });
    expect(nextOne!.checklist!.every((item) => !item.done)).toBe(true);
  });

  it("weist unbekannte Bezüge und Personen ab", async () => {
    await expect(
      reminders.createTenantReminder({ tenantSlug, title: "X", dueDate: "2026-11-01", subjectType: "employee", subjectId: "fremd" }),
    ).rejects.toThrow("Unbekannter Bezug.");
    await expect(reminders.createTenantReminder({ tenantSlug, title: "Y", dueDate: "2026-11-01", ownerUserId: "fremd" })).rejects.toThrow(
      "Unbekannte zuständige Person.",
    );
  });
});

describe("Vorschläge", () => {
  it("schlägt das Probezeitgespräch vor, übernimmt und blendet es danach aus", async () => {
    const suggestions = await dashboard.getReminderSuggestions(tenantSlug);
    const probation = suggestions.find((item) => item.kind === "probation");

    expect(probation).toMatchObject({ subjectId: employeeId, priority: "important" });

    await dashboard.acceptReminderSuggestion({ tenantSlug, key: probation!.key });

    expect((await dashboard.getReminderSuggestions(tenantSlug)).some((item) => item.key === probation!.key)).toBe(false);
    await expect(dashboard.acceptReminderSuggestion({ tenantSlug, key: probation!.key })).rejects.toThrow("Vorschlag nicht mehr verfügbar.");
  });

  it("verschiebt eine Erinnerung", async () => {
    const created = await reminders.createTenantReminder({ tenantSlug, title: "Verschieben", dueDate: "2026-11-01", checklist: [{ label: "A" }] });

    await dashboard.rescheduleTenantReminder({ tenantSlug, reminderId: created.id, dueDate: "2026-11-08" });

    const stored = await prisma.tenantReminder.findUniqueOrThrow({ where: { id: created.id } });

    expect(stored.dueDate).toBe("2026-11-08");
    expect(normalizeReminderChecklist(stored.checklistJson)).toHaveLength(1);
  });
});
