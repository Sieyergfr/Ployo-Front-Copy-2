import { recordTenantAudit } from "@/lib/audit";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { type Employee } from "@/lib/employees";
import { canAccessFileAcl, getOptionalAreaFileAccess } from "@/lib/file-access";
import { mapTenantFileToFileItem } from "@/lib/files";
import { isKnownTeamColor } from "@/lib/org-options";
import { prisma } from "@/lib/prisma";
import { type Team, type TeamFile, type TeamFileFolder, type TeamMember } from "@/lib/teams";
import {
  assertTeamInScope,
  requireTenantAccess,
  resolveScopeFilter,
  type TenantAccess,
} from "@/lib/tenant-access";

function assertKnownTeamColor(colorClassName: string) {
  if (colorClassName && !isKnownTeamColor(colorClassName)) {
    throw new Error("Unbekannte Teamfarbe.");
  }
}

/**
 * Löst den "files"-Scope (own/team/all) für die am Team-Entity hängenden
 * Dateien auf — unabhängig vom "teams"-Bereich (dessen `canViewFiles`
 * weiterhin bestimmt, OB überhaupt Team-Dateien sichtbar sind; dieser Scope
 * bestimmt zusätzlich, für WELCHE Teams). "own" zeigt keine Team-Dateien
 * (das sind keine eigenen Daten), "team" nur die des eigenen Teams
 * (über `TenantTeamMember`, wie beim "team"-Scope anderer Bereiche), "all" alle.
 */
async function resolveFilesAreaScope(tenantSlug: string) {
  try {
    const access = await requireTenantAccess(tenantSlug, "files", "read");

    return await resolveScopeFilter(access);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return null;
    }

    throw error;
  }
}

function teamFilesVisible(
  filesScope: Awaited<ReturnType<typeof resolveFilesAreaScope>>,
  teamId: string,
) {
  if (!filesScope) {
    return false;
  }

  if (filesScope.type === "all") {
    return true;
  }

  if (filesScope.type === "team") {
    return filesScope.teamIds.includes(teamId);
  }

  return false;
}

/**
 * `TenantTeam.locations` ist eine Freitext-Liste (keine Relation) — ohne
 * diese Prüfung könnte ein direkter Server-Action-Aufruf beliebige Strings
 * setzen. Bewusst scope-frei (kein `requireTenantAccess` auf "locations"),
 * damit ein Team-Manager ohne Leserecht auf Standorte weiterhin Teams
 * anlegen/bearbeiten kann — nur zur Validierung, nicht für die Anzeige.
 */
async function assertKnownLocations(tenantId: string, locationNames: string[]) {
  const names = Array.from(
    new Set(locationNames.map((name) => name.trim()).filter(Boolean)),
  );

  if (names.length === 0) {
    return;
  }

  const found = await prisma.tenantLocation.findMany({
    where: { tenantId, name: { in: names } },
    select: { name: true },
  });
  const foundNames = new Set(found.map((location) => location.name));
  const unknown = names.filter((name) => !foundNames.has(name));

  if (unknown.length > 0) {
    throw new Error(`Unbekannte Standorte: ${unknown.join(", ")}.`);
  }
}

export type TeamMetric = {
  label: string;
  value: string;
  caption: string;
  tone?: "danger";
};

type TenantFileRecord = {
  id: string;
  displayName: string;
  originalName: string;
  folderName: string;
  folderSlug: string;
  ownerName: string;
  updatedAt: Date;
  createdAt: Date;
  sizeBytes: number;
  mimeType: string;
  extension: string;
  version: number;
  accessRoleIdsJson: unknown;
  accessUserIdsJson: unknown;
  parent?: { accessRoleIdsJson: unknown; accessUserIdsJson: unknown } | null;
};

