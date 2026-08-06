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
  updatedAt: string;
  size: string;
  type: string;
  locked?: boolean;
  storageFileId?: string;
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

