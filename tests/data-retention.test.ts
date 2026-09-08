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

  it("berechnet das Ablaufdatum für die 8-Jahres-Kategorie (Lohn/SV) ab dem tatsächlichen Schluss des Ausstellungs-Kalenderjahres, nicht ab dem exakten Ausstellungsdatum (Audit-Finding M04)", () => {
    const issued = new Date("2026-06-15T00:00:00Z");
    const expiry = retentionExpiryDate("lohn_sozialversicherung", issued);
    // §147 AO knüpft an den Schluss des Kalenderjahres an — das ist der
    // Beginn des 1.1. des Folgejahres (das Jahr 2026 ist erst mit diesem
    // Zeitpunkt vollständig abgelaufen), nicht der Beginn des 31.12.2026
    // selbst: Fristbeginn 01.01.2027 → +96 Monate → 01.01.2035.
    expect(expiry.getUTCFullYear()).toBe(2035);
    expect(expiry.getUTCMonth()).toBe(0);
    expect(expiry.getUTCDate()).toBe(1);
  });

  it("verankert die Lohn/SV-Frist auch bei Ausstellung im Dezember auf denselben Jahreswechsel", () => {
    const issued = new Date("2026-12-31T23:00:00Z");
    const expiry = retentionExpiryDate("lohn_sozialversicherung", issued);
    expect(expiry.getUTCFullYear()).toBe(2035);
    expect(expiry.getUTCMonth()).toBe(0);
    expect(expiry.getUTCDate()).toBe(1);
  });

  it("R08 — ein Beleg vom 01.02.2020 (8 Jahre Frist) gilt am 31.12.2028 12:00 UTC noch NICHT als löschbar", () => {
    const issued = new Date("2020-02-01T00:00:00Z");
    const stillWithinDeadline = new Date("2028-12-31T12:00:00Z");
    const afterYearEnd = new Date("2029-01-01T00:00:00Z");
    expect(retentionCutoff("lohn_sozialversicherung", issued, stillWithinDeadline)).toBe(false);
    expect(retentionCutoff("lohn_sozialversicherung", issued, afterYearEnd)).toBe(true);
  });

  it("lässt die exakt-verankerten Kategorien (personaldaten/gesundheit_freitext/arbeitszeit) unverändert am Ausstellungsdatum selbst", () => {
    const from = new Date("2026-03-10T00:00:00Z");
    const expiry = retentionExpiryDate("gesundheit_freitext", from); // 12 Monate, "exact"
    expect(expiry.getUTCFullYear()).toBe(2027);
    expect(expiry.getUTCMonth()).toBe(2); // März, wie das Ausgangsdatum
    expect(expiry.getUTCDate()).toBe(10);
  });

  it("hält alle Kategorien mit positiver Monatszahl vor", () => {
    for (const category of Object.keys(RETENTION_POLICIES) as (keyof typeof RETENTION_POLICIES)[]) {
      expect(RETENTION_POLICIES[category].months).toBeGreaterThan(0);
      expect(RETENTION_POLICIES[category].legalBasis).toBeTruthy();
    }
  });
});
