import { type Bundesland, isGermanHoliday } from "@/lib/german-holidays";
import { type OpeningHoursWeekday, weekdayFromDate } from "@/lib/opening-hours";

export type VacationRequestStatus = "pending" | "approved" | "rejected";

export const DEFAULT_VACATION_WORK_DAYS: OpeningHoursWeekday[] = ["Mo", "Di", "Mi", "Do", "Fr"];

/** Parst `TenantEmployee.workDaysJson` — leer/ungültig fällt auf die 5-Tage-Woche (Mo-Fr) zurück. */
export function parseVacationWorkDays(value: unknown): Set<OpeningHoursWeekday> {
  const valid: OpeningHoursWeekday[] = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  if (Array.isArray(value)) {
    const days = value.filter((item): item is OpeningHoursWeekday => valid.includes(item as OpeningHoursWeekday));

    if (days.length > 0) {
      return new Set(days);
    }
  }

  return new Set(DEFAULT_VACATION_WORK_DAYS);
}

/**
 * Urlaubsverbrauch in individuellen Arbeitstagen statt Kalendertagen (Audit-
 * Finding M01): zählt im Datumsbereich [startDate, endDate] (inklusive) nur
 * Tage, die (a) laut `workDays` ein regulärer Arbeitstag dieses Mitarbeiters
 * sind und (b) kein gesetzlicher Feiertag seines Standort-Bundeslands sind.
 * Reine Datumslogik (kein DB-Zugriff) — das Auflösen von `workDays`/
 * `bundesland` aus der Personalakte übernimmt der Aufrufer
 * (lib/vacation-service.ts).
 */
export function calculateVacationWorkDays(
  startDate: string,
  endDate: string,
  workDays: Set<OpeningHoursWeekday>,
  bundesland: Bundesland | null,
): number {
  const startMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  const endMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDate);

  if (!startMatch || !endMatch) {
    return 1;
  }

  const start = Date.UTC(Number(startMatch[1]), Number(startMatch[2]) - 1, Number(startMatch[3]));
  const end = Date.UTC(Number(endMatch[1]), Number(endMatch[2]) - 1, Number(endMatch[3]));

  if (end < start) {
    return 1;
  }

  let count = 0;
  for (let day = start; day <= end; day += 86_400_000) {
    const date = new Date(day);
    const iso = date.toISOString().slice(0, 10);

    if (workDays.has(weekdayFromDate(date)) && !isGermanHoliday(iso, bundesland)) {
      count += 1;
    }
  }

  // Anders als calculateVacationDays (reine Kalenderdauer-Anzeige) gibt es
  // hier bewusst KEIN erzwungenes Minimum von 1 mehr: ein Zeitraum ganz ohne
  // individuellen Arbeitstag (z. B. ausschließlich ein arbeitsfreier
  // Sonntag) belastet damit korrekt 0 Urlaubstage, statt fälschlich 1 zu
  // zählen (Audit-Finding M01). Ob ein Antrag mit 0 Arbeitstagen überhaupt
  // sinnvoll/zulässig ist, entscheidet der Aufrufer (lib/vacation-service.ts
  // lehnt einen solchen Antrag ab).
  return count;
}

export type VacationMetric = {
  label: string;
  value: string;
  caption: string;
  tone?: "warning" | "success";
};

export type VacationRequest = {
  id: string;
  dbId?: string;
  key?: string;
  employeeId?: string;
  initials: string;
  name: string;
  location: string;
  team: string;
  startDate: string;
  endDate: string;
  /** ISO-Format (YYYY-MM-DD) für Bearbeitungsformulare. */
  startDateIso?: string;
  endDateIso?: string;
  days: string;
  note?: string;
  status: VacationRequestStatus;
};

/**
 * Erste Zahl aus einem Freitext-Vertragsfeld wie "30 Tage" — Fallback, falls
 * (noch) keine Vertragsdetails erfasst sind oder das Feld keine Zahl enthält.
 */
export function parseContractVacationDays(contractVacation: string, fallback: number): number {
  const match = contractVacation.match(/\d+/);

  return match ? Number.parseInt(match[0], 10) : fallback;
}

/**
 * Urlaubskonto aus dem Vertrag (Anspruch) + tatsächlich genehmigten Anträgen
 * des laufenden Jahres — statt der bisherigen, manuell gepflegten und damit
 * ständig veraltenden `vacationTotal`/`vacationTaken`-Felder auf
 * `TenantEmployee` (siehe To-Do "Urlaubsanzeige korrigieren"/"wirklich vom
 * Vertrag ablesen").
 */
export function computeVacationAccount(input: {
  contractVacation: string;
  storedVacationTotal: number;
  approvedDaysThisYear: number;
  /**
   * Noch nicht verfallener Resturlaub aus dem Vorjahr (Audit-Finding M02,
   * `TenantEmployee.vacationCarryover`, fortgeschrieben von
   * `runVacationCarryoverRollover`) — 0, wenn keiner besteht oder er bereits
   * verfallen ist.
   */
  carryover?: number;
  /**
   * Manuelle Korrektur (Tage, +/-, `TenantEmployee.vacationManualCorrection`)
   * für Sonderfälle wie Alt-Fehler oder Kulanz, unabhängig von Vertrag,
   * Anträgen und der gesetzlich relevanten Übertragslogik — geht additiv
   * (auch negativ) in `vacationRemaining` ein, ohne `vacationCarryover` zu
   * verändern.
   */
  manualCorrection?: number;
}): {
  vacationTotal: number;
  vacationTaken: number;
  vacationRemaining: number;
  vacationCarryover: number;
  vacationManualCorrection: number;
} {
  const vacationTotal = parseContractVacationDays(input.contractVacation, input.storedVacationTotal);
  const vacationTaken = input.approvedDaysThisYear;
  const carryover = input.carryover ?? 0;
  const manualCorrection = input.manualCorrection ?? 0;

  // Audit-Finding R05: `Math.max(0, vacationTotal - vacationTaken) + carryover`
  // klammerte das Basiskontingent-Defizit VOR der Addition des Übertrags auf
  // 0 — sobald mehr genommen wurde, als das Basiskontingent allein hergibt
  // (der Überhang also bereits in den Übertrag "hineinläuft"), verschwand
  // dieser Überhang: 30 Tage Anspruch + 5 Übertrag − 32 genommen ergab
  // fälschlich 5 statt 3. Erst die Summe aus Kontingent und Übertrag gegen
  // das Genommene aufrechnen, danach auf 0 klammern.
  return {
    vacationTotal,
    vacationTaken,
    vacationRemaining: Math.max(0, vacationTotal + carryover + manualCorrection - vacationTaken),
    vacationCarryover: carryover,
    vacationManualCorrection: manualCorrection,
  };
}

export function getVacationStatusConfig(
  t: (key: string) => string,
): Record<VacationRequestStatus, { label: string; badge: string; className: string }> {
  return {
    pending: {
      label: t("pendingLabel"),
      badge: t("pendingBadge"),
      className: "bg-warning/10 text-[#7A4E00]",
    },
    approved: {
      label: t("approvedLabel"),
      badge: t("approvedBadge"),
      className: "bg-success/10 text-success",
    },
    rejected: {
      label: t("rejectedLabel"),
      badge: t("rejectedBadge"),
      className: "bg-danger/10 text-danger",
    },
  };
}
