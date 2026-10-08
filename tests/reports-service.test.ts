import { inflateRawSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { REPORT_ERRORS } from "@/lib/report-hours";
import { isoWeekOfIsoDate, zonedTimeToUtc } from "@/lib/time-tracking";

/**
 * Integrationstest der Stunden-Reports gegen eine echte Datenbank:
 * Auswahl (alle/Team/Standort/Mitarbeiter), Scope der Zeiterfassung,
 * Nacht-/Feiertags-/Sonntagsanteile, Abwesenheiten samt eigener
 * Berechtigung, Export mit Anpassungen und E-Mail-Versand an die
 * Empfängerliste.
 */

let currentUserId = "";
const sentMails: Array<{ to: string; filename: string; size: number }> = [];

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

vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  isEmailConfigured: () => true,
  sendHoursReportEmail: async (input: { to: string; attachment: { filename: string; content: Buffer } }) => {
    sentMails.push({ to: input.to, filename: input.attachment.filename, size: input.attachment.content.length });
  },
}));

const service = await import("@/lib/reports-service");

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-report-${RUN_ID}`;
const TZ = "Europe/Berlin";
const at = (date: string, time: string) => zonedTimeToUtc(date, time, TZ);

let tenantId: string;
let ownerUserId: string;
let leadUserId: string;
let plainUserId: string;
let userIds: string[];
let anna: string; // Küche, Standort Erfurt (Thüringen)
let ben: string; // Service, kein Hauptstandort, aber Mitglied am Standort Erfurt
let lena: string; // Küche, ohne jeden Standort, verknüpft mit leadUserId
let former: string;
let teamId: string;
let locationId: string;

const SEPTEMBER = { mode: "all", period: "month", date: "2026-09-15" };

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Report Test ${RUN_ID}`, timezone: TZ },
  });
  tenantId = tenant.id;
  await prisma.tenantSettings.create({ data: { tenantId, timeTrackingEnabled: true } });

  const [owner, lead, plain] = await Promise.all(
    ["owner", "lead", "plain"].map((name) =>
      prisma.user.create({ data: { email: `${name}-${RUN_ID}@ployo.invalid`, name, emailVerified: true } }),
    ),
  );
  ownerUserId = owner.id;
  leadUserId = lead.id;
  plainUserId = plain.id;
  userIds = [ownerUserId, leadUserId, plainUserId];

  const leadRole = await prisma.tenantRole.create({
    data: {
      tenantId,
      key: "lead",
      name: "Teamleitung",
      permissions: { create: [{ area: "timeTracking", level: "read", scope: "team" }] },
    },
  });
  const plainRole = await prisma.tenantRole.create({
    data: {
      tenantId,
      key: "plain",
      name: "Ohne Rechte",
      permissions: { create: [{ area: "timeTracking", level: "none", scope: "all" }] },
    },
  });
  await prisma.tenantMembership.createMany({
    data: [
      { tenantId, userId: ownerUserId, role: "OWNER" },
      { tenantId, userId: leadUserId, role: "EMPLOYEE", roleId: leadRole.id },
      { tenantId, userId: plainUserId, role: "EMPLOYEE", roleId: plainRole.id },
    ],
  });

  const make = (key: string, name: string, data: Record<string, unknown> = {}) =>
    prisma.tenantEmployee.create({
      data: { tenantId, key: `${key}-${RUN_ID}`, initials: key.slice(0, 2).toUpperCase(), name, employeeNumber: `${key}-${RUN_ID}`, ...data },
    });
  anna = (await make("anna", "Anna Arndt", { team: "Küche", location: "Erfurt" })).id;
  ben = (await make("ben", "Ben Bauer", { team: "Service" })).id;
  lena = (await make("lena", "Lena Lang", { team: "Küche", userId: leadUserId })).id;
  former = (await make("former", "Fritz Früher", { team: "Küche", status: "former" })).id;

  const team = await prisma.tenantTeam.create({
    data: {
      tenantId,
      key: `kueche-${RUN_ID}`,
      name: "Küche",
      members: {
        create: [anna, lena, former].map((employeeId) => ({
          employeeId,
          initials: "XX",
          name: "x",
          location: "",
          role: "",
          contract: "",
        })),
      },
    },
  });
  teamId = team.id;
  const location = await prisma.tenantLocation.create({
    data: {
      tenantId,
      key: `erfurt-${RUN_ID}`,
      kind: "Filiale",
      name: "Erfurt",
      bundesland: "TH",
      members: { create: [anna, ben].map((employeeId) => ({ employeeId, initials: "XX", name: "x" })) },
    },
  });
  locationId = location.id;

  // Anna: Fr 11.09. 22:00 → Sa 06:00 mit Pause 02:00–02:30 (7,5 h, alles Nacht).
  await prisma.tenantTimeEntry.create({
    data: {
      tenantId,
      employeeId: anna,
      clockInAt: at("2026-09-11", "22:00"),
      clockOutAt: at("2026-09-12", "06:00"),
      breaks: { create: [{ startAt: at("2026-09-12", "02:00"), endAt: at("2026-09-12", "02:30") }] },
    },
  });
  // Weltkindertag So 20.09.2026 — Feiertag nur in Thüringen.
  for (const employeeId of [anna, ben, lena]) {
    await prisma.tenantTimeEntry.create({
      data: { tenantId, employeeId, clockInAt: at("2026-09-20", "10:00"), clockOutAt: at("2026-09-20", "14:00") },
    });
  }
  // Außerhalb des Zeitraums — darf nicht zählen.
  await prisma.tenantTimeEntry.create({
    data: { tenantId, employeeId: anna, clockInAt: at("2026-10-01", "10:00"), clockOutAt: at("2026-10-01", "12:00") },
  });

  const { year, week } = isoWeekOfIsoDate("2026-09-14");
  await prisma.tenantShiftWeek.create({
    data: {
      tenantId,
      year,
      week,
      status: "published",
      publishedShiftsJson: [
        { id: `s-${RUN_ID}`, date: "2026-09-14", startTime: "08:00", endTime: "16:00", breakMinutes: 30, employeeId: anna },
      ],
    },
  });

  await prisma.tenantVacationRequest.createMany({
    data: [
      { tenantId, employeeId: anna, key: `v1-${RUN_ID}`, startDate: "2026-09-28", endDate: "2026-10-02", status: "approved" },
      { tenantId, employeeId: anna, key: `v2-${RUN_ID}`, startDate: "2026-09-01", endDate: "2026-09-02", status: "pending" },
    ],
  });
  await prisma.tenantSicknessReport.create({
    data: { tenantId, employeeId: ben, startDate: new Date("2026-09-25T00:00:00.000Z"), endDate: null },
  });
});

