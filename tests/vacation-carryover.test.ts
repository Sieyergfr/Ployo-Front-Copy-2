import { describe, expect, it } from "vitest";
import {
  isCarryoverReminderDue,
  marchThirtyFirst,
  rollOverVacationCarryover,
  shouldForfeitCarryover,
  type VacationCarryoverState,
} from "@/lib/vacation-carryover";

/**
 * Regressionstest für Sicherheitsaudit-Finding M02: Resturlaubs-Übertrag
 * zum Jahreswechsel, Verfall nur mit rechtzeitigem, dokumentiertem Hinweis
 * (BUrlG §7 Abs. 3, BAG 9 AZR 541/15).
 */
describe("rollOverVacationCarryover", () => {
  it("übernimmt den Resturlaub des abgelaufenen Jahres beim ersten Lauf im neuen Jahr", () => {
    const state: VacationCarryoverState = { carryover: 0, expiresAt: null, remindedAt: null };
    const result = rollOverVacationCarryover({
      now: new Date("2028-01-05T00:00:00Z"),
      currentState: state,
      previousYearTotal: 30,
      previousYearTaken: 22,
    });

    expect(result.carryover).toBe(8);
    expect(result.expiresAt).toEqual(marchThirtyFirst(2028));
    expect(result.remindedAt).toBeNull();
  });

  it("ist idempotent innerhalb desselben Jahres (mehrfacher Cronjob-Lauf verdoppelt nicht)", () => {
    const firstRun = rollOverVacationCarryover({
      now: new Date("2028-01-05T00:00:00Z"),
      currentState: { carryover: 0, expiresAt: null, remindedAt: null },
      previousYearTotal: 30,
      previousYearTaken: 22,
    });
    const secondRun = rollOverVacationCarryover({
      now: new Date("2028-02-01T00:00:00Z"),
      currentState: firstRun,
      previousYearTotal: 30,
      previousYearTaken: 22,
    });

    expect(secondRun).toEqual(firstRun);
  });

  it("addiert einen noch nicht verfallenen Alt-Carryover zum neuen Resturlaub, statt ihn zu überschreiben", () => {
    const oldCarryover: VacationCarryoverState = {
      carryover: 3,
      expiresAt: marchThirtyFirst(2028),
      remindedAt: null, // nie hingewiesen → nicht verfallen
    };
    const result = rollOverVacationCarryover({
      now: new Date("2029-01-10T00:00:00Z"),
      currentState: oldCarryover,
      previousYearTotal: 30,
      previousYearTaken: 30, // 2028 komplett verbraucht, kein neuer Rest
    });

    expect(result.carryover).toBe(3); // alter Carryover bleibt bestehen
    expect(result.expiresAt).toEqual(marchThirtyFirst(2029));
  });
});

describe("isCarryoverReminderDue", () => {
  const expiresAt = marchThirtyFirst(2028);

  it("ist fällig innerhalb der Vorlauffrist (Default 30 Tage) vor dem 31.03.", () => {
    expect(isCarryoverReminderDue({ carryover: 5, expiresAt, remindedAt: null }, new Date("2028-03-15T00:00:00Z"))).toBe(true);
  });

  it("ist nicht fällig weit vor der Frist", () => {
    expect(isCarryoverReminderDue({ carryover: 5, expiresAt, remindedAt: null }, new Date("2028-01-15T00:00:00Z"))).toBe(false);
  });

  it("ist nicht fällig, wenn bereits hingewiesen oder kein Restguthaben vorhanden", () => {
    expect(isCarryoverReminderDue({ carryover: 5, expiresAt, remindedAt: new Date("2028-03-01T00:00:00Z") }, new Date("2028-03-15T00:00:00Z"))).toBe(false);
    expect(isCarryoverReminderDue({ carryover: 0, expiresAt, remindedAt: null }, new Date("2028-03-15T00:00:00Z"))).toBe(false);
  });
});

describe("shouldForfeitCarryover", () => {
  const expiresAt = marchThirtyFirst(2028);

  it("verfällt nach Fristablauf NUR, wenn rechtzeitig vorher hingewiesen wurde", () => {
    const remindedInTime: VacationCarryoverState = {
      carryover: 5,
      expiresAt,
      remindedAt: new Date("2028-03-01T00:00:00Z"),
    };
    expect(shouldForfeitCarryover(remindedInTime, new Date("2028-04-01T00:00:00Z"))).toBe(true);
  });

  it("verfällt NICHT nach Fristablauf ohne dokumentierten Hinweis (BAG 9 AZR 541/15)", () => {
    const neverReminded: VacationCarryoverState = { carryover: 5, expiresAt, remindedAt: null };
    expect(shouldForfeitCarryover(neverReminded, new Date("2028-04-01T00:00:00Z"))).toBe(false);
  });

  it("verfällt nicht vor Fristablauf, selbst mit Hinweis", () => {
    const remindedInTime: VacationCarryoverState = {
      carryover: 5,
      expiresAt,
      remindedAt: new Date("2028-03-01T00:00:00Z"),
    };
    expect(shouldForfeitCarryover(remindedInTime, new Date("2028-03-20T00:00:00Z"))).toBe(false);
  });
});
