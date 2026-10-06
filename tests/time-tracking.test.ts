import { describe, expect, it } from "vitest";
import {
  autoClockOutDecision,
  calculateEntryDurations,
  dueReminders,
  findClockableShift,
  formatDuration,
  isoWeekOfIsoDate,
  localDateKey,
  localTimeKey,
  requiredBreakMinutes,
  resolvePeriod,
  resolveShiftInterval,
  zonedTimeToUtc,
  type ResolvedShift,
} from "@/lib/time-tracking";

const TZ = "Europe/Berlin";
const minutes = (value: number) => value * 60_000;

function shiftAt(startIso: string, endIso: string, id = "s1"): ResolvedShift {
  return {
    id,
    date: startIso.slice(0, 10),
    startTime: "00:00",
    endTime: "00:00",
    startAt: new Date(startIso),
    endAt: new Date(endIso),
    location: "",
    breakMinutes: 30,
  };
}

describe("Zeitzonen", () => {
  it("rechnet Berliner Ortszeit im Sommer (UTC+2) und Winter (UTC+1) korrekt um", () => {
    expect(zonedTimeToUtc("2026-07-01", "08:00", TZ).toISOString()).toBe("2026-07-01T06:00:00.000Z");
    expect(zonedTimeToUtc("2026-01-15", "08:00", TZ).toISOString()).toBe("2026-01-15T07:00:00.000Z");
  });

  it("stimmt direkt nach der Zeitumstellung", () => {
    // 29.03.2026: 02:00 → 03:00 MESZ
    expect(zonedTimeToUtc("2026-03-29", "03:30", TZ).toISOString()).toBe("2026-03-29T01:30:00.000Z");
    // 25.10.2026: 03:00 → 02:00 MEZ
    expect(zonedTimeToUtc("2026-10-25", "04:00", TZ).toISOString()).toBe("2026-10-25T03:00:00.000Z");
  });

  it("liefert Kalendertag und Uhrzeit in der Ortszeit", () => {
    const value = new Date("2026-07-01T22:30:00.000Z");
    expect(localDateKey(value, TZ)).toBe("2026-07-02");
    expect(localTimeKey(value, TZ)).toBe("00:30");
  });

  it("behandelt Schichten über Mitternacht", () => {
    const interval = resolveShiftInterval({ date: "2026-07-01", startTime: "22:00", endTime: "06:00" }, TZ);
    expect(interval.startAt.toISOString()).toBe("2026-07-01T20:00:00.000Z");
    expect(interval.endAt.toISOString()).toBe("2026-07-02T04:00:00.000Z");
  });
});

describe("Schichtfenster fürs Einstempeln", () => {
  const shift = shiftAt("2026-07-01T08:00:00.000Z", "2026-07-01T16:00:00.000Z");

  it("erlaubt Einstempeln ab `lead` Minuten vor Beginn bis Schichtende", () => {
    expect(findClockableShift([shift], new Date("2026-07-01T06:59:00.000Z"), 60)).toBeNull();
    expect(findClockableShift([shift], new Date("2026-07-01T07:00:00.000Z"), 60)).toBe(shift);
    expect(findClockableShift([shift], new Date("2026-07-01T15:59:00.000Z"), 60)).toBe(shift);
    expect(findClockableShift([shift], new Date("2026-07-01T16:00:00.000Z"), 60)).toBeNull();
  });
});

describe("Pausen und Netto", () => {
  it("leitet die gesetzliche Mindestpause ab (§4 ArbZG)", () => {
    expect(requiredBreakMinutes(360)).toBe(0);
    expect(requiredBreakMinutes(361)).toBe(30);
    expect(requiredBreakMinutes(540)).toBe(30);
    expect(requiredBreakMinutes(541)).toBe(45);
  });

  const clockInAt = new Date("2026-07-01T06:00:00.000Z");
  const clockOutAt = new Date(clockInAt.getTime() + minutes(8 * 60));

  it("zieht gestempelte Pausen ab", () => {
    const result = calculateEntryDurations(
      {
        clockInAt,
        clockOutAt,
        breakMinutesOverride: null,
        breaks: [{ startAt: new Date(clockInAt.getTime() + minutes(240)), endAt: new Date(clockInAt.getTime() + minutes(260)) }],
      },
      { autoBreakDeduction: false, now: clockOutAt },
    );
    expect(result).toMatchObject({ grossMinutes: 480, breakMinutes: 20, workedMinutes: 460, breakDeducted: false });
  });

  it("füllt bei aktivem Abzug auf die Mindestpause auf", () => {
    const result = calculateEntryDurations(
      { clockInAt, clockOutAt, breakMinutesOverride: null, breaks: [] },
      { autoBreakDeduction: true, now: clockOutAt },
    );
    expect(result).toMatchObject({ breakMinutes: 30, workedMinutes: 450, breakDeducted: true });
  });

  it("zieht während einer laufenden Schicht noch nichts automatisch ab", () => {
    const now = new Date(clockInAt.getTime() + minutes(7 * 60));
    const result = calculateEntryDurations(
      { clockInAt, clockOutAt: null, breakMinutesOverride: null, breaks: [] },
      { autoBreakDeduction: true, now },
    );
    expect(result).toMatchObject({ grossMinutes: 420, breakMinutes: 0, workedMinutes: 420 });
  });

  it("eine Korrektur ersetzt gestempelte Pausen", () => {
    const result = calculateEntryDurations(
      {
        clockInAt,
        clockOutAt,
        breakMinutesOverride: 15,
        breaks: [{ startAt: clockInAt, endAt: new Date(clockInAt.getTime() + minutes(60)) }],
      },
      { autoBreakDeduction: true, now: clockOutAt },
    );
    expect(result).toMatchObject({ breakMinutes: 15, workedMinutes: 465, clockedBreakMinutes: 60 });
  });
});

