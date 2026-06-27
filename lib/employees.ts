export type EmployeeStatus = "active" | "vacation" | "absent";

export type EmployeeDocument = {
  title: string;
  meta: string;
  state: string;
};

export type EmployeeFileFolder = {
  name: string;
  fileCount: number;
  locked?: boolean;
};

export type EmployeeFile = {
  name: string;
  folder: string;
  type: string;
  size: string;
  updatedAt: string;
  locked?: boolean;
};

export type EmployeeShift = {
  day: string;
  label: string;
  time: string;
};

export type EmployeeTimelineItem = {
  title: string;
  date: string;
  tone: "ink" | "success" | "muted";
};

export type Employee = {
  id: string;
  initials: string;
  name: string;
  employeeNumber: string;
  location: string;
  team: string;
  role: string;
  startDate: string;
  contract: string;
  weeklyHours: string;
  tenure: string;
  status: EmployeeStatus;
  email: string;
  phone: string;
  address: string;
  vacationRemaining: number;
  vacationTotal: number;
  vacationTaken: number;
  documents: EmployeeDocument[];
  fileFolders: EmployeeFileFolder[];
  files: EmployeeFile[];
  shifts: EmployeeShift[];
  timeline: EmployeeTimelineItem[];
};

const defaultDocuments: EmployeeDocument[] = [
  {
    title: "Arbeitsvertrag",
    meta: "Hinterlegt \u00b7 01.03.2021",
    state: "G\u00fcltig",
  },
  {
    title: "Personalausweis (Kopie)",
    meta: "Verifiziert",
    state: "G\u00fcltig",
  },
  {
    title: "Sozialversicherungsnachweis",
    meta: "Hinterlegt",
    state: "G\u00fcltig",
  },
];

const defaultFileFolders: EmployeeFileFolder[] = [
  { name: "Vertr\u00e4ge & Vereinbarungen", fileCount: 2 },
  { name: "Bescheinigungen", fileCount: 3 },
  { name: "Schulungen & Nachweise", fileCount: 2 },
  { name: "Gehalt & Abrechnung", fileCount: 2, locked: true },
  { name: "Schriftverkehr", fileCount: 2 },
];

const defaultFiles: EmployeeFile[] = [
  {
    name: "Arbeitsvertrag.pdf",
    folder: "Vertr\u00e4ge & Vereinbarungen",
    type: "PDF",
    size: "428 KB",
    updatedAt: "01.03.2021",
  },
  {
    name: "Zusatzvereinbarung-arbeitszeit.pdf",
    folder: "Vertr\u00e4ge & Vereinbarungen",
    type: "PDF",
    size: "183 KB",
    updatedAt: "15.04.2024",
  },
  {
    name: "Personalausweis-kopie.pdf",
    folder: "Bescheinigungen",
    type: "PDF",
    size: "612 KB",
    updatedAt: "12.06.2026",
    locked: true,
  },
  {
    name: "Sozialversicherungsnachweis.pdf",
    folder: "Bescheinigungen",
    type: "PDF",
    size: "204 KB",
    updatedAt: "01.03.2021",
  },
  {
    name: "Hygieneschulung-2026.pdf",
    folder: "Schulungen & Nachweise",
    type: "PDF",
    size: "346 KB",
    updatedAt: "07.01.2026",
  },
  {
    name: "Lohnabrechnung-2026-05.pdf",
    folder: "Gehalt & Abrechnung",
    type: "PDF",
    size: "118 KB",
    updatedAt: "31.05.2026",
    locked: true,
  },
];

const defaultShifts: EmployeeShift[] = [
  { day: "Mo", label: "Fr\u00fchschicht", time: "06:00-14:00" },
  { day: "Di", label: "Fr\u00fchschicht", time: "06:00-14:00" },
  { day: "Mi", label: "Fr\u00fchschicht", time: "06:00-14:00" },
  { day: "Do", label: "Fr\u00fchschicht", time: "06:00-14:00" },
  { day: "Fr", label: "Fr\u00fchschicht", time: "06:00-14:00" },
  { day: "Sa", label: "Fr\u00fchschicht", time: "06:00-14:00" },
];

