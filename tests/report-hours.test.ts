import { inflateRawSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildReportPdf, buildReportXlsx, formatAbsencePeriods, type ReportExportInput } from "@/lib/report-export";
import {
  REPORT_ERRORS,
  clipPeriod,
  minutesToDecimalHours,
  normalizeReportEmail,
  parseHoursInput,
  resolveReportRange,
  sanitizeOverrides,
  splitSurchargeMinutes,
} from "@/lib/report-hours";
import { isGermanHoliday } from "@/lib/german-holidays";
import { zonedTimeToUtc } from "@/lib/time-tracking";

const TZ = "Europe/Berlin";
const at = (date: string, time: string) => zonedTimeToUtc(date, time, TZ);
const noHolidays = () => false;

function split(
  start: [string, string],
  end: [string, string],
  options: {
    nightStart?: "20" | "23";
    isHoliday?: (date: string) => boolean;
    breaks?: Array<{ startAt: Date; endAt: Date | null }>;
    workedMinutes?: number;
  } = {},
) {
  const clockInAt = at(...start);
  const endAt = at(...end);
  const breaks = options.breaks ?? [];
  const breakMinutes = breaks.reduce(
    (sum, item) => sum + ((item.endAt ?? endAt).getTime() - item.startAt.getTime()) / 60_000,
    0,
  );

  return splitSurchargeMinutes(
    {
      clockInAt,
      endAt,
      breaks,
      workedMinutes: options.workedMinutes ?? (endAt.getTime() - clockInAt.getTime()) / 60_000 - breakMinutes,
    },
    { timeZone: TZ, nightStart: options.nightStart ?? "20", isHoliday: options.isHoliday ?? noHolidays },
  );
}

describe("splitSurchargeMinutes", () => {
  it("zählt eine normale Tagschicht an einem Werktag nirgends als Zuschlag", () => {
    expect(split(["2026-10-07", "09:00"], ["2026-10-07", "17:00"])).toEqual({
      nightMinutes: 0,
      holidayMinutes: 0,
      sundayMinutes: 0,
    });
  });

  it("rechnet Nachtarbeit je nach Nachtbeginn ab 20 bzw. 23 Uhr bis 6 Uhr", () => {
    // Freitag 22:00 → Samstag 06:00
    expect(split(["2026-10-09", "22:00"], ["2026-10-10", "06:00"]).nightMinutes).toBe(480);
    expect(split(["2026-10-09", "22:00"], ["2026-10-10", "06:00"], { nightStart: "23" }).nightMinutes).toBe(420);
    // Spätschicht 18–23 Uhr: nur 20–23 Uhr ist Nacht (§3b), ab 23 Uhr gar nichts.
    expect(split(["2026-10-07", "18:00"], ["2026-10-07", "23:00"]).nightMinutes).toBe(180);
    expect(split(["2026-10-07", "18:00"], ["2026-10-07", "23:00"], { nightStart: "23" }).nightMinutes).toBe(0);
    // Frühschicht 04–12 Uhr: 04–06 Uhr ist Nacht.
    expect(split(["2026-10-07", "04:00"], ["2026-10-07", "12:00"]).nightMinutes).toBe(120);
  });

  it("zählt Sonntagsstunden ab Mitternacht Ortszeit", () => {
    // Samstag 22:00 → Sonntag 06:00
    const result = split(["2026-10-10", "22:00"], ["2026-10-11", "06:00"]);
    expect(result.sundayMinutes).toBe(360);
    expect(result.nightMinutes).toBe(480);
    expect(result.holidayMinutes).toBe(0);
  });

  it("zählt einen Feiertag am Sonntag nur als Feiertag, nicht doppelt", () => {
    const result = split(["2026-10-11", "08:00"], ["2026-10-11", "16:00"], {
      isHoliday: (date) => date === "2026-10-11",
    });
    expect(result).toEqual({ nightMinutes: 0, holidayMinutes: 480, sundayMinutes: 0 });
  });

  it("nutzt echte Feiertage je Bundesland", () => {
    // 1. November: Feiertag in Bayern, nicht in Berlin (2026 ein Sonntag → in BE Sonntag).
    const by = split(["2026-11-01", "10:00"], ["2026-11-01", "14:00"], {
      isHoliday: (date) => isGermanHoliday(date, "BY"),
    });
    const be = split(["2026-11-01", "10:00"], ["2026-11-01", "14:00"], {
      isHoliday: (date) => isGermanHoliday(date, "BE"),
    });
    expect(by).toEqual({ nightMinutes: 0, holidayMinutes: 240, sundayMinutes: 0 });
    expect(be).toEqual({ nightMinutes: 0, holidayMinutes: 0, sundayMinutes: 240 });
  });

  it("nimmt gestempelte Pausen zeitgenau heraus", () => {
    const result = split(["2026-10-07", "18:00"], ["2026-10-07", "23:00"], {
      breaks: [{ startAt: at("2026-10-07", "20:00"), endAt: at("2026-10-07", "20:30") }],
    });
    expect(result.nightMinutes).toBe(150);
  });

  it("skaliert bei angerechneter Pause ohne Lage proportional und nie über die Ist-Zeit", () => {
    // 8 h komplett in der Nacht, angerechnet nur 7,5 h (Mindestpause/Korrektur).
    const result = split(["2026-10-09", "22:00"], ["2026-10-10", "06:00"], { workedMinutes: 450 });
    expect(result.nightMinutes).toBe(450);
    // Halb Tag, halb Nacht: 16–24 Uhr, angerechnet 7 h → 4 h Nacht * 7/8.
    const half = split(["2026-10-07", "16:00"], ["2026-10-08", "00:00"], { workedMinutes: 420 });
    expect(half.nightMinutes).toBe(210);
  });

  it("rechnet über die Zeitumstellung mit echten Minuten", () => {
    // 24./25.10.2026: Uhren springen um 03:00 auf 02:00 zurück → die Nacht hat 9 echte Stunden.
    const result = split(["2026-10-24", "22:00"], ["2026-10-25", "06:00"]);
    expect(result.nightMinutes).toBe(540);
    expect(result.sundayMinutes).toBe(420);
  });

  it("liefert 0 für leere oder ungültige Einträge", () => {
    expect(split(["2026-10-07", "09:00"], ["2026-10-07", "09:00"])).toEqual({
      nightMinutes: 0,
      holidayMinutes: 0,
      sundayMinutes: 0,
    });
  });
});

