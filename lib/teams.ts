export type TeamMember = {
  id?: string;
  employeeId?: string;
  initials: string;
  name: string;
  location: string;
  role: string;
  contract: string;
  status: "on-duty" | "vacation";
  isLead?: boolean;
};

export type TeamFileFolder = {
  accessRoleIds?: string[];
  pinned?: boolean;
  name: string;
  fileCount: number;
  locked?: boolean;
  path?: string;
};

export type TeamFile = {
  version?: number;
  name: string;
  folder: string;
  /** Ordnerpfad (TenantFile.folderSlug); leer = Home-Ebene des Teams. */
  folderSlug: string;
  updatedAt: string;
  size: string;
  type: string;
  locked?: boolean;
  storageFileId?: string;
};

export type Team = {
  id: string;
  dbId?: string;
  key?: string;
  name: string;
  description?: string;
  locations: string;
  colorClassName: string;
  members: TeamMember[];
  lead: TeamMember;
  fileFolders: TeamFileFolder[];
  files: TeamFile[];
};
