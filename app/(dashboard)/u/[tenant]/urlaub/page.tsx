import { VacationRequestButton } from "@/components/AbsenceActionButtons";
import PageHeader from "@/components/PageHeader";
import { VacationListClient } from "@/components/VacationListClient";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { paginate, searchParamPage } from "@/lib/pagination";
import {
  getVacationMetrics,
  getVacationRequestsForTenant,
} from "@/lib/vacation-service";
import { type VacationMetric } from "@/lib/vacations";
import { hasPermissionLevel } from "@/lib/roles";
import { getTenantCapabilities, withAccessRedirect } from "@/lib/tenant-access";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Urlaub",
};

const PAGE_SIZE = 20;

function VacationMetricCard({ label, value, caption, tone }: VacationMetric) {
  const valueClassName =
    tone === "warning"
      ? "text-warning"
      : tone === "success"
        ? "text-success"
        : "text-ink";

  return (
    <div className="rounded-[14px] border border-border bg-white px-[22px] pt-5 pb-4">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.6px] text-muted">
        {label}
      </div>
      <div
        className={`mt-4 mb-2 font-display text-[38px] font-semibold leading-none tracking-[-1.2px] ${valueClassName}`}
      >
        {value}
      </div>
      <div className="text-[12px] text-muted">{caption}</div>
    </div>
  );
}

export default async function VacationPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/urlaub">) {
  const t = await getTranslations("VacationPage");
  const { tenant } = await params;
  const query = await searchParams;
  const vacationRequests = await withAccessRedirect(tenant, () =>
    getVacationRequestsForTenant(tenant),
  );

  if (!vacationRequests) {
    notFound();
  }

  // Nur für Namen/Standort im Antrags-Dialog und die Metrik-Berechnung —
  // fehlende Berechtigung dafür soll die Urlaubsliste selbst nicht sperren.
  const employees = await getEmployeesForTenant(tenant)
    .catch(() => null)
    .then((v) => v ?? []);
  const capabilities = await getTenantCapabilities(tenant);
  const canManage = hasPermissionLevel(capabilities.vacation.level, "write");
  const canDelete = capabilities.vacation.canDelete;

  // Ausgeschiedene Mitarbeiter sind nicht mehr antragsberechtigt und sollen
  // weder in der Auswahl noch im "durchschnittlicher Resturlaub"-Schnitt
  // auftauchen (QA-Bug BUG-009, gleiche Definition wie BUG-002).
  const activeEmployees = employees.filter((employee) => employee.status !== "former");
  const vacationMetrics = getVacationMetrics(vacationRequests, activeEmployees, t);
  const page = paginate(vacationRequests, searchParamPage(query.page), PAGE_SIZE);
  const employeeOptions = activeEmployees
    .filter((employee) => employee.dbId)
    .map((employee) => ({
      id: employee.dbId ?? employee.id,
      name: employee.name,
      location: employee.location,
    }));

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")}>
        {canManage && (
          <VacationRequestButton tenant={tenant} employees={employeeOptions} />
        )}
      </PageHeader>

      <section className="mb-7 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {vacationMetrics.map((metric) => (
          <VacationMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <VacationListClient
        tenant={tenant}
        allRequests={vacationRequests}
        pageItems={page.items}
        pageInfo={{
          page: page.page,
          pageCount: page.pageCount,
          total: page.total,
          pageSize: page.pageSize,
        }}
        canManage={canManage}
        canDelete={canDelete}
      />
    </>
  );
}
