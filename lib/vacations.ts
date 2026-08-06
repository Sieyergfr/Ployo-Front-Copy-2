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
