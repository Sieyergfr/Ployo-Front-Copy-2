import CreateLocationButton from "@/components/CreateLocationButton";
import { LocationsListClient } from "@/components/LocationsListClient";
import PageHeader from "@/components/PageHeader";
import {
  getLocationMetrics,
  getLocationsForTenant,
} from "@/lib/location-service";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { type LocationMetric } from "@/lib/locations";
import { hasPermissionLevel } from "@/lib/roles";
import { getTenantPermissions, withAccessRedirect } from "@/lib/tenant-access";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Standorte",
};

function LocationMetricCard({
  label,
  value,
  caption,
  tone,
}: LocationMetric) {
  return (
    <div className="rounded-[14px] border border-border bg-white px-5 pt-5 pb-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-muted">
        {label}
      </div>
      <div className="my-[14px] mb-[9px] font-display text-[38px] font-semibold leading-none tracking-[-1.2px] text-ink">
        {value}
      </div>
      <div
        className={`text-[12px] ${tone === "danger" ? "text-danger" : "text-muted"}`}
      >
        {caption}
      </div>
    </div>
  );
}

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

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")}>
        {canCreateLocation && (
          <CreateLocationButton
            tenant={tenant}
            employees={employees.map((employee) => ({
              id: employee.dbId ?? employee.id,
              initials: employee.initials,
              name: employee.name,
              employeeNumber: employee.employeeNumber,
              location: employee.location,
              team: employee.team,
              role: employee.role,
            }))}
          />
        )}
      </PageHeader>

      <section className="mb-7 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        {locationMetrics.map((metric) => (
          <LocationMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <LocationsListClient locations={locations} tenant={tenant} />
    </>
  );
}
