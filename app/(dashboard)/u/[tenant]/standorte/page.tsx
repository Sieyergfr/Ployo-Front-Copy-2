import CreateLocationButton from "@/components/CreateLocationButton";
import { LocationsListClient } from "@/components/LocationsListClient";
import { DbCard, DbPageHead } from "@/components/dashboard/ui";
import { auth } from "@/lib/auth";
import { getTenantsForUser } from "@/lib/tenants";
import { headers } from "next/headers";
import { Plus } from "lucide-react";
import {
  getLocationMetrics,
  getLocationsForTenant,
} from "@/lib/location-service";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { hasPermissionLevel } from "@/lib/roles";
import { getTenantPermissions, withAccessRedirect } from "@/lib/tenant-access";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Standorte",
};

export default async function LocationsPage({
  params,
}: PageProps<"/u/[tenant]/standorte">) {
  const { tenant } = await params;
  const locations = await withAccessRedirect(tenant, () =>
    getLocationsForTenant(tenant),
  );

  if (!locations) {
    notFound();
  }

  // Nur für den Mitarbeiter-Picker im "Standort anlegen"-Dialog — fehlende
  // Berechtigung dafür soll die Standortliste selbst nicht sperren.
  const [employees, permissions, t, tMetrics] = await Promise.all([
    getEmployeesForTenant(tenant).catch(() => null).then((v) => v ?? []),
    getTenantPermissions(tenant),
    getTranslations("LocationsPage"),
    getTranslations("LocationMetrics"),
  ]);
  const canCreateLocation = hasPermissionLevel(permissions.locations, "write");

  const locationMetrics = getLocationMetrics(locations, tMetrics);
  const session = await auth.api.getSession({ headers: await headers() });
  const memberships = session?.user?.id ? await getTenantsForUser(session.user.id).catch(() => null) : null;
  const tenantName = memberships?.find((item) => item.tenant.slug === tenant)?.tenant.name ?? tenant;
  const employeeOptions = employees.map((employee) => ({
    id: employee.dbId ?? employee.id,
    initials: employee.initials,
    name: employee.name,
    employeeNumber: employee.employeeNumber,
    location: employee.location,
    team: employee.team,
    role: employee.role,
  }));

  return (
    <>
      <DbPageHead
        eyebrow={tenantName}
        title={t("title")}
        subtitle={t("subtitle", { count: locations.length })}
        actions={
          canCreateLocation ? (
            <CreateLocationButton
              tenant={tenant}
              employees={employeeOptions}
              className="db-cta db-focus relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-[10px] border border-[rgba(167,142,232,0.45)] bg-ink px-[18px] py-2.5 text-[14px] font-semibold text-white"
            />
          ) : undefined
        }
      />

      <section className="mb-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {locationMetrics.map((metric) => (
          <DbCard key={metric.label} className="db-insight flex flex-col gap-2 p-[18px]">
            <span className="text-[13px] font-medium text-[#6e6e6b]">{metric.label}</span>
            <span className={`font-display text-[30px] leading-none font-semibold tracking-[-1px] ${metric.tone === "danger" && metric.value !== "0" ? "text-[#b4332a]" : ""}`}>
              {metric.value}
            </span>
            <span className="text-[13px] text-[#6e6e6b]">{metric.caption}</span>
          </DbCard>
        ))}
      </section>

      <LocationsListClient
        locations={locations}
        tenant={tenant}
        createTile={
          canCreateLocation ? (
            <CreateLocationButton
              tenant={tenant}
              employees={employeeOptions}
              className="db-focus flex min-h-[250px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[16px] border-[1.5px] border-dashed border-[#dedad4] bg-transparent px-8 text-center text-ink transition-colors hover:border-[#9a9a96]"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-[#f2f1ed]">
                <Plus size={18} />
              </span>
              <span className="text-[14.5px] font-semibold">{t("createTitle")}</span>
              <span className="text-[13px] leading-[1.45] text-[#6e6e6b]">{t("createHint")}</span>
            </CreateLocationButton>
          ) : undefined
        }
      />
    </>
  );
}
