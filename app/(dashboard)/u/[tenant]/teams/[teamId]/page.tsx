import {
  getTeamById,
  teamAssignableEmployees,
  teamMetrics,
  type Team,
  type TeamMember,
} from "@/lib/teams";
import {
  ArrowLeft,
  Pencil,
  Plus,
  Save,
  UserRoundCheck,
  UserRoundMinus,
  X,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

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
      <input id={id} name={name} className="input bg-white" defaultValue={value} />
    </div>
  );
}

function EditableSelectField({
  id,
  label,
  name,
  value,
  options,
}: {
  id: string;
  label: string;
  name: string;
  value: string;
  options: string[];
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select
        id={id}
        name={name}
        className="input cursor-pointer bg-white"
        defaultValue={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
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

  return colors[team.id] ?? "text-muted";
}

function MemberRow({
  member,
  team,
  isEditing,
}: {
  member: TeamMember;
  team: Team;
  isEditing: boolean;
}) {
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
      <div className="text-[13px] text-ink">
        {isEditing ? (
          <select
            aria-label={`${member.name} Standort`}
            className="input cursor-pointer bg-white px-2.5 py-2 text-[12px]"
            defaultValue={member.location}
          >
            {["München", "Berlin", "Hamburg"].map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        ) : (
          member.location
        )}
      </div>
      <div className="text-[13px] text-muted-2">
        {isEditing ? (
          <input
            aria-label={`${member.name} Rolle`}
            className="input bg-white px-2.5 py-2 text-[12px]"
            defaultValue={member.role}
          />
        ) : (
          member.role
        )}
      </div>
      <div>
        {isEditing ? (
          <select
            aria-label={`${member.name} Vertrag`}
            className="input cursor-pointer bg-white px-2.5 py-2 text-[12px]"
            defaultValue={member.contract}
          >
            {["Unbefristet", "Vollzeit", "Teilzeit", "Werkstudentin", "Minijob"].map(
              (contract) => (
                <option key={contract} value={contract}>
                  {contract}
                </option>
              ),
            )}
          </select>
        ) : (
          <ContractBadge>{member.contract}</ContractBadge>
        )}
      </div>
      {isEditing ? (
        <select
          aria-label={`${member.name} Status`}
          className="input cursor-pointer bg-white px-2.5 py-2 text-[12px]"
          defaultValue={member.status}
        >
          <option value="on-duty">Im Dienst</option>
          <option value="vacation">Urlaub</option>
        </select>
      ) : (
        <StatusPill status={member.status} />
      )}
      <div className="flex items-center justify-end gap-2">
        {isEditing && !member.isLead && (
          <button
            type="button"
            className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-danger hover:text-danger"
            title="Aus Team entfernen"
            aria-label={`${member.name} aus Team entfernen`}
          >
            <UserRoundMinus size={14} />
          </button>
        )}
        {isEditing ? (
          <button type="button" className="btn btn-secondary btn-sm px-3">
            <Pencil size={13} />
            Rolle
          </button>
        ) : (
          <span className="font-mono text-[10px] text-muted">-</span>
        )}
      </div>
    </div>
  );
}

function TeamLeaderEditor({ team }: { team: Team }) {
  return (
    <section className="mb-3.5 rounded-card border border-border bg-white px-6 py-4">
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
              defaultValue={team.lead.initials}
              className="input cursor-pointer appearance-none bg-white pr-9 font-medium"
            >
              {team.members.map((member) => (
                <option key={member.initials} value={member.initials}>
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

        <button type="button" className="btn btn-primary">
          Teamleitung speichern
        </button>
      </div>
    </section>
  );
}

function TeamMemberAssignment({ team }: { team: Team }) {
  return (
    <div className="border-b border-border bg-bg px-6 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label
            htmlFor="team-member-add"
            className="mb-2 block font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted"
          >
            Mitarbeiter zum Team hinzufügen
          </label>
          <select
            id="team-member-add"
            defaultValue=""
            className="input cursor-pointer appearance-none bg-white font-medium"
          >
            <option value="" disabled>
              Mitarbeiter ausw\u00e4hlen
            </option>
            {teamAssignableEmployees.map((employee) => (
              <option key={employee.initials} value={employee.initials}>
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
            className="input bg-white"
            defaultValue={team.name}
          />
        </div>

        <button type="button" className="btn btn-primary">
          <Plus size={15} />
          Hinzufügen
        </button>
      </div>
    </div>
  );
}

export default async function TeamDetailPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/teams/[teamId]">) {
  const { tenant, teamId } = await params;
  const { edit } = await searchParams;
  const team = getTeamById(teamId);

  if (!team) {
    notFound();
  }

  const onDutyCount = team.members.filter(
    (member) => member.status === "on-duty",
  ).length;
  const isEditing = edit === "1";
  const teamHref = `/u/${tenant}/teams/${team.id}`;
  const teamEditHref = `${teamHref}?edit=1`;

  return (
    <>
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
                <EditableTextField
                  id="team-locations"
                  label="Standorte"
                  name="locations"
                  value={team.locations}
                />
              </div>
            ) : (
              <>
                <h1 className="m-0 font-display text-[28px] font-semibold tracking-[-0.8px] text-ink">
                  {team.name}
                </h1>
                <div className="mt-1.5 text-[13px] text-muted">
                  {team.locations}
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

            {isEditing ? (
              <div className="flex gap-2">
                <Link href={teamHref} className="btn btn-secondary btn-sm">
                  <X size={14} />
                  Abbrechen
                </Link>
                <Link href={teamHref} className="btn btn-primary btn-sm">
                  <Save size={14} />
                  Speichern
                </Link>
              </div>
            ) : (
              <Link href={teamEditHref} className="btn btn-secondary btn-sm">
                <Pencil size={14} />
                Bearbeiten
              </Link>
            )}
          </div>
        </div>
      </section>

      {isEditing && (
        <>
          <TeamLeaderEditor team={team} />
          <section className="mb-3.5 rounded-card border border-border bg-white px-6 py-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <EditableSelectField
                id="team-default-role"
                label="Standardrolle"
                name="defaultRole"
                value={team.name}
                options={["Verkauf", "Logistik", "Service", "Empfang"]}
              />
              <EditableSelectField
                id="team-color"
                label="Farbmarkierung"
                name="color"
                value={team.colorClassName}
                options={[
                  "bg-[#C9622A]",
                  "bg-[#2A5BC9]",
                  "bg-[#1D8A65]",
                  "bg-[#7A3C9C]",
                ]}
              />
              <EditableTextField
                id="team-capacity"
                label="Zielgröße"
                name="capacity"
                value={`${team.members.length + 2}`}
              />
            </div>
          </section>
        </>
      )}

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
        {isEditing && <TeamMemberAssignment team={team} />}
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
                key={`${team.id}-${member.initials}`}
                member={member}
                team={team}
                isEditing={isEditing}
              />
            ))}
          </div>
        </div>
      </section>

      <div className="mt-8 text-center font-mono text-[10px] tracking-[0.4px] text-[#B0B0AB]">
        Ployo {"\u00b7"} Personalakte-System {"\u00b7"} Alle Zugriffe
        protokolliert {"\u00b7"} Server in Frankfurt
      </div>
    </>
  );
}
