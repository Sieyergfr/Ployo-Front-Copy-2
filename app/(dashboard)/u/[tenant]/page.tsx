import type { CSSProperties } from "react";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import { auth } from "@/lib/auth";
import {
  getOptionalTenantAccess,
  getTenantPermissions,
  isUnassignedEmployee,
  requireTenantMembership,
  withAccessRedirect,
} from "@/lib/tenant-access";
import { getEmployeesForTenant } from "@/lib/employee-service";
import { getLocationsForTenant } from "@/lib/location-service";
import { weekdayFromDate, type OpeningHoursWeekday } from "@/lib/opening-hours";
import { hasPermissionLevel } from "@/lib/roles";
import { getRemindersForTenant } from "@/lib/reminders";
import { getISOWeekFromDate, getShiftPlanForTenant } from "@/lib/shift-service";
import { getSicknessForTenant } from "@/lib/sickness";
import { getTenantsForUser } from "@/lib/tenants";
import { getVacationRequestsForTenant } from "@/lib/vacation-service";
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck,
  Clock3,
  MapPin,
  Plus,
  UsersRound,
} from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

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

function DashboardCard({
  title,
  meta,
  children,
  action,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="m-0 font-display text-[19px] font-semibold leading-tight text-ink">
            {title}
          </h2>
          {meta && <div className="mt-1 text-[12px] text-muted">{meta}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[7px] bg-border-soft px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-2">
      {children}
    </span>
  );
}

function AvatarBadge({ initials }: { initials: string }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">
      {initials}
    </span>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[10px] border border-border-light bg-bg px-3 py-2.5 text-[12.5px] text-muted">
      {children}
    </p>
  );
}

