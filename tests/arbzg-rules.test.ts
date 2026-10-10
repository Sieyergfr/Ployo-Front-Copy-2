import { describe, expect, it } from "vitest";
import {
  calculateAge,
  exceedsMaxShiftHours,
  findRestPeriodViolation,
  findShiftOverlap,
  isSunday,
  netWorkingMinutes,
  overlapsNightWindow,
  requiredBreakMinutes,
  shiftDurationHours,
} from "@/lib/arbzg-rules";

describe("findRestPeriodViolation", () => {
  it("meldet eine Verletzung bei zu kurzer Ruhezeit zur vorherigen Schicht", () => {
    const previous = { date: "2026-09-01", startTime: "14:00", endTime: "23:00" };
    const candidate = { date: "2026-09-02", startTime: "06:00", endTime: "14:00" }; // 7h Pause statt 11h

    const violation = findRestPeriodViolation([previous], candidate, 11);
    expect(violation).not.toBeNull();
    expect(violation?.restHours).toBeCloseTo(7);
  });

  it("meldet keine Verletzung bei ausreichender Ruhezeit", () => {
    const previous = { date: "2026-09-01", startTime: "08:00", endTime: "16:00" };
    const candidate = { date: "2026-09-02", startTime: "08:00", endTime: "16:00" }; // 16h Pause

    expect(findRestPeriodViolation([previous], candidate, 11)).toBeNull();
  });

  it("berücksichtigt Schichten über Mitternacht korrekt", () => {
    const nightShift = { date: "2026-09-01", startTime: "22:00", endTime: "06:00" }; // endet am 2.9.
    const candidate = { date: "2026-09-02", startTime: "10:00", endTime: "18:00" }; // 4h Pause statt 11h

    const violation = findRestPeriodViolation([nightShift], candidate, 11);
    expect(violation).not.toBeNull();
    expect(violation?.restHours).toBeCloseTo(4);
  });

  it("ignoriert überlappende Schichten (Doppelbuchung ist ein anderer Fall)", () => {
    const overlapping = { date: "2026-09-02", startTime: "08:00", endTime: "16:00" };
    const candidate = { date: "2026-09-02", startTime: "12:00", endTime: "20:00" };

    expect(findRestPeriodViolation([overlapping], candidate, 11)).toBeNull();
  });

  it("prüft auch die Ruhezeit zur nachfolgenden Schicht, nicht nur zur vorherigen", () => {
    const next = { date: "2026-09-03", startTime: "05:00", endTime: "13:00" };
    const candidate = { date: "2026-09-02", startTime: "12:00", endTime: "20:00" }; // 9h Pause statt 11h

    const violation = findRestPeriodViolation([next], candidate, 11);
    expect(violation).not.toBeNull();
    expect(violation?.restHours).toBeCloseTo(9);
  });
});

describe("shiftDurationHours / exceedsMaxShiftHours", () => {
  it("berechnet die Dauer korrekt, auch über Mitternacht", () => {
    expect(shiftDurationHours({ date: "2026-09-01", startTime: "22:00", endTime: "06:00" })).toBeCloseTo(8);
    expect(shiftDurationHours({ date: "2026-09-01", startTime: "08:00", endTime: "16:30" })).toBeCloseTo(8.5);
  });

  it("meldet eine Überschreitung der Höchstarbeitszeit", () => {
    const longShift = { date: "2026-09-01", startTime: "06:00", endTime: "18:00" }; // 12h
    expect(exceedsMaxShiftHours(longShift, 10)).toBe(true);
    expect(exceedsMaxShiftHours(longShift, 12)).toBe(false);
  });
});

describe("overlapsNightWindow", () => {
  it("erkennt eine Spätschicht, die ins Nachtfenster hineinreicht", () => {
    expect(overlapsNightWindow({ date: "2026-09-01", startTime: "18:00", endTime: "22:00" })).toBe(true);
  });

  it("erkennt eine Frühschicht, die kurz nach Mitternacht beginnt (Nachtfenster des Vortags)", () => {
    expect(overlapsNightWindow({ date: "2026-09-02", startTime: "02:00", endTime: "10:00" })).toBe(true);
  });

  it("meldet keine Überschneidung für eine reine Tagschicht", () => {
    expect(overlapsNightWindow({ date: "2026-09-01", startTime: "08:00", endTime: "16:00" })).toBe(false);
  });

  it("erkennt eine Nachtschicht über Mitternacht als vollständig im Nachtfenster", () => {
    expect(overlapsNightWindow({ date: "2026-09-01", startTime: "22:00", endTime: "06:00" })).toBe(true);
  });
});

