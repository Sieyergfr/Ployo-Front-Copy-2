import ClockHero from "@/components/dashboard/ClockHero";
import MyDocumentLink from "@/components/dashboard/MyDocumentLink";
import MyQuickActions from "@/components/dashboard/MyQuickActions";
import { DbCard, DbCardTitle, DbPageHead } from "@/components/dashboard/ui";
import { LinkProfilePicker, UnlinkOwnEmployeeButton } from "@/components/SelfServiceEmployeeLink";
import { MyProfileCompletionCard } from "@/components/SelfServiceForms";
import { auth } from "@/lib/auth";
import { getUnlinkedEmployeesForTenant } from "@/lib/employee-service";
import { getGermanHolidays } from "@/lib/german-holidays";
import { computeOvertimeAccount, parseWeeklyHours } from "@/lib/my-times";
import { paletteHex } from "@/lib/org-options";
import { getMyPayrollStatements, getMySelfServiceOverview } from "@/lib/self-service";
import { getMyPublishedShiftsInRange, type MyRangeShift } from "@/lib/shift-service";
import { withAccessRedirect } from "@/lib/tenant-access";
import { getTenantsForUser } from "@/lib/tenants";
import { getMyTimeCorrectionRequests } from "@/lib/time-correction-service";
import { getMyClockStatus, getMyTimeEntries } from "@/lib/time-tracking-service";
import { getMyWishFreeRequests } from "@/lib/wish-free-service";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, FileText, Link2, Sparkles, Sun } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

export const metadata = {
  title: "Mein Bereich",
};

async function tryLoad<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function zonedToday(timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );

  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function shiftMinutes(shift: Pick<MyRangeShift, "startTime" | "endTime" | "breakMinutes">) {
  const [sh, sm] = shift.startTime.split(":").map(Number);
  const [eh, em] = shift.endTime.split(":").map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);

  if (minutes <= 0) minutes += 24 * 60;

  return Math.max(0, minutes - (shift.breakMinutes ?? 0));
}

function shortHour(time: string) {
  return time.endsWith(":00") ? time.slice(0, 2) : time;
}

const statusTone = {
  pending: { color: "#9a5b00", bg: "rgba(224,123,0,0.10)", ring: "rgba(224,123,0,0.25)", dot: "#e07b00" },
  open: { color: "#9a5b00", bg: "rgba(224,123,0,0.10)", ring: "rgba(224,123,0,0.25)", dot: "#e07b00" },
  approved: { color: "#1f5d2c", bg: "rgba(53,122,82,0.10)", ring: "rgba(53,122,82,0.25)", dot: "#357a52" },
  rejected: { color: "#b4332a", bg: "rgba(180,51,42,0.08)", ring: "rgba(180,51,42,0.25)", dot: "#b4332a" },
  withdrawn: { color: "#6e6e6b", bg: "#f2f1ed", ring: "#ecebe7", dot: "#8f8f8a" },
} as const;

