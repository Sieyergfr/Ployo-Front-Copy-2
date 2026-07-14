import CreateTeamButton from "@/components/CreateTeamButton";
import PageHeader from "@/components/PageHeader";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { getLocationsForTenant } from "@/lib/location-service";
import { getTeamMetrics, getTeamsForTenant } from "@/lib/team-service";
import { type Team, type TeamMember } from "@/lib/teams";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Teams",
};

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

function MemberAvatar({ member }: { member: TeamMember }) {
  return (
    <div
      title={member.name}
      className="flex size-8 items-center justify-center rounded-full bg-ink text-[10.5px] font-semibold text-white"
    >
      {member.initials}
    </div>
  );
}

function TeamCard({ team, tenant }: { team: Team; tenant: string }) {
  return (
    <Link
      href={`/u/${tenant}/teams/${team.id}`}
      className="flex w-full cursor-pointer flex-col overflow-hidden rounded-card border border-border bg-white p-0 text-left font-sans transition-[border-color,box-shadow] duration-150 hover:border-muted hover:shadow-[0_8px_24px_rgba(0,0,0,0.05)]"
    >
      <div className={`h-[3px] w-full ${team.colorClassName}`} />
      <div className="w-full px-[22px] pt-[22px] pb-[18px]">
        <div className="mb-4 flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <div className="font-display text-[18px] font-semibold tracking-[-0.4px] text-ink">
              {team.name}
            </div>
            <div className="mt-[5px] font-mono text-[10.5px] text-muted">
              {team.locations || "Keine Standorte"}
            </div>
          </div>
          <span className="font-display text-[30px] font-semibold leading-none tracking-[-1px] text-ink">
            {team.members.length}
          </span>
        </div>

        <div className="mb-4 flex flex-wrap gap-1.5">
          {team.members.map((member) => (
            <MemberAvatar key={member.id ?? `${team.dbId}-${member.initials}`} member={member} />
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border-soft pt-3.5">
          <div className="flex min-w-0 items-center gap-[9px]">
            <div
              className={`flex size-[26px] shrink-0 items-center justify-center rounded-full ${team.colorClassName} text-[9px] font-bold text-white`}
            >
              {team.lead.initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-semibold text-ink">
                {team.lead.name}
              </div>
              <div className="font-mono text-[9px] text-muted">Teamleitung</div>
            </div>
          </div>
          <ArrowRight size={14} className="shrink-0 text-muted" />
        </div>
      </div>
    </Link>
  );
}

export default async function TeamsPage({
  params,
}: PageProps<"/u/[tenant]/teams">) {
  const { tenant } = await params;
  const [teams, employees, locations] = await Promise.all([
    getTeamsForTenant(tenant),
    getEmployeesForTenant(tenant),
    getLocationsForTenant(tenant),
  ]);

  if (!teams || !employees || !locations) {
    notFound();
  }

  const teamMetrics = getTeamMetrics(teams);
  const employeeOptions = employees
    .filter((employee) => employee.dbId)
    .map((employee) => ({
      value: employee.dbId ?? employee.id,
      label: employee.name,
      meta: `${employee.location} - ${employee.role}`,
    }));

  return (
    <>
      <PageHeader eyebrow="Organisationsstruktur" title="Teams">
        <CreateTeamButton
          tenant={tenant}
          employees={employeeOptions}
          locations={locations.map((location) => location.name)}
        />
      </PageHeader>

      <section className="mb-7 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {teamMetrics.map((metric) => (
          <TeamMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
        {teams.map((team) => (
          <TeamCard key={team.dbId ?? team.id} team={team} tenant={tenant} />
        ))}
      </section>
    </>
  );
}