describe("isSunday", () => {
  it("erkennt einen Sonntag", () => {
    expect(isSunday("2026-09-06")).toBe(true); // Sonntag
  });

  it("erkennt einen Nicht-Sonntag", () => {
    expect(isSunday("2026-09-07")).toBe(false); // Montag
  });
});

describe("calculateAge", () => {
  it("berechnet das Alter korrekt, wenn der Geburtstag im Jahr schon war", () => {
    expect(calculateAge("2010-01-15", new Date(2026, 8, 5))).toBe(16);
  });

  it("berechnet das Alter korrekt, wenn der Geburtstag im Jahr noch aussteht", () => {
    expect(calculateAge("2010-12-15", new Date(2026, 8, 5))).toBe(15);
  });

  it("berechnet das Alter korrekt am Geburtstag selbst", () => {
    expect(calculateAge("2010-09-05", new Date(2026, 8, 5))).toBe(16);
  });

  it("liefert null bei leerem oder ungültigem Geburtsdatum", () => {
    expect(calculateAge("", new Date(2026, 8, 5))).toBeNull();
    expect(calculateAge("nicht-auswertbar", new Date(2026, 8, 5))).toBeNull();
  });
});

/** Regressionstest für Sicherheitsaudit-Finding M03. */
describe("findShiftOverlap", () => {
  it("erkennt eine echte zeitliche Überschneidung derselben Person", () => {
    const existing = { date: "2026-09-01", startTime: "08:00", endTime: "16:00" };
    const candidate = { date: "2026-09-01", startTime: "12:00", endTime: "20:00" };
    expect(findShiftOverlap([existing], candidate)).toEqual({ neighborDate: "2026-09-01", shift: existing });
  });

  it("erkennt eine Überschneidung über Mitternacht hinweg (Nachtschicht trifft Frühschicht)", () => {
    const nightShift = { date: "2026-09-01", startTime: "22:00", endTime: "06:00" }; // endet 02.09. 06:00
    const candidate = { date: "2026-09-02", startTime: "05:00", endTime: "13:00" }; // beginnt vor Schichtende
    expect(findShiftOverlap([nightShift], candidate)).toEqual({ neighborDate: "2026-09-01", shift: nightShift });
  });

  it("meldet keine Überschneidung bei ausreichendem Ruheabstand", () => {
    const existing = { date: "2026-09-01", startTime: "08:00", endTime: "16:00" };
    const candidate = { date: "2026-09-02", startTime: "08:00", endTime: "16:00" };
    expect(findShiftOverlap([existing], candidate)).toBeNull();
  });

  it("meldet keine Überschneidung, wenn eine Schicht exakt endet, wo die andere beginnt", () => {
    const existing = { date: "2026-09-01", startTime: "08:00", endTime: "16:00" };
    const candidate = { date: "2026-09-01", startTime: "16:00", endTime: "20:00" };
    expect(findShiftOverlap([existing], candidate)).toBeNull();
  });
});

describe("netWorkingMinutes", () => {
  it("zieht die Pause von der Anwesenheitsspanne ab", () => {
    expect(netWorkingMinutes({ date: "2026-09-01", startTime: "08:00", endTime: "16:00" }, 30)).toBe(450); // 8h - 30min
  });

  it("wird nie negativ, auch bei einer Pause länger als die Schicht", () => {
    expect(netWorkingMinutes({ date: "2026-09-01", startTime: "08:00", endTime: "09:00" }, 90)).toBe(0);
  });
});

describe("requiredBreakMinutes", () => {
  it("Erwachsene (§4 ArbZG): keine Pause bis 6h, 30 Min. über 6h, 45 Min. über 9h", () => {
    expect(requiredBreakMinutes(6 * 60, false)).toBe(0);
    expect(requiredBreakMinutes(6 * 60 + 1, false)).toBe(30);
    expect(requiredBreakMinutes(9 * 60, false)).toBe(30);
    expect(requiredBreakMinutes(9 * 60 + 1, false)).toBe(45);
  });

  it("Jugendliche (§11 JArbSchG): niedrigere Schwellen — 30 Min. über 4,5h, 60 Min. über 6h", () => {
    expect(requiredBreakMinutes(4 * 60 + 30, true)).toBe(0);
    expect(requiredBreakMinutes(4 * 60 + 31, true)).toBe(30);
    expect(requiredBreakMinutes(6 * 60, true)).toBe(30);
    expect(requiredBreakMinutes(6 * 60 + 1, true)).toBe(60);
  });
});
