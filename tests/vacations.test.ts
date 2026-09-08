import { describe, expect, it } from "vitest";
import { calculateVacationWorkDays, computeVacationAccount, parseVacationWorkDays } from "@/lib/vacations";

/**
 * Regressionstest für Sicherheitsaudit-Finding M01 (zweiter Teil): Urlaub
 * soll individuelle Arbeitstage statt aller Kalendertage verbrauchen.
 */
describe("parseVacationWorkDays", () => {
  it("fällt bei leerem/ungültigem Wert auf die 5-Tage-Woche (Mo-Fr) zurück", () => {
    expect([...parseVacationWorkDays(null)].sort()).toEqual(["Di", "Do", "Fr", "Mi", "Mo"].sort());
    expect([...parseVacationWorkDays(undefined)].sort()).toEqual(["Di", "Do", "Fr", "Mi", "Mo"].sort());
    expect([...parseVacationWorkDays([])].sort()).toEqual(["Di", "Do", "Fr", "Mi", "Mo"].sort());
    expect([...parseVacationWorkDays("Mo,Di")].sort()).toEqual(["Di", "Do", "Fr", "Mi", "Mo"].sort());
  });

  it("übernimmt ein gültiges, individuelles Arbeitstage-Set (z. B. 4-Tage-Woche oder Wochenendschicht)", () => {
    expect([...parseVacationWorkDays(["Mo", "Di", "Mi", "Do"])].sort()).toEqual(["Di", "Do", "Mi", "Mo"].sort());
    expect([...parseVacationWorkDays(["Fr", "Sa", "So"])].sort()).toEqual(["Fr", "Sa", "So"].sort());
  });
});

describe("calculateVacationWorkDays", () => {
  const monFri = parseVacationWorkDays(null);

  it("zählt eine normale Mo-Fr-Woche für eine 5-Tage-Woche als 5 Tage, nicht 7", () => {
    // 2027-06-07 (Mo) bis 2027-06-13 (So), keine Feiertage in dieser Woche.
    expect(calculateVacationWorkDays("2027-06-07", "2027-06-13", monFri, null)).toBe(5);
  });

  it("zählt für eine 6-Tage-Woche (inkl. Samstag) dieselbe Woche als 6 Tage", () => {
    const sixDayWeek = parseVacationWorkDays(["Mo", "Di", "Mi", "Do", "Fr", "Sa"]);
    expect(calculateVacationWorkDays("2027-06-07", "2027-06-13", sixDayWeek, null)).toBe(6);
  });

  it("zieht bundeseinheitliche Feiertage zusätzlich ab (hier: Karfreitag 26.03. + Ostermontag 29.03.2027)", () => {
    // Do 25., Fr 26. (Karfreitag), Sa 27., So 28., Mo 29. (Ostermontag), Di 30., Mi 31.
    // Arbeitstage (Mo-Fr) im Bereich: Do, Fr, Mo, Di, Mi = 5, davon 2 Feiertage → 3.
    expect(calculateVacationWorkDays("2027-03-25", "2027-03-31", monFri, null)).toBe(3);
  });

  it("zieht einen landesspezifischen Feiertag nur im betroffenen Bundesland ab (Fronleichnam 27.05.2027, nur BW/BY/HE/NW/RP/SL)", () => {
    expect(calculateVacationWorkDays("2027-05-24", "2027-05-28", monFri, "BY")).toBe(4); // Mo-Fr minus Fronleichnam (Do)
    expect(calculateVacationWorkDays("2027-05-24", "2027-05-28", monFri, "SN")).toBe(5); // Sachsen hat kein Fronleichnam
    expect(calculateVacationWorkDays("2027-05-24", "2027-05-28", monFri, null)).toBe(5); // kein Bundesland = nur bundeseinheitliche Feiertage
  });

  it("liefert mindestens 1 Tag zurück, auch bei vertauschten Daten", () => {
    expect(calculateVacationWorkDays("2027-06-13", "2027-06-07", monFri, null)).toBe(1);
  });

  it("R08/M01 — ein ausschließlich arbeitsfreier Tag (Sonntag) ergibt 0, nicht 1", () => {
    // 2027-06-13 ist ein Sonntag, außerhalb der Mo-Fr-Arbeitswoche.
    expect(calculateVacationWorkDays("2027-06-13", "2027-06-13", monFri, null)).toBe(0);
  });
});

/**
 * Regressionstest für Audit-Finding R05: `Math.max(0, total - taken) +
 * carryover` klammerte das Basiskontingent-Defizit VOR der Addition des
 * Übertrags auf 0 und verlor so den bereits in den Übertrag hineinlaufenden
 * Überhang.
 */
describe("computeVacationAccount", () => {
  it("verrechnet Verbrauch, der über das Basiskontingent hinausgeht, korrekt gegen den Übertrag (30 Anspruch + 5 Übertrag − 32 genommen = 3)", () => {
    const account = computeVacationAccount({
      contractVacation: "30 Tage",
      storedVacationTotal: 30,
      approvedDaysThisYear: 32,
      carryover: 5,
    });

    expect(account.vacationRemaining).toBe(3);
  });

  it("bleibt bei 0, wenn auch der Übertrag vollständig verbraucht ist (kein negativer Saldo)", () => {
    const account = computeVacationAccount({
      contractVacation: "30 Tage",
      storedVacationTotal: 30,
      approvedDaysThisYear: 40,
      carryover: 5,
    });

    expect(account.vacationRemaining).toBe(0);
  });

  it("rechnet im Normalfall (Verbrauch innerhalb des Basiskontingents) unverändert", () => {
    const account = computeVacationAccount({
      contractVacation: "30 Tage",
      storedVacationTotal: 30,
      approvedDaysThisYear: 10,
      carryover: 5,
    });

    expect(account.vacationRemaining).toBe(25);
  });
});
