import { describe, expect, it } from "vitest";
import { computeOvertimeWarnings, parseWeeklyHours } from "@/lib/shift-overtime";

/** Überstunden-Warnung im Schichtplan (Einstellung „Überstunden-Warnung“, M4). */

describe("Überstunden-Warnung", () => {
  it("liest Vertragsstunden aus dem Freitext", () => {
    expect(parseWeeklyHours("38 Std/Woche")).toBe(38);
    expect(parseWeeklyHours("19,5 Stunden")).toBe(19.5);
    expect(parseWeeklyHours("")).toBeNull();
  });

  it("warnt erst über der Schwelle", () => {
    const shift = (employeeId: string) => ({ employeeId, startTime: "08:00", endTime: "17:00", breakMinutes: 60 });
    const employees = [
      { id: "a", name: "Anna", weeklyHours: "30 Std/Woche" },
      { id: "b", name: "Ben", weeklyHours: "40 Std/Woche" },
      { id: "c", name: "Cem", weeklyHours: "" },
    ];
    const shifts = [...Array(5)].flatMap(() => [shift("a"), shift("b"), shift("c")]);

    expect(computeOvertimeWarnings({ shifts, employees, thresholdPercent: 10 })).toEqual([
      { employeeId: "a", name: "Anna", plannedMinutes: 2400, targetMinutes: 1800 },
    ]);
    expect(computeOvertimeWarnings({ shifts, employees, thresholdPercent: 0 }).map((item) => item.name)).toEqual(["Anna"]);
    expect(computeOvertimeWarnings({ shifts, employees, thresholdPercent: 40 })).toEqual([]);
  });
});