describe("resolveReportRange", () => {
  it("löst Tag, Woche und Monat inklusive Blätter-Anker auf", () => {
    expect(resolveReportRange({ period: "day", anchor: "2026-10-07" })).toMatchObject({
      from: "2026-10-07",
      to: "2026-10-07",
      previous: "2026-10-06",
      next: "2026-10-08",
    });
    expect(resolveReportRange({ period: "week", anchor: "2026-10-07" })).toMatchObject({
      from: "2026-10-05",
      to: "2026-10-11",
      previous: "2026-09-28",
      next: "2026-10-12",
    });
    expect(resolveReportRange({ period: "month", anchor: "2026-12-15" })).toMatchObject({
      from: "2026-12-01",
      to: "2026-12-31",
      previous: "2026-11-01",
      next: "2027-01-01",
    });
  });

  it("akzeptiert benutzerdefinierte Zeiträume bis 366 Tage", () => {
    expect(resolveReportRange({ period: "custom", anchor: "", from: "2026-01-01", to: "2026-12-31" })).toMatchObject({
      from: "2026-01-01",
      to: "2026-12-31",
      previous: null,
      next: null,
    });
    expect(() => resolveReportRange({ period: "custom", anchor: "", from: "2026-01-01", to: "2027-01-02" })).toThrow(
      REPORT_ERRORS.invalidRange,
    );
    expect(() => resolveReportRange({ period: "custom", anchor: "", from: "2026-02-01", to: "2026-01-01" })).toThrow(
      REPORT_ERRORS.invalidRange,
    );
    expect(() => resolveReportRange({ period: "custom", anchor: "", from: "2026-02-30", to: "2026-03-01" })).toThrow(
      REPORT_ERRORS.invalidRange,
    );
  });
});

describe("clipPeriod", () => {
  const range = { from: "2026-10-01", to: "2026-10-31" };

  it("schneidet auf den Zeitraum zu und verwirft Zeiträume außerhalb", () => {
    expect(clipPeriod("2026-09-28", "2026-10-03", range)).toEqual({ from: "2026-10-01", to: "2026-10-03" });
    expect(clipPeriod("2026-10-30", "2026-11-05", range)).toEqual({ from: "2026-10-30", to: "2026-10-31" });
    expect(clipPeriod("2026-09-01", "2026-09-30", range)).toBeNull();
    expect(clipPeriod("2026-11-01", null, range)).toBeNull();
    expect(clipPeriod("2026-10-20", null, range)).toEqual({ from: "2026-10-20", to: "2026-10-31" });
  });
});

