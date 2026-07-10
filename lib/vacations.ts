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
  days: string;
  note?: string;
  status: VacationRequestStatus;
};

export const vacationMetrics: VacationMetric[] = [
  {
    label: "Ausstehend",
    value: "4",
    caption: "warten auf Genehmigung",
    tone: "warning",
  },
  {
    label: "Genehmigt",
    value: "3",
    caption: "diesen Monat",
    tone: "success",
  },
  {
    label: "Ø Resturlaub",
    value: "15",
    caption: "Tage · alle Mitarbeiter",
  },
  {
    label: "Beantragte Tage",
    value: "54",
    caption: "gesamt · dieses Jahr",
  },
];

export const vacationRequests: VacationRequest[] = [
  {
    id: "sara-neumann-2026-08",
    initials: "SN",
    name: "Sara Neumann",
    location: "Berlin",
    team: "Verkauf",
    startDate: "12.08",
    endDate: "19.08.2026",
    days: "8 Tage",
    status: "approved",
  },
  {
    id: "lena-fischer-2026-07",
    initials: "LF",
    name: "Lena Fischer",
    location: "München",
    team: "Verkauf",
    startDate: "01.07",
    endDate: "07.07.2026",
    days: "7 Tage",
    status: "approved",
  },
  {
    id: "nina-albrecht-2026-07",
    initials: "NA",
    name: "Nina Albrecht",
    location: "Hamburg",
    team: "Verkauf",
    startDate: "28.07",
    endDate: "04.08.2026",
    days: "8 Tage",
    status: "pending",
  },
  {
    id: "jonas-becker-2026-08",
    initials: "JB",
    name: "Jonas Becker",
    location: "München",
    team: "Logistik",
    startDate: "18.08",
    endDate: "22.08.2026",
    days: "5 Tage",
    status: "pending",
  },
  {
    id: "ole-petersen-2026-07",
    initials: "OP",
    name: "Ole Petersen",
    location: "Hamburg",
    team: "Logistik",
    startDate: "21.07",
    endDate: "25.07.2026",
    days: "5 Tage",
    status: "approved",
  },
  {
    id: "david-roth-2026-09",
    initials: "DR",
    name: "David Roth",
    location: "Berlin",
    team: "Service",
    startDate: "15.09",
    endDate: "22.09.2026",
    days: "6 Tage",
    status: "pending",
  },
  {
    id: "mehmet-yildiz-2026-07",
    initials: "MY",
    name: "Mehmet Yildiz",
    location: "München",
    team: "Service",
    startDate: "14.07",
    endDate: "14.07.2026",
    days: "1 Tag",
    status: "rejected",
  },
  {
    id: "anna-kowalski-2026-09",
    initials: "AK",
    name: "Anna Kowalski",
    location: "Berlin",
    team: "Empfang",
    startDate: "01.09",
    endDate: "14.09.2026",
    days: "14 Tage",
    status: "pending",
  },
];

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