beforeEach(async () => {
  currentUserId = ownerUserId;
  sentMails.length = 0;
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

function rowOf(view: { rows: Array<{ employeeId: string }> }, id: string) {
  return view.rows.find((row) => row.employeeId === id) as Awaited<ReturnType<typeof service.getHoursReport>>["rows"][number];
}

function sheetXml(base64: string) {
  const buffer = Buffer.from(base64, "base64");
  const name = Buffer.from("xl/worksheets/sheet1.xml");
  const start = buffer.indexOf(name);
  const compressedSize = buffer.readUInt32LE(start - 30 + 18);
  return inflateRawSync(buffer.subarray(start + name.length, start + name.length + compressedSize)).toString("utf8");
}

describe("getHoursReport", () => {
  it("wertet Soll, Ist, Zuschläge und Abwesenheiten aus", async () => {
    const view = await service.getHoursReport(tenantSlug, SEPTEMBER);

    expect(view.range).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(view.rows.map((row) => row.name)).toEqual(["Anna Arndt", "Ben Bauer", "Lena Lang"]);
    expect(view.showVacation && view.showSickness && view.canEdit).toBe(true);

    expect(rowOf(view, anna)).toMatchObject({
      plannedMinutes: 450,
      workedMinutes: 450 + 240,
      nightMinutes: 450,
      holidayMinutes: 240,
      sundayMinutes: 0,
      vacations: [{ from: "2026-09-28", to: "2026-09-30", days: 3 }],
      sickness: [],
    });
    // Ben: kein Hauptstandort, aber Standort-Mitgliedschaft in Thüringen → Feiertag.
    expect(rowOf(view, ben)).toMatchObject({
      workedMinutes: 240,
      holidayMinutes: 240,
      sundayMinutes: 0,
      sickness: [{ from: "2026-09-25", to: "2026-09-30", days: 6, open: true }],
    });
    // Lena: gar kein Standort → nur bundeseinheitliche Feiertage → normaler Sonntag.
    expect(rowOf(view, lena)).toMatchObject({ workedMinutes: 240, holidayMinutes: 0, sundayMinutes: 240 });
  });

  it("filtert nach Team, Standort und Mitarbeitern", async () => {
    const team = await service.getHoursReport(tenantSlug, { ...SEPTEMBER, mode: "team", team: teamId });
    expect(team.selectionName).toBe("Küche");
    // Ausgeschiedene ohne Einträge fallen aus Sammelauswahlen heraus.
    expect(team.rows.map((row) => row.employeeId)).toEqual([anna, lena]);

    const location = await service.getHoursReport(tenantSlug, { ...SEPTEMBER, mode: "location", location: locationId });
    expect(location.rows.map((row) => row.employeeId)).toEqual([anna, ben]);

    const many = await service.getHoursReport(tenantSlug, { ...SEPTEMBER, mode: "employees", employee: [ben, "fremd", former] });
    expect(many.rows.map((row) => row.employeeId)).toEqual([ben, former]);

    const missing = await service.getHoursReport(tenantSlug, { ...SEPTEMBER, mode: "team", team: "gibt-es-nicht" });
    expect(missing.selectionMissing).toBe(true);
    expect(missing.rows).toEqual([]);
  });

  it("unterstützt Tag, Woche und benutzerdefinierte Zeiträume", async () => {
    const day = await service.getHoursReport(tenantSlug, { mode: "employee", employee: anna, period: "day", date: "2026-09-20" });
    expect(rowOf(day, anna)).toMatchObject({ workedMinutes: 240, plannedMinutes: 0 });

    const custom = await service.getHoursReport(tenantSlug, {
      mode: "employee",
      employee: anna,
      period: "custom",
      from: "2026-09-12",
      to: "2026-10-01",
    });
    // Einträge zählen nach Einstempel-Tag: der Nachtdienst vom 11.09. fällt heraus, der 01.10. kommt dazu.
    expect(rowOf(custom, anna).workedMinutes).toBe(240 + 120);
  });

  it("begrenzt die Teamleitung auf ihr Team und blendet Abwesenheiten ohne Recht aus", async () => {
    currentUserId = leadUserId;
    const view = await service.getHoursReport(tenantSlug, SEPTEMBER);

    expect(view.rows.map((row) => row.employeeId)).toEqual([anna, lena]);
    expect(view.showVacation).toBe(false);
    expect(view.showSickness).toBe(false);
    expect(rowOf(view, anna).vacations).toBeNull();
    expect(view.canEdit).toBe(false);
    expect(view.recipients).toEqual([]);

    // Mitarbeiter außerhalb des Teams lassen sich auch nicht gezielt anfordern.
    const forced = await service.getHoursReport(tenantSlug, { ...SEPTEMBER, mode: "employee", employee: ben });
    expect(forced.rows).toEqual([]);
  });

  it("verweigert Mitgliedern ohne Zeiterfassungsrecht den Zugriff", async () => {
    currentUserId = plainUserId;
    await expect(service.getHoursReport(tenantSlug, SEPTEMBER)).rejects.toThrow("FORBIDDEN");
  });
});

describe("Export", () => {
  const filters = () => service.parseReportFilters(SEPTEMBER, "2026-10-07");

  it("übernimmt Anpassungen nur für erlaubte Felder und protokolliert sie", async () => {
    const result = await service.exportHoursReport({
      tenantSlug,
      filters: filters(),
      format: "xlsx",
      overrides: { [anna]: { workedMinutes: 720, plannedMinutes: 1 }, fremd: { workedMinutes: 1 } },
    });
    const sheet = sheetXml(result.base64);

    expect(result.filename).toBe("stundenreport_2026-09-01_2026-09-30.xlsx");
    expect(sheet).toContain("<v>12</v>"); // 720 Min.
    expect(sheet).toContain("<v>7.5</v>"); // Soll unverändert
    expect(sheet).toContain("Manuell angepasst: Ist");

    const audit = await prisma.tenantAuditLog.findFirst({
      where: { tenantId, action: "Stundenreport exportiert" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.detail).toContain("Anna Arndt Ist 690→720 Min.");

    await expect(
      service.exportHoursReport({ tenantSlug, filters: filters(), format: "pdf", overrides: { [anna]: { nightMinutes: -1 } } }),
    ).rejects.toThrow(REPORT_ERRORS.invalidValue);
  });

  it("ignoriert Anpassungen ohne Schreibrecht", async () => {
    currentUserId = leadUserId;
    const result = await service.exportHoursReport({
      tenantSlug,
      filters: filters(),
      format: "xlsx",
      overrides: { [anna]: { workedMinutes: 720 } },
    });
    const sheet = sheetXml(result.base64);
    expect(sheet).not.toContain("Manuell angepasst");
    expect(sheet).toContain("<v>11.5</v>"); // 690 Min.
    expect(sheet).not.toContain("Ben Bauer");
  });

  it("liefert ein PDF", async () => {
    const result = await service.exportHoursReport({ tenantSlug, filters: filters(), format: "pdf", overrides: {} });
    expect(Buffer.from(result.base64, "base64").subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("Versand und Empfängerliste", () => {
  const filters = () => service.parseReportFilters(SEPTEMBER, "2026-10-07");

  it("startet mit leerer Liste und nimmt nur gespeicherte oder neu eingegebene Adressen", async () => {
    expect((await service.getHoursReport(tenantSlug, SEPTEMBER)).recipients).toEqual([]);

    // Eine nicht gespeicherte Adresse in "recipients" wird ignoriert.
    await expect(
      service.sendHoursReport({
        tenantSlug,
        filters: filters(),
        format: "pdf",
        overrides: {},
        recipients: ["fremd@example.com"],
        newEmail: "",
        saveNewEmail: false,
      }),
    ).rejects.toThrow(REPORT_ERRORS.noRecipients);

    const first = await service.sendHoursReport({
      tenantSlug,
      filters: filters(),
      format: "pdf",
      overrides: {},
      recipients: [],
      newEmail: " Lohn@Steuerbuero.example ",
      saveNewEmail: true,
    });
    expect(first.sent).toBe(1);
    expect(sentMails).toEqual([
      expect.objectContaining({ to: "lohn@steuerbuero.example", filename: "stundenreport_2026-09-01_2026-09-30.pdf" }),
    ]);
    expect((await service.getHoursReport(tenantSlug, SEPTEMBER)).recipients).toEqual(["lohn@steuerbuero.example"]);

    await service.addReportRecipient({ tenantSlug, email: "chef@example.com" });
    await service.addReportRecipient({ tenantSlug, email: "chef@example.com" }); // doppelt → kein Fehler
    sentMails.length = 0;
    const second = await service.sendHoursReport({
      tenantSlug,
      filters: filters(),
      format: "xlsx",
      overrides: {},
      recipients: ["lohn@steuerbuero.example", "chef@example.com"],
      newEmail: "einmalig@example.com",
      saveNewEmail: false,
    });
    expect(second.sent).toBe(3);
    expect(sentMails.map((mail) => mail.to).sort()).toEqual([
      "chef@example.com",
      "einmalig@example.com",
      "lohn@steuerbuero.example",
    ]);
    expect((await service.getHoursReport(tenantSlug, SEPTEMBER)).recipients).toEqual([
      "chef@example.com",
      "lohn@steuerbuero.example",
    ]);

    await service.removeReportRecipient({ tenantSlug, email: "chef@example.com" });
    expect((await service.getHoursReport(tenantSlug, SEPTEMBER)).recipients).toEqual(["lohn@steuerbuero.example"]);

    const audit = await prisma.tenantAuditLog.count({ where: { tenantId, action: "Stundenreport versendet" } });
    expect(audit).toBe(2);

    await expect(service.addReportRecipient({ tenantSlug, email: "a@b.de, c@d.de" })).rejects.toThrow(
      REPORT_ERRORS.invalidEmail,
    );
  });

  it("verlangt Schreibrecht für Versand und Empfängerliste", async () => {
    currentUserId = leadUserId;
    await expect(
      service.sendHoursReport({
        tenantSlug,
        filters: filters(),
        format: "pdf",
        overrides: {},
        recipients: [],
        newEmail: "x@example.com",
        saveNewEmail: true,
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(service.addReportRecipient({ tenantSlug, email: "x@example.com" })).rejects.toThrow("FORBIDDEN");
    await expect(service.removeReportRecipient({ tenantSlug, email: "lohn@steuerbuero.example" })).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(sentMails).toEqual([]);
  });
});
