import { recordTenantAudit } from "@/lib/audit";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { type Employee } from "@/lib/employees";
import { prisma } from "@/lib/prisma";
import { type Team, type TeamMember } from "@/lib/teams";
import { requireTenantAccess } from "@/lib/tenant-access";

export type TeamMetric = {
  label: string;
  value: string;
  caption: string;
  tone?: "danger";
};

type TeamRecord = {
  id: string;
  key: string;
  name: string;
  description: string;
  locations: string;
  colorClassName: string;
  members: Array<{
    id: string;
    employeeId: string;
    initials: string;
    name: string;
    location: string;
    role: string;
    contract: string;
    status: string;
    isLead: boolean;
  }>;
};

function normalizeTeamKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function createUniqueTeamKey(input: {
  tenantId: string;
  name: string;
  excludeTeamId?: string;
}) {
  const keyBase = normalizeTeamKey(input.name) || "team";
  let key = keyBase;
  let suffix = 2;

  while (
    await prisma.tenantTeam.findFirst({
      where: {
        tenantId: input.tenantId,
        key,
        id: input.excludeTeamId ? { not: input.excludeTeamId } : undefined,
      },
      select: { id: true },
    })
  ) {
    key = `${keyBase}-${suffix}`;
    suffix += 1;
  }

  return key;
}

function formStatus(value: string): TeamMember["status"] {
  return value === "vacation" ? "vacation" : "on-duty";
}

function employeeStatusToTeamStatus(employee: Employee): TeamMember["status"] {
  return employee.status === "vacation" ? "vacation" : "on-duty";
}

function employeeToMember(employee: Employee, role = employee.role): Omit<TeamMember, "id"> & {
  employeeId: string;
} {
  return {
    employeeId: employee.dbId ?? employee.id,
    initials: employee.initials,
    name: employee.name,
    location: employee.location,
    role,
    contract: employee.contract,
    status: employeeStatusToTeamStatus(employee),
  };
}

function toTeam(record: TeamRecord): Team {
  const members = record.members.map((member) => ({
    id: member.id,
    employeeId: member.employeeId,
    initials: member.initials,
    name: member.name,
    location: member.location,
    role: member.role,
    contract: member.contract,
    status: formStatus(member.status),
    isLead: member.isLead,
  }));
  const lead = members.find((member) => member.isLead) ?? members[0] ?? {
    id: "",
    employeeId: "",
    initials: "--",
    name: "Keine Teamleitung",
    location: "",
    role: "",
    contract: "",
    status: "on-duty" as const,
    isLead: true,
  };

  return {
    id: record.key,
    dbId: record.id,
    key: record.key,
    name: record.name,
    description: record.description,
    locations: record.locations,
    colorClassName: record.colorClassName,
    members,
    lead,
  };
}

export async function getTenantIdForTeams(tenantSlug: string) {
  return (await requireTenantAccess(tenantSlug, "teams", "read")).tenantId;
}

export async function getTeamsForTenant(tenantSlug: string) {
  const tenantId = await getTenantIdForTeams(tenantSlug);

  if (!tenantId) {
    return null;
  }

  const records = await prisma.tenantTeam.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    include: {
      members: {
        orderBy: [{ isLead: "desc" }, { createdAt: "asc" }],
      },
    },
  });

  return records.map(toTeam);
}

export async function getTeamForTenant(tenantSlug: string, teamHandle: string) {
  const tenantId = await getTenantIdForTeams(tenantSlug);

  if (!tenantId) {
    return null;
  }

  const record = await prisma.tenantTeam.findFirst({
    where: {
      key: teamHandle,
      tenantId,
    },
    include: {
      members: {
        orderBy: [{ isLead: "desc" }, { createdAt: "asc" }],
      },
    },
  });

  return record ? toTeam(record) : null;
}

export function getTeamMetrics(teams: Team[]): TeamMetric[] {
  const totalMembers = teams.reduce((total, team) => total + team.members.length, 0);
  const average = teams.length > 0 ? (totalMembers / teams.length).toFixed(1) : "0.0";

  return [
    {
      label: "Teams gesamt",
      value: teams.length.toString(),
      caption: "aktive Gruppen",
    },
    {
      label: "Mitglieder",
      value: totalMembers.toString(),
      caption: "alle Standorte",
    },
    {
      label: "Durchschnitt",
      value: average,
      caption: "Mitglieder je Team",
    },
    {
      label: "Vakante Stellen",
      value: "2",
      caption: "Muenchen - Fruehschicht",
      tone: "danger",
    },
  ];
}

export async function getAssignableEmployees(tenantSlug: string, teamHandle: string) {
  const team = await getTeamForTenant(tenantSlug, teamHandle);

  if (!team) {
    return [];
  }

  const assignedEmployeeIds = new Set(team.members.map((member) => member.employeeId));

  const employees = (await getEmployeesForTenant(tenantSlug)) ?? [];

  return employees
    .filter((employee) => !assignedEmployeeIds.has(employee.dbId ?? employee.id))
    .map((employee) => employeeToMember(employee));
}

export async function requireTeamManager(tenantSlug: string) {
  return requireTenantAccess(tenantSlug, "teams", "write");
}

async function recordTeamAudit(
  access: Awaited<ReturnType<typeof requireTeamManager>>,
  action: string,
  teamId: string,
  detail: string,
) {
  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action,
    source: "Teams",
    entityType: "team",
    entityId: teamId,
    detail,
  });
}

