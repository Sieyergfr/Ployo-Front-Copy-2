import { describe, expect, it } from "vitest";
import { parseDateValue, dateToInputValue, dateToDisplayValue, isBeforeDay, preferredDateFormatter } from "@/lib/date-picker";

describe("calendar date entry", () => {
  it.each(["2026-02-29", "31.04.2026", "2026-13-01", "2026-00-10", "2026-10-00", "invalid", ""]) ("rejects invalid date %s without rolling into a different month", (value) => {
    expect(parseDateValue(value)).toBeNull();
  });
  it("accepts leap days and submits the same ISO date from either supported format", () => {
    for (const value of ["2028-02-29", "29.02.2028"]) {
      const date = parseDateValue(value)!;
      expect(dateToInputValue(date)).toBe("2028-02-29");
      expect(dateToDisplayValue(date)).toBe("29.02.2028");
    }
  });
  it("checks the minimum by calendar day, including equality", () => {
    const min = parseDateValue("2026-10-29")!;
    expect(isBeforeDay(parseDateValue("28.10.2026")!, min)).toBe(true);
    expect(isBeforeDay(parseDateValue("29.10.2026")!, min)).toBe(false);
    expect(isBeforeDay(parseDateValue("30.10.2026")!, min)).toBe(false);
  });
});


describe("preferred date format", () => {
  it("displays all account formats and accepts US input", () => {
    const date = parseDateValue("2026-10-29")!;
    expect(dateToDisplayValue(date, "yyyy-mm-dd")).toBe("2026-10-29");
    expect(dateToDisplayValue(date, "mm/dd/yyyy")).toBe("10/29/2026");
    expect(dateToInputValue(parseDateValue("10/29/2026")!)).toBe("2026-10-29");
    expect(parseDateValue("02/30/2026")).toBeNull();
    expect(preferredDateFormatter("yyyy-mm-dd", "de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date)).toBe("2026-10-29");
  });
});
