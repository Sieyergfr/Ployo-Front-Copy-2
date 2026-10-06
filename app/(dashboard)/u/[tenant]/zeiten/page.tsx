import PageHeader from "@/components/PageHeader";
import TimeClockCard from "@/components/TimeClockCard";
import TimeEntriesDays, { TimeTotals } from "@/components/TimeEntriesDays";
import TimePeriodNav from "@/components/TimePeriodNav";
import { withAccessRedirect } from "@/lib/tenant-access";
import { getMyClockStatus, getMyTimeEntries } from "@/lib/time-tracking-service";
import { Mail, Timer } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Meine Zeiten",
};

const NOT_LINKED = "Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden.";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MyTimesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("TimeTracking");
  const { tenant } = await params;
  const query = await searchParams;
  const status = await withAccessRedirect(tenant, () =>
    getMyClockStatus(tenant).catch((error: unknown) => {
      if (error instanceof Error && error.message === NOT_LINKED) return null;
      throw error;
    }),
  );

  if (!status || !status.enabled) {
    return (
      <>
        <PageHeader eyebrow={t("eyebrow")} title={t("myTitle")} />
        <section className="rounded-card border border-border bg-white px-6 py-10 text-center">
          {status ? <Timer className="mx-auto mb-3 text-muted" size={28} /> : <Mail className="mx-auto mb-3 text-muted" size={28} />}
          <p className="text-[15px] font-semibold text-ink">{status ? t("disabledTitle") : NOT_LINKED}</p>
          {status && <p className="mx-auto mt-2 max-w-md text-[13px] text-muted">{t("disabledHint")}</p>}
        </section>
      </>
    );
  }

  const period = single(query.period) === "month" ? "month" : "week";
  const entries = await getMyTimeEntries({ tenantSlug: tenant, period, date: single(query.date) });

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("myTitle")} subtitle={t("mySubtitle")} />

      <div className="mb-7">
        <TimeClockCard tenant={tenant} initialStatus={status} />
      </div>

      <TimePeriodNav basePath={`/u/${tenant}/zeiten`} period={period} range={entries} today={entries.today} />
      <TimeTotals totals={entries.totals} />
      <TimeEntriesDays days={entries.days} today={entries.today} />
    </>
  );
}
