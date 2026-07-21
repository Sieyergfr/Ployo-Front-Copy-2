import {
  addTeamMemberAction,
  deleteTeamAction,
  removeTeamMemberAction,
  setTeamLeadAction,
  updateTeamAction,
} from "@/app/(dashboard)/u/[tenant]/teams/actions";
import AuditLogPanel from "@/components/AuditLogPanel";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { UnsavedChangesGuard } from "@/components/EditSafety";
import FormSubmitButton from "@/components/FormSubmitButton";
import FloatingEditBar from "@/components/FloatingEditBar";
import {
  LocationMultiSelectDropdown,
  TeamColorButtons,
} from "@/components/TeamEditControls";
import TeamRoleEditorButton from "@/components/TeamRoleEditorButton";
import { getAuditLogsForEntity } from "@/lib/audit";
import {
  getAssignableEmployees,
  getTeamForTenant,
  getTeamMetrics,
  getTeamsForTenant,
} from "@/lib/team-service";
import { type Team, type TeamMember } from "@/lib/teams";
import {
  ArrowLeft,
  Pencil,
  Plus,
  UserRoundCheck,
  UserRoundMinus,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

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
  value: string;
  caption: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-[14px] border border-border bg-white px-[22px] pt-5 pb-4">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.6px] text-muted">
        {label}
      </div>
      <div
        className={`mt-4 mb-2 font-display text-[38px] font-semibold leading-none tracking-[-1.2px] ${
          tone === "danger" ? "text-danger" : "text-ink"
        }`}
      >
        {value}
      </div>
      <div className="text-[12px] text-muted">{caption}</div>
    </div>
  );
}

function StatusPill({ status }: { status: TeamMember["status"] }) {
  const isOnDuty = status === "on-duty";

  return (
    <div className="flex items-center gap-[7px]">
      <span
        className={`size-[7px] shrink-0 rounded-full ${
          isOnDuty ? "bg-success" : "bg-muted"
        }`}
      />
      <span
        className={`text-[12.5px] ${isOnDuty ? "text-success" : "text-muted"}`}
      >
        {isOnDuty ? "Im Dienst" : "Urlaub"}
      </span>
    </div>
  );
}

function ContractBadge({ children }: { children: string }) {
  return (
    <span className="inline-block rounded-[7px] border border-border-light px-[9px] py-[3px] text-[11.5px] text-[#5C6B7A]">
      {children}
    </span>
  );
}

function EditableTextField({
  id,
  label,
  name,
  value,
}: {
  id: string;
  label: string;
  name: string;
  value: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} name={name} className="input bg-white" defaultValue={value} required />
    </div>
  );
}

function teamAccentTextClass(team: Team) {
  const colors: Record<string, string> = {
    empfang: "text-[#7A3C9C]",
    logistik: "text-[#1D8A65]",
    service: "text-[#2A5BC9]",
    verkauf: "text-[#C9622A]",
  };

  return colors[team.key ?? team.id] ?? "text-muted";
}

function MemberRow({
  member,
  team,
  tenant,
  isEditing,
}: {
  member: TeamMember;
  team: Team;
  tenant: string;
  isEditing: boolean;
}) {
  const removeMemberFormId = member.id ? `remove-team-member-${member.id}` : undefined;

  return (
    <div className="grid items-center gap-3.5 border-t border-border-soft px-6 py-[13px] [grid-template-columns:2fr_120px_1.2fr_130px_110px_150px]">
      <div className="flex min-w-0 items-center gap-[11px]">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
          {member.initials}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-ink">
            {member.name}
          </div>
          {member.isLead && (
            <div className={`mt-0.5 font-mono text-[9.5px] ${teamAccentTextClass(team)}`}>
              Teamleitung
            </div>
          )}
        </div>
      </div>
      <div className="text-[13px] text-ink">{member.location}</div>
      <div className="text-[13px] text-muted-2">{member.role}</div>
      <div>
        <ContractBadge>{member.contract}</ContractBadge>
      </div>
      <StatusPill status={member.status} />
      <div className="flex items-center justify-end gap-2">
        {isEditing && !member.isLead && member.id && (
          <form id={removeMemberFormId} action={removeTeamMemberAction}>
            <input type="hidden" name="tenant" value={tenant} />
            <input type="hidden" name="teamId" value={team.dbId} />
            <input type="hidden" name="teamHandle" value={team.id} />
            <input type="hidden" name="memberId" value={member.id} />
            <ConfirmSubmitButton
              form={removeMemberFormId}
              className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-danger hover:text-danger"
              title="Aus Team entfernen"
              confirmLabel="Entfernen"
              description={`${member.name} wird aus "${team.name}" entfernt.`}
            >
              <UserRoundMinus size={14} />
              <span className="sr-only">{member.name} aus Team entfernen</span>
            </ConfirmSubmitButton>
          </form>
        )}
        {isEditing ? (
          <TeamRoleEditorButton
            tenant={tenant}
            teamId={team.dbId ?? ""}
            teamHandle={team.id}
            member={member}
          />
        ) : (
          <span className="font-mono text-[10px] text-muted">-</span>
        )}
      </div>
    </div>
  );
}

