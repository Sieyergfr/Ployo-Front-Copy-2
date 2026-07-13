export type LocationStatus = "active" | "inactive";

export type LocationMetric = {
  label: string;
  value: string;
  caption: string;
  tone?: "success" | "danger" | "muted";
};

export type LocationTeamMember = {
  employeeId?: string;
  initials: string;
  name: string;
};

export type LocationActivity = {
  actor: string;
  text: string;
  time: string;
  tone: "success" | "ink" | "danger" | "blue";
};

export type LocationFileFolder = {
  name: string;
  fileCount: number;
  locked?: boolean;
};

export type LocationFile = {
  name: string;
  folder: string;
  updatedAt: string;
  size: string;
  type: string;
  locked?: boolean;
};

export type LocationShiftTone = "blue" | "success" | "muted";

export type LocationShiftCell = {
  staffing?: string;
  time?: string;
  state: "filled" | "warning" | "empty";
};

export type LocationShiftRow = {
  label: string;
  tone: LocationShiftTone;
  cells: LocationShiftCell[];
};

export type LocationShiftEmployee = LocationTeamMember & {
  days: Array<string | null>;
};

export type LocationShiftPlan = {
  week: string;
  days: Array<{
    label: string;
    date: string;
    weekend?: boolean;
  }>;
  rows: LocationShiftRow[];
  employees: LocationShiftEmployee[];
};

export type Location = {
  id: string;
  dbId?: string;
  key?: string;
  kind: string;
  name: string;
  address: string;
  employeeCount: number;
  activeToday: number;
  shiftCount: number;
  openPositions: number;
  utilization: string;
  utilizationCaption: string;
  status: LocationStatus;
  accentClassName: string;
  lead: {
    initials: string;
    name: string;
    phone: string;
    email: string;
  };
  team: LocationTeamMember[];
  activity: LocationActivity[];
  fileFolders: LocationFileFolder[];
  files: LocationFile[];
  shiftPlan: LocationShiftPlan;
};

const defaultTeam: LocationTeamMember[] = [
  { initials: "TK", name: "Tom K." },
  { initials: "LP", name: "Laura P." },
  { initials: "MH", name: "Max H." },
  { initials: "SK", name: "Sara K." },
  { initials: "JB", name: "Jan B." },
  { initials: "AW", name: "Anna W." },
  { initials: "PL", name: "Paul L." },
  { initials: "KR", name: "Kira R." },
  { initials: "FG", name: "Felix G." },
];

const defaultActivity: LocationActivity[] = [
  {
    actor: "Thomas Berger",
    text: "hat Schichtplan KW 27 freigegeben",
    time: "heute \u00b7 09:14",
    tone: "success",
  },
  {
    actor: "Anna Weber",
    text: "wurde der Frühschicht Mi. zugewiesen",
    time: "heute \u00b7 08:50",
    tone: "ink",
  },
  {
    actor: "System",
    text: "Unterbesetzung Sp\u00e4tschicht Do. erkannt",
    time: "gestern \u00b7 18:22",
    tone: "danger",
  },
  {
    actor: "Carla Brandt",
    text: "hat Brandschutzordnung aktualisiert",
    time: "gestern \u00b7 14:05",
    tone: "blue",
  },
  {
    actor: "Paul Lehmann",
    text: "hat Urlaubsantrag genehmigt",
    time: "23.06. \u00b7 11:30",
    tone: "success",
  },
];

const defaultFileFolders: LocationFileFolder[] = [
  { name: "Schichtpl\u00e4ne", fileCount: 8 },
  { name: "Sicherheit & Brandschutz", fileCount: 5, locked: true },
  { name: "Inventar", fileCount: 4 },
  { name: "Vertr\u00e4ge Standort", fileCount: 3, locked: true },
];

