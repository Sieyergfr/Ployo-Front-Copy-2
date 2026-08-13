import { describe, expect, it } from "vitest";
import { calculateBreakMinutes } from "@/lib/shift-break-rule";

describe("calculateBreakMinutes", () => {
  it("liefert 0 bei 'none'", () => {
    expect(calculateBreakMinutes("09:00", "18:00", "none")).toBe(0);
  });

  it("liefert 0, wenn die Schicht kürzer als die Schwelle ist", () => {
    expect(calculateBreakMinutes("09:00", "14:00", "30-6")).toBe(0);
  });

  it("liefert die Pause, sobald die Schwelle erreicht ist", () => {
    expect(calculateBreakMinutes("09:00", "15:00", "30-6")).toBe(30);
    expect(calculateBreakMinutes("09:00", "19:00", "45-9")).toBe(45);
  });

  it("behandelt Nachtschichten über Mitternacht korrekt", () => {
    // 22:00-06:00 = 8h Dauer -> Schwelle 6h greift
    expect(calculateBreakMinutes("22:00", "06:00", "30-6")).toBe(30);
  });

  it("ignoriert kaputte Regeln sicher", () => {
    expect(calculateBreakMinutes("09:00", "18:00", "")).toBe(0);
    expect(calculateBreakMinutes("09:00", "18:00", "kaputt")).toBe(0);
  });
});
