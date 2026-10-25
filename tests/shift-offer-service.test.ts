import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { scoreShiftOfferCandidate, SHIFT_OFFER_ERRORS, shiftNetMinutes } from "@/lib/shift-offers";

/**
 * Schicht anbieten / Vertretung finden (M8), "Vorwoche kopieren" und
 * "Team benachrichtigen" beim Zurückziehen — gegen eine echte Datenbank.
 */

let currentUserId = "";
const dispatched: Array<{ userId: string; key: string }> = [];

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
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

vi.mock("@/lib/notifications/dispatch", () => ({
  dispatchNotification: async (event: { userId: string; message: { key: string } }) => {
    dispatched.push({ userId: event.userId, key: event.message.key });
  },
}));

const offers = await import("@/lib/shift-offer-service");
const shifts = await import("@/lib/shift-service");

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-offer-${RUN_ID}`;

let tenantId: string;
let ownerUserId: string;
let annaUserId: string;
let benUserId: string;
let annaId: string;
let benId: string;
let carlId: string;
let locationId: string;

// Übernächste ISO-Woche, damit "heute" nie mitten in den Testdaten liegt.
const target = shifts.getISOWeekFromDate(new Date(Date.now() + 14 * 86_400_000));
const targetStart = shifts.getISOWeekStart(target.year, target.week);

function dayOf(offset: number) {
  const date = new Date(targetStart);

  date.setUTCDate(targetStart.getUTCDate() + offset);

  return date.toISOString().slice(0, 10);
}

const wednesday = dayOf(2);

async function createShift(input: { date: string; employeeId: string | null; startTime?: string; endTime?: string }) {
  return prisma.tenantShift.create({
    data: {
      tenantId,
      key: `${input.date}-${input.startTime ?? "08:00"}-${input.employeeId ?? "offen"}-${Math.random().toString(36).slice(2, 6)}`,
      date: input.date,
      weekday: (["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const)[(new Date(`${input.date}T12:00:00Z`).getUTCDay() + 6) % 7],
      startTime: input.startTime ?? "08:00",
      endTime: input.endTime ?? "16:00",
      breakMinutes: 30,
      employeeId: input.employeeId,
      locationId,
      team: "Service",
    },
  });
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { slug: tenantSlug, name: `Angebote ${RUN_ID}` } });
  tenantId = tenant.id;
  await prisma.tenantSettings.create({ data: { tenantId } });

  const [owner, anna, ben] = await Promise.all(
    ["owner", "anna", "ben"].map((name) =>
      prisma.user.create({ data: { email: `${name}-offer-${RUN_ID}@ployo.invalid`, name, emailVerified: true } }),
    ),
  );
  ownerUserId = owner.id;
  annaUserId = anna.id;
  benUserId = ben.id;

  await prisma.tenantMembership.createMany({
    data: [
      { tenantId, userId: ownerUserId, role: "OWNER" },
      { tenantId, userId: annaUserId, role: "EMPLOYEE" },
      { tenantId, userId: benUserId, role: "EMPLOYEE" },
    ],
  });

  const location = await prisma.tenantLocation.create({
    data: { tenantId, key: `loc-${RUN_ID}`, kind: "Restaurant", name: "Mitte" },
  });
  locationId = location.id;

  const make = (key: string, name: string, userId: string | null) =>
    prisma.tenantEmployee.create({
      data: { tenantId, key: `${key}-${RUN_ID}`, employeeNumber: `${key}-${RUN_ID}`, userId, initials: name.slice(0, 2).toUpperCase(), name, team: "Service", weeklyHours: "40 Std/Woche" },
    });
  annaId = (await make("anna", "Anna Arndt", annaUserId)).id;
  benId = (await make("ben", "Ben Bauer", benUserId)).id;
  carlId = (await make("carl", "Carl Clausen", null)).id;
  await prisma.tenantLocationMember.create({ data: { locationId, employeeId: annaId, initials: "AA", name: "Anna Arndt" } });

  // Carl ist die ganze Zielwoche krank.
  await prisma.tenantSicknessReport.create({
    data: { tenantId, employeeId: carlId, startDate: new Date(`${dayOf(0)}T00:00:00Z`), endDate: new Date(`${dayOf(6)}T00:00:00Z`) },
  });
});

beforeEach(async () => {
  dispatched.length = 0;
  currentUserId = ownerUserId;
  await prisma.tenantShiftOffer.deleteMany({ where: { tenantId } });
  await prisma.tenantShift.deleteMany({ where: { tenantId } });
  await prisma.tenantShiftWeek.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { slug: tenantSlug } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, annaUserId, benUserId] } } });
  await prisma.$disconnect();
});

describe("Bewertung", () => {
  it("setzt Verfügbarkeit voraus und gewichtet die übrigen Prüfungen", () => {
    expect(scoreShiftOfferCandidate({ available: false, rest: true, hours: true, team: true, location: true })).toBe(0);
    expect(scoreShiftOfferCandidate({ available: true, rest: true, hours: true, team: true, location: true })).toBe(100);
    expect(scoreShiftOfferCandidate({ available: true, rest: true, hours: false, team: false, location: false })).toBe(55);
  });

  it("rechnet Schichtdauer ohne Pause, auch über Mitternacht", () => {
    expect(shiftNetMinutes("08:00", "16:00", 30)).toBe(450);
    expect(shiftNetMinutes("22:00", "06:00", 0)).toBe(480);
  });
});

describe("Vertretung finden und anbieten", () => {
  it("bewertet passende Personen, fragt an und vergibt an die erste Zusage", async () => {
    const shift = await createShift({ date: wednesday, employeeId: carlId });
    // Ben ist am selben Tag bereits eingeplant.
    await createShift({ date: wednesday, employeeId: benId, startTime: "10:00", endTime: "18:00" });
    await shifts.publishShiftWeek({ tenantSlug, year: target.year, week: target.week });

    const context = await offers.getShiftOfferCandidates({ tenantSlug, shiftId: shift.id });

    expect(context.shift.replacedEmployeeName).toBe("Carl Clausen");
    expect(context.shift.replacedAbsence).toBe("sickness");
    expect(context.candidates.map((candidate) => candidate.employeeId)).not.toContain(carlId);

    const anna = context.candidates.find((candidate) => candidate.employeeId === annaId)!;
    const ben = context.candidates.find((candidate) => candidate.employeeId === benId)!;

    expect(context.candidates[0].employeeId).toBe(annaId);
    expect(anna.score).toBe(100);
    expect(ben.score).toBe(0);
    expect(ben.blockedReason).toBe("Bereits eingeplant");

    dispatched.length = 0;
    const result = await offers.offerShiftToEmployees({ tenantSlug, shiftId: shift.id, employeeIds: [annaId, benId, carlId] });

    // Carl ist selbst eingeteilt und wird nicht angefragt.
    expect(result).toEqual({ sent: 2, withoutAccount: 0 });
    expect(dispatched.filter((item) => item.key === "shiftOffered").map((item) => item.userId).sort()).toEqual(
      [annaUserId, benUserId].sort(),
    );

    // Erneutes Anfragen derselben Person legt kein zweites Angebot an.
    expect(await offers.offerShiftToEmployees({ tenantSlug, shiftId: shift.id, employeeIds: [annaId] })).toEqual({
      sent: 0,
      withoutAccount: 0,
    });
    expect(await offers.getPendingShiftOfferCounts(tenantSlug, [shift.id])).toEqual({ [shift.id]: 2 });

    currentUserId = annaUserId;
    const [annaOffer] = await offers.getMyShiftOffers(tenantSlug);

    expect(annaOffer).toMatchObject({ date: wednesday, startTime: "08:00", replacesFirstName: "Carl", location: "Mitte" });

    dispatched.length = 0;
    await expect(offers.respondToMyShiftOffer({ tenantSlug, offerId: annaOffer.id, decision: "accept" })).resolves.toEqual({
      status: "accepted",
    });

    const updated = await prisma.tenantShift.findUniqueOrThrow({ where: { id: shift.id } });
    const week = await prisma.tenantShiftWeek.findFirstOrThrow({ where: { tenantId } });
    const snapshot = week.publishedShiftsJson as Array<{ key: string; employeeId: string | null }>;

    expect(updated.employeeId).toBe(annaId);
    // Der veröffentlichte Schnappschuss bleibt unangetastet — die Woche gilt
    // danach als geändert und wird regulär neu veröffentlicht.
    expect(snapshot.find((entry) => entry.key === shift.key)?.employeeId).toBe(carlId);
    currentUserId = ownerUserId;
    const plan = await shifts.getShiftPlanForTenant({ tenantSlug, year: target.year, week: target.week });

    expect(plan?.hasUnpublishedChanges).toBe(true);
    expect(dispatched).toContainEqual({ userId: ownerUserId, key: "shiftOfferAccepted" });

    // Bens Angebot ist damit geschlossen.
    currentUserId = benUserId;
    expect(await offers.getMyShiftOffers(tenantSlug)).toEqual([]);

    const benOffer = await prisma.tenantShiftOffer.findFirstOrThrow({ where: { shiftId: shift.id, employeeId: benId } });

    expect(benOffer.status).toBe("closed");
    await expect(offers.respondToMyShiftOffer({ tenantSlug, offerId: benOffer.id, decision: "accept" })).rejects.toThrow(
      SHIFT_OFFER_ERRORS.notPending,
    );
  });

  it("lehnt ab und lässt fremde Angebote nicht beantworten", async () => {
    const shift = await createShift({ date: wednesday, employeeId: null });

    await offers.offerShiftToEmployees({ tenantSlug, shiftId: shift.id, employeeIds: [annaId] });
    const offer = await prisma.tenantShiftOffer.findFirstOrThrow({ where: { shiftId: shift.id } });

    currentUserId = benUserId;
    await expect(offers.respondToMyShiftOffer({ tenantSlug, offerId: offer.id, decision: "accept" })).rejects.toThrow(
      SHIFT_OFFER_ERRORS.notFound,
    );

    currentUserId = annaUserId;
    await expect(offers.respondToMyShiftOffer({ tenantSlug, offerId: offer.id, decision: "decline" })).resolves.toEqual({
      status: "declined",
    });
    expect((await prisma.tenantShift.findUniqueOrThrow({ where: { id: shift.id } })).employeeId).toBeNull();
  });

  it("meldet 'bereits vergeben', wenn die Planung die Schicht inzwischen anders besetzt hat", async () => {
    const shift = await createShift({ date: wednesday, employeeId: null });

    await offers.offerShiftToEmployees({ tenantSlug, shiftId: shift.id, employeeIds: [annaId] });
    await prisma.tenantShift.update({ where: { id: shift.id }, data: { employeeId: benId } });

    currentUserId = annaUserId;
    expect(await offers.getMyShiftOffers(tenantSlug)).toEqual([]);

    const offer = await prisma.tenantShiftOffer.findFirstOrThrow({ where: { shiftId: shift.id } });

    await expect(offers.respondToMyShiftOffer({ tenantSlug, offerId: offer.id, decision: "accept" })).rejects.toThrow(
      SHIFT_OFFER_ERRORS.taken,
    );
  });

  it("ist nur mit Schicht-Schreibrecht erreichbar", async () => {
    const shift = await createShift({ date: wednesday, employeeId: null });

    currentUserId = annaUserId;
    await expect(offers.getShiftOfferCandidates({ tenantSlug, shiftId: shift.id })).rejects.toThrow();
    await expect(offers.offerShiftToEmployees({ tenantSlug, shiftId: shift.id, employeeIds: [benId] })).rejects.toThrow();
  });
});

describe("Vorwoche kopieren", () => {
  it("übernimmt die Vorwoche, lässt Abwesende offen und legt nichts doppelt an", async () => {
    await createShift({ date: dayOf(-7), employeeId: annaId });
    await createShift({ date: dayOf(-6), employeeId: carlId });
    await createShift({ date: dayOf(-5), employeeId: null });

    const first = await shifts.copyPreviousShiftWeek({ tenantSlug, year: target.year, week: target.week });

    expect(first).toEqual({ created: 3, unassigned: 1, skipped: 0 });

    const copied = await prisma.tenantShift.findMany({
      where: { tenantId, date: { gte: dayOf(0) } },
      orderBy: { date: "asc" },
    });

    expect(copied.map((shift) => [shift.date, shift.employeeId])).toEqual([
      [dayOf(0), annaId],
      [dayOf(1), null],
      [dayOf(2), null],
    ]);

    expect(await shifts.copyPreviousShiftWeek({ tenantSlug, year: target.year, week: target.week })).toEqual({
      created: 0,
      unassigned: 0,
      skipped: 3,
    });
  });
});

describe("Zurückziehen mit 'Team benachrichtigen'", () => {
  it("benachrichtigt alle im veröffentlichten Stand eingeteilten Personen", async () => {
    await createShift({ date: dayOf(0), employeeId: annaId });
    await createShift({ date: dayOf(1), employeeId: benId });
    await shifts.publishShiftWeek({ tenantSlug, year: target.year, week: target.week });

    dispatched.length = 0;
    const result = await shifts.unpublishShiftWeek({ tenantSlug, year: target.year, week: target.week, notifyTeam: true });

    expect(result).toMatchObject({ status: "draft", notified: 2 });
    expect(dispatched.filter((item) => item.key === "shiftPlanWithdrawn").map((item) => item.userId).sort()).toEqual(
      [annaUserId, benUserId].sort(),
    );

    // Ohne Haken (Standard für die App-Route) keine Benachrichtigung.
    await shifts.publishShiftWeek({ tenantSlug, year: target.year, week: target.week });
    dispatched.length = 0;
    await shifts.unpublishShiftWeek({ tenantSlug, year: target.year, week: target.week });
    expect(dispatched.filter((item) => item.key === "shiftPlanWithdrawn")).toEqual([]);
  });
});
