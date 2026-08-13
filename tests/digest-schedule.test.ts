import { describe, expect, it } from "vitest";
import { isDigestDue } from "@/lib/notifications/digest-schedule";

function dateAt(weekday: number, hour: number) {
  // 2024-01-01 war ein Montag (weekday 1); von dort aus die Zieltage zählen.
  const base = new Date(2024, 0, 1 + ((weekday + 6) % 7));
  base.setHours(hour, 0, 0, 0);

  return base;
}

describe("isDigestDue", () => {
  it("ist deaktiviert, wenn digestTime 'disabled' ist", () => {
    expect(isDigestDue("disabled", dateAt(1, 8))).toBe(false);
  });

  it("greift am richtigen Wochentag innerhalb des Toleranzfensters", () => {
    expect(isDigestDue("monday-0800", dateAt(1, 8))).toBe(true);
    expect(isDigestDue("monday-0800", dateAt(1, 9))).toBe(true);
    expect(isDigestDue("monday-0800", dateAt(1, 7))).toBe(true);
  });

  it("greift nicht außerhalb des Toleranzfensters", () => {
    expect(isDigestDue("monday-0800", dateAt(1, 11))).toBe(false);
  });

  it("greift nicht am falschen Wochentag", () => {
    expect(isDigestDue("monday-0800", dateAt(2, 8))).toBe(false);
  });

  it("ignoriert unbekannte/kaputte Werte sicher", () => {
    expect(isDigestDue("", dateAt(1, 8))).toBe(false);
    expect(isDigestDue("someday-0800", dateAt(1, 8))).toBe(false);
  });
});
