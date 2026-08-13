import { describe, expect, it } from "vitest";
import { parseShiftTemplateEntries } from "@/lib/shift-templates";

describe("parseShiftTemplateEntries", () => {
  it("liefert eine leere Liste für Nicht-Arrays", () => {
    expect(parseShiftTemplateEntries(null)).toEqual([]);
    expect(parseShiftTemplateEntries("kaputt")).toEqual([]);
  });

  it("übernimmt gültige Einträge", () => {
    const entries = parseShiftTemplateEntries([
      {
        weekday: "Mo",
        startTime: "08:00",
        endTime: "16:00",
        breakMinutes: 30,
        team: "Verkauf",
        locationId: "loc-1",
      },
    ]);

    expect(entries).toEqual([
      {
        weekday: "Mo",
        startTime: "08:00",
        endTime: "16:00",
        breakMinutes: 30,
        team: "Verkauf",
        locationId: "loc-1",
      },
    ]);
  });

  it("verwirft Einträge mit ungültigen Zeiten", () => {
    const entries = parseShiftTemplateEntries([
      { weekday: "Di", startTime: "nicht-valide", endTime: "16:00" },
    ]);

    expect(entries).toEqual([]);
  });

  it("fällt bei unbekanntem Wochentag auf 'Mo' zurück", () => {
    const entries = parseShiftTemplateEntries([
      { weekday: "Feiertag", startTime: "08:00", endTime: "16:00" },
    ]);

    expect(entries[0]?.weekday).toBe("Mo");
  });
});
