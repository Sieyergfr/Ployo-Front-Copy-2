import { describe, expect, it } from "vitest";
import { computeOvertimeAccount, parseWeeklyHours } from "@/lib/my-times";

describe("parseWeeklyHours", () => {
  it.each([
    ["40", 40],
    ["37,5 Std.", 37.5],
    ["38.5h", 38.5],
    ["40 Stunden pro Woche", 40],
    ["", null],
    ["Minijob", null],
    ["120", null],
  ])("%s → %s", (input, expected) => {
    expect(parseWeeklyHours(input)).toBe(expected);
  });
});

describe("computeOvertimeAccount", () => {
  const day = (date: string, workedMinutes: number, plannedMinutes: number) => ({ date, workedMinutes, plannedMinutes });

  it("rechnet abgeschlossene Wochen gegen den Plan, sonst gegen den Vertrag", () => {
    const result = computeOvertimeAccount({
      today: "2026-10-26",
      weeklyTargetMinutes: 40 * 60,
      days: [
        // KW 42: geplant 8 h, gearbeitet 9 h → +1 h
        day("2026-10-12", 9 * 60, 8 * 60),
        // KW 43: nichts geplant, 42 h gearbeitet → gegen 40 h Vertrag: +2 h
        day("2026-10-19", 42 * 60, 0),
        // laufende Woche zählt nicht
        day("2026-10-26", 10 * 60, 0),
        // Woche ohne Plan und ohne Arbeit zählt nicht
        day("2026-10-05", 0, 0),
      ],
    });

    expect(result).toEqual({ balanceMinutes: 180, weekCount: 3 });
  });
});
