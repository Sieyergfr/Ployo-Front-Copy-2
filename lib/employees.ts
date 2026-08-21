export type EmployeeStatus = "active" | "vacation" | "absent" | "former";

/**
 * Sentinel-Wert aus Alt-Datensätzen: markiert Vertragsdetails, zu denen noch
 * keine Datei hochgeladen wurde. Wird beim Mapping in leere Felder übersetzt.
 */
export const CONTRACT_FILE_NOT_UPLOADED = "noch nicht hochgeladen";

export type EmployeeFileFolder = {
  name: string;
  fileCount: number;
  locked?: boolean;
  path?: string;
};

export type EmployeeFile = {
  name: string;
  folder: string;
  type: string;
  size: string;
  updatedAt: string;
  locked?: boolean;
  storageFileId?: string;
};

/**
 * Feste, strukturierte "Felder" für Ausweisdokumente/Zertifikate auf der
 * Mitarbeiter-Detailseite — technisch ganz normale, owner-skopierte Dateien
 * mit festem `folderName` (keine eigene DB-Tabelle nötig, `folderName` ist
 * bereits ein freier String). Jede Kategorie ist eine eigene, klar benannte
 * Ablage statt eines generischen Ordners — neue Kategorien lassen sich hier
 * jederzeit ergänzen, ohne Migration. `multiple: true` bei
 * "Zusatzführerschein", da dort mehrere Nachweise (Stapler, Kran, ...)
 * nebeneinander bestehen können; alle anderen Felder halten immer nur den
 * einen aktuellen Nachweis (siehe `uploadEmployeeDocumentSlotAction`, das die
 * vorherige Datei beim Ersetzen entfernt).
 */
export const EMPLOYEE_DOCUMENT_SLOTS = [
  { key: "ausweis", label: "Ausweis", multiple: false },
  { key: "reisepass", label: "Reisepass", multiple: false },
  { key: "aufenthaltstitel", label: "Aufenthaltstitel", multiple: false },
  { key: "fuehrerschein", label: "Führerschein", multiple: false },
  { key: "arbeitserlaubnis", label: "Arbeitserlaubnis", multiple: false },
  { key: "erste-hilfe-nachweis", label: "Erste-Hilfe-Nachweis", multiple: false },
  { key: "gesundheitszeugnis", label: "Gesundheitszeugnis (Lebensmittel)", multiple: false },
  { key: "zusatzfuehrerschein", label: "Zusatzführerschein", multiple: true },
] as const;

export type EmergencyContact = {
  id: string;
  name: string;
  relation: string;
  phone: string;
  email?: string;
  note?: string;
  isPrimary?: boolean;
};

export type PayrollStatement = {
  id: string;
  period: string;
  issuedAt: string;
  gross: string;
  net: string;
  fileName: string;
  storageFileId: string;
  status: "available" | "corrected";
};

export const infoRequestStatuses = ["open", "uploaded", "review", "cancelled"] as const;
export type InfoRequestStatus = (typeof infoRequestStatuses)[number];

export type InfoRequest = {
  id: string;
  title: string;
  message?: string;
  requestedBy: string;
  requestedAt: string;
  dueAt: string;
  fileRequested: boolean;
  status: InfoRequestStatus;
  responseMessage?: string;
  respondedAt?: string;
  hasResponseFile: boolean;
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
  compensationGross: string;
  workingTime: string;
  vacation: string;
  noticePeriod: string;
  collectiveAgreement: string;
  clauses: string[];
};

export type Employee = {
  id: string;
  dbId?: string;
  key?: string;
  initials: string;
  name: string;
  employeeNumber: string;
  birthDate: string;
  birthPlace: string;
  nationality: string;
  maritalStatus: string;
  privateAddress: string;
  privateAddressFields?: {
    street: string;
    houseNumber: string;
    postalCode: string;
    city: string;
    careOf: string;
    country: string;
  };
  taxId: string;
  socialSecurityNumber: string;
  healthInsurance: string;
  iban: string;
  /** Primärer Standort — abgeleitet aus `locations[0]`, für Stellen, die weiterhin nur einen String erwarten. */
  location: string;
  /**
   * Alle zugeordneten Standorte (`TenantLocationMember`) — "Mehrere Standorte
   * pro Mitarbeiter". Optional statt Pflichtfeld, damit nicht jede
   * `Employee`-Konstruktion im Code sofort brechen muss: nur die Stellen, die
   * tatsächlich die Mitgliedschaften abfragen (`getEmployeeForTenant`,
   * `getEmployeesForTenant`), befüllen es.
   */
  locations?: string[];
  team: string;
  role: string;
  startDate: string;
  endDate: string;
  contract: string;
  weeklyHours: string;
  tenure: string;
  status: EmployeeStatus;
  email: string;
  phone: string;
  hasAccount?: boolean;
  address: string;
  addressFields?: {
    street: string;
    houseNumber: string;
    postalCode: string;
    city: string;
    careOf: string;
    country: string;
  };
  vacationRemaining: number;
  vacationTotal: number;
  vacationTaken: number;
  fileFolders: EmployeeFileFolder[];
  files: EmployeeFile[];
  emergencyContacts: EmergencyContact[];
  payrollStatements: PayrollStatement[];
  infoRequests: InfoRequest[];
  shifts: EmployeeShift[];
  timeline: EmployeeTimelineItem[];
  contractDetails: EmployeeContractDetails;
};

export const employeeStatusConfig = {
  active: { label: "Im Dienst", tone: "success" },
  vacation: { label: "Urlaub", tone: "muted" },
  absent: { label: "Abwesend", tone: "neutral" },
  former: { label: "Ausgeschieden", tone: "danger" },
} satisfies Record<
  EmployeeStatus,
  { label: string; tone: "success" | "muted" | "neutral" | "danger" }
>;
