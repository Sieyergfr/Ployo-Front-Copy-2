import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateVacationDays } from "@/lib/vacation-service";

/**
 * Regressionstest für Sicherheitsaudit-Finding M01 (erster Teil): die
 * Tageszahl wurde bisher über eine lokale Mitternacht-zu-Mitternacht-
 * Millisekundendifferenz berechnet, die über einen DST-Wechsel hinweg nicht
 * exakt durch 86.400.000ms teilbar ist. Unter einer DST-Zeitzone konnte das
 * eine Woche mit Zeitumstellung um einen Tag zu kurz zählen. Die neue
 * UTC-komponierte Implementierung ist von der Prozess-Zeitzone unabhängig.
 *
 * Zählt weiterhin Kalendertage, keine individuellen Arbeitstage — dafür
 * fehlt ein Arbeitstage-/Feiertagskalender im Datenmodell (siehe M01,
 * zweiter Teil, weiterhin offen).
 */
describe("calculateVacationDays", () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "Europe/Berlin";
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("zählt einen einzelnen Tag als 1", () => {
    expect(calculateVacationDays("2027-06-01", "2027-06-01")).toBe(1);
  });

  it("zählt eine normale Woche (Mo-So) korrekt als 7 Tage", () => {
    expect(calculateVacationDays("2027-06-07", "2027-06-13")).toBe(7);
  });

  it("zählt über den Frühjahrs-DST-Wechsel (28.03.2027) hinweg korrekt, nicht einen Tag zu wenig", () => {
    // 27., 28., 29. März = 3 Tage inklusive beider Enden.
    expect(calculateVacationDays("2027-03-27", "2027-03-29")).toBe(3);
    // Ganze Woche über den Wechsel hinweg = 7 Tage.
    expect(calculateVacationDays("2027-03-25", "2027-03-31")).toBe(7);
  });

  it("zählt über den Herbst-DST-Wechsel (31.10.2027) hinweg korrekt", () => {
    expect(calculateVacationDays("2027-10-30", "2027-11-02")).toBe(4);
  });

  it("liefert 1 statt eines negativen/NaN-Ergebnisses bei vertauschten oder ungültigen Daten", () => {
    expect(calculateVacationDays("2027-06-13", "2027-06-07")).toBe(1);
    expect(calculateVacationDays("nicht-ein-datum", "2027-06-07")).toBe(1);
  });
});
