import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  TIME_TRACKING_ERRORS,
  isoWeekOfIsoDate,
  localDateKey,
  localTimeKey,
} from "@/lib/time-tracking";

/**
 * Integrationstest der Zeiterfassung gegen eine echte Datenbank: Stempeln,
 * Sperre gegen Doppel-Einstempeln, Schichtfenster-Modus, Verwaltungs-
 * korrektur mit Berechtigung/Audit, automatisches Ausstempeln und
 * Erinnerungen ohne Doppelversand.
 */

let currentUserId = "";
const dispatched: Array<{ userId: string; key: string; channels?: string[] }> = [];

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
  dispatchNotification: async (event: { userId: string; message: { key: string }; channels?: string[] }) => {
    dispatched.push({ userId: event.userId, key: event.message.key, channels: event.channels });
  },
}));

const service = await import("@/lib/time-tracking-service");
const locationService = await import("@/lib/location-service");

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-time-${RUN_ID}`;
const TZ = "Europe/Berlin";

let tenantId: string;
let ownerUserId: string;
let employeeUserId: string;
let otherUserId: string;
let employeeId: string;
let userIds: string[];

/** Veröffentlicht eine Schicht des Test-Mitarbeiters von `start` bis `end` (absolute Zeitpunkte). */
async function publishShift(start: Date, end: Date, id = `shift-${RUN_ID}`) {
  const date = localDateKey(start, TZ);
  const { year, week } = isoWeekOfIsoDate(date);
  const entry = {
    id,
    date,
    startTime: localTimeKey(start, TZ),
    endTime: localTimeKey(end, TZ),
    time: "",
    location: "Filiale",
    locationAccentClassName: null,
    note: "",
    breakMinutes: 30,
    employeeId,
  };

  await prisma.tenantShiftWeek.upsert({
    where: { tenantId_year_week: { tenantId, year, week } },
    create: { tenantId, year, week, status: "published", publishedShiftsJson: [entry] },
    update: { status: "published", publishedShiftsJson: [entry] },
  });
}

async function setSettings(data: Record<string, unknown>) {
  await prisma.tenantSettings.update({ where: { tenantId }, data });
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Zeit Test ${RUN_ID}`, timezone: TZ },
  });
  tenantId = tenant.id;
  await prisma.tenantSettings.create({ data: { tenantId, timeTrackingEnabled: true } });

  const [owner, employeeUser, other] = await Promise.all(
    ["owner", "employee", "other"].map((name) =>
      prisma.user.create({
        data: { email: `${name}-${RUN_ID}@ployo.invalid`, name, emailVerified: true },
      }),
    ),
  );
  ownerUserId = owner.id;
  employeeUserId = employeeUser.id;
  otherUserId = other.id;
  userIds = [ownerUserId, employeeUserId, otherUserId];

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
      { tenantId, userId: otherUserId, role: "EMPLOYEE", roleId: plainRole.id },
    ],
  });

  const employee = await prisma.tenantEmployee.create({
    data: {
      tenantId,
      key: `emp-${RUN_ID}`,
      userId: employeeUserId,
      initials: "EM",
      name: "Erika Muster",
      employeeNumber: `T-${RUN_ID}`,
    },
  });
  employeeId = employee.id;
});