export async function createTenantTeam(input: {
  tenantSlug: string;
  name: string;
  description: string;
  locations: string[];
  colorClassName: string;
  leadEmployeeId?: string;
}) {
  const access = await requireTeamManager(input.tenantSlug);
  const key = await createUniqueTeamKey({
    tenantId: access.tenantId,
    name: input.name,
  });

  const employees = (await getEmployeesForTenant(input.tenantSlug)) ?? [];
  const leadEmployee = employees.find(
    (employee) => employee.dbId === input.leadEmployeeId,
  );
  const leadMember = leadEmployee ? employeeToMember(leadEmployee, input.name) : null;

  const team = await prisma.tenantTeam.create({
    data: {
      tenantId: access.tenantId,
      key,
      name: input.name.trim(),
      description: input.description.trim(),
      locations: input.locations.join(", "),
      colorClassName: input.colorClassName,
      members: leadMember
        ? {
            create: {
              ...leadMember,
              isLead: true,
            },
          }
        : undefined,
    },
  });

  await recordTeamAudit(access, "Team angelegt", team.id, team.name);

  return team;
}

export async function updateTenantTeam(input: {
  tenantSlug: string;
  teamId: string;
  name: string;
  locations: string[];
  colorClassName: string;
}) {
  const access = await requireTeamManager(input.tenantSlug);
  const key = await createUniqueTeamKey({
    tenantId: access.tenantId,
    name: input.name,
    excludeTeamId: input.teamId,
  });

  const team = await prisma.tenantTeam.update({
    where: {
      id: input.teamId,
      tenantId: access.tenantId,
    },
    data: {
      key,
      name: input.name.trim(),
      locations: input.locations.join(", "),
      colorClassName: input.colorClassName,
    },
  });

  await recordTeamAudit(access, "Team geändert", team.id, team.name);

  return team;
}

export async function deleteTenantTeam(input: {
  tenantSlug: string;
  teamId: string;
}) {
  const access = await requireTeamManager(input.tenantSlug);

  const team = await prisma.tenantTeam.delete({
    where: {
      id: input.teamId,
      tenantId: access.tenantId,
    },
  });

  await recordTeamAudit(access, "Team gelöscht", team.id, team.name);
}

export async function setTenantTeamLead(input: {
  tenantSlug: string;
  teamId: string;
  memberId: string;
}) {
  const access = await requireTeamManager(input.tenantSlug);
  const member = await prisma.tenantTeamMember.findFirst({
    where: {
      id: input.memberId,
      team: {
        id: input.teamId,
        tenantId: access.tenantId,
      },
    },
    select: { id: true },
  });

  if (!member) {
    throw new Error("TEAM_MEMBER_NOT_FOUND");
  }

  await prisma.$transaction([
    prisma.tenantTeamMember.updateMany({
      where: { teamId: input.teamId },
      data: { isLead: false },
    }),
    prisma.tenantTeamMember.update({
      where: { id: input.memberId },
      data: { isLead: true },
    }),
  ]);
}

export async function addTenantTeamMember(input: {
  tenantSlug: string;
  teamId: string;
  employeeId: string;
  role: string;
}) {
  const access = await requireTeamManager(input.tenantSlug);
  const employees = (await getEmployeesForTenant(input.tenantSlug)) ?? [];
  const employee = employees.find((item) => item.dbId === input.employeeId);

  if (!employee) {
    throw new Error("EMPLOYEE_NOT_FOUND");
  }

  const team = await prisma.tenantTeam.findFirst({
    where: {
      id: input.teamId,
      tenantId: access.tenantId,
    },
    select: { id: true },
  });

  if (!team) {
    throw new Error("TEAM_NOT_FOUND");
  }

  await prisma.tenantTeamMember.create({
    data: {
      teamId: input.teamId,
      ...employeeToMember(employee, input.role.trim() || employee.role),
    },
  });
}

export async function removeTenantTeamMember(input: {
  tenantSlug: string;
  teamId: string;
  memberId: string;
}) {
  const access = await requireTeamManager(input.tenantSlug);
  const member = await prisma.tenantTeamMember.findFirst({
    where: {
      id: input.memberId,
      team: {
        id: input.teamId,
        tenantId: access.tenantId,
      },
    },
    select: { id: true, isLead: true },
  });

  if (!member) {
    throw new Error("TEAM_MEMBER_NOT_FOUND");
  }

  if (member.isLead) {
    throw new Error("TEAM_LEAD_CANNOT_BE_REMOVED");
  }

  await prisma.tenantTeamMember.delete({
    where: { id: input.memberId },
  });
}

export async function updateTenantTeamMember(input: {
  tenantSlug: string;
  teamId: string;
  memberId: string;
  role: string;
  isLead: boolean;
}) {
  const access = await requireTeamManager(input.tenantSlug);
  const member = await prisma.tenantTeamMember.findFirst({
    where: {
      id: input.memberId,
      team: {
        id: input.teamId,
        tenantId: access.tenantId,
      },
    },
    select: { id: true },
  });

  if (!member) {
    throw new Error("TEAM_MEMBER_NOT_FOUND");
  }

  if (input.isLead) {
    await setTenantTeamLead({
      tenantSlug: input.tenantSlug,
      teamId: input.teamId,
      memberId: input.memberId,
    });
  }

  await prisma.tenantTeamMember.update({
    where: { id: input.memberId },
    data: {
      role: input.role.trim(),
    },
  });
}
