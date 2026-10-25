import { describe, expect, it } from "vitest";
import { buildEmployeeWorkStats, type OverviewDay } from "@/lib/employee-overview";

function day(date: string, worked: number, planned: number, extra: Partial<OverviewDay> = {}): OverviewDay {
  return { date, workedMinutes: worked, plannedMinutes: planned, breakMinutes: 30, entries: [], shifts: [], ...extra };
}

describe("buildEmployeeWorkStats", () => {
  it("bündelt Wochen, Monat, Pünktlichkeit, Schichtarten und Einsatzorte", () => {
    const stats = buildEmployeeWorkStats({
      today: "2026-10-28",
      weeklyTargetMinutes: 40 * 60,
      days: [
        day("2026-10-19", 9 * 60, 8 * 60, {
          entries: [{ clockInAt: "2026-10-19T06:03:00Z", shift: { startAt: "2026-10-19T06:00:00Z" } }],
          shifts: [{ startTime: "08:00", endTime: "16:30", location: "Mitte" }],
        }),
        day("2026-10-20", 8 * 60, 8 * 60, {
          entries: [{ clockInAt: "2026-10-20T12:20:00Z", shift: { startAt: "2026-10-20T12:00:00Z" } }],
          shifts: [{ startTime: "14:00", endTime: "22:30", location: "Nord" }],
        }),
        day("2026-10-27", 4 * 60, 8 * 60, { shifts: [{ startTime: "22:00", endTime: "06:00", location: "Mitte" }] }),
        // Zukunft zählt nicht
        day("2026-10-30", 0, 8 * 60),
      ],
    });

    expect(stats.weeks.map((week) => [week.monday, week.worked, week.isCurrent])).toEqual([
      ["2026-10-19", 17 * 60, false],
      ["2026-10-26", 4 * 60, true],
    ]);
    expect(stats.overtimeMinutes).toBe(60);
    expect(stats.monthWorkedMinutes).toBe(21 * 60);
    expect(stats.punctualityPercent).toBe(50);
    expect(stats.shiftTypes).toEqual({ early: 33, late: 33, night: 33 });
    expect(stats.locations).toEqual([
      { name: "Mitte", percent: 67 },
      { name: "Nord", percent: 33 },
    ]);
  });
});