const defaultTimeline: EmployeeTimelineItem[] = [
  {
    title: "Stammdaten zuletzt gepr\u00fcft",
    date: "12.06.2026 \u00b7 09:14",
    tone: "ink",
  },
  {
    title: "Urlaubsantrag genehmigt",
    date: "02.05.2026 \u00b7 14:30",
    tone: "success",
  },
  {
    title: "Arbeitsvertrag hinterlegt",
    date: "01.03.2021 \u00b7 08:00",
    tone: "muted",
  },
];

function makeEmployee(
  employee: Omit<
    Employee,
    | "weeklyHours"
    | "tenure"
    | "email"
    | "phone"
    | "address"
    | "vacationRemaining"
    | "vacationTotal"
    | "vacationTaken"
    | "documents"
    | "fileFolders"
    | "files"
    | "shifts"
    | "timeline"
  > &
    Partial<
      Pick<
        Employee,
        | "weeklyHours"
        | "tenure"
        | "email"
        | "phone"
        | "address"
        | "vacationRemaining"
        | "vacationTotal"
        | "vacationTaken"
        | "documents"
        | "fileFolders"
        | "files"
        | "shifts"
        | "timeline"
      >
    >,
): Employee {
  return {
    weeklyHours: "38 Std/Woche",
    tenure: "5 J. 3 Mon.",
    email: `${employee.initials.toLowerCase()}@ployo.de`,
    phone: "+49 89 1200-41",
    address: "Leopoldstrasse 12 \u00b7 80802 M\u00fcnchen",
    vacationRemaining: 12,
    vacationTotal: 30,
    vacationTaken: 18,
    documents: defaultDocuments,
    fileFolders: defaultFileFolders,
    files: defaultFiles,
    shifts: defaultShifts,
    timeline: defaultTimeline,
    ...employee,
  };
}

