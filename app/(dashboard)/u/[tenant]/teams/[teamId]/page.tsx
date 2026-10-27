import AuditLogPanel from "@/components/AuditLogPanel";
import AddTeamMembersButton from "@/components/AddTeamMembersButton";
import { UnsavedChangesGuard } from "@/components/EditSafety";
import OwnerFilesTab from "@/components/OwnerFilesTab";
import {
  LocationMultiSelectDropdown,
  TeamColorButtons,
} from "@/components/TeamEditControls";
import {
  RemoveTeamMemberForm,
  TeamEditFormAndBar,
  TeamHeaderActions,
  TeamLeaderEditorForm,
  TeamMemberAssignmentForm,
} from "@/components/TeamActionForms";
import TeamRoleEditorButton from "@/components/TeamRoleEditorButton";
import { getAuditLogsForEntity } from "@/lib/audit";
import { type FileUploadOptions } from "@/lib/files";
import { getFileUploadOptions } from "@/lib/files-server";
import { getLocationsForTenant } from "@/lib/location-service";
import {
  getAssignableEmployees,
  getTeamForTenant,
} from "@/lib/team-service";
import { type Team, type TeamMember } from "@/lib/teams";
import { hasPermissionLevel } from "@/lib/roles";
import { getTenantCapabilities, withAccessRedirect } from "@/lib/tenant-access";
import TeamMembersTable, { type TeamMemberRow } from "@/components/dashboard/teams/TeamMembersTable";
import { DbCard, avatarColor, secondaryClass, smallActionClass } from "@/components/dashboard/ui";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { type Employee } from "@/lib/employees";
import { paletteHex } from "@/lib/org-options";
import { ChevronLeft, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

type T = Awaited<ReturnType<typeof getTranslations>>;

export async function generateMetadata({
  params,
}: PageProps<"/u/[tenant]/teams/[teamId]">) {
  const { tenant, teamId } = await params;
  const team = await getTeamForTenant(tenant, teamId);

  return {
    title: team?.name ?? "Teams",
  };
}

function TeamMetricCard({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: number;
  caption: string;
  tone?: "success" | "teal" | "danger";
}) {
  const color = { success: "text-[#2f7a4a]", teal: "text-[#16676f]", danger: "text-[#b4332a]" };

  return (
    <DbCard className="db-insight flex flex-col gap-2 p-[18px]">
      <span className="text-[13px] font-medium text-[#6e6e6b]">{label}</span>
      <span className={`font-display text-[30px] leading-none font-semibold tracking-[-1px] ${tone ? color[tone] : ""}`}>{value}</span>
      <span className="text-[13px] text-[#6e6e6b]">{caption}</span>
    </DbCard>
  );
}

function EditableTextField({
  id,
  label,
  name,
  value,
  required = true,
}: {
  id: string;
  label: string;
  name: string;
  value: string;
  required?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} name={name} className="input bg-white" defaultValue={value} required={required} />
    </div>
  );
}

function memberStatus(member: TeamMember, employee?: Employee): TeamMemberRow["status"] {
  if (employee?.status === "vacation" || employee?.status === "absent") return employee.status;
  if (employee) return "active";

  return member.status === "vacation" ? "vacation" : "active";
}

function TeamFilesSection({
  team,
  tenant,
  teamHref,
  uploadOptions,
  canManageFiles,
  canDeleteFiles,
  activeFolder,
  t,
}: {
  team: Team;
  tenant: string;
  teamHref: string;
  uploadOptions: FileUploadOptions;
  canManageFiles: boolean;
  canDeleteFiles: boolean;
  activeFolder?: string;
  t: T;
}) {
  return (
    <div className="mt-3.5">
      <OwnerFilesTab
        tenant={tenant}
        ownerType="team"
        ownerId={team.dbId ?? ""}
        basePath={teamHref}
        folders={team.fileFolders}
        files={team.files}
        uploadOptions={uploadOptions}
        canManageFiles={canManageFiles}
        canDeleteFiles={canDeleteFiles}
        initialFolderPath={activeFolder ?? ""}
        emptyLabel={t("noFilesForTeam")}
      />
    </div>
  );
}

