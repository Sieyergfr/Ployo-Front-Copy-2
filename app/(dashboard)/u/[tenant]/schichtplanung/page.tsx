import ShiftPlanningClient from "@/components/ShiftPlanningClient";
import {
  getISOWeekFromDate,
  getShiftFormOptions,
  getShiftPlanForTenant,
  getShiftPlanningSettings,
  getShiftTemplatesForTenant,
} from "@/lib/shift-service";
import { getWishFreeRequestsForTenant } from "@/lib/wish-free-service";
import { hasPermissionLevel } from "@/lib/roles";
import { getTenantCapabilities, withAccessRedirect } from "@/lib/tenant-access";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Schichtplanung",
};

function searchParamNumber(
  value: string | string[] | undefined,
  fallback: number,
  max?: number,
) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 && (max === undefined || parsed <= max)
    ? parsed
    : fallback;
}

export default async function ShiftPlanningPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/schichtplanung">) {
  const { tenant } = await params;
  const query = await searchParams;
  const currentWeek = getISOWeekFromDate(new Date());
  const year = searchParamNumber(query.year, currentWeek.year);
  // Eine gültige ISO-Kalenderwoche liegt zwischen 1 und 53 — ein Wert wie
  // "99" (QA-Bug BUG-026) landete bisher unnormalisiert direkt in der
  // Datumsberechnung und ergab ein KW-Etikett aus einem völlig anderen Jahr.
  const week = searchParamNumber(query.week, currentWeek.week, 53);
  const [plan, options, shiftSettings, templates] = await withAccessRedirect(tenant, () =>
    Promise.all([
      getShiftPlanForTenant({ tenantSlug: tenant, year, week }),
      getShiftFormOptions(tenant),
      getShiftPlanningSettings(tenant),
      getShiftTemplatesForTenant(tenant),
    ]),
  );

  if (!plan || !options) {
    notFound();
  }

  const wishFreeRequests = await getWishFreeRequestsForTenant({
    tenantSlug: tenant,
  });
  const capabilities = await getTenantCapabilities(tenant);

  return (
    <ShiftPlanningClient
      tenant={tenant}
      year={year}
      week={week}
      weekLabel={plan.label}
      weekRange={plan.range}
      conflictCount={plan.conflictCount}
      status={plan.status}
      publishedAt={plan.publishedAt}
      hasUnpublishedChanges={plan.hasUnpublishedChanges}
      days={plan.days}
      employees={options.employees}
      locations={options.locations}
      wishFreeRequests={wishFreeRequests}
      shiftSettings={shiftSettings}
      templates={templates ?? []}
      canManage={hasPermissionLevel(capabilities.shifts.level, "write")}
      canDelete={capabilities.shifts.canDelete}
      canManageSettings={hasPermissionLevel(capabilities.settings.level, "write")}
    />
  );
}
