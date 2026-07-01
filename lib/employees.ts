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

export type EmergencyContact = {
  id: string;
  name: string;
  relation: string;
  phone: string;
  email?: string;
  note?: string;
};

export type PayrollStatement = {
  id: string;
  period: string;
  issuedAt: string;
  gross: string;
  net: string;
  fileName: string;
  status: "available" | "corrected";
};

export type InfoRequest = {
  id: string;
  title: string;
  requestedBy: string;
  requestedAt: string;
  dueAt: string;
  fileRequested: boolean;
  status: "open" | "uploaded" | "review";
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

export type EmployeeContractDetails = {
  linkedFileName: string;
  linkedFileMeta: string;
  contractType: string;
  entryDate: string;
  exitDate: string;
  fixedTerm: string;
  probation: string;
  position: string;
  department: string;
  supervisor: string;
  workLocation: string;
  parties: string;
  compensation: string;
  workingTime: string;
  vacation: string;
  noticePeriod: string;
  collectiveAgreement: string;
  clauses: string[];
};

export type Employee = {
  id: string;
  initials: string;
  name: string;
  employeeNumber: string;
  birthDate: string;
  birthPlace: string;
  nationality: string;
  maritalStatus: string;
  privateAddress: string;
  taxId: string;
  socialSecurityNumber: string;
  healthInsurance: string;
  iban: string;
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
  emergencyContacts: EmergencyContact[];
  payrollStatements: PayrollStatement[];
  infoRequests: InfoRequest[];
  shifts: EmployeeShift[];
  timeline: EmployeeTimelineItem[];
  contractDetails: EmployeeContractDetails;
};

const defaultDocuments: EmployeeDocument[] = [
  {
    title: "Arbeitsvertrag",
    meta: "Hinterlegt \u00b7 01.03.2021",
    state: "Gültig",
  },
  {
    title: "Personalausweis (Kopie)",
    meta: "Verifiziert",
    state: "Gültig",
  },
  {
    title: "Sozialversicherungsnachweis",
    meta: "Hinterlegt",
    state: "Gültig",
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

const defaultEmergencyContacts: EmergencyContact[] = [
  {
    id: "primary",
    name: "Clara Wagner",
    relation: "Partnerin",
    phone: "+49 170 456 9821",
    email: "clara.wagner@example.com",
    note: "Darf bei medizinischen Notfällen sofort kontaktiert werden.",
  },
  {
    id: "secondary",
    name: "Martin Wagner",
    relation: "Vater",
    phone: "+49 89 882244",
    note: "Ersatzkontakt, falls primär nicht erreichbar.",
  },
];

const defaultPayrollStatements: PayrollStatement[] = [
  {
    id: "payroll-2026-06",
    period: "Juni 2026",
    issuedAt: "30.06.2026 · 07:12",
    gross: "2.980,00 EUR",
    net: "1.984,22 EUR",
    fileName: "Lohnabrechnung-2026-06.pdf",
    status: "available",
  },
  {
    id: "payroll-2026-05",
    period: "Mai 2026",
    issuedAt: "31.05.2026 · 07:04",
    gross: "2.980,00 EUR",
    net: "1.984,22 EUR",
    fileName: "Lohnabrechnung-2026-05.pdf",
    status: "available",
  },
  {
    id: "payroll-2026-04",
    period: "April 2026",
    issuedAt: "30.04.2026 · 07:08",
    gross: "2.980,00 EUR",
    net: "1.971,18 EUR",
    fileName: "Lohnabrechnung-2026-04-korrigiert.pdf",
    status: "corrected",
  },
];

const defaultInfoRequests: InfoRequest[] = [
  {
    id: "bank-update",
    title: "Aktuelle Bankverbindung bestätigen",
    requestedBy: "Carla Brandt",
    requestedAt: "26.06.2026 · 09:10",
    dueAt: "05.07.2026",
    fileRequested: false,
    status: "open",
  },
  {
    id: "certificate",
    title: "Fortbildungsnachweis hochladen",
    requestedBy: "Thomas Berger",
    requestedAt: "20.06.2026 · 15:44",
    dueAt: "12.07.2026",
    fileRequested: true,
    status: "uploaded",
  },
];

const defaultShifts: EmployeeShift[] = [
  { day: "Mo", label: "Frühschicht", time: "06:00-14:00" },
  { day: "Di", label: "Frühschicht", time: "06:00-14:00" },
  { day: "Mi", label: "Frühschicht", time: "06:00-14:00" },
  { day: "Do", label: "Frühschicht", time: "06:00-14:00" },
  { day: "Fr", label: "Frühschicht", time: "06:00-14:00" },
  { day: "Sa", label: "Frühschicht", time: "06:00-14:00" },
];

const defaultTimeline: EmployeeTimelineItem[] = [
  {
    title: "Stammdaten zuletzt geprüft",
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

const defaultContractDetails: EmployeeContractDetails = {
  linkedFileName: "Arbeitsvertrag.pdf",
  linkedFileMeta: "Verträge & Vereinbarungen · PDF · 428 KB",
  contractType: "Unbefristeter Arbeitsvertrag",
  entryDate: "01.03.2021",
  exitDate: "Nicht vereinbart",
  fixedTerm: "Keine Befristung",
  probation: "6 Monate, beendet am 31.08.2021",
  position: "Kassiererin",
  department: "Verkauf",
  supervisor: "Filialleitung München",
  workLocation: "München Hauptbahnhof",
  parties: "Müller & Partner GmbH / Sophie Wagner",
  compensation: "2.980,00 EUR brutto monatlich",
  workingTime: "38 Std/Woche, Schichtmodell laut Dienstplan",
  vacation: "30 Arbeitstage pro Kalenderjahr",
  noticePeriod: "4 Wochen zum 15. oder Monatsende",
  collectiveAgreement: "Keine Tarifbindung vermerkt",
  clauses: [
    "Verschwiegenheit und Datenschutz",
    "Nebentätigkeiten nur nach vorheriger Anzeige",
    "Arbeitszeitkonto mit monatlichem Ausgleich",
  ],
};

function getContractTitle(contract: string) {
  const labels: Record<string, string> = {
    Unbefristet: "Unbefristeter Arbeitsvertrag",
    Befristet: "Befristeter Arbeitsvertrag",
    Teilzeit: "Teilzeit-Arbeitsvertrag",
    Werkstudentin: "Werkstudentenvertrag",
  };

  return labels[contract] ?? contract;
}

function makeEmployee(
  employee: Omit<
    Employee,
    | "birthDate"
    | "birthPlace"
    | "nationality"
    | "maritalStatus"
    | "privateAddress"
    | "taxId"
    | "socialSecurityNumber"
    | "healthInsurance"
    | "iban"
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
    | "emergencyContacts"
    | "payrollStatements"
    | "infoRequests"
    | "shifts"
    | "timeline"
    | "contractDetails"
  > &
    Partial<
      Pick<
        Employee,
        | "birthDate"
        | "birthPlace"
        | "nationality"
        | "maritalStatus"
        | "privateAddress"
        | "taxId"
        | "socialSecurityNumber"
        | "healthInsurance"
        | "iban"
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
        | "emergencyContacts"
        | "payrollStatements"
        | "infoRequests"
        | "shifts"
        | "timeline"
        | "contractDetails"
      >
    >,
): Employee {
  return {
    birthDate: "14.09.1992",
    birthPlace: "München",
    nationality: "Deutsch",
    maritalStatus: "Ledig",
    privateAddress: "Isarstrasse 18, 80469 München",
    taxId: "12 345 678 901",
    socialSecurityNumber: "12 140992 W 123",
    healthInsurance: "Techniker Krankenkasse",
    iban: "DE89 3704 0044 0532 0130 00",
    weeklyHours: "38 Std/Woche",
    tenure: "5 J. 3 Mon.",
    email: `${employee.initials.toLowerCase()}@ployo.de`,
    phone: "+49 89 1200-41",
    address: "Leopoldstrasse 12 \u00b7 80802 München",
    vacationRemaining: 12,
    vacationTotal: 30,
    vacationTaken: 18,
    documents: defaultDocuments,
    fileFolders: defaultFileFolders,
    files: defaultFiles,
    emergencyContacts: defaultEmergencyContacts,
    payrollStatements: defaultPayrollStatements,
    infoRequests: defaultInfoRequests,
    shifts: defaultShifts,
    timeline: defaultTimeline,
    contractDetails: {
      ...defaultContractDetails,
      contractType: getContractTitle(employee.contract),
      entryDate: employee.startDate,
      position: employee.role,
      department: employee.team,
      parties: `Müller & Partner GmbH / ${employee.name}`,
      workingTime: `${employee.weeklyHours ?? "38 Std/Woche"}, Schichtmodell laut Dienstplan`,
    },
    ...employee,
  };
}

export const employees: Employee[] = [
  makeEmployee({
    id: "sophie-wagner",
    initials: "SW",
    name: "Sophie Wagner",
    employeeNumber: "MA-2041",
    location: "München",
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
    location: "München",
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
    location: "München",
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
    location: "München",
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
    location: "München",
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
    location: "München",
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
