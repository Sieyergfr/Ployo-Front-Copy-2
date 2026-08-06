import ShiftPlanningClient from "@/components/ShiftPlanningClient";
import {
  getISOWeekFromDate,
  getShiftFormOptions,
  getShiftPlanForTenant,
  getShiftPlanningSettings,
} from "@/lib/shift-service";
import { getWishFreeRequestsForTenant } from "@/lib/wish-free-service";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Schichtplanung",
};

function searchParamNumber(
  value: string | string[] | undefined,
  fallback: number,
) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function ShiftPlanningPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/schichtplanung">) {
  const { tenant } = await params;
  const query = await searchParams;
  const currentWeek = getISOWeekFromDate(new Date());
  const year = searchParamNumber(query.year, currentWeek.year);
  const week = searchParamNumber(query.week, currentWeek.week);
  const [plan, options, shiftSettings] = await Promise.all([
    getShiftPlanForTenant({ tenantSlug: tenant, year, week }),
    getShiftFormOptions(tenant),
    getShiftPlanningSettings(tenant),
  ]);

  if (!plan || !options) {
    notFound();
  }

  const wishFreeRequests = await getWishFreeRequestsForTenant({
    tenantSlug: tenant,
  });

  return (
    <ShiftPlanningClient
      tenant={tenant}
      year={year}
      week={week}
      weekLabel={plan.label}
      weekRange={plan.range}
      conflictCount={plan.conflictCount}
      days={plan.days}
      employees={options.employees}
      locations={options.locations}
      wishFreeRequests={wishFreeRequests}
      shiftSettings={shiftSettings}
    />
  );
}
