import { describe, expect, it } from "vitest";
import { getGermanHolidays, isGermanHoliday } from "@/lib/german-holidays";

/**
 * Neue Grundlage für die M01/M02/M03-Feiertagsberücksichtigung (Audit).
 * Ostersonntag-Termine gegen bekannte reale Daten verifiziert: 2024-03-31,
 * 2025-04-20, 2026-04-05 (jeweils daraus abgeleitete Ostermontag/Karfreitag/
 * Christi-Himmelfahrt/Pfingstmontag/Fronleichnam-Daten).
 */
describe("getGermanHolidays / isGermanHoliday", () => {
  it("liefert die neun bundeseinheitlichen Feiertage ohne Bundesland", () => {
    const holidays = getGermanHolidays(2027, null);
    expect(holidays.size).toBe(9);
    expect(holidays.get("2027-01-01")).toBe("Neujahr");
    expect(holidays.get("2027-10-03")).toBe("Tag der Deutschen Einheit");
    expect(holidays.get("2027-12-25")).toBe("1. Weihnachtsfeiertag");
    expect(holidays.get("2027-12-26")).toBe("2. Weihnachtsfeiertag");
    expect(holidays.has("2027-01-06")).toBe(false); // Heilige Drei Könige nur einzelne Länder
  });

  it("berechnet die beweglichen Feiertage korrekt aus Ostersonntag (verifiziert gegen reale Daten 2024-2026)", () => {
    expect(getGermanHolidays(2024, null).get("2024-03-29")).toBe("Karfreitag"); // Ostersonntag 2024: 31.03.
    expect(getGermanHolidays(2024, null).get("2024-04-01")).toBe("Ostermontag");
    expect(getGermanHolidays(2025, null).get("2025-04-20")).toBe(undefined); // Ostersonntag selbst ist kein gesetzlicher Feiertag
    expect(getGermanHolidays(2025, null).get("2025-04-21")).toBe("Ostermontag"); // Ostersonntag 2025: 20.04.
    expect(getGermanHolidays(2026, null).get("2026-04-06")).toBe("Ostermontag"); // Ostersonntag 2026: 05.04.
  });

  it("Bayern hat Heilige Drei Könige, Fronleichnam und Allerheiligen, aber nicht Reformationstag", () => {
    const holidays = getGermanHolidays(2027, "BY");
    expect(holidays.has("2027-01-06")).toBe(true);
    expect(holidays.get("2027-05-27")).toBe("Fronleichnam");
    expect(holidays.has("2027-11-01")).toBe(true);
    expect(holidays.has("2027-10-31")).toBe(false);
  });

  it("Sachsen hat Reformationstag und Buß-/Bettag, aber nicht Fronleichnam/Allerheiligen", () => {
    const holidays = getGermanHolidays(2027, "SN");
    expect(holidays.has("2027-10-31")).toBe(true);
    expect(holidays.get("2027-11-17")).toBe("Buß- und Bettag");
    expect(holidays.has("2027-05-27")).toBe(false);
    expect(holidays.has("2027-11-01")).toBe(false);
  });

  it("Buß- und Bettag liegt immer auf einem Mittwoch zwischen dem 16. und 22.11.", () => {
    for (const year of [2025, 2026, 2027, 2028, 2029, 2030]) {
      const iso = [...getGermanHolidays(year, "SN").entries()].find(
        ([, name]) => name === "Buß- und Bettag",
      )?.[0];
      expect(iso).toBeDefined();
      const day = Number(iso!.slice(8, 10));
      expect(day).toBeGreaterThanOrEqual(16);
      expect(day).toBeLessThanOrEqual(22);
      expect(new Date(`${iso}T00:00:00Z`).getUTCDay()).toBe(3);
    }
  });

  it("Thüringen hat Weltkindertag, Mecklenburg-Vorpommern hat Frauentag", () => {
    expect(isGermanHoliday("2027-09-20", "TH")).toBe(true);
    expect(isGermanHoliday("2027-09-20", "BY")).toBe(false);
    expect(isGermanHoliday("2027-03-08", "MV")).toBe(true);
    expect(isGermanHoliday("2027-03-08", "BW")).toBe(false);
  });

  it("isGermanHoliday liefert false für ein normales Datum und für ein ungültiges Datum", () => {
    expect(isGermanHoliday("2027-06-15", "BY")).toBe(false);
    expect(isGermanHoliday("nicht-valide", "BY")).toBe(false);
  });
});
