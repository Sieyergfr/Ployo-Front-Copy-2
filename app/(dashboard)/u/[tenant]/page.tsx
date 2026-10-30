import OverviewClockRefresh from "@/components/dashboard/OverviewClockRefresh";
import { CalendarDays, Download, Plus, TriangleAlert, ArrowDown, ArrowUp, UserPlus } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";
import OverviewFeed, { type OverviewFeedItem } from "@/components/dashboard/OverviewFeed";
import { DbCard, DbCardTitle, DbCtaLink, DbPageHead, DbSecondaryLink } from "@/components/dashboard/ui";
import { auth } from "@/lib/auth";
import {
  buildAbsenceRadar,
  buildStaffingCurve,
  staffingWindow,
  findRestViolations,
} from "@/lib/dashboard-overview";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { getLocationsForTenant } from "@/lib/location-service";
import { weekdayFromDate } from "@/lib/opening-hours";
import { getRemindersForTenant } from "@/lib/reminders";
import { hasPermissionLevel } from "@/lib/roles";
import {
  getISOWeekFromDate,
  getShiftPlanForTenant,
  getShiftPlanningSettings,
} from "@/lib/shift-service";
import { getSicknessForTenant, getSicknessRateTrend } from "@/lib/sickness";
import {
  getOptionalTenantAccess,
  getTenantPermissions,
  isUnassignedEmployee,
  requireTenantMembership,
  withAccessRedirect,
} from "@/lib/tenant-access";
import { getTenantsForUser } from "@/lib/tenants";
import { getTenantTimeEntries } from "@/lib/time-tracking-service";
import { getVacationRequestsForTenant } from "@/lib/vacation-service";
import { getWishFreeRequestsForTenant } from "@/lib/wish-free-service";

export const metadata = {
  title: "Übersicht",
};

type DashboardHomeProps = {
  params: Promise<{ tenant: string }>;
};

/**
 * Lädt einen Dashboard-Bereich tolerant: Wer für einen Bereich keine
 * Berechtigung hat (FORBIDDEN aus requireTenantAccess), sieht die
 * zugehörige Karte einfach nicht, statt einen Fehler zu bekommen.
 */
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

