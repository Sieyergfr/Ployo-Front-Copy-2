import CreateTeamButton from "@/components/CreateTeamButton";
import { TeamsListClient } from "@/components/TeamsListClient";
import PageHeader from "@/components/PageHeader";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { getLocationsForTenant } from "@/lib/location-service";
import { getTeamMetrics, getTeamsForTenant } from "@/lib/team-service";
import { hasPermissionLevel } from "@/lib/roles";
import { getTenantPermissions, withAccessRedirect } from "@/lib/tenant-access";
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

export default async function TeamsPage({
  params,
}: PageProps<"/u/[tenant]/teams">) {
  const { tenant } = await params;
  const teams = await withAccessRedirect(tenant, () => getTeamsForTenant(tenant));

  if (!teams) {
    notFound();
  }

  // Nur für den Mitglieder-Picker und die Standort-Filter im
  // "Team anlegen"-Dialog — fehlende Berechtigung dafür soll die Teamliste
  // selbst nicht sperren.
  const [employees, locations, permissions] = await Promise.all([
    getEmployeesForTenant(tenant).catch(() => null).then((v) => v ?? []),
    getLocationsForTenant(tenant).catch(() => null).then((v) => v ?? []),
    getTenantPermissions(tenant),
  ]);
  const canCreateTeam = hasPermissionLevel(permissions.teams, "write");

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
        {canCreateTeam && (
          <CreateTeamButton
            tenant={tenant}
            employees={employeeOptions}
            locations={locations.map((location) => location.name)}
          />
        )}
      </PageHeader>

      <section className="mb-7 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {teamMetrics.map((metric) => (
          <TeamMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <TeamsListClient teams={teams} tenant={tenant} />
    </>
  );
}
