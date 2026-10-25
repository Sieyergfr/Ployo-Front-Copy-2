import ShiftPlanningClient from "@/components/ShiftPlanningClient";
import { auth } from "@/lib/auth";
import { getGermanHolidays } from "@/lib/german-holidays";
import { getPendingShiftOfferCounts } from "@/lib/shift-offer-service";
import {
  getISOWeekFromDate,
  getShiftFormOptions,
  getShiftPlanForTenant,
  getShiftPlanningSettings,
  getShiftTemplatesForTenant,
  getShiftWeekAbsences,
} from "@/lib/shift-service";
import { getWishFreeRequestsForTenant } from "@/lib/wish-free-service";
import { hasPermissionLevel } from "@/lib/roles";
import { getTenantCapabilities, withAccessRedirect } from "@/lib/tenant-access";
import { getTenantsForUser } from "@/lib/tenants";
import { headers } from "next/headers";
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
  const canManage = hasPermissionLevel(capabilities.shifts.level, "write");
  const shiftIds = plan.days.flatMap((day) => day.shifts.map((shift) => shift.dbId).filter((id): id is string => Boolean(id)));
  // Nur Planer sehen Abwesenheiten und Angebote — ohne Schreibrecht bleibt
  // der Plan eine reine Ansicht.
  const [absences, offerCounts, session] = await Promise.all([
    canManage ? getShiftWeekAbsences({ tenantSlug: tenant, year, week }).catch(() => []) : [],
    canManage ? getPendingShiftOfferCounts(tenant, shiftIds).catch(() => ({})) : {},
    auth.api.getSession({ headers: await headers() }),
  ]);
  const memberships = session?.user?.id ? await getTenantsForUser(session.user.id).catch(() => null) : null;
  const tenantName = memberships?.find((item) => item.tenant.slug === tenant)?.tenant.name ?? tenant;
  const dayIds = new Set(plan.days.map((day) => day.id));
  const holidays = Object.fromEntries(
    [...new Set(plan.days.map((day) => Number(day.id.slice(0, 4))))]
      .flatMap((holidayYear) => [...getGermanHolidays(holidayYear, null)])
      .filter(([date]) => dayIds.has(date)),
  );

  return (
    <ShiftPlanningClient
      tenant={tenant}
      tenantName={tenantName}
      year={year}
      week={week}
      currentYear={currentWeek.year}
      currentWeek={currentWeek.week}
      todayIso={new Date().toISOString().slice(0, 10)}
      absences={absences}
      offerCounts={offerCounts}
      holidays={holidays}
      canSeeSickness={hasPermissionLevel(capabilities.sickness.level, "read")}
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
      canManage={canManage}
      canDelete={capabilities.shifts.canDelete}
      canManageSettings={hasPermissionLevel(capabilities.settings.level, "write")}
    />
  );
}
