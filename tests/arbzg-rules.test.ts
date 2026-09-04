import { describe, expect, it } from "vitest";
import { exceedsMaxShiftHours, findRestPeriodViolation, shiftDurationHours } from "@/lib/arbzg-rules";

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
