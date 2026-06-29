export type SicknessMetric = {
  label: string;
  value: string;
  caption: string;
  tone?: "danger";
};

export type CurrentSickness = {
  id: string;
  initials: string;
  name: string;
  location: string;
  since: string;
  days: string;
};

export type SicknessChartItem = {
  month: string;
  count: number;
  height: number;
  current?: boolean;
};

export type SicknessHistoryItem = {
  id: string;
  initials: string;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  days: string;
};

export const sicknessMetrics: SicknessMetric[] = [
  {
    label: "Aktuell krank",
    value: "2",
    caption: "Mitarbeiter abwesend",
    tone: "danger",
  },
  {
    label: "Diesen Monat",
    value: "8",
    caption: "Krankmeldungen gesamt",
  },
  {
    label: "Ø Dauer",
    value: "3.2",
    caption: "Tage je Krankmeldung",
  },
  {
    label: "Krankenquote",
    value: "2.8%",
    caption: "Ø aller Standorte",
  },
];

export const currentSickness: CurrentSickness[] = [
  {
    id: "paul-schaefer-current",
    initials: "PS",
    name: "Paul Schäfer",
    location: "München",
    since: "24.06.2026",
    days: "3",
  },
  {
    id: "elif-demir-current",
    initials: "ED",
    name: "Elif Demir",
    location: "Berlin",
    since: "22.06.2026",
    days: "5",
  },
];

export const sicknessChart: SicknessChartItem[] = [
  { month: "Jan", count: 2, height: 32 },
  { month: "Feb", count: 1, height: 16 },
  { month: "Mär", count: 3, height: 48 },
  { month: "Apr", count: 2, height: 32 },
  { month: "Mai", count: 4, height: 64 },
  { month: "Jun", count: 5, height: 80, current: true },
];

export const sicknessHistory: SicknessHistoryItem[] = [
  {
    id: "marc-vogel-2026-06",
    initials: "MV",
    name: "Marc Vogel",
    location: "München",
    startDate: "15.06",
    endDate: "17.06.2026",
    days: "3 Tage",
  },
  {
    id: "tim-brandt-2026-06",
    initials: "TB",
    name: "Tim Brandt",
    location: "Berlin",
    startDate: "10.06",
    endDate: "11.06.2026",
    days: "2 Tage",
  },
  {
    id: "nina-albrecht-2026-06",
    initials: "NA",
    name: "Nina Albrecht",
    location: "Hamburg",
    startDate: "02.06",
    endDate: "05.06.2026",
    days: "4 Tage",
  },
  {
    id: "greta-voss-2026-05",
    initials: "GV",
    name: "Greta Voss",
    location: "Hamburg",
    startDate: "20.05",
    endDate: "22.05.2026",
    days: "3 Tage",
  },
];