const defaultFiles: LocationFile[] = [
  {
    name: "Schichtplan KW 27.pdf",
    folder: "Schichtpl\u00e4ne",
    updatedAt: "heute \u00b7 09:14",
    size: "428 KB",
    type: "PDF",
  },
  {
    name: "Brandschutzordnung 2026.pdf",
    folder: "Sicherheit & Brandschutz",
    updatedAt: "gestern \u00b7 14:05",
    size: "1.2 MB",
    type: "PDF",
    locked: true,
  },
  {
    name: "Inventarliste Juni.xlsx",
    folder: "Inventar",
    updatedAt: "24.06. \u00b7 16:20",
    size: "86 KB",
    type: "XLSX",
  },
  {
    name: "Mietvertrag Standort.pdf",
    folder: "Vertr\u00e4ge Standort",
    updatedAt: "12.06. \u00b7 11:40",
    size: "940 KB",
    type: "PDF",
    locked: true,
  },
];

const defaultShiftPlan: LocationShiftPlan = {
  week: "KW 26",
  days: [
    { label: "Mo", date: "22.06" },
    { label: "Di", date: "23.06" },
    { label: "Mi", date: "24.06" },
    { label: "Do", date: "25.06" },
    { label: "Fr", date: "26.06" },
    { label: "Sa", date: "27.06", weekend: true },
    { label: "So", date: "28.06", weekend: true },
  ],
  rows: [
    {
      label: "Frühschicht",
      tone: "blue",
      cells: [
        { staffing: "3/3", time: "06-14", state: "filled" },
        { staffing: "3/3", time: "06-14", state: "filled" },
        { staffing: "2/3", time: "06-14", state: "warning" },
        { staffing: "3/3", time: "06-14", state: "filled" },
        { staffing: "3/3", time: "06-14", state: "filled" },
        { staffing: "2/3", time: "06-14", state: "warning" },
        { state: "empty" },
      ],
    },
    {
      label: "Sp\u00e4tschicht",
      tone: "success",
      cells: [
        { staffing: "3/3", time: "14-22", state: "filled" },
        { staffing: "2/3", time: "14-22", state: "warning" },
        { staffing: "3/3", time: "14-22", state: "filled" },
        { staffing: "3/3", time: "14-22", state: "filled" },
        { staffing: "2/3", time: "14-22", state: "warning" },
        { staffing: "2/3", time: "14-22", state: "warning" },
        { state: "empty" },
      ],
    },
    {
      label: "Nachtschicht",
      tone: "muted",
      cells: [
        { staffing: "2/2", time: "22-06", state: "filled" },
        { staffing: "2/2", time: "22-06", state: "filled" },
        { staffing: "2/2", time: "22-06", state: "filled" },
        { staffing: "1/2", time: "22-06", state: "warning" },
        { staffing: "2/2", time: "22-06", state: "filled" },
        { state: "empty" },
        { state: "empty" },
      ],
    },
  ],
  employees: [
    { initials: "TK", name: "Tom K.", days: ["06:00-14:00", "14:00-22:00", "06:00-14:00", null, "06:00-14:00", "14:00-22:00", null] },
    { initials: "LP", name: "Laura P.", days: ["06:00-14:00", "14:00-22:00", "06:00-14:00", null, "06:00-14:00", "14:00-22:00", null] },
    { initials: "MH", name: "Max H.", days: ["06:00-14:00", "14:00-22:00", "06:00-14:00", null, "06:00-14:00", "14:00-22:00", null] },
    { initials: "SK", name: "Sara K.", days: ["06:00-14:00", "14:00-22:00", "06:00-14:00", null, "06:00-14:00", "14:00-22:00", null] },
    { initials: "JB", name: "Jan B.", days: ["06:00-14:00", "14:00-22:00", "06:00-14:00", null, "06:00-14:00", "14:00-22:00", null] },
  ],
};

