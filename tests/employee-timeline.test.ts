import { describe, expect, it } from "vitest";
import { buildEditTimelineEntries } from "@/lib/employee-service";

const base = {
  location: "Berlin",
  team: "Service",
  role: "Kellner",
  contract: "Vollzeit",
  status: "active" as const,
};

describe("buildEditTimelineEntries", () => {
  it("liefert keine Einträge, wenn sich nichts geändert hat", () => {
    expect(buildEditTimelineEntries(base, { ...base })).toEqual([]);
  });

  it("erkennt eine Standortänderung", () => {
    const entries = buildEditTimelineEntries(base, { ...base, location: "München" });
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Standort geändert: Berlin → München");
    expect(entries[0].tone).toBe("ink");
  });

  it("erkennt Team-, Rollen- und Vertragsänderungen", () => {
    const entries = buildEditTimelineEntries(base, {
      ...base,
      team: "Küche",
      role: "Koch",
      contract: "Teilzeit",
    });
    expect(entries.map((entry) => entry.title)).toEqual([
      "Team geändert: Service → Küche",
      "Rolle geändert: Kellner → Koch",
      "Vertragsart geändert: Vollzeit → Teilzeit",
    ]);
  });

  it("übersetzt Statusänderungen in lesbare Labels", () => {
    const entries = buildEditTimelineEntries(base, { ...base, status: "vacation" });
    expect(entries[0].title).toBe("Status geändert: Im Dienst → Urlaub");
  });

  it("markiert fehlende Werte mit einem Platzhalter", () => {
    const entries = buildEditTimelineEntries(
      { ...base, team: "" },
      { ...base, team: "Service" },
    );
    expect(entries[0].title).toBe("Team geändert: – → Service");
  });

  it("erzeugt für jede Änderung ein eigenes, heutiges Datum", () => {
    const today = new Intl.DateTimeFormat("de-DE").format(new Date());
    const entries = buildEditTimelineEntries(base, { ...base, location: "Hamburg" });
    expect(entries[0].date).toBe(today);
  });
});
