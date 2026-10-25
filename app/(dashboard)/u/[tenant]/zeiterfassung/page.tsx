import TimeCorrectionsList from "@/components/dashboard/time/TimeCorrectionsList";
import { DbCard, DbPageHead } from "@/components/dashboard/ui";
import TimeEntriesDays, { AddTimeEntryButton, TimeTotals } from "@/components/TimeEntriesDays";
import TimePeriodNav from "@/components/TimePeriodNav";
import { auth } from "@/lib/auth";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { getLocationsForTenant } from "@/lib/location-service";
import { parseWeeklyHours } from "@/lib/my-times";
import { paletteHex } from "@/lib/org-options";
import { getSicknessForTenant } from "@/lib/sickness";
import { withAccessRedirect } from "@/lib/tenant-access";
import { getTenantsForUser } from "@/lib/tenants";
import { getTenantTimeCorrectionRequests } from "@/lib/time-correction-service";
import { requiredBreakMinutes } from "@/lib/time-tracking";
import { getTenantTimeEntries } from "@/lib/time-tracking-service";
import { getVacationRequestsForTenant } from "@/lib/vacation-service";
import { ArrowLeft, ChevronLeft, ChevronRight, Lock, Timer } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

export const metadata = {
  title: "Zeiterfassung",
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function tryLoad<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

function hm(minutes: number, signed = false) {
  const sign = minutes < 0 ? "−" : signed ? (minutes === 0 ? "±" : "+") : "";
  const value = Math.abs(Math.round(minutes));

  return `${sign}${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

const avatarColors = ["#2a5bc9", "#4a5568", "#1d8a65", "#c9622a", "#7a3c9c", "#b7791f", "#168a8a", "#c23b7a"];

function colorFor(name: string) {
  let hash = 0;

  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;

  return avatarColors[hash % avatarColors.length];
}

/** Ab dieser Abweichung vom Plan (Minuten) gilt jemand als "über Plan". */
const OVER_PLAN_MINUTES = 60;
/** Höchstarbeitszeit pro Tag (§3 ArbZG). */
const MAX_DAY_MINUTES = 10 * 60;

export default async function TimeTrackingAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("TimeUi");
  const tTracking = await getTranslations("TimeTracking");
  const locale = await getLocale();
  const intlLocale = locale === "en" ? "en-GB" : "de-DE";
  const { tenant } = await params;
  const query = await searchParams;
  const selectedEmployee = single(query.employee);
  const period = single(query.period) === "month" && selectedEmployee ? "month" : "week";
  const data = await withAccessRedirect(tenant, () =>
    getTenantTimeEntries({ tenantSlug: tenant, period, date: single(query.date), employeeId: selectedEmployee }),
  );
  const session = await auth.api.getSession({ headers: await headers() });
  const memberships = session?.user?.id ? await tryLoad(getTenantsForUser(session.user.id)) : null;
  const tenantName = memberships?.find((item) => item.tenant.slug === tenant)?.tenant.name ?? tenant;
  const { today } = data;
  const basePath = `/u/${tenant}/zeiterfassung`;
  const selected = data.employees.find((employee) => employee.id === data.selectedEmployeeId) ?? null;

  // ── Einzelansicht einer Person (Bearbeiten wie bisher) ───────────────
  if (selected) {
    return (
      <>
        <DbPageHead
          eyebrow={tenantName}
          title={selected.name}
          subtitle={t("detailSubtitle")}
          actions={
            <>
              <Link
                href={`${basePath}?${new URLSearchParams({ date: data.from }).toString()}`}
                className="db-btn2 db-focus inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-[#ecebe7] bg-[#f2f1ed] px-4 text-[14px] font-semibold text-ink no-underline"
              >
                <ArrowLeft size={15} />
                {t("backToAll")}
              </Link>
              {data.canWrite && <AddTimeEntryButton tenant={tenant} employeeId={selected.id} defaultDate={today} />}
            </>
          }
        />
        <TimePeriodNav basePath={basePath} period={period} range={data} today={today} extraParams={{ employee: selected.id }} />
        <TimeTotals totals={data.totals} />
        <TimeEntriesDays
          days={data.days}
          today={today}
          edit={{ tenant, employeeId: selected.id, canWrite: data.canWrite, canDelete: data.canDelete }}
        />
      </>
    );
  }

  // ── Wochenübersicht aller Personen ───────────────────────────────────
  const [employees, locations, sickness, vacations, corrections] = await Promise.all([
    tryLoad(getEmployeesForTenant(tenant)),
    tryLoad(getLocationsForTenant(tenant)),
    tryLoad(getSicknessForTenant(tenant)),
    tryLoad(getVacationRequestsForTenant(tenant)),
    tryLoad(getTenantTimeCorrectionRequests({ tenantSlug: tenant, status: "all" })),
  ]);
  const employeeInfo = new Map((employees ?? []).map((employee) => [employee.dbId ?? employee.id, employee]));
  const locationFilter = single(query.standort) ?? "";
  const view = single(query.ansicht) === "korrekturen" ? "corrections" : "times";
  const sort = single(query.sort) === "saldo" ? "saldo" : single(query.sort) === "auffaellig" ? "issues" : "name";
  const sickRanges = [...(sickness?.current ?? []), ...(sickness?.history ?? [])].map((item) => ({
    employeeId: item.employeeId,
    from: item.startDateIso,
    to: item.endDateIso || today,
  }));
  const vacationRanges = (vacations ?? [])
    .filter((request) => request.status === "approved" && request.employeeId && request.startDateIso)
    .map((request) => ({ employeeId: request.employeeId!, from: request.startDateIso!, to: request.endDateIso || request.startDateIso! }));
  const inRange = (ranges: Array<{ employeeId: string; from: string; to: string }>, employeeId: string, date: string) =>
    ranges.some((range) => range.employeeId === employeeId && range.from <= date && range.to >= date);
  const dayList = data.days.map((day) => day.date);
  const rows = data.employees
    .filter((summary) => {
      if (!locationFilter) return true;

      const info = employeeInfo.get(summary.id);

      return info ? (info.locations?.length ? info.locations : [info.location]).includes(locationFilter) : false;
    })
    .map((summary) => {
      const info = employeeInfo.get(summary.id);
      const cells = data.days.map((day) => {
        const entries = day.entries.filter((entry) => entry.employeeId === summary.id);
        const worked = entries.reduce((sum, entry) => sum + entry.workedMinutes, 0);
        const breaks = entries.reduce((sum, entry) => sum + entry.breakMinutes, 0);
        const running = entries.some((entry) => entry.isOpen) && day.date === today;
        const missingOut = entries.some((entry) => entry.autoClosed || (entry.isOpen && day.date < today));
        const long = worked > MAX_DAY_MINUTES || (worked > 0 && !running && breaks < requiredBreakMinutes(worked + breaks));

        return {
          date: day.date,
          worked,
          running,
          missingOut,
          long,
          sick: entries.length === 0 && inRange(sickRanges, summary.id, day.date),
          vacation: entries.length === 0 && inRange(vacationRanges, summary.id, day.date),
        };
      });
      const weeklyTarget = parseWeeklyHours(info?.weeklyHours);
      // Ohne Schichtplan gilt die Wochenarbeitszeit; Urlaubs- und Krankheitstage
      // (Mo–Fr) mindern das Soll anteilig, statt als Minusstunden zu zählen.
      const absentWeekdays = cells.filter((cell) => (cell.vacation || cell.sick) && asDate(cell.date).getUTCDay() % 6 !== 0).length;
      const target =
        summary.plannedMinutes > 0 ? summary.plannedMinutes : weeklyTarget ? Math.round((weeklyTarget * 60 * Math.max(0, 5 - absentWeekdays)) / 5) : 0;
      const issues = cells.filter((cell) => cell.missingOut || cell.long).length;

      return {
        ...summary,
        initials: info?.initials ?? summary.name.slice(0, 2).toUpperCase(),
        subtitle: [(info?.teams?.length ? info.teams : [info?.team]).filter(Boolean).join(", "), info?.weeklyHours].filter(Boolean).join(" · "),
        cells,
        target,
        balance: target > 0 ? summary.workedMinutes - target : 0,
        issues,
      };
    })
    .sort((a, b) =>
      sort === "saldo" ? b.balance - a.balance : sort === "issues" ? b.issues - a.issues || a.name.localeCompare(b.name) : a.name.localeCompare(b.name, intlLocale),
    );
  const clockedIn = rows.filter((row) => row.isClockedIn);
  const totalWorked = rows.reduce((sum, row) => sum + row.workedMinutes, 0);
  const totalTarget = rows.reduce((sum, row) => sum + row.target, 0);
  const teamBalance = rows.reduce((sum, row) => sum + row.balance, 0);
  const overPlan = rows.filter((row) => row.balance > OVER_PLAN_MINUTES).length;
  const pendingCorrections = (corrections ?? []).filter((request) => request.status === "pending").length;
  const anomalies = rows.reduce((sum, row) => sum + row.issues, 0);
  const isoWeek = (() => {
    const date = new Date(`${data.from}T12:00:00Z`);
    const thursday = new Date(date);

    thursday.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));

    const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));

    return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  })();
  const shortDate = new Intl.DateTimeFormat(intlLocale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const fullDate = new Intl.DateTimeFormat(intlLocale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const weekday = new Intl.DateTimeFormat(intlLocale, { weekday: "short", timeZone: "UTC" });
  const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const isCurrentWeek = data.from <= today && data.to >= today;
  const href = (overrides: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const values: Record<string, string | null> = {
      date: data.from,
      standort: locationFilter || null,
      ansicht: view === "corrections" ? "korrekturen" : null,
      sort: sort === "name" ? null : sort === "saldo" ? "saldo" : "auffaellig",
      ...overrides,
    };

    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
    }

    return `${basePath}?${params.toString()}`;
  };
  const kpi = (label: string, value: string, unit: string, footer: React.ReactNode, dot?: string) => (
    <DbCard className="db-insight relative flex flex-col gap-2 p-[18px]">
      <span className="text-[13px] font-medium text-[#6e6e6b]">{label}</span>
      {dot && <span className="absolute top-[18px] right-[18px] size-2 rounded-full" style={{ background: dot }} />}
      <span className="flex items-baseline gap-1.5">
        <span className="font-display text-[30px] leading-none font-semibold tracking-[-1px]">{value}</span>
        <span className="text-[14px] text-[#6e6e6b]">{unit}</span>
      </span>
      {footer}
    </DbCard>
  );

  return (
    <>
      <DbPageHead eyebrow={tenantName} title={t("title")} subtitle={t("subtitle", { company: tenantName })} />

      {!data.timeTrackingEnabled && (
        <DbCard className="mb-5 flex items-start gap-3 p-5">
          <Timer className="mt-0.5 shrink-0 text-[#8f8f8a]" size={18} />
          <span>
            <p className="m-0 text-[14px] font-semibold">{tTracking("disabledTitle")}</p>
            <p className="m-0 mt-1 text-[13px] text-[#6e6e6b]">{tTracking("disabledHint")}</p>
          </span>
        </DbCard>
      )}

      <DbCard className="mb-5 flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={href({ date: data.previous })}
              aria-label={t("previousWeek")}
              className="db-btn2 flex size-10 items-center justify-center rounded-[10px] border border-[#ecebe7] bg-[#f2f1ed] text-ink"
            >
              <ChevronLeft size={16} />
            </Link>
            <span className="flex flex-col">
              <span className="flex items-baseline gap-1.5">
                <span className="font-display text-[18px] font-semibold">{t("week", { week: isoWeek })}</span>
                {isCurrentWeek ? (
                  <span className="text-[12px] font-semibold text-[#6b4fc4]">· {t("thisWeek")}</span>
                ) : (
                  <Link href={href({ date: today })} className="text-[12px] font-semibold text-[#6b4fc4] no-underline">
                    · {t("toThisWeek")}
                  </Link>
                )}
              </span>
              <span className="text-[12.5px] text-[#6e6e6b]">
                {fullDate.format(asDate(data.from))} – {fullDate.format(asDate(data.to))}
              </span>
            </span>
            {data.next && data.next <= today ? (
              <Link
                href={href({ date: data.next })}
                aria-label={t("nextWeek")}
                className="db-btn2 flex size-10 items-center justify-center rounded-[10px] border border-[#ecebe7] bg-[#f2f1ed] text-ink"
              >
                <ChevronRight size={16} />
              </Link>
            ) : (
              <span className="flex size-10 items-center justify-center rounded-[10px] border border-[#ecebe7] text-[#c9c8c3]">
                <ChevronRight size={16} />
              </span>
            )}
          </div>
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[#8f8f8a]">
            <Lock size={13} />
            {t("privacy")}
          </span>
        </div>
        {(locations ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Link
              href={href({ standort: null })}
              className={`inline-flex min-h-8 items-center rounded-[8px] px-3 text-[13px] font-semibold no-underline ${!locationFilter ? "bg-ink text-white" : "border border-[#ecebe7] bg-white text-ink"}`}
            >
              {t("allLocations")}
            </Link>
            {(locations ?? []).map((location) => (
              <Link
                key={location.id}
                href={href({ standort: location.name })}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-semibold no-underline ${locationFilter === location.name ? "bg-ink text-white" : "border border-[#ecebe7] bg-white text-ink"}`}
              >
                <span className="h-3 w-[3px] rounded-full" style={{ background: paletteHex(location.accentClassName, "#8b6ed4") }} />
                {location.name}
              </Link>
            ))}
          </div>
        )}
      </DbCard>

      <div className="mb-5 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        {kpi(
          t("kpi.clockedIn"),
          String(clockedIn.length),
          t("kpi.of", { total: rows.length }),
          <span className="truncate text-[13px] text-[#6e6e6b]">{clockedIn.map((row) => row.name.split(/\s+/)[0]).join(", ") || "–"}</span>,
          clockedIn.length > 0 ? "#357a52" : undefined,
        )}
        {kpi(
          t("kpi.recorded", { week: isoWeek }),
          hm(totalWorked),
          totalTarget > 0 ? t("kpi.ofHours", { hours: hm(totalTarget) }) : "",
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#f2f1ed]">
            <span className="block h-full rounded-full bg-[#8b6ed4]" style={{ width: `${totalTarget > 0 ? Math.min(100, (totalWorked / totalTarget) * 100) : 0}%` }} />
          </span>,
        )}
        {kpi(t("kpi.balance"), hm(teamBalance, true), t("kpi.hours"), <span className="text-[13px] text-[#6e6e6b]">{t("kpi.overPlan", { count: overPlan })}</span>)}
        {kpi(
          t("kpi.review"),
          String(pendingCorrections),
          t("kpi.corrections"),
          <span className="text-[13px] text-[#6e6e6b]">{t("kpi.anomalies", { count: anomalies })}</span>,
          pendingCorrections + anomalies > 0 ? "#e07b00" : undefined,
        )}
      </div>

      <DbCard className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ecebe7] px-5">
          <nav className="flex gap-6">
            <Link
              href={href({ ansicht: null })}
              className={`-mb-px border-b-2 py-3.5 text-[14px] no-underline ${view === "times" ? "border-[#8b6ed4] font-semibold text-ink" : "border-transparent font-medium text-[#6e6e6b]"}`}
            >
              {t("tabTimes")}
            </Link>
            <Link
              href={href({ ansicht: "korrekturen" })}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 py-3.5 text-[14px] no-underline ${view === "corrections" ? "border-[#8b6ed4] font-semibold text-ink" : "border-transparent font-medium text-[#6e6e6b]"}`}
            >
              {t("tabCorrections")}
              {pendingCorrections > 0 && <span className="rounded-full bg-[#e07b00] px-1.5 text-[11px] font-bold text-white">{pendingCorrections}</span>}
            </Link>
          </nav>
          {view === "times" && (
            <span className="flex items-center gap-2 py-2">
              <span className="font-mono text-[10px] tracking-[0.1em] text-[#9a9a96] uppercase">{t("sortBy")}</span>
              <span className="inline-flex gap-0.5 rounded-[10px] bg-[#f2f1ed] p-1">
                {(
                  [
                    ["name", null],
                    ["saldo", "saldo"],
                    ["issues", "auffaellig"],
                  ] as const
                ).map(([id, param]) => (
                  <Link
                    key={id}
                    href={href({ sort: param })}
                    className={`inline-flex min-h-8 items-center rounded-[7px] px-3 text-[13px] font-semibold no-underline ${sort === id ? "bg-white text-ink shadow-[0_1px_2px_rgba(14,14,14,0.08)]" : "text-[#6e6e6b]"}`}
                  >
                    {t(`sort.${id}`)}
                  </Link>
                ))}
              </span>
            </span>
          )}
        </div>

        {view === "corrections" ? (
          <TimeCorrectionsList tenant={tenant} requests={corrections ?? []} canDecide={data.canWrite} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] border-collapse text-left">
                <thead>
                  <tr className="font-mono text-[10px] tracking-[0.1em] text-[#6e6e6b] uppercase">
                    <th className="px-5 py-3 font-normal">{t("columns.employee")}</th>
                    {dayList.map((date) => (
                      <th key={date} className={`px-1 py-3 text-center font-normal ${date === today ? "text-[#6b4fc4]" : ""}`}>
                        {weekday.format(asDate(date)).replace(".", "")}
                        <br />
                        <span className="normal-case">{shortDate.format(asDate(date))}</span>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-right font-normal">{t("columns.actualTarget")}</th>
                    <th className="px-3 py-3 text-right font-normal">{t("columns.balance")}</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const rowHref = `${basePath}?${new URLSearchParams({ employee: row.id, date: data.from }).toString()}`;

                    return (
                      <tr key={row.id} className="border-t border-[#f0efeb] hover:bg-[#fafaf8]">
                        <td className="px-5 py-2.5">
                          <Link href={rowHref} className="flex items-center gap-3 text-ink no-underline">
                            <span className="relative shrink-0">
                              <span
                                className="flex size-9 items-center justify-center rounded-full text-[12px] font-bold text-white"
                                style={{ background: colorFor(row.name) }}
                              >
                                {row.initials}
                              </span>
                              {row.isClockedIn && (
                                <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-[#357a52] shadow-[0_0_0_2px_#ffffff]" />
                              )}
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-[14px] font-semibold">{row.name}</span>
                              <span className="max-w-[170px] truncate text-[12px] text-[#6e6e6b]">{row.subtitle}</span>
                            </span>
                          </Link>
                        </td>
                        {row.cells.map((cell) => (
                          <td key={cell.date} className="px-1 py-1.5 text-center">
                            {cell.sick ? (
                              <span className="flex min-h-[40px] items-center justify-center rounded-[9px] bg-[rgba(180,51,42,0.08)] text-[13px] font-semibold text-[#b4332a]">
                                {t("sick")}
                              </span>
                            ) : cell.vacation ? (
                              <span className="flex min-h-[40px] items-center justify-center rounded-[9px] bg-[rgba(22,138,138,0.10)] text-[13px] font-semibold text-[#16707a]">
                                {t("vacation")}
                              </span>
                            ) : cell.worked > 0 || cell.running || cell.missingOut ? (
                              <span className="relative inline-flex flex-col items-center px-2">
                                <span
                                  className={`font-mono text-[14px] font-semibold ${cell.missingOut ? "text-[#b4332a]" : cell.running ? "text-[#357a52]" : "text-ink"}`}
                                >
                                  {hm(cell.worked)}
                                </span>
                                {cell.running && <span className="text-[11px] text-[#357a52]">{t("running")}</span>}
                                {cell.missingOut && <span className="text-[11px] font-semibold text-[#b4332a]">{t("noClockOut")}</span>}
                                {(cell.missingOut || cell.long) && (
                                  <span
                                    className="absolute -top-1 right-0 size-1.5 rounded-full"
                                    style={{ background: cell.missingOut ? "#b4332a" : "#e07b00" }}
                                  />
                                )}
                              </span>
                            ) : (
                              <span className="text-[#c9c8c3]">–</span>
                            )}
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-right">
                          <span className="flex flex-col items-end">
                            <span className="font-mono text-[14px] font-semibold">{hm(row.workedMinutes)}</span>
                            {row.target > 0 && <span className="text-[12px] text-[#9a9a96]">{t("ofTarget", { hours: hm(row.target) })}</span>}
                          </span>
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right font-mono text-[14px] font-semibold ${row.balance > OVER_PLAN_MINUTES ? "text-[#9a5b00]" : row.balance >= 0 ? "text-[#357a52]" : "text-ink"}`}
                        >
                          {row.target > 0 ? hm(row.balance, true) : "–"}
                        </td>
                        <td className="pr-4">
                          <Link href={rowHref} aria-label={row.name} className="text-[#9a9a96]">
                            <ChevronRight size={16} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 && <p className="px-5 py-10 text-center text-[13px] text-[#6e6e6b]">{t("empty")}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-[#ecebe7] px-5 py-3 text-[12.5px] text-[#6e6e6b]">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[#357a52]" />
                {t("legend.running")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[#b4332a]" />
                {t("legend.noClockOut")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[#e07b00]" />
                {t("legend.limits")}
              </span>
              <span className="text-[#9a9a96]">{t("legend.hint")}</span>
            </div>
          </>
        )}
      </DbCard>
    </>
  );
}
