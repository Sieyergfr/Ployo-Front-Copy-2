import { describe, expect, it } from "vitest";
import {
  addMonthsIso,
  countWorkdays,
  findArbzgViolations,
  headcountByMonth,
  lastMonths,
  monthBounds,
  parseProbationMonths,
  projectSundaysOff,
  sicknessRate,
  sicknessStartsByWeekday,
  staffMovements,
  summarizeOvertime,
  buildOvertimeAccount,
  turnoverRate,
  upcomingStaffDeadlines,
  type WorkBlock,
} from "@/lib/report-analytics-core";

/** Rechenlogik der Report-Analysen (ohne Datenbank). */

const at = (iso: string, time: string) => Date.parse(`${iso}T${time}:00Z`);

function block(date: string, start: string, end: string, breakMinutes = 0, endDate = date): WorkBlock {
  const startMs = at(date, start);
  const endMs = at(endDate, end);

  return { date, start: startMs, end: endMs, workedMinutes: (endMs - startMs) / 60_000 - breakMinutes, breakMinutes };
}

describe("Datum", () => {
  it("rechnet Monate und Monatsgrenzen", () => {
    expect(lastMonths("2026-10-27", 3)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(lastMonths("2026-02-10", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(monthBounds("2026-10", "2026-10-27")).toEqual({ from: "2026-10-01", to: "2026-10-27" });
    expect(monthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("zählt Arbeitstage ohne Feiertage", () => {
    const workDays = new Set(["Mo", "Di", "Mi", "Do", "Fr"]);

    expect(countWorkdays("2026-10-01", "2026-10-31", workDays)).toBe(22);
    expect(countWorkdays("2026-10-01", "2026-10-31", workDays, (day) => day === "2026-10-03")).toBe(22);
    expect(countWorkdays("2026-12-24", "2026-12-26", workDays, (day) => day === "2026-12-25")).toBe(1);
  });
});

describe("Überstunden und Abwesenheiten", () => {
  it("fasst Arbeitszeitkonten zusammen", () => {
    const accounts = [buildOvertimeAccount("a", [600, 900]), buildOvertimeAccount("b", [-700, 0]), buildOvertimeAccount("c", [0, 30])];

    expect(accounts[0]).toMatchObject({ total: 1500, current: 900 });
    expect(summarizeOvertime(accounts)).toEqual({ total: 830, average: 830 / 3, high: 1, low: 1 });
  });

  it("berechnet Krankenquote und Wochentage", () => {
    expect(sicknessRate(9, 176)).toBe(5.1);
    expect(sicknessRate(0, 0)).toBe(0);
    expect(sicknessStartsByWeekday(["2026-10-26", "2026-10-19", "2026-10-25"])).toEqual([2, 0, 0, 0, 0, 0, 1]);
  });
});

describe("Personal", () => {
  const records = [
    { id: "a", startDate: "2020-01-01", endDate: "", former: false, exitDate: "" },
    { id: "b", startDate: "2026-09-01", endDate: "", former: false, exitDate: "" },
    { id: "c", startDate: "2021-05-01", endDate: "2026-06-30", former: true, exitDate: "" },
  ];

  it("zählt Headcount, Ein- und Austritte", () => {
    expect(headcountByMonth(records, ["2026-06", "2026-07", "2026-09"], "2026-10-27")).toEqual([
      { month: "2026-06", count: 2 },
      { month: "2026-07", count: 1 },
      { month: "2026-09", count: 2 },
    ]);

    const movements = staffMovements(records, { from: "2025-11-01", to: "2026-10-27" });

    expect(movements.entries.map((record) => record.id)).toEqual(["b"]);
    expect(movements.exits.map((record) => record.id)).toEqual(["c"]);
    expect(turnoverRate(2, 12)).toBe(16.7);
  });

  it("findet Befristungsende, Probezeit und Jubiläen", () => {
    expect(parseProbationMonths("6 Monate")).toBe(6);
    expect(parseProbationMonths("keine")).toBeNull();
    expect(
      upcomingStaffDeadlines({ startDate: "2026-09-01", fixedTermEnd: "2027-08-31", probation: "6 Monate" }, "2026-10-27"),
    ).toEqual([
      { kind: "fixedTermEnd", date: "2027-08-31" },
      { kind: "probationEnd", date: "2027-02-28" },
    ]);
    expect(upcomingStaffDeadlines({ startDate: "2022-01-15", fixedTermEnd: "", probation: "" }, "2026-10-27")).toEqual([
      { kind: "anniversary", date: "2027-01-15", years: 5 },
    ]);
  });
});

describe("Arbeitszeitgesetz", () => {
  it("meldet zu lange Tage, fehlende Pausen und kurze Ruhezeiten", () => {
    const findings = findArbzgViolations([
      block("2026-10-20", "08:00", "19:00", 45),
      block("2026-10-21", "08:00", "15:00", 10),
      block("2026-10-22", "14:00", "22:00", 30),
      block("2026-10-23", "06:00", "12:00", 0),
    ]);

    expect(findings.map((finding) => [finding.rule, finding.date])).toEqual([
      ["rest", "2026-10-23"],
      ["break", "2026-10-21"],
      ["maxDaily", "2026-10-20"],
    ]);
    expect(findings[0]).toMatchObject({ restMinutes: 480, previousDate: "2026-10-22" });
  });

  it("zählt Unterbrechungen zwischen Blöcken als Pause", () => {
    expect(findArbzgViolations([block("2026-10-20", "08:00", "12:00"), block("2026-10-20", "12:30", "16:30")])).toEqual([]);
  });

  it("rechnet freie Sonntage hoch", () => {
    expect(projectSundaysOff(9, 26)).toBe(34);
    expect(projectSundaysOff(0, 0)).toBe(52);
  });
});
