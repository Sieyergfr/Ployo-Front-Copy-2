import type { OpeningHoursDay } from "@/lib/opening-hours";

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
  path?: string;
};

export type LocationFile = {
  name: string;
  folder: string;
  /** Ordnerpfad (TenantFile.folderSlug); leer = Home-Ebene des Standorts. */
  folderSlug: string;
  updatedAt: string;
  size: string;
  type: string;
  locked?: boolean;
  storageFileId?: string;
};

export type Location = {
  id: string;
  dbId?: string;
  key?: string;
  kind: string;
  name: string;
  address: string;
  addressFields?: {
    street: string;
    houseNumber: string;
    postalCode: string;
    city: string;
    careOf: string;
    country: string;
  };
  employeeCount: number;
  activeToday: number;
  shiftCount: number;
  openPositions: number;
  /** Effektive Öffnungszeiten (eigene Angabe, sonst Mandanten-Standard, sonst eingebauter Standard). */
  openingHours: OpeningHoursDay[];
  /** true = Standort hat keine eigene Öffnungszeiten hinterlegt, übernimmt den Mandanten-Standard. */
  usesDefaultOpeningHours: boolean;
  /** Eigene Mindestbesetzung dieses Standorts; null = Unternehmensvorgabe gilt. */
  shiftMinStaffing: number | null;
  /** Tatsächlich angewandte Mindestbesetzung (eigener Wert, sonst Unternehmensvorgabe). */
  effectiveMinStaffing: number;
  utilization: string;
  utilizationCaption: string;
  status: LocationStatus;
  accentClassName: string;
  /** Kontakt-E-Mail des Standorts (M5) — unabhängig von der Leitung. */
  contactEmail?: string;
  lead: {
    /** Echte Mitarbeiter-ID der Standortleitung (Fremdschlüssel), falls gesetzt. */
    employeeId: string | null;
    initials: string;
    name: string;
    phone: string;
    email: string;
  };
  team: LocationTeamMember[];
  activity: LocationActivity[];
  fileFolders: LocationFileFolder[];
  files: LocationFile[];
};

