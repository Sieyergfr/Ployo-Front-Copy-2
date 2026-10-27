import AnalyticsExportButtons from "@/components/dashboard/reports/AnalyticsExportButtons";
import { AbsencesTab, ArbzgTab, OvertimeTab, StaffTab } from "@/components/dashboard/reports/AnalyticsTabs";
import { DbCard, DbPageHead } from "@/components/dashboard/ui";
import { HoursReportTable, REPORT_ACTIONS_SLOT, ReportFilterBar } from "@/components/HoursReport";
import { auth } from "@/lib/auth";
import {
  getArbzgAnalytics,
  getOvertimeAnalytics,
  getSicknessAnalytics,
  getStaffAnalytics,
  getVacationAccountAnalytics,
} from "@/lib/report-analytics";
import { getHoursReport } from "@/lib/reports-service";
import { hasPermissionLevel } from "@/lib/roles";
import { getTenantPermissions, withAccessRedirect } from "@/lib/tenant-access";
import { getTenantsForUser } from "@/lib/tenants";
import { CalendarDays, Clock, ShieldCheck, Timer, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Reports",
};

const TABS = ["hours", "overtime", "absences", "arbzg", "staff"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, LucideIcon> = {
  hours: Clock,
  overtime: TrendingUp,
  absences: CalendarDays,
  arbzg: ShieldCheck,
  staff: Users,
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("ReportsPage");
  const { tenant } = await params;
  const query = await searchParams;
  const permissions = await withAccessRedirect(tenant, () => getTenantPermissions(tenant));
  const can = (area: keyof typeof permissions) => hasPermissionLevel(permissions[area] ?? "none", "read");
  const available = TABS.filter((tab) =>
    tab === "staff" ? can("employees") : tab === "absences" ? can("sickness") || can("vacation") : can("timeTracking"),
  );
  const requested = single(query.tab) as Tab | undefined;
  const tab: Tab = requested && available.includes(requested) ? requested : (available[0] ?? "hours");

  const session = await auth.api.getSession({ headers: await headers() });
  const memberships = session?.user?.id ? await getTenantsForUser(session.user.id).catch(() => null) : null;
  const tenantName = memberships?.find((item) => item.tenant.slug === tenant)?.tenant.name ?? tenant;

  const tabHref = (target: Tab) => (target === "hours" ? `/u/${tenant}/reports` : `/u/${tenant}/reports?tab=${target}`);
  let content: React.ReactNode;

  if (tab === "hours") {
    const data = await withAccessRedirect(tenant, () => getHoursReport(tenant, query));
    // Neuer Filter → Tabelle mit frischem Bearbeitungsstand (keine Anpassungen
    // aus einem anderen Zeitraum/einer anderen Auswahl übernehmen).
    const tableKey = JSON.stringify([data.filters, data.range.from, data.range.to]);

    content = (
      <>
        {!data.timeTrackingEnabled && (
          <DbCard className="mb-4 flex items-start gap-3 p-[18px]">
            <Timer className="mt-0.5 shrink-0 text-[#6e6e6b]" size={18} />
            <div>
              <p className="m-0 text-[14px] font-semibold">{t("timeTrackingDisabledTitle")}</p>
              <p className="m-0 mt-1 text-[13px] text-[#6e6e6b]">{t("timeTrackingDisabledHint")}</p>
            </div>
          </DbCard>
        )}

        <ReportFilterBar
          key={`filters-${tableKey}`}
          filters={data.filters}
          range={data.range}
          today={data.today}
          employees={data.employees}
          teams={data.teams}
          locations={data.locations}
          selectionName={data.selectionName}
        />

        <HoursReportTable
          key={`table-${tableKey}`}
          tenant={tenant}
          range={data.range}
          today={data.today}
          rows={data.rows}
          canEdit={data.canEdit}
          showVacation={data.showVacation}
          showSickness={data.showSickness}
          recipients={data.recipients}
          emailConfigured={data.emailConfigured}
          disabled={data.selectionMissing}
        />
      </>
    );
  } else if (tab === "overtime") {
    content = <OvertimeTab tenant={tenant} data={await withAccessRedirect(tenant, () => getOvertimeAnalytics(tenant))} />;
  } else if (tab === "absences") {
    const [sickness, vacation] = await Promise.all([getSicknessAnalytics(tenant), getVacationAccountAnalytics(tenant)]);

    content = <AbsencesTab tenant={tenant} sickness={sickness} vacation={vacation} />;
  } else if (tab === "arbzg") {
    content = <ArbzgTab tenant={tenant} data={await withAccessRedirect(tenant, () => getArbzgAnalytics(tenant))} />;
  } else {
    const data = await withAccessRedirect(tenant, () => getStaffAnalytics(tenant));

    content = <StaffTab tenant={tenant} data={data} today={data.today} />;
  }

  return (
    <>
      <DbPageHead eyebrow={tenantName} title={t("title")} subtitle={t("subtitle")} />

      <div id={REPORT_ACTIONS_SLOT} className="-mt-3 mb-6 flex flex-wrap gap-2">
        {tab !== "hours" && <AnalyticsExportButtons tenant={tenant} tab={tab} />}
      </div>

      <nav aria-label={t("tabsLabel")} className="mb-5 flex gap-6 overflow-x-auto border-b border-[#ecebe7]">
        {available.map((item) => {
          const Icon = TAB_ICONS[item];
          const active = item === tab;

          return (
            <Link
              key={item}
              href={tabHref(item)}
              aria-current={active ? "page" : undefined}
              title={t(`tabHint.${item}`)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-3 text-[14.5px] no-underline ${
                active ? "border-ink font-semibold text-ink" : "border-transparent font-medium text-[#6e6e6b] hover:text-ink"
              }`}
            >
              <Icon size={16} />
              {t(`tab.${item}`)}
            </Link>
          );
        })}
      </nav>

      {content}
    </>
  );
}
