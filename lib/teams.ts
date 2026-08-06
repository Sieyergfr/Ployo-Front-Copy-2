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
};