function TeamLeaderEditor({ team, tenant }: { team: Team; tenant: string }) {
  return (
    <form
      action={setTeamLeadAction}
      className="mb-3.5 rounded-card border border-border bg-white px-6 py-4"
    >
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="teamId" value={team.dbId} />
      <input type="hidden" name="teamHandle" value={team.id} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label
            htmlFor="team-lead"
            className="mb-2 block font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted"
          >
            Teamleitung bearbeiten
          </label>
          <div className="relative">
            <select
              id="team-lead"
              name="memberId"
              defaultValue={team.lead.id}
              className="input cursor-pointer appearance-none bg-white pr-9 font-medium"
              required
            >
              {team.members.map((member) => (
                <option key={member.id ?? member.initials} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <UserRoundCheck
              size={15}
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
            />
          </div>
        </div>

        <FormSubmitButton
          className="btn btn-primary"
          pendingLabel="Wird gespeichert..."
        >
          Teamleitung speichern
        </FormSubmitButton>
      </div>
    </form>
  );
}

function TeamMemberAssignment({
  team,
  tenant,
  assignableEmployees,
}: {
  team: Team;
  tenant: string;
  assignableEmployees: TeamMember[];
}) {
  return (
    <form action={addTeamMemberAction} className="border-b border-border bg-bg px-6 py-4">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="teamId" value={team.dbId} />
      <input type="hidden" name="teamHandle" value={team.id} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label
            htmlFor="team-member-add"
            className="mb-2 block font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted"
          >
            Mitarbeiter zum Team hinzufuegen
          </label>
          <select
            id="team-member-add"
            name="employeeId"
            defaultValue=""
            className="input cursor-pointer appearance-none bg-white font-medium"
            required
          >
            <option value="" disabled>
              Mitarbeiter auswaehlen
            </option>
            {assignableEmployees.map((employee) => (
              <option key={employee.employeeId ?? employee.initials} value={employee.employeeId}>
                {employee.name} - {employee.location}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[180px]">
          <label
            htmlFor="team-member-role"
            className="mb-2 block font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted"
          >
            Rolle im Team
          </label>
          <input
            id="team-member-role"
            name="role"
            className="input bg-white"
            defaultValue={team.name}
          />
        </div>

        <FormSubmitButton
          Icon={Plus}
          pendingLabel="Wird hinzugefuegt..."
        >
          Hinzufuegen
        </FormSubmitButton>
      </div>
    </form>
  );
}

export default async function TeamDetailPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/teams/[teamId]">) {
  const { tenant, teamId } = await params;
  const { edit } = await searchParams;
  const [team, teams] = await Promise.all([
    getTeamForTenant(tenant, teamId),
    getTeamsForTenant(tenant),
  ]);

  if (!team || !teams) {
    notFound();
  }

  const assignableEmployees = await getAssignableEmployees(tenant, team.id);
  const teamMetrics = getTeamMetrics(teams);
  const onDutyCount = team.members.filter(
    (member) => member.status === "on-duty",
  ).length;
  const isEditing = edit === "1";
  const teamHref = `/u/${tenant}/teams/${team.id}`;
  const auditEntries = await getAuditLogsForEntity({
    tenantSlug: tenant,
    entityType: "team",
    entityId: team.dbId ?? team.id,
  });
  const teamEditHref = `${teamHref}?edit=1`;

  return (
    <>
      <UnsavedChangesGuard active={isEditing} />
      <section className="mb-7 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {teamMetrics.map((metric) => (
          <TeamMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <div className="mb-[22px] flex flex-wrap items-center gap-3.5">
        <Link href={`/u/${tenant}/teams`} className="btn btn-secondary btn-sm">
          <ArrowLeft size={14} />
          Alle Teams
        </Link>
        <span className="font-mono text-[11px] uppercase tracking-[0.5px] text-muted">
          Teams / {team.name}
        </span>
      </div>

      <form id="team-edit-form" action={updateTeamAction}>
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="teamId" value={team.dbId} />
        <section className="mb-3.5 overflow-hidden rounded-card border border-border bg-white">
          <div className={`h-1 w-full ${team.colorClassName}`} />
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-[22px]">
            <div className="min-w-[260px] flex-1">
              {isEditing ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditableTextField
                    id="team-name"
                    label="Teamname"
                    name="name"
                    value={team.name}
                  />
                  <LocationMultiSelectDropdown
                    defaultLocations={team.locations
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean)}
                  />
                </div>
              ) : (
                <>
                  <h1 className="m-0 font-display text-[28px] font-semibold tracking-[-0.8px] text-ink">
                    {team.name}
                  </h1>
                  <div className="mt-1.5 text-[13px] text-muted">
                    {team.locations || "Keine Standorte"}
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex gap-6">
                <div className="text-center">
                  <div className="font-display text-[30px] font-semibold tracking-[-1px] text-ink">
                    {team.members.length}
                  </div>
                  <div className="mt-[3px] font-mono text-[9px] uppercase text-muted">
                    Mitglieder
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-display text-[30px] font-semibold tracking-[-1px] text-success">
                    {onDutyCount}
                  </div>
                  <div className="mt-[3px] font-mono text-[9px] uppercase text-muted">
                    Im Dienst
                  </div>
                </div>
              </div>

              {!isEditing && (
                <div className="flex gap-2">
                  <ConfirmSubmitButton
                    form="team-edit-form"
                    formAction={deleteTeamAction}
                    className="btn btn-secondary btn-sm border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
                    description={`Das Team "${team.name}" wird dauerhaft entfernt.`}
                  >
                    Loeschen
                  </ConfirmSubmitButton>
                  <Link href={teamEditHref} className="btn btn-secondary btn-sm">
                    <Pencil size={14} />
                    Bearbeiten
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>

        {isEditing && (
          <section className="mb-3.5 rounded-card border border-border bg-white px-6 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <TeamColorButtons defaultValue={team.colorClassName} />
            </div>
          </section>
        )}
      </form>

      {isEditing && <TeamLeaderEditor team={team} tenant={tenant} />}

      <section className="overflow-hidden rounded-card border border-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 pt-5 pb-3.5">
          <h2 className="m-0 font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
            Teammitglieder
          </h2>
          {!isEditing && (
            <Link href={teamEditHref} className="btn btn-secondary btn-sm">
              <Pencil size={14} />
              Mitglieder anpassen
            </Link>
          )}
        </div>
        {isEditing && (
          <TeamMemberAssignment
            team={team}
            tenant={tenant}
            assignableEmployees={assignableEmployees}
          />
        )}
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid gap-3.5 border-b border-border px-6 py-3.5 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted [grid-template-columns:2fr_120px_1.2fr_130px_110px_150px]">
              <div>Name</div>
              <div>Standort</div>
              <div>Rolle</div>
              <div>Vertrag</div>
              <div>Status</div>
              <div className="text-right">Aktion</div>
            </div>
            {team.members.map((member) => (
              <MemberRow
                key={member.id ?? `${team.dbId}-${member.initials}`}
                member={member}
                team={team}
                tenant={tenant}
                isEditing={isEditing}
              />
            ))}
          </div>
        </div>
      </section>

      <div className="mt-4">
        <AuditLogPanel
          entries={auditEntries}
        />
      </div>

      {isEditing && (
        <FloatingEditBar cancelHref={teamHref} formId="team-edit-form" />
      )}
    </>
  );
}