beforeEach(async () => {
  dispatched.length = 0;
  currentUserId = employeeUserId;
  await prisma.tenantTimeEntry.deleteMany({ where: { tenantId } });
  await prisma.tenantTimeClockReminder.deleteMany({ where: { tenantId } });
  await prisma.tenantShiftWeek.deleteMany({ where: { tenantId } });
  await setSettings({
    timeTrackingEnabled: true,
    timeTrackingBreaksEnabled: true,
    timeTrackingClockInMode: "always",
    timeTrackingClockInLeadMinutes: 60,
    timeTrackingReminderPush: true,
    timeTrackingAutoClockOut: false,
    timeTrackingQrRequired: false,
  });
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { slug: { in: [tenantSlug, `${tenantSlug}-foreign`] } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("Stempeluhr (Self-Service)", () => {
  it("stempelt ein, pausiert und stempelt aus", async () => {
    let status = await service.performMyClockAction({ tenantSlug, action: "clockIn", source: "web" });
    expect(status.state).toBe("working");

    await expect(
      service.performMyClockAction({ tenantSlug, action: "clockIn", source: "web" }),
    ).rejects.toThrow(TIME_TRACKING_ERRORS.alreadyClockedIn);

    status = await service.performMyClockAction({ tenantSlug, action: "breakStart", source: "app" });
    expect(status.state).toBe("break");

    await expect(
      service.performMyClockAction({ tenantSlug, action: "breakStart", source: "app" }),
    ).rejects.toThrow(TIME_TRACKING_ERRORS.breakRunning);

    status = await service.performMyClockAction({ tenantSlug, action: "breakEnd", source: "app" });
    expect(status.state).toBe("working");

    status = await service.performMyClockAction({ tenantSlug, action: "breakStart", source: "app" });
    // Ausstempeln beendet die laufende Pause mit.
    status = await service.performMyClockAction({ tenantSlug, action: "clockOut", source: "app" });
    expect(status.state).toBe("off");

    const entries = await prisma.tenantTimeEntry.findMany({ where: { tenantId }, include: { breaks: true } });
    expect(entries).toHaveLength(1);
    expect(entries[0].clockOutAt).not.toBeNull();
    expect(entries[0].breaks).toHaveLength(2);
    expect(entries[0].breaks.every((item) => item.endAt !== null)).toBe(true);

    await expect(
      service.performMyClockAction({ tenantSlug, action: "clockOut", source: "app" }),
    ).rejects.toThrow(TIME_TRACKING_ERRORS.notClockedIn);
  });

  it("legt bei gleichzeitigem Doppel-Einstempeln nur einen Eintrag an", async () => {
    const results = await Promise.allSettled([
      service.performMyClockAction({ tenantSlug, action: "clockIn", source: "app" }),
      service.performMyClockAction({ tenantSlug, action: "clockIn", source: "web" }),
      service.performMyClockAction({ tenantSlug, action: "clockIn", source: "app" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.tenantTimeEntry.count({ where: { tenantId, clockOutAt: null } })).toBe(1);
  });

  it("verweigert Pausen, wenn Pausenstempeln abgeschaltet ist", async () => {
    await setSettings({ timeTrackingBreaksEnabled: false });
    await service.performMyClockAction({ tenantSlug, action: "clockIn", source: "app" });

    await expect(
      service.performMyClockAction({ tenantSlug, action: "breakStart", source: "app" }),
    ).rejects.toThrow(TIME_TRACKING_ERRORS.breaksDisabled);
  });

  it("Modus 'shift': ohne Schicht in Reichweite ausgeblendet, mit Schicht erlaubt und verknüpft", async () => {
    await setSettings({ timeTrackingClockInMode: "shift" });

    let status = await service.getMyClockStatus(tenantSlug);
    expect(status.canClockIn).toBe(false);
    expect(status.showClock).toBe(false);
    await expect(
      service.performMyClockAction({ tenantSlug, action: "clockIn", source: "app" }),
    ).rejects.toThrow(TIME_TRACKING_ERRORS.outsideShift);

    // Schicht beginnt in 2 Stunden — außerhalb der 60 Minuten.
    const now = Date.now();
    await publishShift(new Date(now + 2 * 3_600_000), new Date(now + 6 * 3_600_000));
    status = await service.getMyClockStatus(tenantSlug);
    expect(status.showClock).toBe(false);
    expect(status.nextShift).not.toBeNull();

    // Schicht beginnt in 30 Minuten — innerhalb.
    await publishShift(new Date(now + 30 * 60_000), new Date(now + 5 * 3_600_000));
    status = await service.getMyClockStatus(tenantSlug);
    expect(status.canClockIn).toBe(true);
    expect(status.showClock).toBe(true);

    status = await service.performMyClockAction({ tenantSlug, action: "clockIn", source: "app" });
    expect(status.openEntry?.shift?.id).toBe(`shift-${RUN_ID}`);
    expect(status.openEntry?.shift?.location).toBe("Filiale");
  });

  it("listet eigene Zeiten tageweise mit Soll", async () => {
    const now = Date.now();
    await publishShift(new Date(now - 60 * 60_000), new Date(now + 3 * 3_600_000));
    await service.performMyClockAction({ tenantSlug, action: "clockIn", source: "app" });

    const view = await service.getMyTimeEntries({ tenantSlug });
    const today = view.days.find((day) => day.date === view.today);

    expect(view.totals.entryCount).toBe(1);
    expect(today?.entries).toHaveLength(1);
    expect(today?.shifts).toHaveLength(1);
    expect(today?.plannedMinutes).toBe(4 * 60 - 30);
  });

  it("verweigert alles, wenn die Zeiterfassung aus ist", async () => {
    await setSettings({ timeTrackingEnabled: false });

    expect((await service.getMyClockStatus(tenantSlug)).enabled).toBe(false);
    await expect(
      service.performMyClockAction({ tenantSlug, action: "clockIn", source: "app" }),
    ).rejects.toThrow(TIME_TRACKING_ERRORS.disabled);
  });
});

describe("Stempeln per Standort-QR-Code", () => {
  let filialeId: string;
  let lagerId: string;
  let filialeQr: string;
  let lagerQr: string;
  let inactiveQr: string;
  let foreignQr: string;

  async function createLocation(data: { tenantId: string; key: string; name: string; status?: "active" | "inactive" }) {
    const location = await prisma.tenantLocation.create({
      data: { tenantId: data.tenantId, key: data.key, name: data.name, kind: "Filiale", status: data.status ?? "active" },
    });
    currentUserId = ownerUserId;
    await locationService.regenerateLocationClockQr({
      tenantSlug: data.tenantId === tenantId ? tenantSlug : `${tenantSlug}-foreign`,
      locationId: location.id,
    });
    const qr = await prisma.tenantLocation.findUniqueOrThrow({ where: { id: location.id } });
    return { id: location.id, payload: `https://ployo.io/stempeln/${qr.clockQrToken}` };
  }

  beforeAll(async () => {
    const foreignTenant = await prisma.tenant.create({
      data: { slug: `${tenantSlug}-foreign`, name: `Fremd ${RUN_ID}`, timezone: TZ },
    });
    await prisma.tenantMembership.create({ data: { tenantId: foreignTenant.id, userId: ownerUserId, role: "OWNER" } });

    const filiale = await createLocation({ tenantId, key: `filiale-${RUN_ID}`, name: "Filiale Mitte" });
    const lager = await createLocation({ tenantId, key: `lager-${RUN_ID}`, name: "Lager Nord" });
    const inactive = await createLocation({ tenantId, key: `alt-${RUN_ID}`, name: "Alt", status: "inactive" });
    const foreign = await createLocation({ tenantId: foreignTenant.id, key: `fremd-${RUN_ID}`, name: "Fremd" });
    filialeId = filiale.id;
    lagerId = lager.id;
    filialeQr = filiale.payload;
    lagerQr = lager.payload;
    inactiveQr = inactive.payload;
    foreignQr = foreign.payload;
  });

  beforeEach(async () => {
    currentUserId = employeeUserId;
    await setSettings({ timeTrackingQrRequired: true, timeTrackingQrRequiredClockOut: false });
  });

  it("App: Einstempeln ohne Scan verweigert, Pausen und Ausstempeln ohne Scan erlaubt, Web unverändert", async () => {
    let status = await service.getMyClockStatus(tenantSlug);
    expect(status.settings.qrRequired).toBe(true);

    await expect(
      service.performMyClockAction({ tenantSlug, action: "clockIn", source: "app" }),
    ).rejects.toThrow(TIME_TRACKING_ERRORS.qrRequired);

    status = await service.performMyClockAction({ tenantSlug, action: "clockIn", source: "app", qrCode: filialeQr });
    expect(status.state).toBe("working");
    expect(status.openEntry?.clockInLocation).toEqual({ id: filialeId, name: "Filiale Mitte" });

    status = await service.performMyClockAction({ tenantSlug, action: "breakStart", source: "app" });
    expect(status.state).toBe("break");

    // Ausstempeln per Knopf — kein Scan, kein Ausstempel-Standort.
    status = await service.performMyClockAction({ tenantSlug, action: "clockOut", source: "app" });
    expect(status.state).toBe("off");
    const closed = await prisma.tenantTimeEntry.findFirstOrThrow({ where: { tenantId } });
    expect(closed.clockOutLocationId).toBeNull();
    expect(closed.clockInLocationId).toBe(filialeId);

    // Web-Dashboard: auch Einstempeln ohne Scan.
    status = await service.performMyClockAction({ tenantSlug, action: "clockIn", source: "web" });
    expect(status.openEntry?.clockInLocation).toBeNull();
  });

  it("Ausstempeln: Scan-Pflicht getrennt einstellbar, unabhängig vom Einstempeln", async () => {
    await setSettings({ timeTrackingQrRequired: false, timeTrackingQrRequiredClockOut: true });
    let status = await service.getMyClockStatus(tenantSlug);
    expect(status.settings.qrRequired).toBe(false);
    expect(status.settings.qrRequiredClockOut).toBe(true);

    // Einstempeln per Knopf, Pausen per Knopf ...
    status = await service.performMyClockAction({ tenantSlug, action: "clockIn", source: "app" });
    expect(status.state).toBe("working");
    status = await service.performMyClockAction({ tenantSlug, action: "breakStart", source: "app" });
    expect(status.state).toBe("break");

    // ... Ausstempeln in der App nur mit Scan.
    await expect(
      service.performMyClockAction({ tenantSlug, action: "clockOut", source: "app" }),
    ).rejects.toThrow(TIME_TRACKING_ERRORS.qrRequiredClockOut);
    status = await service.performMyClockAction({ tenantSlug, action: "clockOut", source: "app", qrCode: lagerQr });
    expect(status.state).toBe("off");
    const closed = await prisma.tenantTimeEntry.findFirstOrThrow({ where: { tenantId } });
    expect(closed.clockInLocationId).toBeNull();
    expect(closed.clockOutLocationId).toBe(lagerId);

    // Web-Dashboard: Ausstempeln ohne Scan.
    await service.performMyClockAction({ tenantSlug, action: "clockIn", source: "web" });
    status = await service.performMyClockAction({ tenantSlug, action: "clockOut", source: "web" });
    expect(status.state).toBe("off");
  });

  it("ein beim Ausstempeln freiwillig gescannter anderer Standort wird ebenfalls festgehalten", async () => {
    // Schicht ist für "Filiale" geplant — gescannt werden darf trotzdem jeder Standort.
    const now = Date.now();
    await publishShift(new Date(now - 30 * 60_000), new Date(now + 3 * 3_600_000));

    await service.performMyClockAction({ tenantSlug, action: "clockIn", source: "app", qrCode: lagerQr });
    await service.performMyClockAction({ tenantSlug, action: "clockOut", source: "app", qrCode: filialeQr });

    const entry = await prisma.tenantTimeEntry.findFirstOrThrow({ where: { tenantId } });
    expect(entry.clockInLocationId).toBe(lagerId);
    expect(entry.clockInLocationName).toBe("Lager Nord");
    expect(entry.clockOutLocationId).toBe(filialeId);
    expect(entry.clockOutLocationName).toBe("Filiale Mitte");
    expect(entry.shiftLocation).toBe("Filiale");

    const view = await service.getMyTimeEntries({ tenantSlug });
    const listed = view.days.flatMap((day) => day.entries)[0];
    expect(listed.clockInLocation?.name).toBe("Lager Nord");
    expect(listed.clockOutLocation?.name).toBe("Filiale Mitte");
  });

  it("verweigert fremde, inaktive, alte und unsinnige Codes", async () => {
    for (const qrCode of [foreignQr, inactiveQr, "https://ployo.io/stempeln/kaputt", "hallo", "x".repeat(600)]) {
      await expect(
        service.performMyClockAction({ tenantSlug, action: "clockIn", source: "app", qrCode }),
      ).rejects.toThrow(TIME_TRACKING_ERRORS.qrInvalid);
    }

    // Neu erzeugen macht den alten Ausdruck ungültig.
    currentUserId = ownerUserId;
    await locationService.regenerateLocationClockQr({ tenantSlug, locationId: filialeId });
    currentUserId = employeeUserId;
    await expect(
      service.performMyClockAction({ tenantSlug, action: "clockIn", source: "app", qrCode: filialeQr }),
    ).rejects.toThrow(TIME_TRACKING_ERRORS.qrInvalid);
    filialeQr = `https://ployo.io/stempeln/${
      (await prisma.tenantLocation.findUniqueOrThrow({ where: { id: filialeId } })).clockQrToken
    }`;
    const status = await service.performMyClockAction({ tenantSlug, action: "clockIn", source: "app", qrCode: filialeQr });
    expect(status.state).toBe("working");
    expect(await prisma.tenantTimeEntry.count({ where: { tenantId } })).toBe(1);

    const audit = await prisma.tenantAuditLog.findFirst({
      where: { tenantId, action: "Stempel-QR-Code neu erzeugt", entityId: filialeId },
    });
    expect(audit).not.toBeNull();
  });

  it("nur Standort-Verwalter können den QR-Code sehen oder erzeugen", async () => {
    await expect(locationService.getLocationClockQr(tenantSlug, filialeId)).rejects.toThrow("FORBIDDEN");
    await expect(
      locationService.regenerateLocationClockQr({ tenantSlug, locationId: filialeId }),
    ).rejects.toThrow("FORBIDDEN");

    currentUserId = ownerUserId;
    const qr = await locationService.getLocationClockQr(tenantSlug, filialeId);
    expect(qr?.payload).toMatch(/\/stempeln\/[A-Za-z0-9_-]{32}$/);
    expect(qr?.qrRequired).toBe(true);
  });

  it("ohne QR-Pflicht wird ein mitgeschickter Code trotzdem geprüft und vermerkt", async () => {
    await setSettings({ timeTrackingQrRequired: false });

    let status = await service.performMyClockAction({ tenantSlug, action: "clockIn", source: "app" });
    expect(status.openEntry?.clockInLocation).toBeNull();
    status = await service.performMyClockAction({ tenantSlug, action: "clockOut", source: "app", qrCode: lagerQr });
    expect(status.state).toBe("off");
    expect((await prisma.tenantTimeEntry.findFirstOrThrow({ where: { tenantId } })).clockOutLocationName).toBe(
      "Lager Nord",
    );
  });
});

describe("Verwaltung", () => {
  async function createClosedEntry(hoursAgo: number, durationHours: number) {
    const clockInAt = new Date(Date.now() - hoursAgo * 3_600_000);
    return prisma.tenantTimeEntry.create({
      data: {
        tenantId,
        employeeId,
        clockInAt,
        clockOutAt: new Date(clockInAt.getTime() + durationHours * 3_600_000),
      },
    });
  }

  it("Mitarbeiter ohne Bereichsrecht können fremde Zeiten weder sehen noch korrigieren", async () => {
    const entry = await createClosedEntry(30, 8);
    currentUserId = otherUserId;

    await expect(service.getTenantTimeEntries({ tenantSlug })).rejects.toThrow("FORBIDDEN");
    await expect(
      service.correctTimeEntry({
        tenantSlug,
        entryId: entry.id,
        date: localDateKey(entry.clockInAt, TZ),
        startTime: "08:00",
        endTime: "16:00",
        breakMinutes: 30,
        note: "x",
      }),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("korrigiert mit Pflicht-Grund und Audit-Eintrag", async () => {
    const entry = await createClosedEntry(30, 8);
    const date = localDateKey(entry.clockInAt, TZ);
    currentUserId = ownerUserId;

    await expect(
      service.correctTimeEntry({ tenantSlug, entryId: entry.id, date, startTime: "08:00", endTime: "16:00", breakMinutes: 30, note: "  " }),
    ).rejects.toThrow(TIME_TRACKING_ERRORS.noteRequired);

    await service.correctTimeEntry({
      tenantSlug,
      entryId: entry.id,
      date,
      startTime: "08:00",
      endTime: "16:30",
      breakMinutes: 45,
      note: "Ausstempeln vergessen",
    });

    const updated = await prisma.tenantTimeEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(localTimeKey(updated.clockInAt, TZ)).toBe("08:00");
    expect(localTimeKey(updated.clockOutAt!, TZ)).toBe("16:30");
    expect(updated.breakMinutesOverride).toBe(45);
    expect(updated.correctedAt).not.toBeNull();

    const audit = await prisma.tenantAuditLog.findFirst({
      where: { tenantId, entityType: "time-entry", entityId: entry.id },
    });
    expect(audit?.detail).toContain("Ausstempeln vergessen");

    const view = await service.getTenantTimeEntries({
      tenantSlug,
      from: date,
      to: date,
      employeeId,
    });
    expect(view.days[0].entries[0]).toMatchObject({ workedMinutes: 8 * 60 + 30 - 45, corrected: true });
  });

  it("verhindert überlappende Nachträge", async () => {
    const entry = await createClosedEntry(30, 8);
    const date = localDateKey(entry.clockInAt, TZ);
    const start = localTimeKey(new Date(entry.clockInAt.getTime() + 3_600_000), TZ);
    const end = localTimeKey(new Date(entry.clockInAt.getTime() + 2 * 3_600_000), TZ);
    currentUserId = ownerUserId;

    await expect(
      service.createManualTimeEntry({
        tenantSlug,
        employeeId,
        date,
        startTime: start,
        endTime: end,
        breakMinutes: 0,
        note: "Doppelt",
      }),
    ).rejects.toThrow(TIME_TRACKING_ERRORS.overlap);
  });
});

describe("Cron", () => {
  it("stempelt vergessene Einträge zum Schichtende aus und benachrichtigt", async () => {
    await setSettings({ timeTrackingAutoClockOut: true, timeTrackingAutoClockOutAfterShiftMinutes: 60 });
    const plannedEndAt = new Date(Date.now() - 2 * 3_600_000);
    const entry = await prisma.tenantTimeEntry.create({
      data: {
        tenantId,
        employeeId,
        clockInAt: new Date(plannedEndAt.getTime() - 8 * 3_600_000),
        plannedEndAt,
        breaks: { create: [{ startAt: new Date(plannedEndAt.getTime() - 3_600_000) }] },
      },
    });

    await service.runTimeTrackingJobs();

    const closed = await prisma.tenantTimeEntry.findUniqueOrThrow({
      where: { id: entry.id },
      include: { breaks: true },
    });
    expect(closed.clockOutAt?.toISOString()).toBe(plannedEndAt.toISOString());
    expect(closed.autoClosed).toBe(true);
    expect(closed.breaks[0].endAt?.toISOString()).toBe(plannedEndAt.toISOString());
    expect(dispatched).toContainEqual({ userId: employeeUserId, key: "autoClockedOut", channels: ["push", "in-app"] });
  });

  it("erinnert einmal ans Einstempeln (Push), nicht bei Krankmeldung", async () => {
    const now = Date.now();
    await publishShift(new Date(now - 10 * 60_000), new Date(now + 4 * 3_600_000));

    await service.runTimeTrackingJobs();
    await service.runTimeTrackingJobs();

    expect(dispatched.filter((event) => event.key === "clockInReminder")).toEqual([
      { userId: employeeUserId, key: "clockInReminder", channels: ["push"] },
    ]);

    // Krankmeldung für heute: keine Erinnerung für eine neue Schicht.
    dispatched.length = 0;
    await prisma.tenantTimeClockReminder.deleteMany({ where: { tenantId } });
    const sick = await prisma.tenantSicknessReport.create({
      data: {
        tenantId,
        employeeId,
        startDate: new Date(`${localDateKey(new Date(), TZ)}T00:00:00.000Z`),
      },
    });
    await service.runTimeTrackingJobs();
    expect(dispatched).toEqual([]);
    await prisma.tenantSicknessReport.delete({ where: { id: sick.id } });
  });

  it("erinnert ans Ausstempeln, wenn nach Schichtende noch eingestempelt", async () => {
    const now = Date.now();
    await publishShift(new Date(now - 8 * 3_600_000), new Date(now - 10 * 60_000));
    await prisma.tenantTimeEntry.create({
      data: { tenantId, employeeId, clockInAt: new Date(now - 8 * 3_600_000) },
    });

    await service.runTimeTrackingJobs();

    expect(dispatched.map((event) => event.key)).toEqual(["clockOutReminder"]);
  });
});
