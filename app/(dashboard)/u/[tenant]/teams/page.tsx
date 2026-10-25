import CreateTeamButton from "@/components/CreateTeamButton";
import { TeamsListClient } from "@/components/TeamsListClient";
import { DbCard, DbPageHead } from "@/components/dashboard/ui";
import { auth } from "@/lib/auth";
import { paletteHex } from "@/lib/org-options";
import { getTenantsForUser } from "@/lib/tenants";
import { headers } from "next/headers";
import { Plus } from "lucide-react";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { getLocationsForTenant } from "@/lib/location-service";
import { getTeamMetrics, getTeamsForTenant } from "@/lib/team-service";
import { hasPermissionLevel } from "@/lib/roles";
import { getTenantPermissions, withAccessRedirect } from "@/lib/tenant-access";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Teams",
};

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
  const [employees, locations, permissions, t, tMetrics] = await Promise.all([
    getEmployeesForTenant(tenant).catch(() => null).then((v) => v ?? []),
    getLocationsForTenant(tenant).catch(() => null).then((v) => v ?? []),
    getTenantPermissions(tenant),
    getTranslations("TeamsPage"),
    getTranslations("TeamMetrics"),
  ]);
  const canCreateTeam = hasPermissionLevel(permissions.teams, "write");

  const teamMetrics = getTeamMetrics(teams, tMetrics);
  const employeeOptions = employees
    .filter((employee) => employee.dbId)
    .map((employee) => ({
      value: employee.dbId ?? employee.id,
      label: employee.name,
      meta: `${employee.location} - ${employee.role}`,
    }));

  const session = await auth.api.getSession({ headers: await headers() });
  const memberships = session?.user?.id ? await getTenantsForUser(session.user.id).catch(() => null) : null;
  const tenantName = memberships?.find((item) => item.tenant.slug === tenant)?.tenant.name ?? tenant;
  const locationNames = locations.map((location) => location.name);
  const locationColors = Object.fromEntries(
    locations.map((location) => [location.name, paletteHex(location.accentClassName, "#9a9a96")]),
  );

  return (
    <>
      <DbPageHead
        eyebrow={tenantName}
        title={t("title")}
        subtitle={t("subtitle", { count: teams.length })}
        actions={
          canCreateTeam ? (
            <CreateTeamButton
              tenant={tenant}
              employees={employeeOptions}
              locations={locationNames}
              className="db-cta db-focus relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-[10px] border border-[rgba(167,142,232,0.45)] bg-ink px-[18px] py-2.5 text-[14px] font-semibold text-white"
            />
          ) : undefined
        }
      />

      <section className="mb-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {teamMetrics.map((metric) => (
          <DbCard key={metric.label} className="db-insight flex flex-col gap-2 p-[18px]">
            <span className="text-[13px] font-medium text-[#6e6e6b]">{metric.label}</span>
            <span className="font-display text-[30px] leading-none font-semibold tracking-[-1px]">{metric.value}</span>
            <span className="text-[13px] text-[#6e6e6b]">{metric.caption}</span>
          </DbCard>
        ))}
      </section>

      <TeamsListClient
        teams={teams}
        tenant={tenant}
        locationColors={locationColors}
        createTile={
          canCreateTeam ? (
            <CreateTeamButton
              tenant={tenant}
              employees={employeeOptions}
              locations={locationNames}
              className="db-focus flex min-h-[230px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[16px] border-[1.5px] border-dashed border-[#dedad4] bg-transparent px-8 text-center text-ink transition-colors hover:border-[#9a9a96]"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-[#f2f1ed]">
                <Plus size={18} />
              </span>
              <span className="text-[14.5px] font-semibold">{t("createTitle")}</span>
              <span className="text-[13px] leading-[1.45] text-[#6e6e6b]">{t("createHint")}</span>
            </CreateTeamButton>
          ) : undefined
        }
      />
    </>
  );
}