describe("Eingaben", () => {
  it("parst Dezimal- und Uhrzeitformat", () => {
    expect(parseHoursInput("7,5")).toBe(450);
    expect(parseHoursInput("7.75")).toBe(465);
    expect(parseHoursInput("7:45")).toBe(465);
    expect(parseHoursInput("160")).toBe(9600);
    expect(parseHoursInput("  ")).toBeNull();
    expect(parseHoursInput("-1")).toBeNaN();
    expect(parseHoursInput("abc")).toBeNaN();
    expect(parseHoursInput("7:75")).toBeNaN();
    expect(minutesToDecimalHours(465)).toBe(7.75);
  });

  it("übernimmt nur erlaubte Mitarbeiter/Felder und lehnt unplausible Zahlen ab", () => {
    const allowed = new Set(["a", "b"]);
    expect(
      sanitizeOverrides(
        { a: { workedMinutes: 480, plannedMinutes: 1, nightMinutes: null }, x: { workedMinutes: 1 } },
        allowed,
        10_000,
      ),
    ).toEqual({ a: { workedMinutes: 480 } });
    expect(() => sanitizeOverrides({ a: { workedMinutes: -5 } }, allowed, 10_000)).toThrow(REPORT_ERRORS.invalidValue);
    expect(() => sanitizeOverrides({ a: { workedMinutes: 1.5 } }, allowed, 10_000)).toThrow(REPORT_ERRORS.invalidValue);
    expect(() => sanitizeOverrides({ a: { workedMinutes: 10_001 } }, allowed, 10_000)).toThrow(
      REPORT_ERRORS.invalidValue,
    );
    expect(sanitizeOverrides("kaputt", allowed, 10_000)).toEqual({});
  });

  it("normalisiert E-Mail-Adressen und lehnt Mehrfach-/Header-Tricks ab", () => {
    expect(normalizeReportEmail("  Lohn@Steuerbuero.DE ")).toBe("lohn@steuerbuero.de");
    expect(() => normalizeReportEmail("a@b.de, c@d.de")).toThrow(REPORT_ERRORS.invalidEmail);
    expect(() => normalizeReportEmail("a@b.de\nBcc: x@y.de")).toThrow(REPORT_ERRORS.invalidEmail);
    expect(() => normalizeReportEmail("kein-at.de")).toThrow(REPORT_ERRORS.invalidEmail);
  });
});

/** Liest die Dateien aus einem (von createZip erzeugten) ZIP über das zentrale Verzeichnis. */
function readZip(buffer: Buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const files = new Map<string, string>();

  for (let index = 0; index < count; index += 1) {
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const data = buffer.subarray(localOffset + 30 + localNameLength, localOffset + 30 + localNameLength + compressedSize);
    files.set(name, inflateRawSync(data).toString("utf8"));
    offset += 46 + nameLength;
  }

  return files;
}

const exportInput: ReportExportInput = {
  tenantName: "Café Müller & Söhne",
  title: "Stundenreport",
  rangeLabel: "01.10.2026 – 31.10.2026",
  selectionLabel: "Team: Küche <A>",
  nightLabel: "Nachtarbeit 20:00–06:00 Uhr",
  generatedLabel: "Erstellt am 07.10.2026 von Test",
  showVacation: true,
  showSickness: true,
  rows: [
    {
      name: "Jörg Weiß",
      employeeNumber: "MA-001",
      plannedMinutes: 9600,
      workedMinutes: 9645,
      nightMinutes: 120,
      holidayMinutes: 480,
      sundayMinutes: 0,
      vacations: [{ from: "2026-10-12", to: "2026-10-16", days: 5 }],
      sickness: [{ from: "2026-10-20", to: "2026-10-31", days: 12, open: true }],
      adjusted: ["Ist"],
    },
    {
      name: "Ana Ğ",
      employeeNumber: "",
      plannedMinutes: 0,
      workedMinutes: 0,
      nightMinutes: 0,
      holidayMinutes: 0,
      sundayMinutes: 0,
      vacations: null,
      sickness: [],
      adjusted: [],
    },
  ],
};

describe("Report-Dateien", () => {
  it("baut eine gültige XLSX-Datei mit Zahlen, Summen und Hinweisen", () => {
    const files = readZip(buildReportXlsx(exportInput));
    expect([...files.keys()]).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]),
    );
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("Café Müller &amp; Söhne");
    expect(sheet).toContain("Team: Küche &lt;A&gt;");
    expect(sheet).toContain("<v>160.75</v>");
    expect(sheet).toContain("Manuell angepasst: Ist");
    expect(sheet).toContain("12.10.–16.10. (5 T.)");
    expect(sheet).toContain("20.10.–31.10. (offen, 12 T.)");
  });

  it("baut ein ladbares PDF auch mit Zeichen außerhalb von WinAnsi", async () => {
    const pdf = await buildReportPdf(exportInput);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const loaded = await PDFDocument.load(pdf);
    expect(loaded.getPageCount()).toBe(1);
  });

  it("bricht große Reports auf mehrere Seiten um", async () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({ ...exportInput.rows[0], name: `Person ${index}` }));
    const loaded = await PDFDocument.load(await buildReportPdf({ ...exportInput, rows }));
    expect(loaded.getPageCount()).toBeGreaterThan(1);
  });

  it("formatiert Abwesenheiten kompakt", () => {
    expect(formatAbsencePeriods([{ from: "2026-10-05", to: "2026-10-05", days: 1 }])).toBe("05.10. (1 T.)");
  });
});
