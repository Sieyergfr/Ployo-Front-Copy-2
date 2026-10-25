import MyTimesActions from "@/components/dashboard/MyTimesActions";
import MyTimesBoard, { type MyTimesDay } from "@/components/dashboard/MyTimesBoard";
import { DbCard, DbPageHead } from "@/components/dashboard/ui";
import { auth } from "@/lib/auth";
import { computeOvertimeAccount, parseWeeklyHours } from "@/lib/my-times";
import { getMySelfServiceOverview } from "@/lib/self-service";
import { withAccessRedirect } from "@/lib/tenant-access";
import { getTenantsForUser } from "@/lib/tenants";
import { getMyTimeCorrectionRequests } from "@/lib/time-correction-service";
import { requiredBreakMinutes } from "@/lib/time-tracking";
import { getMyClockStatus, getMyTimeEntries } from "@/lib/time-tracking-service";
import { Mail, Timer } from "lucide-react";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

export const metadata = {
  title: "Meine Zeiten",
};

const NOT_LINKED = "Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden.";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function hm(minutes: number) {
  return `${Math.floor(minutes / 60)}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
}

async function tryLoad<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

export default async function MyTimesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("MyTimes");
  const tTracking = await getTranslations("TimeTracking");
  const tForms = await getTranslations("SelfServiceForms");
  const locale = await getLocale();
  const intlLocale = locale === "en" ? "en-GB" : "de-DE";
  const { tenant } = await params;
  const query = await searchParams;
  const status = await withAccessRedirect(tenant, () =>
    getMyClockStatus(tenant).catch((error: unknown) => {
      if (error instanceof Error && error.message === NOT_LINKED) return null;
      throw error;
    }),
  );
  const session = await auth.api.getSession({ headers: await headers() });
  const memberships = session?.user?.id ? await tryLoad(getTenantsForUser(session.user.id)) : null;
  const tenantName = memberships?.find((item) => item.tenant.slug === tenant)?.tenant.name ?? tenant;

  if (!status || !status.enabled) {
    return (
      <>
        <DbPageHead eyebrow={tenantName} title={t("title")} />
        <DbCard className="px-6 py-10 text-center">
          {status ? <Timer className="mx-auto mb-3 text-[#8f8f8a]" size={28} /> : <Mail className="mx-auto mb-3 text-[#8f8f8a]" size={28} />}
          <p className="text-[15px] font-semibold text-ink">{status ? tTracking("disabledTitle") : NOT_LINKED}</p>
          {status && <p className="mx-auto mt-2 max-w-md text-[13px] text-[#6e6e6b]">{tTracking("disabledHint")}</p>}
        </DbCard>
      </>
    );
  }

  const period = single(query.period) === "month" ? "month" : "week";
  const [entries, currentWeek, overview, corrections] = await Promise.all([
    getMyTimeEntries({ tenantSlug: tenant, period, date: single(query.date) }),
    getMyTimeEntries({ tenantSlug: tenant, period: "week" }),
    tryLoad(getMySelfServiceOverview(tenant, tForms)),
    tryLoad(getMyTimeCorrectionRequests(tenant)),
  ]);
  const employee = overview?.employee ?? null;
  const today = entries.today;
  const thisMonday = currentWeek.from;
  const overtimeFrom = addDays(thisMonday, -84);
  const overtimeFromClamped = employee?.startDate && employee.startDate > overtimeFrom ? employee.startDate : overtimeFrom;
  const pastEntries =
    overtimeFromClamped < thisMonday
      ? await tryLoad(getMyTimeEntries({ tenantSlug: tenant, from: overtimeFromClamped, to: addDays(thisMonday, -1) }))
      : null;
  const weeklyHours = parseWeeklyHours(employee?.weeklyHours);
  const overtime = pastEntries
    ? computeOvertimeAccount({ days: pastEntries.days, today: thisMonday, weeklyTargetMinutes: weeklyHours ? weeklyHours * 60 : null })
    : null;
  const weekTarget = weeklyHours ? weeklyHours * 60 : currentWeek.totals.plannedMinutes;
  const workedDays = entries.days.filter((day) => day.workedMinutes > 0);
  const averageBreak = workedDays.length
    ? Math.round(workedDays.reduce((sum, day) => sum + day.breakMinutes, 0) / workedDays.length)
    : 0;
  const breakViolations = workedDays.filter(
    (day) => day.breakMinutes < requiredBreakMinutes(day.workedMinutes + day.breakMinutes),
  ).length;
  const hoursFormat = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 });
  const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const days: MyTimesDay[] = entries.days.map((day) => ({
    date: day.date,
    workedMinutes: day.workedMinutes,
    plannedMinutes: day.plannedMinutes,
    breakMinutes: day.breakMinutes,
    entries: day.entries.map((entry) => ({
      clockInTime: entry.clockInTime,
      clockOutTime: entry.clockOutTime,
      isOpen: entry.isOpen,
      autoClosed: entry.autoClosed,
    })),
    shiftStart: day.shifts[0]?.startTime,
    shiftEnd: day.shifts[day.shifts.length - 1]?.endTime,
  }));
  const firstDate = asDate(entries.from);
  const lastDate = asDate(entries.to);
  const isoWeek = (() => {
    const date = new Date(firstDate);
    const dayNumber = (date.getUTCDay() + 6) % 7;

    date.setUTCDate(date.getUTCDate() - dayNumber + 3);

    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));

    return 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  })();
  const boardTitle =
    period === "month"
      ? new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" }).format(firstDate)
      : t("weekTitle", { week: isoWeek });
  const rangeLabel = `${new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "long", timeZone: "UTC" }).format(firstDate)} – ${new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(lastDate)}`;
  const base = `/u/${tenant}/zeiten?period=${period}`;

  return (
    <>
      <DbPageHead
        eyebrow={tenantName}
        title={t("title")}
        subtitle={employee ? [employee.name, employee.role, employee.location].filter(Boolean).join(" · ") : undefined}
        actions={<MyTimesActions tenant={tenant} period={period} />}
      />

      <div className="db-insights mb-5 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        <DbCard className="db-insight flex min-h-[150px] flex-col gap-2.5">
          <span className="text-[13px] font-medium text-[#6e6e6b]">{t("recordedThisWeek")}</span>
          <span className="flex items-baseline gap-2">
            <span className="font-display text-[40px] leading-none font-semibold tracking-[-1.4px]">{hm(currentWeek.totals.workedMinutes)}</span>
            {weekTarget > 0 && (
              <span className="text-[15px] text-[#6e6e6b]">{t("ofHours", { hours: hoursFormat.format(weekTarget / 60) })}</span>
            )}
          </span>
          <span className="mt-auto h-2 overflow-hidden rounded-full bg-[#f2f1ed]">
            <span
              className="block h-full rounded-full bg-[#8b6ed4]"
              style={{ width: `${weekTarget > 0 ? Math.min(100, (currentWeek.totals.workedMinutes / weekTarget) * 100) : 0}%` }}
            />
          </span>
        </DbCard>
        <DbCard className="db-insight flex min-h-[150px] flex-col gap-2.5">
          <span className="text-[13px] font-medium text-[#6e6e6b]">{t("overtimeAccount")}</span>
          <span className="flex items-baseline gap-2">
            <span className="font-display text-[40px] leading-none font-semibold tracking-[-1.4px]">
              {overtime && overtime.balanceMinutes > 0 ? "+" : ""}
              {hoursFormat.format((overtime?.balanceMinutes ?? 0) / 60)}
            </span>
            <span className="text-[15px] text-[#6e6e6b]">{t("hours")}</span>
          </span>
          <span className="mt-auto text-[13px] text-[#6e6e6b]">{t("overtimeHint")}</span>
        </DbCard>
        <DbCard className="db-insight flex min-h-[150px] flex-col gap-2.5">
          <span className="text-[13px] font-medium text-[#6e6e6b]">{t("breaks")}</span>
          <span className="flex items-baseline gap-2">
            <span className="font-display text-[40px] leading-none font-semibold tracking-[-1.4px]">{averageBreak}</span>
            <span className="text-[15px] text-[#6e6e6b]">{t("minutesPerDay")}</span>
          </span>
          <span
            className={`mt-auto inline-flex items-center gap-2 text-[13px] ${breakViolations === 0 ? "text-[#1f5d2c]" : "text-[#9a5b00]"}`}
          >
            <span className={`size-1.5 rounded-full ${breakViolations === 0 ? "bg-[#357a52]" : "bg-[#e07b00]"}`} />
            {breakViolations === 0 ? t("breaksOk") : t("breaksShort", { count: breakViolations })}
          </span>
        </DbCard>
      </div>

      <MyTimesBoard
        tenant={tenant}
        title={boardTitle}
        rangeLabel={rangeLabel}
        days={days}
        today={today}
        previousHref={entries.previous ? `${base}&date=${entries.previous}` : null}
        nextHref={entries.next && entries.next <= today ? `${base}&date=${entries.next}` : null}
        corrections={(corrections ?? []).map((item) => ({
          id: item.id,
          date: item.date,
          requestedStartTime: item.requestedStartTime,
          requestedEndTime: item.requestedEndTime,
          status: item.status,
          decisionNote: item.decisionNote,
        }))}
      />
    </>
  );
}
