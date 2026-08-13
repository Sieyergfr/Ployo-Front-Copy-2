import { describe, expect, it } from "vitest";
import { parseShiftPresets } from "@/lib/shift-presets";

describe("parseShiftPresets", () => {
  it("übernimmt gültige Vorlagen", () => {
    const presets = parseShiftPresets([
      { id: "early", label: "Früh", start: "06:00", end: "14:00", pause: "30m" },
    ]);

    expect(presets).toEqual([
      { id: "early", label: "Früh", start: "06:00", end: "14:00", pause: "30m" },
    ]);
  });

  it("liefert eine leere Liste, wenn kein Array übergeben wird", () => {
    expect(parseShiftPresets("kein-array")).toEqual([]);
    expect(parseShiftPresets({ label: "Früh" })).toEqual([]);
  });

  it("verwirft Vorlagen ohne Namen", () => {
    const presets = parseShiftPresets([
      { id: "x", label: "  ", start: "06:00", end: "14:00" },
    ]);

    expect(presets).toEqual([]);
  });

  it("verwirft ungültige Uhrzeiten", () => {
    const presets = parseShiftPresets([
      { id: "a", label: "Kaputt", start: "25:00", end: "14:00" },
      { id: "b", label: "Auch kaputt", start: "06:00", end: "abc" },
    ]);

    expect(presets).toEqual([]);
  });

  it("ergänzt fehlende IDs und Pausenwerte", () => {
    const presets = parseShiftPresets([
      { label: "Tag", start: "09:00", end: "17:00" },
    ]);

    expect(presets).toHaveLength(1);
    expect(presets[0].id).toBe("preset-0");
    expect(presets[0].pause).toBe("0m");
  });

  it("begrenzt die Anzahl der Vorlagen auf 20", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      id: `p-${index}`,
      label: `Schicht ${index}`,
      start: "08:00",
      end: "16:00",
      pause: "30m",
    }));

    expect(parseShiftPresets(many)).toHaveLength(20);
  });
});
