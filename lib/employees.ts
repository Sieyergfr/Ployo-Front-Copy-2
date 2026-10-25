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
  /** Vor dem Mitarbeiter selbst verborgen — samt Inhalt und Unterordnern. */
  hiddenFromEmployee?: boolean;
};

export type EmployeeFile = {
  name: string;
  folder: string;
  /** Ordnerpfad (TenantFile.folderSlug); leer = Home-Ebene der Akte. */
  folderSlug: string;
  type: string;
  size: string;
  updatedAt: string;
  locked?: boolean;
  storageFileId?: string;
  /** Vor dem Mitarbeiter selbst verborgen (HR sieht die Datei weiterhin). */
  hiddenFromEmployee?: boolean;
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
  // Ausweis, Reisepass und Aufenthaltstitel waren drei getrennte Felder. Ein
  // Betrieb braucht sie nicht nebeneinander — es zählt, dass *ein* gültiges
  // Ausweisdokument vorliegt. Deshalb ein Feld, und `multiple`, damit die
  // Dateien aus den drei alten Ordnern nebeneinander bestehen bleiben
  // (mehrseitige Dokumente passen ohnehin besser so).
  //
  // `legacyLabels`: Ordner früherer Felder. Bereits abgelegte Dateien liegen
  // weiterhin dort und werden hier mit angezeigt; neue landen im neuen Ordner.
  {
    key: "ausweisdokument",
    label: "Ausweisdokument",
    multiple: true,
    legacyLabels: ["Ausweis", "Reisepass", "Aufenthaltstitel"],
  },
  { key: "fuehrerschein", label: "Führerschein", multiple: false },
  { key: "arbeitserlaubnis", label: "Arbeitserlaubnis", multiple: false },
  { key: "erste-hilfe-nachweis", label: "Erste-Hilfe-Nachweis", multiple: false },
  { key: "gesundheitszeugnis", label: "Gesundheitszeugnis (Lebensmittel)", multiple: false },
  { key: "zusatzfuehrerschein", label: "Zusatzführerschein", multiple: true },
] as const satisfies readonly {
  key: string;
  label: string;
  multiple: boolean;
  legacyLabels?: readonly string[];
}[];

/** Ordnernamen, aus denen ein Feld seine Dateien bezieht — inkl. der zusammengefassten Vorgänger. */
export function employeeDocumentSlotFolders(
  slot: (typeof EMPLOYEE_DOCUMENT_SLOTS)[number],
): readonly string[] {
  return [slot.label, ...("legacyLabels" in slot ? slot.legacyLabels : [])];
}

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
  /** Erster Abruf durch den Mitarbeiter selbst; `null` = noch nicht geöffnet. */
  firstViewedAt?: string | null;
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
  /** Datei-ID der Antwort — für Ansehen/Herunterladen im Detail-Drawer. */
  responseFileId?: string;
  responseFileName?: string;
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
  /** Mutterschutz-Kennzeichnung — eigener Berechtigungsbereich "mutterschutz", nicht Teil von sensitiveData. */
  maternityProtectionActive: boolean;
  maternityProtectionNote: string;
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
  /** Primäres Team — abgeleitet aus `teams[0]`, für Stellen (u. a. die own/team-Berechtigungsscopes), die weiterhin nur einen String erwarten. */
  team: string;
  /**
   * Alle zugeordneten Teams (`TenantTeamMember`) — "Mehrere Teams pro
   * Mitarbeiter", analog zu `locations`. Optional statt Pflichtfeld, damit
   * nicht jede `Employee`-Konstruktion im Code sofort brechen muss: nur die
   * Stellen, die tatsächlich die Mitgliedschaften abfragen
   * (`getEmployeeForTenant`, `getEmployeesForTenant`), befüllen es.
   */
  teams?: string[];
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
  /** App-Zugang für diesen Betrieb gesperrt (M2); `null`/fehlend = frei. */
  appAccessLockedAt?: string | null;
  appAccessLockReason?: string;
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
  vacationCarryover: number;
  /** Verfallsdatum des Übertrags (YYYY-MM-DD) und Zeitpunkt des Hinweises an den Mitarbeiter. */
  vacationCarryoverExpiresAt?: string | null;
  vacationCarryoverRemindedAt?: string | null;
  vacationManualCorrection: number;
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

/** Platzhalter für Felder ohne Leserecht (siehe lib/employee-service.ts). */
const REDACTED_VALUE = "•••";

export const employeeProfileFields = [
  "birthDate",
  "privateAddress",
  "phone",
  "taxId",
  "socialSecurityNumber",
  "healthInsurance",
  "iban",
  "emergencyContact",
  "weeklyHours",
  "startDate",
] as const;

export type EmployeeProfileField = (typeof employeeProfileFields)[number];

/**
 * Fehlende Angaben der Personalakte ("Akte vollständig"). Redigierte Felder
 * (ohne Leserecht) zählen weder als vorhanden noch als fehlend.
 */
export function employeeProfileGaps(employee: Employee) {
  const values: Record<EmployeeProfileField, string | boolean> = {
    birthDate: employee.birthDate,
    privateAddress: employee.privateAddress,
    phone: employee.phone,
    taxId: employee.taxId,
    socialSecurityNumber: employee.socialSecurityNumber,
    healthInsurance: employee.healthInsurance,
    iban: employee.iban,
    emergencyContact: employee.emergencyContacts.length > 0,
    weeklyHours: employee.weeklyHours,
    startDate: employee.startDate,
  };
  const known = employeeProfileFields.filter((field) => values[field] !== REDACTED_VALUE);
  const missing = known.filter((field) => {
    const value = values[field];

    return typeof value === "boolean" ? !value : !value.trim();
  });

  return {
    missing,
    total: known.length,
    percent: known.length ? Math.round(((known.length - missing.length) / known.length) * 100) : 100,
  };
}

/** Jahre seit Eintritt (Bruchteil), `null` ohne gültiges Datum. */
export function yearsSince(startDate: string, today = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);

  if (!match) {
    return null;
  }

  const start = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  return Math.max(0, (today.getTime() - start) / (365.25 * 86_400_000));
}
