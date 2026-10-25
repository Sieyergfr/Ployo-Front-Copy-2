import { describe, expect, it } from "vitest";
import {
  buildAbsenceRadar,
  buildStaffingCurve,
  findRestViolations,
} from "@/lib/dashboard-overview";
import type { OpeningHoursDay } from "@/lib/opening-hours";

const openTenToSix: OpeningHoursDay[] = [
  { weekday: "Mo", mode: "custom", ranges: [{ start: "10:00", end: "18:00", breakMinutes: 0 }] },
];

describe("buildStaffingCurve", () => {
  it("leitet den Bedarf aus Öffnungszeiten × Mindestbesetzung ab und findet Lücken", () => {
    const { hours, gaps } = buildStaffingCurve({
      weekday: "Mo",
      locations: [{ id: "l1", name: "Mitte", openingHours: openTenToSix, minStaffing: 2 }],
      shifts: [
        { employeeId: "a", locationId: "l1", startTime: "10:00", endTime: "18:00" },
        { employeeId: "b", locationId: "l1", startTime: "10:00", endTime: "14:00" },
        // Unbesetzte Schicht zählt nicht als besetzt.
        { locationId: "l1", startTime: "14:00", endTime: "18:00" },
      ],
    });

    expect(hours.map((hour) => hour.hour)).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
    expect(hours.every((hour) => hour.need === 2)).toBe(true);
    expect(hours.find((hour) => hour.hour === 13)).toMatchObject({ have: 2, isGap: false });
    expect(hours.find((hour) => hour.hour === 14)).toMatchObject({ have: 1, isGap: true });
    expect(gaps).toEqual([{ locationName: "Mitte", fromHour: 14, toHour: 18, missing: 1 }]);
  });

  it("zählt an geschlossenen Tagen keinen Bedarf und deckt Nachtschichten ab", () => {
    const { hours, gaps } = buildStaffingCurve({
      weekday: "Di",
      locations: [{ id: "l1", name: "Mitte", openingHours: openTenToSix, minStaffing: 2 }],
      shifts: [{ employeeId: "a", locationId: "l1", startTime: "22:00", endTime: "06:00" }],
    });

    expect(gaps).toEqual([]);
    expect(hours.every((hour) => hour.need === 0)).toBe(true);
    expect(hours.find((hour) => hour.hour === 23)?.have).toBe(1);
  });
});

describe("buildAbsenceRadar", () => {
  it("zählt Abwesende je Tag und meldet Engpässe im Team", () => {
    const employees = [
      { id: "a", team: "Service" },
      { id: "b", team: "Service" },
      { id: "c", team: "Service" },
      { id: "d", team: "Service" },
      { id: "e", team: "Küche" },
    ];
    const { days, peak } = buildAbsenceRadar({
      startDate: "2026-11-02",
      employees,
      absences: [
        { employeeId: "a", from: "2026-11-03", to: "2026-11-04" },
        { employeeId: "b", from: "2026-11-04", to: "2026-11-04" },
        { employeeId: "e", from: "2026-11-01", to: "2026-11-02" },
        // Unbekannte Person (z. B. außerhalb des Scopes) wird ignoriert.
        { employeeId: "x", from: "2026-11-02", to: "2026-11-10" },
      ],
    });

    expect(days).toHaveLength(14);
    expect(days.slice(0, 3).map((day) => day.count)).toEqual([1, 1, 2]);
    expect(days[5]).toMatchObject({ date: "2026-11-07", isWeekend: true });
    expect(peak).toEqual({ team: "Service", dates: ["2026-11-04"], absent: 2, teamSize: 4 });
  });
});

describe("findRestViolations", () => {
  it("findet zu kurze Ruhezeiten zwischen aufeinanderfolgenden Schichten", () => {
    const violations = findRestViolations(
      [
        { employeeId: "a", name: "Jonas", date: "2026-10-27", startTime: "06:00", endTime: "14:00" },
        { employeeId: "a", name: "Jonas", date: "2026-10-26", startTime: "14:00", endTime: "22:00" },
        { employeeId: "b", name: "Lara", date: "2026-10-26", startTime: "08:00", endTime: "16:00" },
        { employeeId: "b", name: "Lara", date: "2026-10-27", startTime: "08:00", endTime: "16:00" },
      ],
      11,
    );

    expect(violations).toEqual([
      { employeeId: "a", name: "Jonas", fromDate: "2026-10-26", toDate: "2026-10-27", restHours: 8 },
    ]);
  });
});