describe("automatisches Ausstempeln", () => {
  const settings = { autoClockOutAfterShiftMinutes: 60, autoClockOutMaxHours: 12 };

  it("schließt X Minuten nach Schichtende zum Schichtende", () => {
    const entry = {
      clockInAt: new Date("2026-07-01T06:00:00.000Z"),
      plannedEndAt: new Date("2026-07-01T14:00:00.000Z"),
    };
    expect(autoClockOutDecision(entry, settings, new Date("2026-07-01T14:59:00.000Z"))).toBeNull();
    expect(autoClockOutDecision(entry, settings, new Date("2026-07-01T15:00:00.000Z"))).toEqual({
      clockOutAt: entry.plannedEndAt,
    });
  });

  it("schließt ohne Schicht nach der Höchstdauer", () => {
    const entry = { clockInAt: new Date("2026-07-01T06:00:00.000Z"), plannedEndAt: null };
    expect(autoClockOutDecision(entry, settings, new Date("2026-07-01T17:59:00.000Z"))).toBeNull();
    expect(autoClockOutDecision(entry, settings, new Date("2026-07-01T18:00:00.000Z"))).toEqual({
      clockOutAt: new Date("2026-07-01T18:00:00.000Z"),
    });
  });
});

describe("Stempel-Erinnerungen", () => {
  const shift = shiftAt("2026-07-01T08:00:00.000Z", "2026-07-01T16:00:00.000Z");

  it("erinnert 5 Minuten nach Beginn ans Einstempeln, nicht früher", () => {
    const base = { shift, leadMinutes: 60, openEntry: null, lastClockInAt: null };
    expect(dueReminders({ ...base, now: new Date("2026-07-01T08:04:00.000Z") })).toEqual([]);
    expect(dueReminders({ ...base, now: new Date("2026-07-01T08:05:00.000Z") })).toEqual([
      { kind: "clock-in", shift },
    ]);
  });

  it("erinnert nicht, wenn schon eingestempelt oder zur Schicht bereits gestempelt wurde", () => {
    const now = new Date("2026-07-01T09:00:00.000Z");
    expect(
      dueReminders({ shift, now, leadMinutes: 60, openEntry: { clockInAt: new Date("2026-07-01T07:55:00.000Z") }, lastClockInAt: null }),
    ).toEqual([]);
    expect(
      dueReminders({ shift, now, leadMinutes: 60, openEntry: null, lastClockInAt: new Date("2026-07-01T07:30:00.000Z") }),
    ).toEqual([]);
  });

  it("erinnert 5 Minuten nach Ende ans Ausstempeln, wenn noch eingestempelt", () => {
    const openEntry = { clockInAt: new Date("2026-07-01T07:55:00.000Z") };
    expect(
      dueReminders({ shift, now: new Date("2026-07-01T16:04:00.000Z"), leadMinutes: 60, openEntry, lastClockInAt: null }),
    ).toEqual([]);
    expect(
      dueReminders({ shift, now: new Date("2026-07-01T16:05:00.000Z"), leadMinutes: 60, openEntry, lastClockInAt: null }),
    ).toEqual([{ kind: "clock-out", shift }]);
  });
});

describe("Zeiträume", () => {
  it("ISO-Wochen am Jahreswechsel", () => {
    expect(isoWeekOfIsoDate("2026-01-01")).toEqual({ year: 2026, week: 1 });
    expect(isoWeekOfIsoDate("2027-01-01")).toEqual({ year: 2026, week: 53 });
  });

  it("Woche und Monat inklusive Blättern", () => {
    expect(resolvePeriod("week", "2026-10-07")).toEqual({
      from: "2026-10-05",
      to: "2026-10-11",
      previous: "2026-09-28",
      next: "2026-10-12",
    });
    expect(resolvePeriod("month", "2026-12-15")).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
      previous: "2026-11-01",
      next: "2027-01-01",
    });
  });

  it("formatiert Dauern", () => {
    expect(formatDuration(465)).toBe("7:45");
    expect(formatDuration(-30)).toBe("−0:30");
  });
});
