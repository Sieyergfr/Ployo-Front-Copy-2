export type ShiftDay = {
  id: string;
  weekday: string;
  date: string;
  isWeekend?: boolean;
  shifts: Shift[];
  staffedCount?: number;
  understaffed?: boolean;
};

export type Shift = {
  id: string;
  dbId?: string;
  key?: string;
  time: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  employeeId?: string;
  locationId?: string;
  locationAccentClassName?: string;
  assignee?: string;
  location?: string;
  team?: string;
  conflict?: boolean;
  /** Grund des Konflikts, z. B. Überschneidung oder Abwesenheit — nur gesetzt, wenn `conflict` true ist. */
  conflictReason?: string;
  note?: string;
};

export const shiftWeekLabel = "KW 26 · 22.06–28.06.2026";

export const shiftConflictCount = 3;

export const shiftDays: ShiftDay[] = [
  {
    id: "2026-06-22",
    weekday: "Mo",
    date: "22.06",
    shifts: [
      {
        id: "mon-early",
        time: "08:00–16:00",
      },
    ],
  },
  {
    id: "2026-06-23",
    weekday: "Di",
    date: "23.06",
    shifts: [
      {
        id: "tue-late",
        time: "14:00–22:00",
        assignee: "Jonas Becker",
        location: "München",
        team: "Logistik",
      },
    ],
  },
  {
    id: "2026-06-24",
    weekday: "Mi",
    date: "24.06",
    shifts: [
      {
        id: "wed-service",
        time: "10:00–18:00",
        assignee: "Elif Demir",
        location: "Berlin",
        team: "Service",
        conflict: true,
      },
    ],
  },
  {
    id: "2026-06-25",
    weekday: "Do",
    date: "25.06",
    shifts: [],
  },
  {
    id: "2026-06-26",
    weekday: "Fr",
    date: "26.06",
    shifts: [
      {
        id: "fri-sales",
        time: "09:00–17:00",
        assignee: "Sara Neumann",
        location: "Berlin",
        team: "Verkauf",
      },
    ],
  },
  {
    id: "2026-06-27",
    weekday: "Sa",
    date: "27.06",
    shifts: [],
  },
  {
    id: "2026-06-28",
    weekday: "So",
    date: "28.06",
    isWeekend: true,
    shifts: [
      {
        id: "sun-empty",
        time: "08:00–14:00",
      },
    ],
  },
];
