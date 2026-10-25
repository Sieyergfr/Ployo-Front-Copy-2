import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { TIME_CORRECTION_ERRORS, localDateKey } from "@/lib/time-tracking";

/**
 * Korrekturanträge (M6) gegen eine echte Datenbank: Antrag stellen,
 * Doppelantrag, Zurückziehen, Genehmigen (korrigiert bzw. trägt nach) und
 * Ablehnen, jeweils mit Rechteprüfung und Benachrichtigung.
 */

let currentUserId = "";
const dispatched: Array<{ userId: string; key: string }> = [];

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: currentUserId, name: "Test Actor", email: "actor@test.invalid" },
      }),
    },
  },
}));

vi.mock("@/lib/notifications/dispatch", () => ({
  dispatchNotification: async (event: { userId: string; message: { key: string } }) => {
    dispatched.push({ userId: event.userId, key: event.message.key });
  },
}));

const service = await import("@/lib/time-correction-service");

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-corr-${RUN_ID}`;
const TZ = "Europe/Berlin";

let tenantId: string;
let ownerUserId: string;
let employeeUserId: string;
let employeeId: string;

function daysAgo(days: number) {
  return localDateKey(new Date(Date.now() - days * 86_400_000), TZ);
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { slug: tenantSlug, name: `Korrektur ${RUN_ID}`, timezone: TZ } });
  tenantId = tenant.id;
  await prisma.tenantSettings.create({ data: { tenantId, timeTrackingEnabled: true } });

  const [owner, employeeUser] = await Promise.all(
    ["owner", "employee"].map((name) =>
      prisma.user.create({ data: { email: `${name}-corr-${RUN_ID}@ployo.invalid`, name, emailVerified: true } }),
    ),
  );
  ownerUserId = owner.id;
  employeeUserId = employeeUser.id;

  const plainRole = await prisma.tenantRole.create({
    data: {
      tenantId,
      key: "plain",
      name: "Ohne Zeiterfassung",
      permissions: { create: [{ area: "timeTracking", level: "none", scope: "all" }] },
    },
  });

  await prisma.tenantMembership.createMany({
    data: [
      { tenantId, userId: ownerUserId, role: "OWNER" },
      { tenantId, userId: employeeUserId, role: "EMPLOYEE", roleId: plainRole.id },
    ],
  });

  const employee = await prisma.tenantEmployee.create({
    data: {
      tenantId,
      key: `emp-${RUN_ID}`,
      userId: employeeUserId,
      initials: "EM",
      name: "Erika Muster",
      employeeNumber: `C-${RUN_ID}`,
    },
  });
  employeeId = employee.id;
});

beforeEach(async () => {
  dispatched.length = 0;
  currentUserId = employeeUserId;
  await prisma.tenantTimeCorrectionRequest.deleteMany({ where: { tenantId } });
  await prisma.tenantTimeEntry.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { slug: tenantSlug } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, employeeUserId] } } });
  await prisma.$disconnect();
});

describe("Korrekturanträge", () => {
  it("legt einen Antrag an, verhindert Doppelanträge und lässt ihn zurückziehen", async () => {
    const date = daysAgo(2);
    const created = await service.createMyTimeCorrectionRequest({
      tenantSlug,
      date,
      startTime: "08:00",
      endTime: "16:00",
      reason: "Ausstempeln vergessen",
    });

    expect(created).toMatchObject({ status: "pending", date, timeEntryId: null });
    expect(dispatched.map((item) => item.key)).toContain("newTimeCorrectionRequest");

    await expect(
      service.createMyTimeCorrectionRequest({ tenantSlug, date, startTime: "09:00", endTime: "17:00" }),
    ).rejects.toThrow(TIME_CORRECTION_ERRORS.duplicate);

    await service.withdrawMyTimeCorrectionRequest({ tenantSlug, requestId: created.id });
    expect((await service.getMyTimeCorrectionRequests(tenantSlug))[0].status).toBe("withdrawn");
  });

  it("lehnt Tage in der Zukunft ab", async () => {
    await expect(
      service.createMyTimeCorrectionRequest({ tenantSlug, date: daysAgo(-2), startTime: "08:00", endTime: "16:00" }),
    ).rejects.toThrow(TIME_CORRECTION_ERRORS.future);
  });

  it("trägt beim Genehmigen einen fehlenden Tag nach und benachrichtigt den Mitarbeiter", async () => {
    const date = daysAgo(3);
    const created = await service.createMyTimeCorrectionRequest({ tenantSlug, date, startTime: "08:00", endTime: "16:30" });

    // Ohne Zeiterfassungs-Schreibrecht keine Entscheidung.
    await expect(
      service.decideTimeCorrectionRequest({ tenantSlug, requestId: created.id, decision: "approved" }),
    ).rejects.toThrow();

    currentUserId = ownerUserId;
    dispatched.length = 0;
    await service.decideTimeCorrectionRequest({ tenantSlug, requestId: created.id, decision: "approved" });

    const entries = await prisma.tenantTimeEntry.findMany({ where: { employeeId } });

    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe("manual");
    expect(localDateKey(entries[0].clockInAt, TZ)).toBe(date);
    expect(dispatched).toEqual([{ userId: employeeUserId, key: "timeCorrectionDecided" }]);

    await expect(
      service.decideTimeCorrectionRequest({ tenantSlug, requestId: created.id, decision: "rejected" }),
    ).rejects.toThrow(TIME_CORRECTION_ERRORS.notPending);
  });

  it("korrigiert beim Genehmigen den vorhandenen Eintrag des Tages", async () => {
    const date = daysAgo(1);
    const clockInAt = new Date(`${date}T06:00:00Z`);
    const entry = await prisma.tenantTimeEntry.create({
      data: { tenantId, employeeId, clockInAt, clockOutAt: new Date(`${date}T20:00:00Z`), autoClosed: true },
    });
    const created = await service.createMyTimeCorrectionRequest({ tenantSlug, date, startTime: "08:00", endTime: "16:00" });

    expect(created.timeEntryId).toBe(entry.id);

    currentUserId = ownerUserId;
    await service.decideTimeCorrectionRequest({ tenantSlug, requestId: created.id, decision: "approved" });

    const updated = await prisma.tenantTimeEntry.findUniqueOrThrow({ where: { id: entry.id } });

    expect((updated.clockOutAt?.getTime() ?? 0) - updated.clockInAt.getTime()).toBe(8 * 3_600_000);
    expect(updated.correctedAt).not.toBeNull();
  });

  it("lässt die Verwaltung ablehnen, ohne Zeiten zu ändern", async () => {
    const created = await service.createMyTimeCorrectionRequest({ tenantSlug, date: daysAgo(4), startTime: "08:00", endTime: "16:00" });

    currentUserId = ownerUserId;
    await service.decideTimeCorrectionRequest({ tenantSlug, requestId: created.id, decision: "rejected", note: "Bitte Beleg" });

    const list = await service.getTenantTimeCorrectionRequests({ tenantSlug, status: "all" });

    expect(list[0]).toMatchObject({ status: "rejected", decisionNote: "Bitte Beleg" });
    expect(await prisma.tenantTimeEntry.count({ where: { employeeId } })).toBe(0);
  });
});