export default async function SelfServicePage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/mein-bereich">) {
  const t = await getTranslations("MyArea");
  const tForms = await getTranslations("SelfServiceForms");
  const locale = await getLocale();
  const intlLocale = locale === "en" ? "en-GB" : "de-DE";
  const { tenant } = await params;
  const query = await searchParams;
  const overview = await withAccessRedirect(tenant, () => getMySelfServiceOverview(tenant, tForms));
  const session = await auth.api.getSession({ headers: await headers() });
  const memberships = session?.user?.id ? await tryLoad(getTenantsForUser(session.user.id)) : null;
  const membership = memberships?.find((item) => item.tenant.slug === tenant);
  const tenantName = membership?.tenant.name ?? tenant;
  const timeZone = membership?.tenant.timezone || "Europe/Berlin";
  const isOwnerLike = membership ? ["OWNER", "ADMIN", "HR"].includes(membership.role) : false;

  if (!overview.employee) {
    const unlinkedEmployees = await getUnlinkedEmployeesForTenant(tenant).catch(() => []);

    return (
      <>
        <DbPageHead eyebrow={tenantName} title={t("title")} subtitle={t("notLinkedSubtitle")} />
        <DbCard className="db-link-grid grid gap-3 p-3 [grid-template-columns:minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="min-w-0 p-[clamp(16px,3vw,28px)]">
            <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-[rgba(139,110,212,0.12)] text-[#7a5fd0] shadow-[inset_0_0_0_1px_rgba(139,110,212,0.25),0_12px_30px_-12px_rgba(139,110,212,0.7)]">
              <Link2 size={22} />
            </span>
            <h2 className="mt-5 mb-0 font-display text-[24px] leading-[1.15] font-semibold tracking-[-0.6px]">
              {t("notLinkedTitle")}
            </h2>
            <p className="mt-2.5 mb-6 max-w-[560px] text-[14px] leading-[1.6] text-[#6e6e6b]">
              {isOwnerLike ? t("notLinkedOwnerText") : t("notLinkedText")}
            </p>
            <LinkProfilePicker tenant={tenant} unlinkedEmployees={unlinkedEmployees} />
          </div>
          <div className="db-hero relative flex flex-col overflow-hidden rounded-[14px] bg-[#0d0d0d] p-8 text-[#ededea]">
            <div className="db-hero-glow" aria-hidden="true" />
            <div className="db-hero-grid" aria-hidden="true" />
            <span className="relative font-mono text-[10px] tracking-[0.2em] text-[#a3a39e] uppercase">
              {t("afterLinking")}
            </span>
            <ul className="relative m-0 mt-6 flex list-none flex-col gap-3 p-0">
              {[
                { icon: Clock, label: t("benefitClock") },
                { icon: CalendarDays, label: t("benefitShifts") },
                { icon: Sun, label: t("benefitRequests") },
                { icon: FileText, label: t("benefitDocuments") },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-3 text-[14.5px] text-white">
                  <span className="flex size-8 items-center justify-center rounded-[9px] bg-white/5 text-[#c9b8f5] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]">
                    <item.icon size={15} />
                  </span>
                  {item.label}
                </li>
              ))}
            </ul>
            {isOwnerLike && (
              <p className="relative mt-auto pt-8 text-[12.5px] leading-[1.55] text-[#8f8f8a]">{t("ownerRightsHint")}</p>
            )}
          </div>
        </DbCard>
      </>
    );
  }

  const { employee, vacationRequests, sicknessReports, documents, profileFields, profileCompleteness } = overview;
  const today = zonedToday(timeZone);
  const monthParam = typeof query.monat === "string" && /^\d{4}-\d{2}$/.test(query.monat) ? query.monat : today.date.slice(0, 7);
  const monthStart = `${monthParam}-01`;
  const monthDate = new Date(`${monthStart}T12:00:00Z`);
  const monthEnd = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const rangeFrom = monthStart < today.date ? monthStart : today.date;
  const rangeTo = monthEnd > addDays(today.date, 13) ? monthEnd : addDays(today.date, 13);
  const weekday = (new Date(`${today.date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const thisMonday = addDays(today.date, -weekday);
  const overtimeFrom = addDays(thisMonday, -84);
  const overtimeFromClamped = employee.startDate && employee.startDate > overtimeFrom ? employee.startDate : overtimeFrom;

  const [clockStatus, shifts, wishFree, corrections, payroll, weekEntries, pastEntries] = await Promise.all([
    tryLoad(getMyClockStatus(tenant)),
    tryLoad(getMyPublishedShiftsInRange(tenant, { from: rangeFrom, to: rangeTo })),
    tryLoad(getMyWishFreeRequests(tenant)),
    tryLoad(getMyTimeCorrectionRequests(tenant)),
    tryLoad(getMyPayrollStatements(tenant)),
    tryLoad(getMyTimeEntries({ tenantSlug: tenant })),
    overtimeFromClamped < thisMonday
      ? tryLoad(getMyTimeEntries({ tenantSlug: tenant, from: overtimeFromClamped, to: addDays(thisMonday, -1) }))
      : Promise.resolve(null),
  ]);
  const timeTrackingEnabled = clockStatus?.enabled ?? false;
  const shiftList = shifts ?? [];
  const approvedVacations = vacationRequests.filter((request) => request.status === "approved");
  const wishFreeList = wishFree ?? [];
  const holidays = new Map([
    ...getGermanHolidays(monthDate.getUTCFullYear(), null),
    ...getGermanHolidays(new Date(`${today.date}T12:00:00Z`).getUTCFullYear(), null),
  ]);
  const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const fullDate = new Intl.DateTimeFormat(intlLocale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const shortDate = new Intl.DateTimeFormat(intlLocale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const weekdayShort = new Intl.DateTimeFormat(intlLocale, { weekday: "short", timeZone: "UTC" });
  const firstName = employee.name.trim().split(/\s+/)[0];

  function dayInfo(date: string) {
    return {
      shifts: shiftList.filter((shift) => shift.date === date),
      vacation: approvedVacations.find((request) => request.startDate <= date && request.endDate >= date),
      sick: sicknessReports.find(
        (report) => report.startDate <= date && (report.endDate ?? today.date) >= date && report.startDate <= today.date,
      ),
      wishFree: wishFreeList.find((request) => request.date === date && request.status !== "rejected"),
      holiday: holidays.get(date),
    };
  }

  // ── Nächste Schichten (5 Tage ab heute) ──────────────────────────────
  const nextDays = Array.from({ length: 5 }, (_, index) => addDays(today.date, index)).map((date) => ({
    date,
    ...dayInfo(date),
  }));

  // ── Anfragen ─────────────────────────────────────────────────────────
  const requests = [
    ...vacationRequests.map((request) => ({
      key: `v-${request.id}`,
      sort: request.startDate,
      title: t("requests.vacation"),
      detail: `${fullDate.format(asDate(request.startDate))} – ${fullDate.format(asDate(request.endDate))} · ${t("days", { count: request.days })}`,
      status: request.status as keyof typeof statusTone,
    })),
    ...wishFreeList.map((request) => ({
      key: `w-${request.dbId}`,
      sort: request.date,
      title: t("requests.wishFree"),
      detail: `${weekdayShort.format(asDate(request.date))}, ${fullDate.format(asDate(request.date))}`,
      status: request.status as keyof typeof statusTone,
    })),
    ...(corrections ?? []).map((request) => ({
      key: `c-${request.id}`,
      sort: request.date,
      title: t("requests.correction"),
      detail: `${weekdayShort.format(asDate(request.date))}, ${shortDate.format(asDate(request.date))}. · ${request.requestedStartTime}–${request.requestedEndTime}`,
      status: request.status as keyof typeof statusTone,
    })),
  ]
    .sort((a, b) => b.sort.localeCompare(a.sort))
    .slice(0, 4);

  // ── Dokumente ────────────────────────────────────────────────────────
  const payrollFileIds = new Set((payroll ?? []).map((statement) => statement.fileId));
  const recentLimit = addDays(today.date, -30);
  const documentRows = [
    ...(payroll ?? []).slice(0, 2).map((statement) => ({
      id: statement.fileId,
      name: t("payslip", { period: statement.period }),
      isNew: statement.issuedAt >= recentLimit,
    })),
    ...documents
      .filter((document) => !payrollFileIds.has(document.id))
      .slice(0, 3)
      .map((document) => ({ id: document.id, name: document.name, isNew: false })),
  ].slice(0, 4);

  // ── Monatskalender ───────────────────────────────────────────────────
  const firstWeekday = (monthDate.getUTCDay() + 6) % 7;
  const daysInMonth = Number(monthEnd.slice(8));
  const monthCells = Array.from({ length: daysInMonth }, (_, index) => {
    const date = `${monthParam}-${String(index + 1).padStart(2, "0")}`;

    return { date, day: index + 1, ...dayInfo(date) };
  });
  const monthShifts = shiftList.filter((shift) => shift.date >= monthStart && shift.date <= monthEnd);
  const monthHours = monthShifts.reduce((sum, shift) => sum + shiftMinutes(shift), 0) / 60;
  const legendLocations = Array.from(
    new Map(monthShifts.map((shift) => [shift.location, paletteHex(shift.locationAccentClassName, "#8b6ed4")])).entries(),
  ).filter(([name]) => name);
  const previousMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const nextMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
  const monthLabel = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate);
  const todayShift = dayInfo(today.date).shifts[0];

  // ── Kennzahlen ───────────────────────────────────────────────────────
  const weeklyHours = parseWeeklyHours(employee.weeklyHours);
  const overtime = pastEntries
    ? computeOvertimeAccount({
        days: pastEntries.days,
        today: thisMonday,
        weeklyTargetMinutes: weeklyHours ? weeklyHours * 60 : null,
      })
    : null;
  const weekWorked = weekEntries?.totals.workedMinutes ?? 0;
  const weekTarget = weeklyHours ? weeklyHours * 60 : (weekEntries?.totals.plannedMinutes ?? 0);
  const hoursFormat = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 });

  return (
    <>
      <DbPageHead
        eyebrow={tenantName}
        title={t("hello", { name: firstName })}
        subtitle={[t("subtitle"), employee.role, employee.location].filter(Boolean).join(" · ")}
        actions={
          <>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-[13px] text-[#6e6e6b] shadow-[inset_0_0_0_1px_#ecebe7]">
              <Link2 size={14} className="text-[#357a52]" />
              {t.rich("linkedWith", {
                name: employee.name,
                b: (chunks) => <strong className="font-semibold text-ink">{chunks}</strong>,
              })}
            </span>
            <UnlinkOwnEmployeeButton tenant={tenant} employeeName={employee.name} />
          </>
        }
      />

      {clockStatus?.enabled && <ClockHero tenant={tenant} initialStatus={clockStatus} />}

      {profileFields && profileCompleteness && profileCompleteness.percent < 100 && (
        <div className="mb-5">
          <MyProfileCompletionCard tenant={tenant} profileFields={profileFields} completeness={profileCompleteness} />
        </div>
      )}

      <MyQuickActions
        tenant={tenant}
        vacationRemaining={employee.vacationRemaining}
        timeTrackingEnabled={timeTrackingEnabled}
      />

      <div className="db-body mb-5 grid items-start gap-5 [grid-template-columns:minmax(0,1.35fr)_minmax(0,0.95fr)]">
        <DbCard aria-labelledby="my-next-shifts">
          <DbCardTitle id="my-next-shifts" title={t("nextShifts")} />
          <div className="flex flex-col gap-2">
            {nextDays.map((day) => {
              const isToday = day.date === today.date;
              const shift = day.shifts[0];
              const color = shift ? paletteHex(shift.locationAccentClassName, "#8b6ed4") : "#e4e3df";
              const running =
                isToday && shift && shift.startTime <= today.time && (shift.endTime > today.time || shift.endTime <= shift.startTime);
              const otherLocation = shift && employee.location && shift.location && shift.location !== employee.location;
              const hatched = !shift && (day.wishFree || day.vacation || day.sick);

              return (
                <div
                  key={day.date}
                  className={`flex items-center gap-4 rounded-[12px] border px-4 py-3 ${isToday ? "border-[rgba(139,110,212,0.35)] bg-[rgba(139,110,212,0.05)]" : "border-[#ecebe7] bg-white"}`}
                  style={{
                    boxShadow: `inset 3px 0 0 ${shift ? color : "#e4e3df"}`,
                    backgroundImage: hatched
                      ? "repeating-linear-gradient(135deg, rgba(14,14,14,0.04) 0 1px, transparent 1px 7px)"
                      : undefined,
                  }}
                >
                  <span className="flex w-10 shrink-0 flex-col items-center">
                    <span className="font-mono text-[9.5px] tracking-[0.1em] text-[#6e6e6b] uppercase">
                      {isToday ? t("today") : weekdayShort.format(asDate(day.date)).replace(".", "")}
                    </span>
                    <span className="font-display text-[20px] leading-tight font-semibold">{Number(day.date.slice(8))}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    {shift ? (
                      <>
                        <span className="text-[14px] font-semibold">
                          {shift.startTime} – {shift.endTime}
                          {day.shifts.length > 1 ? ` (+${day.shifts.length - 1})` : ""}
                        </span>
                        <span className="truncate text-[12.5px] text-[#6e6e6b]">{shift.location}</span>
                      </>
                    ) : day.vacation ? (
                      <span className="text-[14px] font-semibold">{t("vacation")}</span>
                    ) : day.sick ? (
                      <span className="text-[14px] font-semibold">{t("sick")}</span>
                    ) : day.wishFree ? (
                      <>
                        <span className="text-[14px] font-semibold">{t("wishFree")}</span>
                        <span className="text-[12.5px] text-[#6e6e6b]">
                          {day.wishFree.status === "approved" ? t("status.approved") : t("status.open")}
                        </span>
                      </>
                    ) : (
                      <span className="text-[14px] text-[#6e6e6b]">{day.holiday ?? t("free")}</span>
                    )}
                  </span>
                  {running && (
                    <span className="rounded-[7px] bg-[rgba(53,122,82,0.10)] px-2 py-[3px] text-[12px] font-medium text-[#1f5d2c]">
                      {t("running")}
                    </span>
                  )}
                  {!running && otherLocation && (
                    <span className="rounded-[7px] bg-[rgba(42,111,219,0.08)] px-2 py-[3px] text-[12px] font-medium text-[#2a6fdb]">
                      {t("otherLocation")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </DbCard>

        <div className="flex min-w-0 flex-col gap-5">
          <DbCard aria-labelledby="my-requests">
            <DbCardTitle id="my-requests" title={t("myRequests")} />
            {requests.length === 0 ? (
              <p className="m-0 text-[13px] text-[#6e6e6b]">{t("noRequests")}</p>
            ) : (
              <div className="flex flex-col">
                {requests.map((request, index) => {
                  const tone = statusTone[request.status] ?? statusTone.pending;

                  return (
                    <div
                      key={request.key}
                      className={`flex items-center justify-between gap-3 py-3 ${index ? "border-t border-[#ecebe7]" : ""}`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[14px] font-semibold">{request.title}</span>
                        <span className="truncate text-[12.5px] text-[#6e6e6b]">{request.detail}</span>
                      </span>
                      <span
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-[7px] px-2 py-[3px] text-[12px] font-medium"
                        style={{ color: tone.color, background: tone.bg, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
                      >
                        <span className="size-1.5 rounded-full" style={{ background: tone.dot }} />
                        {t(`status.${request.status}`)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </DbCard>

          <DbCard aria-labelledby="my-documents">
            <DbCardTitle
              id="my-documents"
              title={t("myDocuments")}
              action={
                <Link href={`/u/${tenant}/dateien`} className="text-[13px] font-medium text-[#6b4fc4] no-underline">
                  {t("allDocuments")}
                </Link>
              }
            />
            {documentRows.length === 0 ? (
              <p className="m-0 text-[13px] text-[#6e6e6b]">{t("noDocuments")}</p>
            ) : (
              <div className="flex flex-col">
                {documentRows.map((document) => (
                  <MyDocumentLink
                    key={document.id}
                    tenant={tenant}
                    fileId={document.id}
                    name={document.name}
                    badge={
                      document.isNew ? (
                        <span className="rounded-[7px] bg-[rgba(139,110,212,0.12)] px-2 py-0.5 text-[11.5px] font-semibold text-[#6b4fc4]">
                          {t("new")}
                        </span>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </DbCard>
        </div>
      </div>

      <DbCard aria-labelledby="my-month" className="mb-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="my-month" className="m-0 font-display text-[22px] font-semibold tracking-[-0.5px]">
              {monthLabel}
            </h2>
            <span className="text-[13px] text-[#6e6e6b]">
              {t("monthSummary", { shifts: monthShifts.length, hours: hoursFormat.format(monthHours) })}
            </span>
          </div>
          <div className="flex gap-1.5">
            <Link
              href={`?monat=${previousMonth}`}
              aria-label={t("previousMonth")}
              className="db-btn2 db-focus flex size-10 items-center justify-center rounded-[10px] border border-[#ecebe7] bg-[#f2f1ed] text-ink"
            >
              <ChevronLeft size={16} />
            </Link>
            <Link
              href={`?monat=${today.date.slice(0, 7)}`}
              className="db-btn2 db-focus flex h-10 items-center rounded-[10px] border border-[#ecebe7] bg-[#f2f1ed] px-3.5 text-[13.5px] font-medium text-ink no-underline"
            >
              {t("today")}
            </Link>
            <Link
              href={`?monat=${nextMonth}`}
              aria-label={t("nextMonth")}
              className="db-btn2 db-focus flex size-10 items-center justify-center rounded-[10px] border border-[#ecebe7] bg-[#f2f1ed] text-ink"
            >
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[640px] grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index} className="px-1 font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">
                {weekdayShort.format(asDate(addDays("2026-01-05", index))).replace(".", "")}
              </span>
            ))}
            {Array.from({ length: firstWeekday }, (_, index) => (
              <span key={`empty-${index}`} />
            ))}
            {monthCells.map((cell) => {
              const shift = cell.shifts[0];
              const color = shift ? paletteHex(shift.locationAccentClassName, "#8b6ed4") : null;
              const isToday = cell.date === today.date;
              const isPast = cell.date < today.date;
              const absence = !shift && (cell.vacation || cell.sick);

              return (
                <div
                  key={cell.date}
                  title={cell.holiday}
                  className={`flex min-h-[74px] flex-col gap-0.5 overflow-hidden rounded-[9px] px-2 py-1.5 text-[12px] ${isToday ? "shadow-[0_0_0_2px_#0e0e0e]" : ""}`}
                  style={{
                    background: color ? `${color}${isPast ? "14" : "22"}` : absence ? "#fff7ea" : "#fafaf8",
                    boxShadow: [color ? `inset 0 3px 0 ${color}` : "", isToday ? "0 0 0 2px #0e0e0e" : ""]
                      .filter(Boolean)
                      .join(", ") || "inset 0 0 0 1px #f0efeb",
                    backgroundImage:
                      !shift && cell.wishFree
                        ? "repeating-linear-gradient(135deg, rgba(14,14,14,0.06) 0 1px, transparent 1px 7px)"
                        : cell.vacation && !shift
                          ? "repeating-linear-gradient(135deg, rgba(224,123,0,0.25) 0 2px, transparent 2px 7px)"
                          : undefined,
                  }}
                >
                  <span className={`font-display text-[14px] font-semibold ${isToday ? "text-[#6b4fc4]" : isPast ? "text-[#8f8f8a]" : "text-ink"}`}>
                    {cell.day}
                  </span>
                  {shift ? (
                    <>
                      <span className={isPast ? "text-[#6e6e6b]" : "text-ink"}>
                        {shortHour(shift.startTime)}–{shortHour(shift.endTime)} {t("oClock")}
                      </span>
                      <span className="truncate text-[11px] text-[#8f8f8a]">{shift.location}</span>
                    </>
                  ) : cell.vacation ? (
                    <span className="font-medium text-[#9a5b00]">{t("vacation")}</span>
                  ) : cell.sick ? (
                    <span className="font-medium text-[#b4332a]">{t("sick")}</span>
                  ) : cell.wishFree ? (
                    <span className="text-ink">{t("wishFree")}</span>
                  ) : cell.holiday ? (
                    <>
                      <span className="text-ink">{t("holiday")}</span>
                      <span className="truncate text-[11px] text-[#8f8f8a]">{cell.holiday}</span>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-[#6e6e6b]">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {legendLocations.map(([name, color]) => (
              <span key={name} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px]" style={{ background: color }} />
                {name}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-[repeating-linear-gradient(135deg,rgba(224,123,0,0.7)_0_2px,transparent_2px_4px)]" />
              {t("vacation")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-[repeating-linear-gradient(135deg,rgba(14,14,14,0.3)_0_1px,transparent_1px_3px)]" />
              {t("wishFree")}
            </span>
          </span>
          {todayShift && (
            <span>
              {weekdayShort.format(asDate(today.date))}, {shortDate.format(asDate(today.date))}.:{" "}
              <strong className="font-semibold text-ink">
                {todayShift.startTime} – {todayShift.endTime}
              </strong>
              {todayShift.location ? ` · ${todayShift.location}` : ""}
            </span>
          )}
        </div>
      </DbCard>

      <div className="db-insights grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        <DbCard className="db-insight flex min-h-[150px] flex-col gap-2.5">
          <span className="text-[13px] font-medium text-[#6e6e6b]">{t("insights.vacationLeft")}</span>
          <span className="flex items-baseline gap-2">
            <span className="font-display text-[40px] leading-none font-semibold tracking-[-1.4px]">{employee.vacationRemaining}</span>
            <span className="text-[15px] text-[#6e6e6b]">{t("insights.ofDays", { total: employee.vacationTotal })}</span>
          </span>
          <span className="mt-auto h-2 overflow-hidden rounded-full bg-[#f2f1ed]">
            <span
              className="block h-full rounded-full bg-[#8b6ed4]"
              style={{ width: `${employee.vacationTotal > 0 ? Math.min(100, (employee.vacationRemaining / employee.vacationTotal) * 100) : 0}%` }}
            />
          </span>
        </DbCard>
        {timeTrackingEnabled && (
          <>
            <DbCard className="db-insight flex min-h-[150px] flex-col gap-2.5">
              <span className="text-[13px] font-medium text-[#6e6e6b]">{t("insights.overtime")}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-display text-[40px] leading-none font-semibold tracking-[-1.4px]">
                  {overtime && overtime.balanceMinutes > 0 ? "+" : ""}
                  {hoursFormat.format((overtime?.balanceMinutes ?? 0) / 60)}
                </span>
                <span className="text-[15px] text-[#6e6e6b]">{t("insights.hours")}</span>
              </span>
              <span className="mt-auto text-[13px] text-[#6e6e6b]">{t("insights.overtimeHint")}</span>
            </DbCard>
            <DbCard className="db-insight flex min-h-[150px] flex-col gap-2.5">
              <span className="text-[13px] font-medium text-[#6e6e6b]">{t("insights.thisWeek")}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-display text-[40px] leading-none font-semibold tracking-[-1.4px]">
                  {hoursFormat.format(weekWorked / 60)}
                </span>
                <span className="text-[15px] text-[#6e6e6b]">
                  {weekTarget > 0 ? t("insights.ofHours", { hours: hoursFormat.format(weekTarget / 60) }) : t("insights.hours")}
                </span>
              </span>
              <span className="mt-auto h-2 overflow-hidden rounded-full bg-[#f2f1ed]">
                <span
                  className="block h-full rounded-full bg-[#8b6ed4]"
                  style={{ width: `${weekTarget > 0 ? Math.min(100, (weekWorked / weekTarget) * 100) : 0}%` }}
                />
              </span>
            </DbCard>
          </>
        )}
      </div>

      {!timeTrackingEnabled && employee.vacationCarryover > 0 && (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-[#6e6e6b]">
          <Sparkles size={14} />
          {t("carryoverHint", { days: employee.vacationCarryover })}
        </p>
      )}
    </>
  );
}
