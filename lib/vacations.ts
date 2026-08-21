export type VacationRequestStatus = "pending" | "approved" | "rejected";

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
}): { vacationTotal: number; vacationTaken: number; vacationRemaining: number } {
  const vacationTotal = parseContractVacationDays(input.contractVacation, input.storedVacationTotal);
  const vacationTaken = input.approvedDaysThisYear;

  return {
    vacationTotal,
    vacationTaken,
    vacationRemaining: Math.max(0, vacationTotal - vacationTaken),
  };
}

export const vacationStatusConfig = {
  pending: {
    label: "Ausstehend",
    badge: "· Ausstehend",
    className: "bg-warning/10 text-[#7A4E00]",
  },
  approved: {
    label: "Genehmigt",
    badge: "✓ Genehmigt",
    className: "bg-success/10 text-success",
  },
  rejected: {
    label: "Abgelehnt",
    badge: "× Abgelehnt",
    className: "bg-danger/10 text-danger",
  },
} satisfies Record<
  VacationRequestStatus,
  { label: string; badge: string; className: string }
>;