export const locations: Location[] = [
  {
    id: "muenchen-hauptbahnhof",
    kind: "Filiale",
    name: "München Hauptbahnhof",
    address: "Bahnhofplatz 1, 80335 München",
    employeeCount: 24,
    activeToday: 21,
    shiftCount: 3,
    openPositions: 2,
    utilization: "87%",
    utilizationCaption: "\u00b13% Vorwoche",
    status: "active",
    accentClassName: "bg-ink",
    lead: {
      initials: "TB",
      name: "Thomas Berger",
      phone: "+49 89 123 456",
      email: "muenchen@ployo.de",
    },
    team: defaultTeam,
    activity: defaultActivity,
    fileFolders: defaultFileFolders,
    files: defaultFiles,
    shiftPlan: defaultShiftPlan,
  },
  {
    id: "hamburg-altona",
    kind: "Filiale",
    name: "Hamburg Altona",
    address: "Altona Bahnhof 2, 22765 Hamburg",
    employeeCount: 18,
    activeToday: 16,
    shiftCount: 2,
    openPositions: 1,
    utilization: "82%",
    utilizationCaption: "\u00b12% Vorwoche",
    status: "active",
    accentClassName: "bg-success",
    lead: {
      initials: "MK",
      name: "Maria Koch",
      phone: "+49 40 4400-18",
      email: "hamburg@ployo.de",
    },
    team: defaultTeam.slice(0, 7),
    activity: defaultActivity,
    fileFolders: defaultFileFolders.slice(0, 3),
    files: defaultFiles.slice(0, 3),
    shiftPlan: defaultShiftPlan,
  },
  {
    id: "berlin-mitte",
    kind: "Lager",
    name: "Berlin Mitte",
    address: "Unter den Linden 10, 10117 Berlin",
    employeeCount: 31,
    activeToday: 28,
    shiftCount: 3,
    openPositions: 3,
    utilization: "91%",
    utilizationCaption: "+4% Vorwoche",
    status: "active",
    accentClassName: "bg-[#2A6FDB]",
    lead: {
      initials: "SM",
      name: "Sarah Müller",
      phone: "+49 30 1010-31",
      email: "berlin@ployo.de",
    },
    team: defaultTeam,
    activity: defaultActivity,
    fileFolders: defaultFileFolders,
    files: defaultFiles,
    shiftPlan: defaultShiftPlan,
  },
  {
    id: "frankfurt-zentrum",
    kind: "Verwaltung",
    name: "Frankfurt Zentrum",
    address: "Kaiserstrasse 5, 60311 Frankfurt",
    employeeCount: 12,
    activeToday: 0,
    shiftCount: 1,
    openPositions: 1,
    utilization: "0%",
    utilizationCaption: "inaktiv",
    status: "inactive",
    accentClassName: "bg-[#B9B9B4]",
    lead: {
      initials: "AW",
      name: "Andreas Wolf",
      phone: "+49 69 60311-12",
      email: "frankfurt@ployo.de",
    },
    team: defaultTeam.slice(0, 4),
    activity: defaultActivity.slice(2),
    fileFolders: defaultFileFolders.slice(1, 3),
    files: defaultFiles.slice(1, 3),
    shiftPlan: defaultShiftPlan,
  },
];

export const locationMetrics: LocationMetric[] = [
  {
    label: "Standorte gesamt",
    value: locations.length.toString(),
    caption: `${locations.filter((location) => location.status === "active").length} aktiv`,
  },
  {
    label: "Aktive Standorte",
    value: locations
      .filter((location) => location.status === "active")
      .length.toString(),
    caption: `${locations.filter((location) => location.status === "inactive").length} inaktiv`,
  },
  {
    label: "Mitarbeiter gesamt",
    value: locations
      .reduce((total, location) => total + location.employeeCount, 0)
      .toString(),
    caption: "aller Standorte",
  },
  {
    label: "Offene Schichten",
    value: "7",
    caption: "diese Woche",
    tone: "danger",
  },
];

export function getLocationById(id: string) {
  return locations.find((location) => location.id === id);
}
