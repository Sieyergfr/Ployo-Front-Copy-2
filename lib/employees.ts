export type EmployeeStatus = "active" | "vacation" | "absent";

/**
 * Sentinel-Wert aus Alt-Datensätzen: markiert Vertragsdetails, zu denen noch
 * keine Datei hochgeladen wurde. Wird beim Mapping in leere Felder übersetzt.
 */
export const CONTRACT_FILE_NOT_UPLOADED = "noch nicht hochgeladen";

export type EmployeeDocument = {
  title: string;
  meta: string;
  state: string;
};

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
  message?: string;
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

export const employeeStatusConfig = {
  active: { label: "Im Dienst", tone: "success" },
  vacation: { label: "Urlaub", tone: "muted" },
  absent: { label: "Abwesend", tone: "neutral" },
} satisfies Record<
  EmployeeStatus,
  { label: string; tone: "success" | "muted" | "neutral" }
>;