type TenantFileFolderRecord = {
  id: string;
  name: string;
  path: string;
  ownerName: string;
  locked: boolean;
  updatedAt: Date;
  createdAt: Date;
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
  storageFiles?: TenantFileRecord[];
  storageFileFolders?: TenantFileFolderRecord[];
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

/** Verhindert doppelte Teamnamen pro Mandant, case-insensitiv (QA-Bug BUG-006, siehe lib/location-service.ts). */
async function assertUniqueTeamName(input: {
  tenantId: string;
  name: string;
  excludeTeamId?: string;
}) {
  const name = input.name.trim();

  if (!name) {
    return;
  }

  const existing = await prisma.tenantTeam.findFirst({
    where: {
      tenantId: input.tenantId,
      name: { equals: name, mode: "insensitive" },
      id: input.excludeTeamId ? { not: input.excludeTeamId } : undefined,
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error(`Ein Team mit dem Namen "${name}" existiert bereits.`);
  }
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
  const storedFiles: TeamFile[] = (record.storageFiles ?? []).map((file) => {
    const mapped = mapTenantFileToFileItem(file);

    return {
      name: mapped.name,
      folder: mapped.folder,
      folderSlug: mapped.folderSlug,
      updatedAt: mapped.updatedAt,
      size: mapped.size,
      type: mapped.type,
      locked: true,
      storageFileId: mapped.storageFileId,
    };
  });
  const files = storedFiles;
  const folderMap = new Map<string, TeamFileFolder>();

  // Schluessel ist der Ordner-PFAD, nicht der Name (siehe location-service.ts).
  for (const folder of record.storageFileFolders ?? []) {
    folderMap.set(folder.path, {
      name: folder.name,
      path: folder.path,
      fileCount: 0,
      locked: folder.locked,
    });
  }

  for (const file of storedFiles) {
    if (!file.folderSlug) {
      continue;
    }

    const current = folderMap.get(file.folderSlug);

    if (current) {
      current.fileCount += 1;
    } else {
      folderMap.set(file.folderSlug, {
        name: file.folder,
        path: file.folderSlug,
        fileCount: 1,
        locked: false,
      });
    }
  }

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
    fileFolders: Array.from(folderMap.values()),
    files,
  };
}

export async function getTenantIdForTeams(tenantSlug: string) {
  return (await requireTenantAccess(tenantSlug, "teams", "read")).tenantId;
}

/**
 * "assigned"-Scope für Teams: nur die Teams, denen die eigene
 * Personalakte über `TenantTeamMember` zugeordnet ist. "own"/"team" ergeben
 * für Teams (bisher) keinen Sinn — sicherheitshalber nichts treffen statt zu
 * raten, welches Team gemeint sein könnte.
 */
export async function teamScopeWhere(access: TenantAccess) {
  const scopeFilter = await resolveScopeFilter(access);

  if (scopeFilter.type === "all") {
    return { tenantId: access.tenantId };
  }

  if (scopeFilter.type === "assigned" && scopeFilter.area === "teams") {
    return { tenantId: access.tenantId, id: { in: scopeFilter.teamIds } };
  }

  return { tenantId: access.tenantId, id: "__none__" };
}

export async function getTeamsForTenant(tenantSlug: string) {
  const access = await requireTenantAccess(tenantSlug, "teams", "read");
  const where = await teamScopeWhere(access);
  const fileAccess = await getOptionalAreaFileAccess(tenantSlug, "teams");
  const filesScope = await resolveFilesAreaScope(tenantSlug);

  const records = await prisma.tenantTeam.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      members: {
        orderBy: [{ isLead: "desc" }, { createdAt: "asc" }],
      },
      files: {
        where: { status: "active" },
        orderBy: { updatedAt: "desc" },
        include: { parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } } },
      },
      fileFolders: {
        where: { status: "active" },
        orderBy: { name: "asc" },
      },
    },
  });

  return records.map((record) => {
    const filesVisible = fileAccess && teamFilesVisible(filesScope, record.id);

    return toTeam({
      ...record,
      storageFiles: filesVisible
        ? record.files.filter((file) => canAccessFileAcl(file.parent ?? file, fileAccess))
        : [],
      storageFileFolders: filesVisible ? record.fileFolders : [],
    });
  });
}

