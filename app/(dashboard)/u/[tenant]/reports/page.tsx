import { HoursReportTable, ReportFilterBar } from "@/components/HoursReport";
import PageHeader from "@/components/PageHeader";
import { getHoursReport } from "@/lib/reports-service";
import { withAccessRedirect } from "@/lib/tenant-access";
import { Timer } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Reports",
};

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
  const data = await withAccessRedirect(tenant, () => getHoursReport(tenant, query));
  // Neuer Filter → Tabelle mit frischem Bearbeitungsstand (keine Anpassungen
  // aus einem anderen Zeitraum/einer anderen Auswahl übernehmen).
  const tableKey = JSON.stringify([data.filters, data.range.from, data.range.to]);

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      {!data.timeTrackingEnabled && (
        <section className="mb-5 flex items-start gap-3 rounded-card border border-border bg-white px-5 py-4">
          <Timer className="mt-0.5 shrink-0 text-muted" size={18} />
          <div>
            <p className="text-[13.5px] font-semibold text-ink">{t("timeTrackingDisabledTitle")}</p>
            <p className="mt-1 text-[12.5px] text-muted">{t("timeTrackingDisabledHint")}</p>
          </div>
        </section>
      )}

      <ReportFilterBar
        key={`filters-${tableKey}`}
        filters={data.filters}
        range={data.range}
        today={data.today}
        employees={data.employees}
        teams={data.teams}
        locations={data.locations}
      />

      <HoursReportTable
        key={`table-${tableKey}`}
        tenant={tenant}
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
}