export default async function DashboardHome({ params }: DashboardHomeProps) {
  const t = await getTranslations("DashboardHome");
  const { tenant } = await params;

  if (await isUnassignedEmployee(tenant)) {
    redirect(`/u/${tenant}/mein-bereich`);
  }

  // Die restlichen Datenladungen unten sind absichtlich tolerant (tryLoad /
  // getOptionalTenantAccess) und würden TWO_FACTOR_REQUIRED sonst still
  // schlucken statt sauber umzuleiten — deshalb hier einmal explizit prüfen.
  await withAccessRedirect(tenant, () => requireTenantMembership(tenant));

  const baseHref = `/u/${tenant}`;
  const now = new Date();
  const { year, week } = getISOWeekFromDate(now);

  const session = await auth.api.getSession({ headers: await headers() });
  const [
    employees,
    vacationRequests,
    reminders,
    sickness,
    locations,
    shiftPlan,
    memberships,
    employeesAccess,
    vacationAccess,
    sicknessAccess,
    shiftsAccess,
    permissions,
  ] = await Promise.all([
    tryLoad(getEmployeesForTenant(tenant)),
    tryLoad(getVacationRequestsForTenant(tenant)),
    tryLoad(getRemindersForTenant(tenant)),
    tryLoad(getSicknessForTenant(tenant)),
    tryLoad(getLocationsForTenant(tenant)),
    tryLoad(getShiftPlanForTenant({ tenantSlug: tenant, year, week })),
    session?.user?.id
      ? tryLoad(getTenantsForUser(session.user.id))
      : Promise.resolve(null),
    getOptionalTenantAccess(tenant, "employees"),
    getOptionalTenantAccess(tenant, "vacation"),
    getOptionalTenantAccess(tenant, "sickness"),
    getOptionalTenantAccess(tenant, "shifts"),
    getTenantPermissions(tenant),
  ]);

  // Karten mit Daten anderer Mitarbeiter sind fuer Rollen mit
  // "own"-Sichtbarkeit (z. B. einfache Mitgliedskonten) irrelevant bzw.
  // wuerden ohnehin leer bleiben — dort gar nicht erst anzeigen.
  const employeesTeamWide = employeesAccess !== null && employeesAccess.scope !== "own";
  const vacationTeamWide = vacationAccess !== null && vacationAccess.scope !== "own";
  const sicknessTeamWide = sicknessAccess !== null && sicknessAccess.scope !== "own";
  const shiftsTeamWide = shiftsAccess !== null && shiftsAccess.scope !== "own";
  const canInviteEmployees = hasPermissionLevel(permissions.employees, "write");

  // "Aktive Belegschaft" für alle Dashboard-Kennzahlen: ausgeschiedene
  // (status "former") und noch nicht gestartete Mitarbeiter (startDate in
  // der Zukunft) zählen nicht mit (QA-Bug BUG-002) — employee.status selbst
  // wird sonst live weiter unten aus Urlaub/Krankheit abgeleitet.
  const todayIsoForWorkforce = new Date().toISOString().slice(0, 10);
  const employeeList = (employees ?? []).filter(
    (employee) =>
      employee.status !== "former" &&
      (!employee.startDate || employee.startDate <= todayIsoForWorkforce),
  );
  const vacationList = vacationRequests ?? [];
  const reminderList = reminders ?? [];
  const locationList = locations ?? [];
  const currentSickness = sickness?.current ?? [];
  const sicknessMetrics = sickness?.metrics ?? [];
  const shiftDays = shiftPlan?.days ?? [];
  const shiftConflictCount = shiftPlan?.conflictCount ?? 0;
  const shiftWeekLabel = shiftPlan
    ? `${shiftPlan.label} · ${shiftPlan.range}`
    : t("weekLabel", { week });

  const tenantName =
    memberships?.find((membership) => membership.tenant.slug === tenant)?.tenant
      .name ?? tenant;

  // `employee.status` wird nirgends automatisch synchron gehalten (bleibt
  // z. B. "active", während jemand im Urlaub oder krank ist) — daher live
  // aus genehmigten Urlaubsanträgen (heute im Zeitraum) und der bereits
  // korrekt berechneten "aktuell krank"-Liste ableiten statt aus dem Feld.
  const todayIso = new Date().toISOString().slice(0, 10);
  const employeeIdsOnVacationToday = new Set(
    vacationList
      .filter(
        (request) =>
          request.status === "approved" &&
          !!request.startDateIso &&
          !!request.endDateIso &&
          request.startDateIso <= todayIso &&
          request.endDateIso >= todayIso,
      )
      .map((request) => request.employeeId),
  );
  const employeeIdsAbsentToday = new Set(
    currentSickness.map((entry) => entry.employeeId),
  );
  const vacationEmployees = employeeList.filter((employee) =>
    employeeIdsOnVacationToday.has(employee.dbId ?? employee.id),
  );
  const absentEmployees = employeeList.filter((employee) =>
    employeeIdsAbsentToday.has(employee.dbId ?? employee.id),
  );
  const activeEmployees = employeeList.filter(
    (employee) =>
      !employeeIdsOnVacationToday.has(employee.dbId ?? employee.id) &&
      !employeeIdsAbsentToday.has(employee.dbId ?? employee.id),
  );
  const pendingVacations = vacationList.filter(
    (request) => request.status === "pending",
  );
  // `reminderList` enthält seit BUG-013 auch bereits erledigte Erinnerungen
  // (deren `daysLeft` weiterhin nur aus dem Fälligkeitsdatum berechnet wird) —
  // für "dringend" zählen nur die noch offenen.
  const urgentReminders = reminderList.filter(
    (reminder) => reminder.status !== "done" && reminder.daysLeft <= 7,
  );
  // Eine unbesetzte Schicht von GESTERN ist kein Risiko mehr, das sich noch
  // beheben ließe — nur heutige/künftige Tage der aktuellen Woche zählen
  // als "Schicht-Risiko" (QA-Bug BUG-017, zweiter Teil).
  const openShiftCount = shiftDays
    .filter((day) => day.id >= todayIso)
    .reduce((total, day) => total + day.shifts.filter((shift) => !shift.assignee).length, 0);
  const activeLocations = locationList.filter(
    (location) => location.status === "active",
  );
  // Ein Wochentag gilt als "offen" für die "Schichtlage"-Karte, wenn
  // mindestens ein aktiver Standort an diesem Tag geöffnet hat. Ohne
  // Standorte (noch keine angelegt) keine Einschränkung — sonst würde die
  // Karte fälschlich jeden Tag als geschlossen zeigen.
  const openWeekdays = new Set<OpeningHoursWeekday>();

  for (const location of activeLocations) {
    for (const day of location.openingHours) {
      if (day.mode !== "closed") {
        openWeekdays.add(day.weekday);
      }
    }
  }

  function isClosedDay(dayId: string) {
    if (activeLocations.length === 0) {
      return false;
    }

    return !openWeekdays.has(weekdayFromDate(new Date(`${dayId}T00:00:00Z`)));
  }
  const activeToday = locationList.reduce(
    (total, location) => total + location.activeToday,
    0,
  );
  const employeeTotal = employeeList.length;
  const averageVacationRemaining =
    employeeTotal > 0
      ? Math.round(
          employeeList.reduce(
            (total, employee) => total + employee.vacationRemaining,
            0,
          ) / employeeTotal,
        )
      : 0;

  const contractCounts = new Map<string, number>();

  for (const employee of employeeList) {
    const label = employee.contract?.trim() || t("noContractInfo");

    contractCounts.set(label, (contractCounts.get(label) ?? 0) + 1);
  }

  const contractDistribution = [...contractCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  // Intl liefert in de-DE "03 Uhr" – daher parseInt statt Number.
  const berlinHour = Number.parseInt(
    new Intl.DateTimeFormat("de-DE", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Europe/Berlin",
    }).format(now),
    10,
  );
  const greeting =
    berlinHour < 11
      ? t("greetingMorning")
      : berlinHour < 18
        ? t("greetingDay")
        : t("greetingEvening");
  const firstName = session?.user?.name?.trim().split(/\s+/)[0];
  const dateLabel = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(now);

  const actionItems = [
    {
      title: t("actionItem1Title"),
      detail: t("actionItem1Detail", { count: pendingVacations.length }),
      href: `${baseHref}/urlaub`,
      tone: "bg-warning/10 text-[#7A4E00]",
    },
    ...(shiftsTeamWide
      ? [
          {
            title: t("actionItem2Title"),
            detail: t("actionItem2Detail", {
              count: shiftConflictCount,
              week: shiftPlan?.label ?? t("weekLabel", { week }),
            }),
            href: `${baseHref}/schichtplanung`,
            tone: "bg-danger/10 text-danger",
          },
        ]
      : []),
    {
      title: t("actionItem3Title"),
      detail: t("actionItem3Detail", { count: urgentReminders.length }),
      href: `${baseHref}/erinnerungen`,
      tone: "bg-ink text-white",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={`${dateLabel} · ${t("weekLabel", { week })}`}
        title={firstName ? `${greeting}, ${firstName}` : greeting}
        subtitle={t("subtitleForTenant", { tenant: tenantName })}
      >
        {canInviteEmployees && (
          <Link href={`${baseHref}/employees`} className="btn btn-primary">
            <UsersRound size={15} />
            {t("employeesNav")}
          </Link>
        )}
        <Link href={`${baseHref}/schichtplanung`} className="btn btn-secondary">
          <Plus size={15} />
          {t("planShift")}
        </Link>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t("metricEmployeesActiveLabel")}
          value={`${activeEmployees.length}/${employeeTotal}`}
          change={t("metricEmployeesActiveChange", { count: vacationEmployees.length })}
          caption={t("metricEmployeesActiveCaption", { count: absentEmployees.length })}
        />
        <MetricCard
          label={t("metricOnDutyTodayLabel")}
          value={activeToday}
          trend="neutral"
          change={t("metricOnDutyTodayChange", { count: activeLocations.length })}
          caption={t("metricOnDutyTodayCaption")}
        />
        <MetricCard
          label={t("metricOpenRequestsLabel")}
          value={pendingVacations.length + urgentReminders.length}
          change={t("metricOpenRequestsChange", { count: pendingVacations.length })}
          caption={t("metricOpenRequestsCaption", { count: urgentReminders.length })}
        />
        <MetricCard
          label={t("metricShiftRisksLabel")}
          value={shiftConflictCount + openShiftCount}
          change={t("metricShiftRisksChange", { count: shiftConflictCount })}
          caption={t("metricShiftRisksCaption", { count: openShiftCount })}
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="flex flex-col gap-5">
          <DashboardCard
            title={t("cardTodayTitle")}
            meta={t("cardTodayMeta")}
          >
            <div className="grid gap-3">
              {actionItems.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="flex items-center gap-3 rounded-[12px] border border-border-light bg-bg p-3 no-underline transition-colors hover:border-muted"
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] ${item.tone}`}
                  >
                    <AlertCircle size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-ink">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-muted-2">
                      {item.detail}
                    </span>
                  </span>
                  <ArrowRight size={15} className="shrink-0 text-muted" />
                </Link>
              ))}
            </div>
          </DashboardCard>

          {shiftPlan && shiftsTeamWide && (
            <DashboardCard
              title={t("cardShiftSituationTitle")}
              meta={shiftWeekLabel}
              action={
                <Link href={`${baseHref}/schichtplanung`} className="text-link">
                  {t("open")}
                </Link>
              }
            >
              <div className="grid gap-2">
                {shiftDays.map((day) => {
                  const assignedCount = day.shifts.filter((shift) => shift.assignee).length;
                  const emptyCount = day.shifts.filter((shift) => !shift.assignee).length;
                  const hasConflict = day.shifts.some((shift) => shift.conflict);
                  const closed = isClosedDay(day.id);

                  return (
                    <div
                      key={day.id}
                      className={`grid grid-cols-[54px_1fr_auto] items-center gap-3 rounded-[10px] border border-border-light bg-bg px-3 py-2.5 ${
                        closed ? "opacity-60" : ""
                      }`}
                    >
                      <div>
                        <div className="font-mono text-[11px] font-semibold text-ink">
                          {day.weekday}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-muted">
                          {day.date}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-medium text-ink">
                          {closed
                            ? t("closedDayNoLocation")
                            : day.shifts.length === 0
                              ? t("closedDayNoShifts")
                              : t("assignedOfOpen", { assigned: assignedCount, empty: emptyCount })}
                        </div>
                        {!closed && (
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
                            <div
                              className={`h-full w-[var(--pct)] rounded-full ${
                                hasConflict || emptyCount > 0 ? "bg-warning" : "bg-success"
                              }`}
                              style={
                                {
                                  "--pct":
                                    day.shifts.length === 0
                                      ? "0%"
                                      : `${Math.max(18, Math.round((assignedCount / day.shifts.length) * 100))}%`,
                                } as CSSProperties
                              }
                            />
                          </div>
                        )}
                      </div>
                      {closed ? (
                        <StatusPill>{t("statusClosed")}</StatusPill>
                      ) : hasConflict ? (
                        <StatusPill>{t("statusConflict")}</StatusPill>
                      ) : emptyCount > 0 ? (
                        <StatusPill>{t("statusOpen")}</StatusPill>
                      ) : (
                        <StatusPill>{t("statusStable")}</StatusPill>
                      )}
                    </div>
                  );
                })}
              </div>
            </DashboardCard>
          )}

          {locations && (
            <DashboardCard
              title={t("cardLocationsTitle")}
              meta={t("cardLocationsMeta")}
              action={
                <Link href={`${baseHref}/standorte`} className="text-link">
                  {t("allLocations")}
                </Link>
              }
            >
              {locationList.length === 0 ? (
                <EmptyHint>{t("noLocationsYet")}</EmptyHint>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {locationList.slice(0, 4).map((location) => (
                    <div
                      key={location.id}
                      className="rounded-[12px] border border-border-light bg-bg p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13.5px] font-semibold text-ink">
                            {location.name}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted">
                            <MapPin size={12} />
                            {location.kind}
                          </div>
                        </div>
                        <StatusPill>{location.utilization}</StatusPill>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="font-display text-[18px] font-semibold text-ink">
                            {location.employeeCount}
                          </div>
                          <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                            {t("teamLabel")}
                          </div>
                        </div>
                        <div>
                          <div className="font-display text-[18px] font-semibold text-ink">
                            {location.activeToday}
                          </div>
                          <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                            {t("activeLabel")}
                          </div>
                        </div>
                        <div>
                          <div className="font-display text-[18px] font-semibold text-danger">
                            {location.openPositions}
                          </div>
                          <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                            {t("statusOpen")}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {employeesTeamWide && (
          <DashboardCard title={t("cardTeamStatusTitle")} meta={t("cardTeamStatusMeta")}>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-[10px] bg-success/10 p-3">
                <div className="font-display text-[24px] font-semibold text-success">
                  {activeEmployees.length}
                </div>
                <div className="mt-1 text-[11px] text-muted-2">{t("onDutyLabel")}</div>
              </div>
              <div className="rounded-[10px] bg-border-soft p-3">
                <div className="font-display text-[24px] font-semibold text-ink">
                  {vacationEmployees.length}
                </div>
                <div className="mt-1 text-[11px] text-muted-2">{t("vacationLabel")}</div>
              </div>
              <div className="rounded-[10px] bg-danger/10 p-3">
                <div className="font-display text-[24px] font-semibold text-danger">
                  {absentEmployees.length}
                </div>
                <div className="mt-1 text-[11px] text-muted-2">{t("absentLabel")}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {employeeTotal === 0 ? (
                <EmptyHint>{t("noEmployeesYet")}</EmptyHint>
              ) : vacationEmployees.length + absentEmployees.length === 0 ? (
                <EmptyHint>{t("allOnDuty")}</EmptyHint>
              ) : (
                [
                  ...vacationEmployees.map((employee) => ({ employee, label: t("vacationLabel") })),
                  ...absentEmployees.map((employee) => ({ employee, label: t("absentLabel") })),
                ]
                  .slice(0, 5)
                  .map(({ employee, label }) => (
                    <Link
                      key={employee.id}
                      href={`${baseHref}/employees/${employee.id}`}
                      className="flex items-center gap-3 rounded-[10px] border border-border-light bg-bg p-2.5 no-underline transition-colors hover:border-muted"
                    >
                      <AvatarBadge initials={employee.initials} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-ink">
                          {employee.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                          {employee.location} · {employee.team}
                        </span>
                      </span>
                      <StatusPill>{label}</StatusPill>
                    </Link>
                  ))
              )}
            </div>
          </DashboardCard>
          )}

          {vacationTeamWide && (
          <DashboardCard
            title={t("cardAbsencesTitle")}
            meta={t("cardAbsencesMeta", { avg: averageVacationRemaining })}
            action={<CalendarCheck size={18} className="text-muted" />}
          >
            <div className="grid gap-3">
              {pendingVacations.length === 0 ? (
                <EmptyHint>{t("noOpenVacationRequests")}</EmptyHint>
              ) : (
                pendingVacations.slice(0, 4).map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center gap-3 rounded-[10px] border border-border-light bg-bg p-2.5"
                  >
                    <AvatarBadge initials={request.initials} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink">
                        {request.name}
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-muted">
                        {request.startDate}-{request.endDate} · {request.days}
                      </div>
                    </div>
                    <StatusPill>{t("statusPending")}</StatusPill>
                  </div>
                ))
              )}
            </div>
          </DashboardCard>
          )}

          {sicknessTeamWide && (
          <DashboardCard
            title={t("cardSicknessTitle")}
            meta={sicknessMetrics[1]?.caption}
            action={<Clock3 size={18} className="text-muted" />}
          >
            <div className="mb-3 rounded-[10px] bg-danger/10 p-3">
              <div className="font-display text-[28px] font-semibold text-danger">
                {currentSickness.length}
              </div>
              <div className="mt-1 text-[12px] text-muted-2">
                {t("currentlySick")}
              </div>
            </div>
            <div className="grid gap-2">
              {currentSickness.length === 0 ? (
                <EmptyHint>{t("noCurrentSickness")}</EmptyHint>
              ) : (
                currentSickness.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-[10px] border border-border-light bg-bg p-2.5"
                  >
                    <AvatarBadge initials={item.initials} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink">
                        {item.name}
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-muted">
                        {t("sinceDaysLabel", { date: item.since, days: item.days })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </DashboardCard>
          )}

          {employeesTeamWide && (
          <DashboardCard title={t("cardStaffStructureTitle")} meta={t("cardStaffStructureMeta")}>
            <div className="grid gap-2">
              {contractDistribution.length === 0 ? (
                <EmptyHint>{t("noEmployeesYet")}</EmptyHint>
              ) : (
                contractDistribution.map(([contract, count]) => {
                  const percent =
                    employeeTotal > 0
                      ? Math.round((count / employeeTotal) * 100)
                      : 0;

                  return (
                    <div key={contract}>
                      <div className="mb-1 flex justify-between text-[12px]">
                        <span className="font-medium text-ink">{contract}</span>
                        <span className="text-muted">{count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full w-[var(--pct)] rounded-full bg-ink"
                          style={{ "--pct": `${percent}%` } as CSSProperties}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </DashboardCard>
          )}
        </div>
      </div>
    </>
  );
}