export default async function TeamDetailPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/teams/[teamId]">) {
  const { tenant, teamId } = await params;
  const { edit, tab, folder } = await searchParams;
  const activeFolder = typeof folder === "string" ? folder : undefined;
  const t = await getTranslations("TeamDetailPage");
  const team = await withAccessRedirect(tenant, () => getTeamForTenant(tenant, teamId));

  if (!team) {
    notFound();
  }

  const [assignableEmployees, capabilities, uploadOptions, locations, employees] = await Promise.all([
    getAssignableEmployees(tenant, team.id),
    getTenantCapabilities(tenant),
    getFileUploadOptions(tenant),
    // Fehlende "locations:read"-Berechtigung soll den Standort-Picker nur auf
    // "keine Auswahl" zurückfallen lassen, nicht die ganze Seite sperren
    // (gleiche Absicherung wie auf der Teams-Übersicht für CreateTeamButton).
    getLocationsForTenant(tenant).catch(() => null).then((v) => v ?? []),
    // Status und E-Mail kommen aus der Personalakte; ohne Leserecht bleibt
    // es beim gespeicherten Teamstatus.
    getEmployeesForTenant(tenant).catch(() => null).then((v) => v ?? []),
  ]);
  const canManage = hasPermissionLevel(capabilities.teams.level, "write");
  const canDeleteTeam = capabilities.teams.canDelete;
  const canViewAudit = capabilities.teams.canViewAudit;
  const canManageFiles = capabilities.teams.canUploadFiles;
  const canDeleteFiles = canManageFiles && capabilities.files.canDelete;
  const canOpenProfiles = hasPermissionLevel(capabilities.employees.level, "read");
  const isFilesTab = tab === "files";
  const isHomeTab = !isFilesTab;
  const isEditing = edit === "1" && isHomeTab && canManage;
  const teamHref = `/u/${tenant}/teams/${team.id}`;
  const auditEntries = canViewAudit
    ? await getAuditLogsForEntity({
        tenantSlug: tenant,
        entityType: "team",
        entityId: team.dbId ?? team.id,
      })
    : [];
  const teamEditHref = `${teamHref}?edit=1`;
  const accent = paletteHex(team.colorClassName, "#2c64c9");
  const employeeByDbId = new Map(employees.map((employee) => [employee.dbId ?? employee.id, employee]));
  const locationColor = new Map(locations.map((location) => [location.name, paletteHex(location.accentClassName, "#9a9a96")]));
  const teamLocations = team.locations
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const rows: TeamMemberRow[] = team.members.map((member) => {
    const employee = member.employeeId ? employeeByDbId.get(member.employeeId) : undefined;

    return {
      key: member.id ?? `${team.dbId}-${member.initials}`,
      name: member.name,
      initials: member.initials,
      isLead: Boolean(member.isLead),
      location: employee?.location || member.location,
      locationColor: locationColor.get(employee?.location || member.location) ?? "#9a9a96",
      role: member.role,
      contract: employee?.contract || member.contract,
      status: memberStatus(member, employee),
      href: canOpenProfiles && employee ? `/u/${tenant}/employees/${employee.id}` : undefined,
      actions: canManage ? (
        <>
          <TeamRoleEditorButton tenant={tenant} teamId={team.dbId ?? ""} teamHandle={team.id} member={member} />
          {!member.isLead && member.id && <RemoveTeamMemberForm tenant={tenant} team={team} member={member} />}
        </>
      ) : undefined,
    };
  });
  const countBy = (status: TeamMemberRow["status"]) => rows.filter((row) => row.status === status).length;
  const memberLocationCount = new Set(rows.map((row) => row.location).filter(Boolean)).size;
  const leadMember = team.members.find((member) => member.isLead);
  const leadEmployee = leadMember?.employeeId ? employeeByDbId.get(leadMember.employeeId) : undefined;
  const tabClass = (active: boolean) =>
    `-mb-px inline-flex items-center gap-2 border-b-2 px-0.5 pb-3 text-[14.5px] no-underline ${
      active ? "border-ink font-semibold text-ink" : "border-transparent font-medium text-[#6e6e6b] hover:text-ink"
    }`;

  return (
    <>
      <UnsavedChangesGuard active={isEditing} />
      <nav aria-label={t("breadcrumb")} className="mb-[18px] flex items-center gap-2 text-[14px]">
        <Link href={`/u/${tenant}/teams`} className={`${secondaryClass} min-h-9 bg-white px-3 py-1.5 text-[13.5px]`}>
          <ChevronLeft size={15} />
          {t("backToTeams")}
        </Link>
        <span className="text-[#9a9a96]">/</span>
        <Link href={`/u/${tenant}/teams`} className="text-[#6e6e6b] no-underline hover:text-ink">
          {t("teams")}
        </Link>
        <span className="text-[#9a9a96]">/</span>
        <span className="truncate font-medium">{team.name}</span>
      </nav>

      <TeamEditFormAndBar tenant={tenant} teamId={team.dbId ?? ""} cancelHref={teamHref} isEditing={isEditing}>
        <DbCard className="db-hero relative mb-5 overflow-hidden p-0">
          <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />
          <div className="flex flex-wrap items-start gap-5 px-7 pt-6 pb-5">
            {isEditing ? (
              <div className="flex min-w-[240px] flex-1 flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditableTextField id="team-name" label={t("teamName")} name="name" value={team.name} />
                  <LocationMultiSelectDropdown defaultLocations={teamLocations} options={locations.map((location) => location.name)} />
                </div>
                <EditableTextField id="team-description" label={t("description")} name="description" value={team.description ?? ""} required={false} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TeamColorButtons defaultValue={team.colorClassName} />
                </div>
              </div>
            ) : (
              <>
                <span
                  className="flex size-[64px] shrink-0 items-center justify-center rounded-[16px] text-white shadow-[0_10px_28px_rgba(0,0,0,0.14)]"
                  style={{ background: accent }}
                >
                  <Users size={26} />
                </span>
                <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
                  <h1 className="m-0 flex flex-wrap items-center gap-2.5 font-display text-[clamp(26px,3vw,34px)] leading-[1.1] font-semibold tracking-[-1px]">
                    {team.name}
                    <span className="rounded-[6px] bg-[#f2f1ed] px-2 py-[3px] font-sans text-[12px] font-semibold tracking-normal text-[#3d3d3a]">
                      {t("memberCount", { count: team.members.length })}
                    </span>
                  </h1>
                  {team.description && <span className="text-[14px] text-[#6e6e6b]">{team.description}</span>}
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {teamLocations.length === 0 && <span className="text-[13px] text-[#9a9a96]">{t("noLocations")}</span>}
                    {teamLocations.slice(0, 3).map((name) => (
                      <span key={name} className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#ecebe7] bg-white px-2 py-[3px] text-[12.5px]">
                        <span className="size-[7px] rounded-[2px]" style={{ background: locationColor.get(name) ?? "#9a9a96" }} />
                        {name}
                      </span>
                    ))}
                    {teamLocations.length > 3 && (
                      <span title={teamLocations.slice(3).join(", ")} className="rounded-[7px] bg-[rgba(139,111,224,0.12)] px-2 py-[3px] text-[12.5px] font-semibold text-[#6b4fc4]">
                        +{teamLocations.length - 3}
                      </span>
                    )}
                  </span>
                </div>
                <TeamHeaderActions teamName={team.name} teamEditHref={teamEditHref} canDeleteTeam={canDeleteTeam} canManage={canManage} />
              </>
            )}
          </div>
          {!isEditing && (
            <div className="flex gap-6 border-t border-[#f0efeb] px-7 pt-3.5">
              <Link href={teamHref} className={tabClass(isHomeTab)}>
                {t("tabHome")}
              </Link>
              <Link href={`${teamHref}?tab=files`} className={tabClass(isFilesTab)}>
                {t("tabFiles")}
                <span className="rounded-[6px] bg-[#f2f1ed] px-1.5 text-[12px] font-semibold text-[#6e6e6b]">
                  {team.fileFolders.length + team.files.length}
                </span>
              </Link>
            </div>
          )}
        </DbCard>
      </TeamEditFormAndBar>

      {isFilesTab ? (
        <TeamFilesSection
          team={team}
          tenant={tenant}
          teamHref={teamHref}
          uploadOptions={uploadOptions}
          canManageFiles={canManageFiles}
          canDeleteFiles={canDeleteFiles}
          activeFolder={activeFolder}
          t={t}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {!isEditing && (
            <section className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
              <TeamMetricCard label={t("members")} value={rows.length} caption={t("atLocations", { count: memberLocationCount })} />
              <TeamMetricCard label={t("onDuty")} value={countBy("active")} caption={t("perPersonnelFile")} tone="success" />
              <TeamMetricCard label={t("onVacation")} value={countBy("vacation")} caption={t("currentlyOnVacation")} tone="teal" />
              <TeamMetricCard label={t("absent")} value={countBy("absent")} caption={t("sickOrAbsent")} tone="danger" />
            </section>
          )}

          {isEditing ? (
            <TeamLeaderEditorForm team={team} tenant={tenant} />
          ) : (
            <DbCard className="flex flex-wrap items-center gap-3.5 px-[18px] py-3.5">
              {leadMember ? (
                <span
                  className="flex size-[52px] shrink-0 items-center justify-center rounded-full text-[15px] font-semibold text-white ring-2 ring-white ring-offset-2"
                  style={{ background: avatarColor(leadMember.name), ["--tw-ring-offset-color" as string]: accent }}
                >
                  {leadMember.initials}
                </span>
              ) : (
                <span className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-[#f2f1ed] text-[#9a9a96]">
                  <UserRound size={22} />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-mono text-[10px] tracking-[0.12em] text-[#6e6e6b] uppercase">{t("teamLead")}</span>
                <span className="font-display text-[17px] font-semibold tracking-[-0.3px]">{leadMember?.name ?? t("noTeamLead")}</span>
                {leadMember && (
                  <span className="truncate text-[13px] text-[#6e6e6b]">
                    {[leadMember.role, leadEmployee?.location || leadMember.location].filter(Boolean).join(" · ")}
                    {leadEmployee?.email && (
                      <>
                        {" · "}
                        <a href={`mailto:${leadEmployee.email}`} className="text-ink no-underline hover:underline">
                          {leadEmployee.email}
                        </a>
                      </>
                    )}
                  </span>
                )}
              </div>
              {canManage && team.members.length > 0 && (
                <Link href={teamEditHref} className={smallActionClass + " bg-white"}>
                  {t("editTeamLead")}
                </Link>
              )}
            </DbCard>
          )}

          <TeamMembersTable
            rows={rows}
            editor={isEditing ? <TeamMemberAssignmentForm team={team} tenant={tenant} assignableEmployees={assignableEmployees} /> : undefined}
            toolbar={
              !isEditing && canManage ? (
                <AddTeamMembersButton
                  tenant={tenant}
                  teamId={team.dbId ?? ""}
                  teamHandle={team.id}
                  defaultRole={team.name}
                  variant="cta"
                  employees={assignableEmployees.map((member) => ({
                    id: member.employeeId ?? "",
                    initials: member.initials,
                    name: member.name,
                    employeeNumber: "",
                    location: member.location,
                    team: "",
                    role: member.role,
                  }))}
                />
              ) : undefined
            }
          />
        </div>
      )}

      {canViewAudit && (
        <div className="mt-4">
          <AuditLogPanel entries={auditEntries} />
        </div>
      )}
    </>
  );
}