function daysBetween(fromIso: string, toIso: string) {
  return Math.round(
    (new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

/** Kalendertag und Uhrzeit "jetzt" in der Zeitzone des Betriebs. */
function zonedNow(timeZone: string) {
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

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    time: `${parts.hour}:${parts.minute}`,
  };
}

function toMinutes(time: string | undefined) {
  if (!time) return 0;

  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

const decimal = (locale: string, digits = 1) =>
  new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const radarColors = ["#f2f1ed", "rgba(139,110,212,0.18)", "rgba(139,110,212,0.32)", "rgba(139,110,212,0.55)", "#7a3c9c"];
const avatarColors = ["#2a5bc9", "#4a5568", "#1d8a65", "#c9622a", "#7a3c9c"];

export default async function DashboardHome({ params }: DashboardHomeProps) {
  const t = await getTranslations("Overview");
  const locale = await getLocale();
  const intlLocale = locale === "en" ? "en-GB" : "de-DE";
  const { tenant } = await params;

  if (await isUnassignedEmployee(tenant)) {
    redirect(`/u/${tenant}/mein-bereich`);
  }

  // Die restlichen Datenladungen unten sind absichtlich tolerant (tryLoad /
  // getOptionalTenantAccess) und würden TWO_FACTOR_REQUIRED sonst still
  // schlucken statt sauber umzuleiten — deshalb hier einmal explizit prüfen.
  await withAccessRedirect(tenant, () => requireTenantMembership(tenant));

  const baseHref = `/u/${tenant}`;
  const session = await auth.api.getSession({ headers: await headers() });
  const memberships = session?.user?.id ? await tryLoad(getTenantsForUser(session.user.id)) : null;
  const tenantRecord = memberships?.find((membership) => membership.tenant.slug === tenant)?.tenant;
  const tenantName = tenantRecord?.name ?? tenant;
  const timeZone = tenantRecord?.timezone || "Europe/Berlin";
  const now = zonedNow(timeZone);
  const todayIso = now.date;
  const today = new Date(`${todayIso}T12:00:00Z`);
  const { year, week } = getISOWeekFromDate(today);
  const nextWeek = getISOWeekFromDate(new Date(`${addDays(todayIso, 7)}T12:00:00Z`));

  const [
    employees,
    vacationRequests,
    reminders,
    sickness,
    sicknessTrend,
    locations,
    shiftPlan,
    nextShiftPlan,
    planningSettings,
    timeEntries,
    employeesAccess,
    vacationAccess,
    sicknessAccess,
    shiftsAccess,
    timeAccess,
    permissions,
  ] = await Promise.all([
    tryLoad(getEmployeesForTenant(tenant)),
    tryLoad(getVacationRequestsForTenant(tenant)),
    tryLoad(getRemindersForTenant(tenant)),
    tryLoad(getSicknessForTenant(tenant)),
    tryLoad(getSicknessRateTrend(tenant)),
    tryLoad(getLocationsForTenant(tenant)),
    tryLoad(getShiftPlanForTenant({ tenantSlug: tenant, year, week })),
    tryLoad(getShiftPlanForTenant({ tenantSlug: tenant, year: nextWeek.year, week: nextWeek.week })),
    tryLoad(getShiftPlanningSettings(tenant)),
    tryLoad(getTenantTimeEntries({ tenantSlug: tenant })),
    getOptionalTenantAccess(tenant, "employees"),
    getOptionalTenantAccess(tenant, "vacation"),
    getOptionalTenantAccess(tenant, "sickness"),
    getOptionalTenantAccess(tenant, "shifts"),
    getOptionalTenantAccess(tenant, "timeTracking"),
    getTenantPermissions(tenant),
  ]);

  // Karten mit Daten anderer Mitarbeiter sind fuer Rollen mit
  // "own"-Sichtbarkeit (z. B. einfache Mitgliedskonten) irrelevant bzw.
  // wuerden ohnehin leer bleiben — dort gar nicht erst anzeigen.
  const employeesTeamWide = employeesAccess !== null && employeesAccess.scope !== "own";
  const vacationTeamWide = vacationAccess !== null && vacationAccess.scope !== "own";
  const sicknessTeamWide = sicknessAccess !== null && sicknessAccess.scope !== "own";
  const shiftsTeamWide = shiftsAccess !== null && shiftsAccess.scope !== "own";
  const timeTeamWide = timeAccess !== null && timeAccess.scope !== "own";
  const canWriteShifts = hasPermissionLevel(permissions.shifts, "write");
  const canDecideVacation = hasPermissionLevel(permissions.vacation, "write");
  const wishFreeRequests = canWriteShifts
    ? await tryLoad(getWishFreeRequestsForTenant({ tenantSlug: tenant }))
    : null;

  // "Aktive Belegschaft": ausgeschiedene und noch nicht gestartete
  // Mitarbeiter zählen nicht mit (QA-Bug BUG-002).
  const employeeList = (employees ?? []).filter(
    (employee) =>
      employee.status !== "former" && (!employee.startDate || employee.startDate <= todayIso),
  );
  const employeeByDbId = new Map(employeeList.map((employee) => [employee.dbId ?? employee.id, employee]));
  const vacationList = vacationRequests ?? [];
  const currentSickness = sickness?.current ?? [];
  const todayShifts = shiftPlan?.days.find((day) => day.id === todayIso)?.shifts ?? [];

  const dateLabel = new Intl.DateTimeFormat(intlLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(today);
  const shortDate = new Intl.DateTimeFormat(intlLocale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const fullDate = new Intl.DateTimeFormat(intlLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
  const weekdayShort = new Intl.DateTimeFormat(intlLocale, { weekday: "short", timeZone: "UTC" });
  const relativeDays = new Intl.RelativeTimeFormat(intlLocale, { numeric: "auto" });
  const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const greetingHour = Math.floor(now.minutes / 60);
  const greeting =
    greetingHour < 11 ? t("greetingMorning") : greetingHour < 18 ? t("greetingDay") : t("greetingEvening");
  const firstName = session?.user?.name?.trim().split(/\s+/)[0];

  // ── Tageslage ────────────────────────────────────────────────────────
  const activeLocations = (locations ?? []).filter((location) => location.status === "active");
  const curve = buildStaffingCurve({
    shifts: todayShifts,
    locations: activeLocations.map((location) => ({
      id: location.id,
      name: location.name,
      openingHours: location.openingHours,
      minStaffing: location.effectiveMinStaffing,
    })),
    weekday: weekdayFromDate(new Date(`${todayIso}T00:00:00Z`)),
  });
  const currentHour = Math.floor(now.minutes / 60);
  const visibleHours = staffingWindow(curve.hours, currentHour);
  const upcomingGaps = curve.gaps.filter((gap) => gap.toHour > currentHour);
  const assignedToday = todayShifts.filter((shift) => shift.employeeId);
  const openEntries = (timeEntries?.days ?? []).flatMap((day) => day.entries).filter((entry) => entry.isOpen);
  const onBreakCount = openEntries.filter((entry) => entry.breaks.some((item) => !item.endAt)).length;
  const onDutyCount = openEntries.length - onBreakCount;
  const clockedInIds = new Set(openEntries.map((entry) => entry.employeeId));
  const upcomingCount = assignedToday.filter(
    (shift) => toMinutes(shift.startTime) > now.minutes && !clockedInIds.has(shift.employeeId ?? ""),
  ).length;
  const chartMax = Math.max(1, ...visibleHours.map((hour) => Math.max(hour.need, hour.have)));

  function gapSentence(gap: (typeof curve.gaps)[number]) {
    const sickAssignee = todayShifts.find(
      (shift) =>
        shift.location === gap.locationName &&
        shift.conflictKind === "sickness" &&
        toMinutes(shift.startTime) < gap.toHour * 60 &&
        toMinutes(shift.endTime) > gap.fromHour * 60,
    )?.assignee;
    const base = t("hero.gap", {
      location: gap.locationName,
      from: gap.fromHour,
      to: gap.toHour,
      count: gap.missing,
    });

    return sickAssignee ? `${base} ${t("hero.gapSick", { name: sickAssignee })}` : base;
  }

  const heroTitle =
    todayShifts.length === 0
      ? t("hero.noShifts")
      : t("hero.title", { staffed: assignedToday.length, total: todayShifts.length });
  const heroText =
    upcomingGaps.length > 0
      ? [gapSentence(upcomingGaps[0]), upcomingGaps.length > 1 ? t("hero.moreGaps", { count: upcomingGaps.length - 1 }) : ""]
          .filter(Boolean)
          .join(" ")
      : t("hero.allGood");

  // ── Handlungsbedarf ──────────────────────────────────────────────────
  const feed: OverviewFeedItem[] = [];
  const relative = (iso: string) => relativeDays.format(daysBetween(todayIso, iso), "day");

  if (shiftsTeamWide) {
    for (const gap of upcomingGaps.slice(0, 3)) {
      feed.push({
        id: `gap-${gap.locationName}-${gap.fromHour}`,
        category: "critical",
        severity: "critical",
        icon: "alert",
        title: t("feed.gapTitle", { location: gap.locationName }),
        text: gapSentence(gap),
        when: t("feed.today"),
        action: canWriteShifts ? { label: t("feed.findSubstitute"), href: `${baseHref}/schichtplanung` } : undefined,
      });
    }

    const conflictCount = shiftPlan?.conflictCount ?? 0;

    if (conflictCount > 0) {
      feed.push({
        id: "shift-conflicts",
        category: "critical",
        severity: "critical",
        icon: "alert",
        title: t("feed.conflictsTitle", { count: conflictCount }),
        text: t("feed.conflictsText", { week: shiftPlan?.label ?? "" }),
        when: shiftPlan?.label ?? "",
        action: { label: t("feed.reviewPlan"), href: `${baseHref}/schichtplanung` },
      });
    }

    const restShifts = [...(shiftPlan?.days ?? []), ...(nextShiftPlan?.days ?? [])].flatMap((day) =>
      day.shifts
        .filter((shift) => shift.employeeId && shift.startTime && shift.endTime)
        .map((shift) => ({
          employeeId: shift.employeeId!,
          name: shift.assignee ?? "",
          date: day.id,
          startTime: shift.startTime!,
          endTime: shift.endTime!,
        })),
    );

    for (const violation of findRestViolations(restShifts, planningSettings?.minRestHours ?? 11)
      .filter((item) => item.toDate >= todayIso)
      .slice(0, 2)) {
      const violationWeek = getISOWeekFromDate(asDate(violation.toDate)).week;

      feed.push({
        id: `rest-${violation.employeeId}-${violation.toDate}`,
        category: "critical",
        severity: "warning",
        icon: "alert",
        title: t("feed.restTitle"),
        text: t("feed.restText", {
          name: violation.name,
          from: weekdayShort.format(asDate(violation.fromDate)),
          to: weekdayShort.format(asDate(violation.toDate)),
          week: violationWeek,
          hours: decimal(intlLocale, violation.restHours % 1 === 0 ? 0 : 1).format(violation.restHours),
          required: planningSettings?.minRestHours ?? 11,
        }),
        when: t("feed.weekShort", { week: violationWeek }),
        action: { label: t("feed.reviewPlan"), href: `${baseHref}/schichtplanung` },
      });
    }
  }

  if (vacationTeamWide && canDecideVacation) {
    const absences = vacationList.filter((request) => request.status === "approved" || request.status === "pending");

    for (const request of vacationList.filter((item) => item.status === "pending").slice(0, 4)) {
      const startIso = request.startDateIso ?? "";
      const endIso = request.endDateIso ?? startIso;
      const overlaps = request.team
        ? absences.filter(
            (other) =>
              other.id !== request.id &&
              other.employeeId !== request.employeeId &&
              other.team === request.team &&
              (other.startDateIso ?? "") <= endIso &&
              (other.endDateIso ?? "") >= startIso,
          ).length
        : 0;
      const employee = request.employeeId ? employeeByDbId.get(request.employeeId) : undefined;
      const days = Number.parseInt(request.days, 10) || 0;

      feed.push({
        id: `vacation-${request.dbId ?? request.id}`,
        category: "requests",
        severity: "request",
        icon: "request",
        title: t("feed.vacationTitle", { name: request.name }),
        text: [
          `${request.startDate} – ${request.endDate}`,
          request.days,
          employee ? t("feed.remainingAfter", { days: Math.max(0, employee.vacationRemaining - days) }) : "",
        ]
          .filter(Boolean)
          .join(" · "),
        hint: request.team
          ? overlaps === 0
            ? { text: t("feed.noOverlap"), tone: "ok" }
            : { text: t("feed.overlap", { count: overlaps, team: request.team }), tone: "warning" }
          : undefined,
        when: startIso ? relative(startIso) : "",
        request: { kind: "vacation", requestId: request.dbId ?? request.id },
      });
    }
  }

  for (const request of (wishFreeRequests ?? [])
    .filter((item) => item.status === "open" && item.date >= todayIso)
    .slice(0, 3)) {
    feed.push({
      id: `wishfree-${request.dbId}`,
      category: "requests",
      severity: "request",
      icon: "request",
      title: t("feed.wishFreeTitle", { name: request.employeeName }),
      text: [request.dateLabel, request.reason].filter(Boolean).join(" · "),
      when: relative(request.date),
      request: { kind: "wishFree", requestId: request.dbId },
    });
  }

  for (const reminder of (reminders ?? [])
    .filter((item) => item.status !== "done" && item.daysLeft <= 14)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 3)) {
    feed.push({
      id: `reminder-${reminder.id}`,
      category: "deadlines",
      severity: reminder.daysLeft < 0 ? "critical" : "warning",
      icon: "document",
      title: reminder.title,
      text: [reminder.subject, t("feed.dueOn", {
          date: /^\d{4}-\d{2}-\d{2}$/.test(reminder.dueDate) ? fullDate.format(asDate(reminder.dueDate)) : reminder.dueDate,
        })].filter(Boolean).join(" · "),
      when: relativeDays.format(reminder.daysLeft, "day"),
      action: { label: t("feed.open"), href: `${baseHref}/erinnerungen` },
    });
  }

  if (employeesTeamWide && hasPermissionLevel(permissions.employees, "write")) {
    const incomplete = employeeList.filter((employee) => !employee.weeklyHours.trim() || !employee.startDate);

    if (incomplete.length > 0) {
      feed.push({
        id: "contract-details",
        category: "deadlines",
        severity: "warning",
        icon: "document",
        title: t("feed.contractTitle"),
        text: t("feed.contractText", { count: incomplete.length }),
        when: t("feed.openState"),
        action: { label: t("feed.complete"), href: `${baseHref}/employees` },
      });
    }
  }

  if (timeTeamWide && timeEntries) {
    const autoClosed = timeEntries.employees.reduce((sum, employee) => sum + employee.autoClosedCount, 0);

    if (autoClosed > 0) {
      feed.push({
        id: "auto-closed",
        category: "times",
        severity: "info",
        icon: "time",
        title: t("feed.autoClosedTitle", { count: autoClosed }),
        text: t("feed.autoClosedText"),
        when: t("feed.weekShort", { week }),
        action: { label: t("feed.review"), href: `${baseHref}/zeiterfassung` },
      });
    }
  }

  // ── Abwesenheits-Radar ───────────────────────────────────────────────
  const todayWeekday = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
  // Am Wochenende beginnt das Radar mit der kommenden Woche.
  const radarStart =
    todayWeekday === 0 ? addDays(todayIso, 1) : todayWeekday === 6 ? addDays(todayIso, 2) : addDays(todayIso, 1 - todayWeekday);
  const radar = buildAbsenceRadar({
    startDate: radarStart,
    employees: employeeList.map((employee) => ({ id: employee.dbId ?? employee.id, team: employee.team })),
    absences: [
      ...vacationList
        .filter((request) => request.status === "approved" && request.employeeId && request.startDateIso)
        .map((request) => ({
          employeeId: request.employeeId!,
          from: request.startDateIso!,
          to: request.endDateIso || request.startDateIso!,
        })),
      // Offene Krankmeldungen ohne Ende zählen nur bis heute — wie lange
      // jemand noch fehlt, ist nicht bekannt.
      ...currentSickness.map((entry) => ({
        employeeId: entry.employeeId,
        from: entry.startDateIso,
        to: entry.endDateIso || todayIso,
      })),
    ],
  });

  // ── Kennzahlen unten ─────────────────────────────────────────────────
  const carryoverEmployees = employeeList
    .filter((employee) => employee.vacationCarryover > 0)
    .sort((a, b) => b.vacationCarryover - a.vacationCarryover);
  const carryoverDays = carryoverEmployees.reduce((sum, employee) => sum + employee.vacationCarryover, 0);
  const overtime = (timeEntries?.employees ?? [])
    .map((employee) => ({ name: employee.name, minutes: employee.workedMinutes - employee.plannedMinutes }))
    .filter((employee) => employee.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
  const overtimeMinutes = overtime.reduce((sum, employee) => sum + employee.minutes, 0);
  const pastDays = (timeEntries?.days ?? []).filter((day) => day.date <= todayIso);
  const workedMinutes = pastDays.reduce((sum, day) => sum + day.workedMinutes, 0);
  const plannedMinutes = pastDays.reduce((sum, day) => sum + day.plannedMinutes, 0);
  const workedPercent = plannedMinutes > 0 ? Math.round((workedMinutes / plannedMinutes) * 100) : 0;
  const hoursFormat = decimal(intlLocale);

  const showHero = shiftsTeamWide && shiftPlan !== null;
  const showSide = vacationTeamWide || sicknessTeamWide;

  return (
    <>
      <DbPageHead
        eyebrow={tenantName}
        title={firstName ? `${greeting}, ${firstName}` : greeting}
        subtitle={`${dateLabel} · ${t("weekLabel", { week })}`}
        actions={
          <>
            {timeTeamWide && (
              <DbSecondaryLink href={`${baseHref}/reports`}>
                <Download size={15} />
                {t("export")}
              </DbSecondaryLink>
            )}
            {canWriteShifts && (
              <DbCtaLink href={`${baseHref}/schichtplanung`}>
                <Plus size={15} />
                <span>{t("createShift")}</span>
              </DbCtaLink>
            )}
          </>
        }
      />

      {showHero && (
        <section
          aria-labelledby="overview-hero"
          className="db-hero relative mb-5 overflow-hidden rounded-[16px] bg-[#0d0d0d] p-[clamp(20px,3vw,28px)] text-[#ededea]"
        >
          <div className="db-hero-glow" aria-hidden="true" />
          <div className="db-hero-grid" aria-hidden="true" />
          <div className="db-hero-in relative grid items-stretch gap-x-10 gap-y-7 [grid-template-columns:minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="flex min-w-0 flex-col gap-3.5">
              <span className="inline-flex items-center gap-2.5 font-mono text-[10.5px] tracking-[0.14em] text-[#a3a39e] uppercase">
                <span className="db-live size-2 rounded-full bg-[#4ade80]" />
                {t("hero.eyebrow", { time: now.time })}
              </span>
              <h2
                id="overview-hero"
                className="m-0 font-display text-[clamp(26px,2.8vw,34px)] leading-[1.1] font-semibold tracking-[-1px] text-white"
              >
                {heroTitle}
              </h2>
              <p className="m-0 text-[14px] leading-[1.6] text-[#a3a39e]">{heroText}</p>

              <div className="mt-1 grid grid-cols-4 gap-2">
                {[
                  { value: timeTeamWide ? onDutyCount : "–", label: t("hero.onDuty"), dot: "#4ade80" },
                  { value: timeTeamWide ? onBreakCount : "–", label: t("hero.onBreak"), dot: "#a3a39e" },
                  { value: upcomingCount, label: t("hero.upcoming"), dot: "#7fb0ff" },
                  { value: sicknessTeamWide ? currentSickness.length : "–", label: t("hero.sick"), dot: "#ff8a80" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-[12px] bg-white/5 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]"
                  >
                    <span className="block font-display text-[24px] font-semibold tracking-[-0.6px] text-white">
                      {stat.value}
                    </span>
                    <span className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] text-[#a3a39e]">
                      <span className="size-1.5 rounded-full" style={{ background: stat.dot }} />
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-auto flex flex-wrap gap-2 pt-1.5">
                {upcomingGaps.length > 0 && canWriteShifts && (
                  <Link
                    href={`${baseHref}/schichtplanung`}
                    className="db-light-btn db-focus inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-white px-4 py-[11px] text-[14px] font-semibold text-ink no-underline"
                  >
                    <UserPlus size={15} />
                    {t("hero.findSubstitute")}
                  </Link>
                )}
                <Link
                  href={timeTeamWide ? `${baseHref}/zeiterfassung` : `${baseHref}/schichtplanung`}
                  className="db-glass-dark db-focus box-border inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-white/[0.07] px-4 py-[11px] text-[14px] font-semibold text-white no-underline shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                >
                  {t("hero.whoIsThere")}
                </Link>
              </div>
            </div>

            <div className="relative flex h-full min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <OverviewClockRefresh />
                <span className="font-display text-[16px] font-semibold text-white">{t("hero.chartTitle")}</span>
                <span className="flex flex-wrap gap-3.5 text-[12px] text-[#a3a39e]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-[3px] bg-[#a78ee8]" />
                    {t("hero.legendStaffed")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="db-track size-2.5 rounded-[3px]" />
                    {t("hero.legendNeed")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="db-track-gap size-2.5 rounded-[3px]" />
                    {t("hero.legendGap")}
                  </span>
                </span>
              </div>
              <div
                role="img"
                aria-label={t("hero.chartLabel", {
                  from: visibleHours[0]?.hour ?? 0,
                  to: (visibleHours[visibleHours.length - 1]?.hour ?? 0) + 1,
                })}
                className="relative flex min-h-[170px] flex-auto items-stretch gap-[3px] pt-1.5"
              >
                <div aria-hidden="true" className="absolute right-0 bottom-[33.3%] left-0 border-t border-white/[0.06]" />
                <div aria-hidden="true" className="absolute right-0 bottom-[66.6%] left-0 border-t border-white/[0.06]" />
                {visibleHours.map((hour) => {
                  const top = Math.max(hour.need, hour.have);
                  const isNow = hour.hour === currentHour;
                  const barColor = hour.hour < currentHour ? "#4f4470" : isNow ? "#c9b8f5" : "#9b85dc";

                  return (
                    <div
                      key={hour.hour}
                      className="db-col"
                      title={`${t("hero.hourLabel", { from: hour.hour, to: hour.hour + 1 })} · ${t("hero.tooltip", { need: hour.need, have: hour.have })}`}
                    >
                      {isNow && (
                        <div
                          aria-hidden="true"
                          className="absolute -top-1.5 bottom-0 z-[2] w-0.5 bg-[#4ade80] shadow-[0_0_10px_rgba(74,222,128,0.8)]"
                          style={{ left: `${((now.minutes % 60) / 60) * 100}%` }}
                        />
                      )}
                      <div
                        className={`${hour.isGap ? "db-track-gap" : hour.need > 0 ? "db-track" : ""} relative flex flex-col justify-end overflow-hidden rounded-[6px]`}
                        style={{ height: `${(top / chartMax) * 100}%` }}
                      >
                        <div
                          className="db-bar"
                          style={{ height: top > 0 ? `${(hour.have / top) * 100}%` : 0, background: barColor }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div aria-hidden="true" className="flex gap-[3px] font-mono text-[9.5px] text-[#8f8f8a]">
                {visibleHours.map((hour) => (
                  <span key={hour.hour} className="min-w-0 flex-1 text-left">
                    <span className="inline-block -translate-x-1/2">{String(hour.hour).padStart(2, "0")}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <div
        className={
          showSide
            ? "db-body mb-5 grid items-start gap-5 [grid-template-columns:minmax(0,1.35fr)_minmax(0,0.95fr)]"
            : "mb-5"
        }
      >
        <DbCard aria-labelledby="overview-feed">
          <DbCardTitle
            id="overview-feed"
            title={t("feed.title")}
            subtitle={feed.length > 0 ? t("feed.subtitle", { count: feed.length }) : t("feed.subtitleEmpty")}
          />
          <OverviewFeed tenant={tenant} items={feed} />
        </DbCard>

        {showSide && (
          <div className="flex min-w-0 flex-col gap-5">
            {(vacationTeamWide || sicknessTeamWide) && (
              <DbCard aria-labelledby="overview-radar">
                <DbCardTitle id="overview-radar" title={t("radar.title")} subtitle={t("radar.subtitle")} />
                <div className="mb-1 grid grid-cols-7 gap-1">
                  {radar.days.slice(0, 7).map((day) => (
                    <span
                      key={day.date}
                      className="text-center font-mono text-[9.5px] tracking-[0.06em] text-[#6e6e6b] uppercase"
                    >
                      {weekdayShort.format(asDate(day.date)).replace(".", "")}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {radar.days.map((day) => {
                    const isPeak = radar.peak?.dates.includes(day.date) ?? false;
                    const level = Math.min(4, day.count);
                    const strong = level >= 4 || isPeak;

                    return (
                      <div
                        key={day.date}
                        className="db-cell relative flex aspect-square min-h-[34px] flex-col items-center justify-center gap-px rounded-[8px]"
                        title={`${weekdayShort.format(asDate(day.date))} ${fullDate.format(asDate(day.date))}: ${
                          day.isWeekend && day.count === 0 ? t("radar.weekend") : t("radar.absent", { count: day.count })
                        }`}
                        style={{
                          background:
                            day.isWeekend && day.count === 0
                              ? "repeating-linear-gradient(135deg, rgba(14,14,14,0.05) 0 1px, #fafaf8 1px 6px)"
                              : strong
                                ? "#7a3c9c"
                                : radarColors[level],
                          boxShadow: isPeak ? "0 0 0 2px rgba(224,123,0,0.55)" : "none",
                        }}
                      >
                        <span className={`text-[10px] ${strong ? "text-white/80" : "text-[#6e6e6b]"}`}>
                          {shortDate.format(asDate(day.date)).slice(0, 3)}
                        </span>
                        <span
                          className={`font-display text-[15px] leading-none font-semibold ${strong ? "text-white" : "text-ink"}`}
                        >
                          {day.isWeekend && day.count === 0 ? "–" : day.count}
                        </span>
                        {isPeak && (
                          <span
                            aria-hidden="true"
                            className="absolute -top-1 -right-1 size-3 rounded-full bg-[#e07b00] text-center text-[9px] leading-3 font-bold text-white shadow-[0_0_0_2px_#ffffff]"
                          >
                            !
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-[#6e6e6b]">
                  {t("radar.less")}
                  {[radarColors[0], radarColors[1], radarColors[3], radarColors[4]].map((color) => (
                    <span key={color} className="size-3 rounded-[3px]" style={{ background: color }} />
                  ))}
                  {t("radar.more")}
                </div>
                {radar.peak && (
                  <div className="mt-3.5 flex gap-2.5 rounded-[12px] border border-[rgba(224,123,0,0.25)] bg-[#fff7ea] p-3">
                    <TriangleAlert size={16} className="mt-0.5 shrink-0 text-[#e07b00]" />
                    <span className="text-[12.5px] leading-[1.5] text-[#7a4e00]">
                      <strong className="font-semibold">
                        {t("radar.peakTitle", {
                          dates: radar.peak.dates
                            .slice(0, 3)
                            .map((date) => `${weekdayShort.format(asDate(date)).replace(".", "")} ${shortDate.format(asDate(date))}.`)
                            .join(", "),
                        })}
                      </strong>{" "}
                      {t("radar.peakText", {
                        absent: radar.peak.absent,
                        size: radar.peak.teamSize,
                        team: radar.peak.team,
                      })}
                    </span>
                  </div>
                )}
              </DbCard>
            )}

            {sicknessTeamWide && sicknessTrend && (
              <DbCard aria-labelledby="overview-sickness">
                <div className="flex flex-col gap-2">
                  <span
                    id="overview-sickness"
                    className="font-mono text-[10.5px] tracking-[0.6px] text-[#6e6e6b] uppercase"
                  >
                    {t("sickness.label")}
                  </span>
                  <span className="font-display text-[42px] leading-none font-semibold tracking-[-1.5px]">
                    {decimal(intlLocale).format(sicknessTrend.rate30)} %
                  </span>
                  {(() => {
                    const delta = sicknessTrend.rate30 - sicknessTrend.previousRate30;
                    const lower = delta <= 0;

                    return (
                      <span
                        className={`inline-flex items-center gap-1.5 text-[12px] ${lower ? "text-[#357a52]" : "text-[#b4332a]"}`}
                      >
                        {lower ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
                        {lower
                          ? t("sickness.lower", { value: decimal(intlLocale).format(Math.abs(delta)) })
                          : t("sickness.higher", { value: decimal(intlLocale).format(Math.abs(delta)) })}
                      </span>
                    );
                  })()}
                </div>
                <div
                  role="img"
                  aria-label={t("sickness.chartLabel", {
                    value: decimal(intlLocale).format(sicknessTrend.weeks[sicknessTrend.weeks.length - 1]?.rate ?? 0),
                  })}
                  className="mt-[18px] flex h-14 items-end gap-1"
                >
                  {(() => {
                    const maxRate = Math.max(1, ...sicknessTrend.weeks.map((item) => item.rate));

                    return sicknessTrend.weeks.map((item, index) => (
                      <span
                        key={item.week}
                        title={`${t("weekLabel", { week: item.week })}: ${decimal(intlLocale).format(item.rate)} %`}
                        className="flex-1 rounded-[4px_4px_1px_1px]"
                        style={
                          {
                            height: `${Math.max(4, (item.rate / maxRate) * 100)}%`,
                            background:
                              index === sicknessTrend.weeks.length - 1 ? "#8b6ed4" : "rgba(139,110,212,0.28)",
                          } as CSSProperties
                        }
                      />
                    ));
                  })()}
                </div>
                <div className="mt-1.5 flex justify-between font-mono text-[9.5px] text-[#6e6e6b]">
                  <span>{t("weekLabel", { week: sicknessTrend.weeks[0]?.week ?? week })}</span>
                  <span>{t("weekLabel", { week: sicknessTrend.weeks[sicknessTrend.weeks.length - 1]?.week ?? week })}</span>
                </div>
              </DbCard>
            )}
          </div>
        )}
      </div>

      <div className="db-insights grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        {employeesTeamWide && (
          <DbCard aria-labelledby="overview-carryover" className="db-insight flex min-h-[168px] flex-col gap-2.5">
            <span id="overview-carryover" className="text-[13px] font-medium text-[#6e6e6b]">
              {t("insights.carryoverLabel")}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="font-display text-[40px] leading-none font-semibold tracking-[-1.4px]">{carryoverDays}</span>
              <span className="text-[15px] text-[#6e6e6b]">{t("insights.days")}</span>
            </span>
            <div className="mt-auto flex items-center justify-between gap-2.5 pt-2">
              {carryoverEmployees.length > 0 ? (
                <span className="flex items-center">
                  {carryoverEmployees.slice(0, 3).map((employee, index) => (
                    <span
                      key={employee.id}
                      title={`${employee.name}: ${employee.vacationCarryover}`}
                      className="flex size-7 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-[0_0_0_2px_#ffffff]"
                      style={{ background: avatarColors[index % avatarColors.length], marginLeft: index ? -8 : 0 }}
                    >
                      {employee.initials}
                    </span>
                  ))}
                  {carryoverEmployees.length > 3 && (
                    <span className="-ml-2 flex size-7 items-center justify-center rounded-full bg-[#f2f1ed] text-[11px] font-semibold text-[#6e6e6b] shadow-[0_0_0_2px_#ffffff]">
                      +{carryoverEmployees.length - 3}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-[13px] text-[#6e6e6b]">{t("insights.noCarryover")}</span>
              )}
              {vacationTeamWide && carryoverEmployees.length > 0 && (
                <Link
                  href={`${baseHref}/urlaub`}
                  className="db-act db-focus inline-flex min-h-9 items-center rounded-[9px] border border-[#ecebe7] bg-[#f2f1ed] px-3 py-[7px] text-[13px] font-medium text-ink no-underline"
                >
                  {t("insights.view")}
                </Link>
              )}
            </div>
          </DbCard>
        )}

        {timeTeamWide && timeEntries && (
          <>
            <DbCard aria-labelledby="overview-overtime" className="db-insight flex min-h-[168px] flex-col gap-2.5">
              <span id="overview-overtime" className="text-[13px] font-medium text-[#6e6e6b]">
                {t("insights.overtimeLabel")}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="font-display text-[40px] leading-none font-semibold tracking-[-1.4px]">
                  +{hoursFormat.format(overtimeMinutes / 60)}
                </span>
                <span className="text-[15px] text-[#6e6e6b]">{t("insights.hours")}</span>
              </span>
              <div className="mt-auto pt-2">
                {overtime.length > 0 ? (
                  <span className="inline-flex items-center gap-2 rounded-[9px] bg-[rgba(224,123,0,0.08)] px-3 py-[7px] text-[13px] text-[#7a4e00]">
                    <span className="size-[7px] rounded-full bg-[#e07b00]" />
                    {t("insights.overtimeTop", {
                      name: overtime[0].name,
                      hours: hoursFormat.format(overtime[0].minutes / 60),
                    })}
                  </span>
                ) : (
                  <span className="text-[13px] text-[#6e6e6b]">{t("insights.noOvertime")}</span>
                )}
              </div>
            </DbCard>

            <DbCard aria-labelledby="overview-week" className="db-insight flex min-h-[168px] flex-col gap-2.5">
              <span id="overview-week" className="text-[13px] font-medium text-[#6e6e6b]">
                {t("insights.weekLabel")}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="font-display text-[40px] leading-none font-semibold tracking-[-1.4px]">
                  {Math.round(workedMinutes / 60)}
                </span>
                <span className="text-[15px] text-[#6e6e6b]">
                  {t("insights.ofPlanned", { hours: Math.round(plannedMinutes / 60) })}
                </span>
              </span>
              <div
                role="img"
                aria-label={t("insights.weekChartLabel", { percent: workedPercent })}
                className="mt-auto flex items-center gap-3 pt-2"
              >
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#f2f1ed]">
                  <span
                    className="block h-full rounded-full bg-[#8b6ed4]"
                    style={{ width: `${Math.min(100, workedPercent)}%` }}
                  />
                </span>
                <span className="text-[13px] font-medium">{workedPercent} %</span>
              </div>
            </DbCard>
          </>
        )}
      </div>

      {!showHero && !showSide && feed.length === 0 && !employeesTeamWide && !timeTeamWide && (
        <DbCard className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <span className="flex items-center gap-3 text-[14px] text-[#6e6e6b]">
            <CalendarDays size={18} />
            {t("ownOnlyHint")}
          </span>
          <DbSecondaryLink href={`${baseHref}/mein-bereich`}>{t("toMyArea")}</DbSecondaryLink>
        </DbCard>
      )}
    </>
  );
}