export const employees: Employee[] = [
  makeEmployee({
    id: "sophie-wagner",
    initials: "SW",
    name: "Sophie Wagner",
    employeeNumber: "MA-2041",
    location: "M\u00fcnchen",
    team: "Verkauf",
    role: "Kassiererin",
    startDate: "01.03.2021",
    contract: "Unbefristet",
    status: "active",
    email: "s.wagner@ployo.de",
  }),
  makeEmployee({
    id: "jonas-becker",
    initials: "JB",
    name: "Jonas Becker",
    employeeNumber: "MA-2044",
    location: "M\u00fcnchen",
    team: "Logistik",
    role: "Lagerist",
    startDate: "15.08.2022",
    contract: "Unbefristet",
    status: "active",
  }),
  makeEmployee({
    id: "mara-klein",
    initials: "MK",
    name: "Mara Klein",
    employeeNumber: "MA-2050",
    location: "M\u00fcnchen",
    team: "Verkauf",
    role: "Kassiererin",
    startDate: "02.01.2023",
    contract: "Teilzeit",
    weeklyHours: "24 Std/Woche",
    tenure: "3 J. 5 Mon.",
    status: "active",
  }),
  makeEmployee({
    id: "mehmet-yildiz",
    initials: "MY",
    name: "Mehmet Yildiz",
    employeeNumber: "MA-2052",
    location: "M\u00fcnchen",
    team: "Service",
    role: "Servicekraft",
    startDate: "10.06.2024",
    contract: "Befristet",
    tenure: "2 J.",
    status: "active",
  }),
  makeEmployee({
    id: "lena-fischer",
    initials: "LF",
    name: "Lena Fischer",
    employeeNumber: "MA-2057",
    location: "M\u00fcnchen",
    team: "Verkauf",
    role: "Aushilfe",
    startDate: "05.04.2025",
    contract: "Werkstudentin",
    weeklyHours: "16 Std/Woche",
    tenure: "1 J. 2 Mon.",
    status: "vacation",
  }),
  makeEmployee({
    id: "paul-schaefer",
    initials: "PS",
    name: "Paul Sch\u00e4fer",
    employeeNumber: "MA-2031",
    location: "M\u00fcnchen",
    team: "Logistik",
    role: "Lagerist",
    startDate: "20.09.2019",
    contract: "Unbefristet",
    tenure: "6 J. 9 Mon.",
    status: "absent",
  }),
  makeEmployee({
    id: "anna-kowalski",
    initials: "AK",
    name: "Anna Kowalski",
    employeeNumber: "MA-3010",
    location: "Berlin",
    team: "Empfang",
    role: "Empfangskraft",
    startDate: "12.02.2020",
    contract: "Unbefristet",
    address: "Rosenthaler Strasse 44 \u00b7 10178 Berlin",
    status: "active",
  }),
  makeEmployee({
    id: "david-roth",
    initials: "DR",
    name: "David Roth",
    employeeNumber: "MA-3014",
    location: "Berlin",
    team: "Service",
    role: "Servicekraft",
    startDate: "01.07.2021",
    contract: "Unbefristet",
    address: "Rosenthaler Strasse 44 \u00b7 10178 Berlin",
    status: "active",
  }),
  makeEmployee({
    id: "sara-neumann",
    initials: "SN",
    name: "Sara Neumann",
    employeeNumber: "MA-3020",
    location: "Berlin",
    team: "Verkauf",
    role: "Verk\u00e4uferin",
    startDate: "18.11.2022",
    contract: "Teilzeit",
    weeklyHours: "28 Std/Woche",
    address: "Rosenthaler Strasse 44 \u00b7 10178 Berlin",
    status: "vacation",
  }),
  makeEmployee({
    id: "elif-demir",
    initials: "ED",
    name: "Elif Demir",
    employeeNumber: "MA-3025",
    location: "Berlin",
    team: "Service",
    role: "Servicekraft",
    startDate: "03.05.2023",
    contract: "Befristet",
    address: "Rosenthaler Strasse 44 \u00b7 10178 Berlin",
    status: "absent",
  }),
  makeEmployee({
    id: "greta-voss",
    initials: "GV",
    name: "Greta Voss",
    employeeNumber: "MA-4008",
    location: "Hamburg",
    team: "Empfang",
    role: "Empfangskraft",
    startDate: "09.10.2020",
    contract: "Unbefristet",
    address: "Neuer Wall 18 \u00b7 20354 Hamburg",
    status: "active",
  }),
  makeEmployee({
    id: "lukas-maier",
    initials: "LM",
    name: "Lukas Maier",
    employeeNumber: "MA-4012",
    location: "Hamburg",
    team: "Service",
    role: "Servicekraft",
    startDate: "22.03.2022",
    contract: "Unbefristet",
    address: "Neuer Wall 18 \u00b7 20354 Hamburg",
    status: "active",
  }),
  makeEmployee({
    id: "nina-albrecht",
    initials: "NA",
    name: "Nina Albrecht",
    employeeNumber: "MA-4018",
    location: "Hamburg",
    team: "Verkauf",
    role: "Verk\u00e4uferin",
    startDate: "14.01.2024",
    contract: "Teilzeit",
    weeklyHours: "30 Std/Woche",
    address: "Neuer Wall 18 \u00b7 20354 Hamburg",
    status: "vacation",
  }),
  makeEmployee({
    id: "ole-petersen",
    initials: "OP",
    name: "Ole Petersen",
    employeeNumber: "MA-4021",
    location: "Hamburg",
    team: "Logistik",
    role: "Lagerist",
    startDate: "28.06.2025",
    contract: "Befristet",
    address: "Neuer Wall 18 \u00b7 20354 Hamburg",
    status: "active",
  }),
];

export const employeeStatusConfig = {
  active: { label: "Im Dienst", tone: "success" },
  vacation: { label: "Urlaub", tone: "muted" },
  absent: { label: "Abwesend", tone: "neutral" },
} satisfies Record<
  EmployeeStatus,
  { label: string; tone: "success" | "muted" | "neutral" }
>;

export function getEmployeeById(id: string) {
  return employees.find((employee) => employee.id === id);
}
