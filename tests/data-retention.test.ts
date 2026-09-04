import { describe, expect, it } from "vitest";
import { retentionCutoff, retentionExpiryDate, RETENTION_POLICIES } from "@/lib/data-retention";

describe("retentionCutoff / retentionExpiryDate", () => {
  it("ist noch nicht abgelaufen kurz vor Fristende", () => {
    const from = new Date("2023-01-01T00:00:00Z");
    const justBefore = new Date("2025-12-31T23:59:59Z"); // personaldaten: 36 Monate
    expect(retentionCutoff("personaldaten", from, justBefore)).toBe(false);
  });

  it("ist abgelaufen ab Fristende", () => {
    const from = new Date("2023-01-01T00:00:00Z");
    const atOrAfter = new Date("2026-01-01T00:00:00Z");
    expect(retentionCutoff("personaldaten", from, atOrAfter)).toBe(true);
  });

  it("berechnet das Ablaufdatum korrekt für die 8-Jahres-Kategorie (Lohn/SV)", () => {
    const issued = new Date("2026-06-15T00:00:00Z");
    const expiry = retentionExpiryDate("lohn_sozialversicherung", issued);
    expect(expiry.getUTCFullYear()).toBe(2034);
    expect(expiry.getUTCMonth()).toBe(issued.getUTCMonth());
  });

  it("hält alle vier Kategorien mit positiver Monatszahl vor", () => {
    for (const category of Object.keys(RETENTION_POLICIES) as (keyof typeof RETENTION_POLICIES)[]) {
      expect(RETENTION_POLICIES[category].months).toBeGreaterThan(0);
      expect(RETENTION_POLICIES[category].legalBasis).toBeTruthy();
    }
  });
});
