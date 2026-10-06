import PageHeader from "@/components/PageHeader";
import TimeEntriesDays, { AddTimeEntryButton, TimeTotals } from "@/components/TimeEntriesDays";
import TimePeriodNav from "@/components/TimePeriodNav";
import { withAccessRedirect } from "@/lib/tenant-access";
import { formatDuration } from "@/lib/time-tracking";
import { getTenantTimeEntries } from "@/lib/time-tracking-service";
import { Timer } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

export const metadata = {
  title: "Zeiterfassung",
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TimeTrackingAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("TimeTracking");
  const { tenant } = await params;
  const query = await searchParams;
  const period = single(query.period) === "month" ? "month" : "week";
  const data = await withAccessRedirect(tenant, () =>
    getTenantTimeEntries({
      tenantSlug: tenant,
      period,
      date: single(query.date),
      employeeId: single(query.employee),
    }),
  );
  const { today } = data;
  const basePath = `/u/${tenant}/zeiterfassung`;
  const selected = data.employees.find((employee) => employee.id === data.selectedEmployeeId) ?? null;
  const employeeHref = (employeeId: string | null) =>
    `${basePath}?${new URLSearchParams({
      period,
      date: data.from,
      ...(employeeId ? { employee: employeeId } : {}),
    }).toString()}`;

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={selected ? selected.name : t("managerTitle")}
        subtitle={t("managerSubtitle")}
      >
        {selected && data.canWrite && (
          <AddTimeEntryButton tenant={tenant} employeeId={selected.id} defaultDate={today} />
        )}
      </PageHeader>

      {!data.timeTrackingEnabled && (
        <section className="mb-5 flex items-start gap-3 rounded-card border border-border bg-white px-5 py-4">
          <Timer className="mt-0.5 shrink-0 text-muted" size={18} />
          <div>
            <p className="text-[13.5px] font-semibold text-ink">{t("disabledTitle")}</p>
            <p className="mt-1 text-[12.5px] text-muted">{t("disabledHint")}</p>
          </div>
        </section>
      )}

      <TimePeriodNav
        basePath={basePath}
        period={period}
        range={data}
        today={today}
        extraParams={data.selectedEmployeeId ? { employee: data.selectedEmployeeId } : {}}
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <section className="h-fit overflow-hidden rounded-card border border-border bg-white">
          <Link
            href={employeeHref(null)}
            className={`block border-b border-border-soft px-5 py-3 text-[13px] font-semibold ${
              selected ? "text-muted-2" : "bg-bg text-ink"
            }`}
          >
            {t("allEmployees")}
          </Link>
          {data.employees.map((employee) => (
            <Link
              key={employee.id}
              href={employeeHref(employee.id)}
              className={`flex items-center justify-between gap-3 border-b border-border-soft px-5 py-3 last:border-b-0 ${
                employee.id === data.selectedEmployeeId ? "bg-bg" : "hover:bg-bg/60"
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold text-ink">{employee.name}</div>
                <div className="flex flex-wrap gap-x-2 text-[11.5px] text-muted">
                  {employee.team && <span>{employee.team}</span>}
                  {employee.isClockedIn && <span className="text-[#1F7A3E]">● {t("clockedInNow")}</span>}
                  {employee.autoClosedCount > 0 && (
                    <span className="text-[#9A5B00]">
                      {t("autoClosedCount", { count: employee.autoClosedCount })}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right font-mono text-[12px] tabular-nums">
                <div className="font-semibold text-ink">{formatDuration(employee.workedMinutes)}</div>
                <div className="text-muted">
                  {t("columnPlanned")} {formatDuration(employee.plannedMinutes)}
                </div>
              </div>
            </Link>
          ))}
        </section>

        <div className="min-w-0">
          {selected ? (
            <>
              <TimeTotals totals={data.totals} />
              <TimeEntriesDays
                days={data.days}
                today={today}
                edit={{
                  tenant,
                  employeeId: selected.id,
                  canWrite: data.canWrite,
                  canDelete: data.canDelete,
                }}
              />
            </>
          ) : (
            <>
              <TimeTotals totals={data.totals} />
              <section className="rounded-card border border-border bg-white px-6 py-10 text-center text-[13px] text-muted">
                {t("selectEmployeeHint")}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
