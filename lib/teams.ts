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
  name: string;
  fileCount: number;
  locked?: boolean;
  path?: string;
};

export type TeamFile = {
  name: string;
  folder: string;
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