export async function getTeamForTenant(tenantSlug: string, teamHandle: string) {
  const access = await requireTenantAccess(tenantSlug, "teams", "read");
  const where = await teamScopeWhere(access);
  const fileAccess = await getOptionalAreaFileAccess(tenantSlug, "teams");
  const filesScope = await resolveFilesAreaScope(tenantSlug);

  const record = await prisma.tenantTeam.findFirst({
    where: {
      ...where,
      key: teamHandle,
    },
    include: {
      members: {
        orderBy: [{ isLead: "desc" }, { createdAt: "asc" }],
      },
      files: {
        where: { status: "active" },
        orderBy: { updatedAt: "desc" },
        include: { parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } } },
      },
      fileFolders: {
        where: { status: "active" },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!record) {
    return null;
  }

  const filesVisible = fileAccess && teamFilesVisible(filesScope, record.id);

  return toTeam({
    ...record,
    storageFiles: filesVisible
      ? record.files.filter((file) => canAccessFileAcl(file.parent ?? file, fileAccess))
      : [],
    storageFileFolders: filesVisible ? record.fileFolders : [],
  });
}

/**
 * Formt ein `Team` in das Schema um, das die Mobile-API unter
 * `/api/tenants/[tenant]/teams(/[teamHandle])` liefert. `Team.locations` ist
 * intern ein einzelner, mit ", " zusammengesetzter String (siehe
 * `createTenantTeam`/`updateTenantTeam`) — das Dashboard zeigt ihn direkt als
 * Text an, die App erwartet aber ein Array. Ebenso erwartet die App
 * `memberId`/`leadName`/`leadEmployeeId`, die es im internen `Team`-Typ
 * (`lead`, `member.id`) so nicht gibt.
 */
export function toTeamAdminPayload(team: Team) {
  const locations = team.locations
    .split(",")
    .map((location) => location.trim())
    .filter(Boolean);
  const hasRealLead = Boolean(team.lead?.employeeId);

  return {
    id: team.id,
    dbId: team.dbId ?? null,
    key: team.key ?? team.id,
    name: team.name,
    description: team.description ?? "",
    locations,
    colorClassName: team.colorClassName,
    leadEmployeeId: hasRealLead ? team.lead.employeeId : null,
    leadName: hasRealLead ? team.lead.name : null,
    members: team.members.map((member) => ({
      memberId: member.id ?? "",
      employeeId: member.employeeId ?? "",
      name: member.name,
      role: member.role,
      isLead: Boolean(member.isLead),
      location: member.location,
      contract: member.contract,
      status: member.status,
    })),
  };
}

/** `t` kommt aus dem Namespace "TeamMetrics" (next-intl) — bewusst nur als generische Funktionssignatur getippt, damit dieses lib-Modul next-intl nicht selbst importieren muss. */
export function getTeamMetrics(
  teams: Team[],
  t: (key: string) => string,
): TeamMetric[] {
  const totalMembers = teams.reduce((total, team) => total + team.members.length, 0);
  const average = teams.length > 0 ? (totalMembers / teams.length).toFixed(1) : "0.0";

  return [
    {
      label: t("teamsTotal"),
      value: teams.length.toString(),
      caption: t("activeGroups"),
    },
    {
      label: t("members"),
      value: totalMembers.toString(),
      caption: t("allLocations"),
    },
    {
      label: t("average"),
      value: average,
      caption: t("membersPerTeam"),
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
    .map((employee) => ({
      // `id` zusätzlich zu `employeeId`: für noch nicht zugeordnete Mitarbeiter
      // gibt es keine `TenantTeamMember`-Zeile, `id` ist hier also eindeutig
      // die Mitarbeiter-ID. Ohne dieses Feld kam die Auswahl in der App mit
      // lauter `undefined`-Werten an und ließ sich nicht auswählen.
      id: employee.dbId ?? employee.id,
      ...employeeToMember(employee),
    }));
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
  assertKnownTeamColor(input.colorClassName);

  const access = await requireTeamManager(input.tenantSlug);
  await assertKnownLocations(access.tenantId, input.locations);
  await assertUniqueTeamName({ tenantId: access.tenantId, name: input.name });
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
  assertKnownTeamColor(input.colorClassName);

  const access = await requireTeamManager(input.tenantSlug);
  await assertTeamInScope(access, input.teamId);
  await assertKnownLocations(access.tenantId, input.locations);
  await assertUniqueTeamName({
    tenantId: access.tenantId,
    name: input.name,
    excludeTeamId: input.teamId,
  });
  const key = await createUniqueTeamKey({
    tenantId: access.tenantId,
    name: input.name,
    excludeTeamId: input.teamId,
  });
  const current = await prisma.tenantTeam.findFirst({
    where: { id: input.teamId, tenantId: access.tenantId },
    select: { name: true },
  });
  const nextName = input.name.trim();

  const team = await prisma.tenantTeam.update({
    where: {
      id: input.teamId,
      tenantId: access.tenantId,
    },
    data: {
      key,
      name: nextName,
      locations: input.locations.join(", "),
      colorClassName: input.colorClassName,
    },
  });

  // TenantEmployee.team und TenantShift.team sind Freitext-Kopien des
  // Teamnamens — bei Umbenennung überall nachziehen (Schichten zusätzlich
  // über TenantShift.teamId, falls deren Text schon abgewichen war).
  if (current && current.name !== nextName) {
    await prisma.$transaction([
      prisma.tenantEmployee.updateMany({
        where: { tenantId: access.tenantId, team: current.name },
        data: { team: nextName },
      }),
      prisma.tenantShift.updateMany({
        where: {
          tenantId: access.tenantId,
          OR: [{ teamId: team.id }, { team: current.name }],
        },
        data: { team: nextName, teamId: team.id },
      }),
    ]);
  }

  await recordTeamAudit(access, "Team geändert", team.id, team.name);

  return team;
}

/**
 * `TenantEmployee.team` ist nur noch die Anzeige des Hauptteams (Quelle der
 * Zugehörigkeit ist `TenantTeamMember`, siehe resolveScopeFilter). Zeigt sie
 * bei einem dieser Mitarbeiter noch auf `teamName`, obwohl er dort kein
 * Mitglied mehr ist (Team gelöscht, Mitglied entfernt), rückt sein erstes
 * verbliebenes Team nach — sonst bleibt ein Name stehen, den es nicht mehr gibt.
 */
async function reassignPrimaryTeam(
  db: Pick<typeof prisma, "tenantEmployee" | "tenantTeamMember">,
  tenantId: string,
  employeeIds: string[],
  teamName: string,
) {
  const affected = employeeIds.length
    ? await db.tenantEmployee.findMany({
        where: { tenantId, id: { in: employeeIds }, team: teamName },
        select: { id: true },
      })
    : [];

  for (const employee of affected) {
    const next = await db.tenantTeamMember.findFirst({
      where: { employeeId: employee.id, team: { tenantId, name: { not: teamName } } },
      orderBy: { team: { name: "asc" } },
      select: { team: { select: { name: true } } },
    });

    await db.tenantEmployee.update({
      where: { id: employee.id },
      data: { team: next?.team.name ?? "" },
    });
  }
}

export async function deleteTenantTeam(input: {
  tenantSlug: string;
  teamId: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "teams", "read");

  if (!access.canDelete) {
    throw new Error("FORBIDDEN");
  }

  await assertTeamInScope(access, input.teamId);

  // Die Mitgliedschaften fallen per Cascade weg; die Freitext-Kopien des
  // Teamnamens (Hauptteam der Mitarbeiter, Team-Feld der Schichten) müssen
  // mit — sonst übernähme ein später gleichnamig angelegtes Team sie.
  const team = await prisma.$transaction(async (tx) => {
    const members = await tx.tenantTeamMember.findMany({
      where: { teamId: input.teamId, team: { tenantId: access.tenantId } },
      select: { employeeId: true },
    });
    // Vor dem Löschen, solange TenantShift.teamId noch gesetzt ist (danach
    // SetNull) — trifft so auch Schichten, deren Text schon abwich.
    await tx.tenantShift.updateMany({
      where: { tenantId: access.tenantId, teamId: input.teamId },
      data: { team: "" },
    });
    const deleted = await tx.tenantTeam.delete({
      where: {
        id: input.teamId,
        tenantId: access.tenantId,
      },
    });
    const memberIds = members.map((member) => member.employeeId);
    const formerMembers = await tx.tenantEmployee.findMany({
      where: { tenantId: access.tenantId, team: deleted.name },
      select: { id: true },
    });

    await reassignPrimaryTeam(
      tx,
      access.tenantId,
      Array.from(new Set([...memberIds, ...formerMembers.map((employee) => employee.id)])),
      deleted.name,
    );
    await tx.tenantShift.updateMany({
      where: { tenantId: access.tenantId, team: deleted.name },
      data: { team: "" },
    });

    return deleted;
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Team gelöscht",
    source: "Teams",
    entityType: "team",
    entityId: team.id,
    detail: team.name,
  });
}

export async function setTenantTeamLead(input: {
  tenantSlug: string;
  teamId: string;
  memberId: string;
}) {
  const access = await requireTeamManager(input.tenantSlug);
  await assertTeamInScope(access, input.teamId);
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
  await assertTeamInScope(access, input.teamId);
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
    select: { id: true, name: true },
  });

  if (!team) {
    throw new Error("TEAM_NOT_FOUND");
  }

  const member = employeeToMember(employee, input.role.trim() || employee.role);

  await prisma.$transaction([
    prisma.tenantTeamMember.create({
      data: {
        teamId: input.teamId,
        ...member,
      },
    }),
    // Wer noch kein Hauptteam hat, bekommt dieses als Anzeige — vorher blieb
    // das Feld leer, wenn jemand über die Team-Seite hinzugefügt wurde.
    prisma.tenantEmployee.updateMany({
      where: { id: member.employeeId, tenantId: access.tenantId, team: "" },
      data: { team: team.name },
    }),
  ]);
}

export async function removeTenantTeamMember(input: {
  tenantSlug: string;
  teamId: string;
  memberId: string;
}) {
  const access = await requireTeamManager(input.tenantSlug);
  await assertTeamInScope(access, input.teamId);
  const member = await prisma.tenantTeamMember.findFirst({
    where: {
      id: input.memberId,
      team: {
        id: input.teamId,
        tenantId: access.tenantId,
      },
    },
    select: { id: true, isLead: true, employeeId: true, team: { select: { name: true } } },
  });

  if (!member) {
    throw new Error("TEAM_MEMBER_NOT_FOUND");
  }

  if (member.isLead) {
    throw new Error("TEAM_LEAD_CANNOT_BE_REMOVED");
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenantTeamMember.delete({
      where: { id: input.memberId },
    });
    await reassignPrimaryTeam(tx, access.tenantId, [member.employeeId], member.team.name);
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
  await assertTeamInScope(access, input.teamId);
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
