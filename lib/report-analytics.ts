import "server-only";

import { getGermanHolidays, type Bundesland } from "@/lib/german-holidays";
import { prisma } from "@/lib/prisma";
import {
  addDaysIso,
  buildOvertimeAccount,
  countWorkdays,
  eachDayIso,
  findArbzgViolations,
  headcountByMonth,
  intersectSpan,
  lastMonths,
  monthBounds,
  projectSundaysOff,
  sicknessRate,
  sicknessStartsByWeekday,
  staffMovements,
  summarizeOvertime,
  tenureYears,
  turnoverRate,
  upcomingStaffDeadlines,
  weekdayIndex,
  type ArbzgFinding,
  type StaffDeadline,
  type StaffRecord,
  type WorkBlock,
} from "@/lib/report-analytics-core";
import { computeReport, type ReportFilters } from "@/lib/reports-service";
import { getOptionalTenantAccess, requireTenantAccess, type TenantAccess } from "@/lib/tenant-access";
import { calculateEntryDurations, localDateKey } from "@/lib/time-tracking";
import {
  entryInclude,
  loadPublishedShifts,
  loadTenantContext,
  rangeBounds,
  scopedEmployeeWhere,
  toShiftView,
} from "@/lib/time-tracking-service";
import { parseVacationWorkDays } from "@/lib/vacations";

/**
 * Analysen der Reports-Seite (Tabs neben dem Stundenreport). Jede Analyse
 * nutzt die Rechte und den Scope des passenden Bereichs:
 * - Überstunden und Arbeitszeitgesetz: "timeTracking" lesen (wie der Stundenreport),
 * - Abwesenheiten: "sickness" lesen (Gesundheitsdaten, Art. 9 DSGVO),
 * - Personal: "employees" lesen.
 */

const MONTHS = 6;

export type AnalyticsPerson = { id: string; key: string; name: string; initials: string };

function person(employee: { id: string; key: string; name: string; initials: string }): AnalyticsPerson {
  return { id: employee.id, key: employee.key, name: employee.name, initials: employee.initials };
}

async function todayFor(access: TenantAccess) {
  const { timeZone } = await loadTenantContext(access.tenantId);

  return { timeZone, today: localDateKey(new Date(), timeZone) };
}

// ---------------------------------------------------------------------------
// Überstunden
// ---------------------------------------------------------------------------

export type OvertimeAnalytics = {
  months: string[];
  monthTotals: number[];
  accounts: Array<
    AnalyticsPerson & { contract: string; weeklyHours: string; monthly: number[]; total: number; current: number }
  >;
  summary: ReturnType<typeof summarizeOvertime>;
};

/** Arbeitszeitkonten: Ist − Soll je Monat (Soll bis heute, ohne Abwesenheitstage), sechs Monate. */
export async function getOvertimeAnalytics(tenantSlug: string): Promise<OvertimeAnalytics> {
  const access = await requireTenantAccess(tenantSlug, "timeTracking", "read");
  const { today } = await todayFor(access);
  const months = lastMonths(today, MONTHS);
  const saldo = new Map<string, number[]>();

  // Bewusst nacheinander: jeder Monat lädt Zeiteinträge und Schichtplan.
  for (const [index, month] of months.entries()) {
    const { from, to } = monthBounds(month, today);
    const filters: ReportFilters = {
      mode: "all",
      employeeIds: [],
      teamId: "",
      locationId: "",
      period: "custom",
      date: from,
      from,
      to,
      nightStart: "20",
    };
    const report = await computeReport(access, filters);

    for (const row of report.rows) {
      const values = saldo.get(row.employeeId) ?? Array<number>(months.length).fill(0);

      values[index] = row.workedMinutes - (row.plannedToDateMinutes - row.absencePlannedMinutes);
      saldo.set(row.employeeId, values);
    }
  }

  const employees = await prisma.tenantEmployee.findMany({
    where: { id: { in: [...saldo.keys()] }, tenantId: access.tenantId },
    select: { id: true, key: true, name: true, initials: true, contract: true, weeklyHours: true, status: true },
  });
  const accounts = employees
    .filter((employee) => employee.status !== "former" || saldo.get(employee.id)?.some((value) => value !== 0))
    .map((employee) => ({
      ...person(employee),
      contract: employee.contract,
      weeklyHours: employee.weeklyHours,
      ...buildOvertimeAccount(employee.id, saldo.get(employee.id) ?? []),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    months,
    monthTotals: months.map((_, index) => accounts.reduce((sum, account) => sum + (account.monthly[index] ?? 0), 0)),
    accounts,
    summary: summarizeOvertime(accounts),
  };
}

// ---------------------------------------------------------------------------
// Abwesenheiten (Krankheit)
// ---------------------------------------------------------------------------

export type SicknessAnalytics = {
  months: string[];
  /** Krankenquote je Monat in Prozent. */
  rates: number[];
  currentSickWorkdays: number;
  /** Krankheits-Kalendertage seit Beginn des ersten Monats. */
  calendarDays: number;
  startsByWeekday: number[];
  totalStarts: number;
};

export async function getSicknessAnalytics(tenantSlug: string): Promise<SicknessAnalytics | null> {
  const access = await getOptionalTenantAccess(tenantSlug, "sickness", "read");

  if (!access) return null;

  const { today } = await todayFor(access);
  const months = lastMonths(today, MONTHS);
  const windowStart = `${months[0]}-01`;
  const [employees, locations] = await Promise.all([
    prisma.tenantEmployee.findMany({
      where: await scopedEmployeeWhere(access),
      select: { id: true, startDate: true, endDate: true, status: true, offboardedAt: true, workDaysJson: true, location: true },
    }),
    prisma.tenantLocation.findMany({ where: { tenantId: access.tenantId }, select: { name: true, bundesland: true } }),
  ]);
  const reports = await prisma.tenantSicknessReport.findMany({
    where: {
      tenantId: access.tenantId,
      employeeId: { in: employees.map((employee) => employee.id) },
      startDate: { lte: new Date(`${today}T23:59:59.999Z`) },
      OR: [{ endDate: null }, { endDate: { gte: new Date(`${windowStart}T00:00:00.000Z`) } }],
    },
    select: { employeeId: true, startDate: true, endDate: true },
  });

  const bundeslandOf = new Map(locations.map((location) => [location.name, location.bundesland as Bundesland | null]));
  const holidayCache = new Map<string, Map<string, string>>();
  const holidayChecker = (bundesland: Bundesland | null) => (day: string) => {
    const key = `${bundesland ?? "-"}:${day.slice(0, 4)}`;
    let holidays = holidayCache.get(key);

    if (!holidays) {
      holidays = getGermanHolidays(Number(day.slice(0, 4)), bundesland);
      holidayCache.set(key, holidays);
    }

    return holidays.has(day);
  };
  const staff = employees.map((employee) => ({
    ...employee,
    record: toStaffRecord(employee),
    workDays: parseVacationWorkDays(employee.workDaysJson),
    isHoliday: holidayChecker(bundeslandOf.get(employee.location) ?? null),
  }));
  const byId = new Map(staff.map((employee) => [employee.id, employee]));
  const periods = reports.map((report) => ({
    employeeId: report.employeeId,
    from: report.startDate.toISOString().slice(0, 10),
    to: report.endDate ? report.endDate.toISOString().slice(0, 10) : today,
  }));

  let currentSickWorkdays = 0;
  const rates = months.map((month) => {
    const bounds = monthBounds(month, today);
    let possible = 0;
    let sick = 0;

    for (const employee of staff) {
      const employed = intersectSpan(bounds, {
        from: employee.record.startDate || bounds.from,
        to: employee.record.former ? employee.record.exitDate || employee.record.endDate || bounds.to : bounds.to,
      });

      if (employed) possible += countWorkdays(employed.from, employed.to, employee.workDays, employee.isHoliday);
    }

    for (const period of periods) {
      const employee = byId.get(period.employeeId);
      const span = employee && intersectSpan(bounds, period);

      if (employee && span) sick += countWorkdays(span.from, span.to, employee.workDays, employee.isHoliday);
    }

    if (month === months.at(-1)) currentSickWorkdays = sick;

    return sicknessRate(sick, possible);
  });

  const windowSpan = { from: windowStart, to: today };
  const starts = periods.map((period) => period.from).filter((start) => start >= windowStart);

  return {
    months,
    rates,
    currentSickWorkdays,
    calendarDays: periods.reduce((sum, period) => {
      const span = intersectSpan(windowSpan, period);

      return sum + (span ? eachDayIso(span.from, span.to).length : 0);
    }, 0),
    startsByWeekday: sicknessStartsByWeekday(starts),
    totalStarts: starts.length,
  };
}

// ---------------------------------------------------------------------------
// Arbeitszeitgesetz
// ---------------------------------------------------------------------------

export type ArbzgAnalyticsFinding = ArbzgFinding & { source: "time" | "plan"; employee: AnalyticsPerson };

export type ArbzgAnalytics = {
  timeRange: { from: string; to: string };
  planRange: { from: string; to: string };
  findings: ArbzgAnalyticsFinding[];
  sundays: Array<AnalyticsPerson & { worked: number; projectedOff: number }>;
  sundaysSince: string;
};

const ARBZG_LOOKBACK_DAYS = 28;
const ARBZG_PLAN_DAYS = 7;

export async function getArbzgAnalytics(tenantSlug: string): Promise<ArbzgAnalytics> {
  const access = await requireTenantAccess(tenantSlug, "timeTracking", "read");
  const { timeZone, settings } = await loadTenantContext(access.tenantId);
  const now = new Date();
  const today = localDateKey(now, timeZone);
  const timeRange = { from: addDaysIso(today, -(ARBZG_LOOKBACK_DAYS - 1)), to: today };
  const planRange = { from: addDaysIso(today, 1), to: addDaysIso(today, ARBZG_PLAN_DAYS) };
  const sundaysSince = `${lastMonths(today, MONTHS)[0]}-01`;
  const employees = await prisma.tenantEmployee.findMany({
    where: { ...(await scopedEmployeeWhere(access)), status: { not: "former" } },
    select: { id: true, key: true, name: true, initials: true },
    orderBy: { name: "asc" },
  });
  const ids = employees.map((employee) => employee.id);
  const [entries, shifts] = await Promise.all([
    ids.length
      ? prisma.tenantTimeEntry.findMany({
          where: {
            tenantId: access.tenantId,
            employeeId: { in: ids },
            clockOutAt: { not: null },
            clockInAt: rangeBounds(sundaysSince < timeRange.from ? sundaysSince : timeRange.from, today, timeZone),
          },
          include: entryInclude,
          orderBy: { clockInAt: "asc" },
        })
      : [],
    loadPublishedShifts(access.tenantId, ids, timeRange.to, planRange.to, timeZone),
  ]);

  const findings: ArbzgAnalyticsFinding[] = [];
  const sundays: ArbzgAnalytics["sundays"] = [];
  const checkBreaks = settings.breaksEnabled || settings.autoBreakDeduction;
  const sundaysElapsed = eachDayIso(sundaysSince, today).filter((day) => weekdayIndex(day) === 6).length;

  for (const employee of employees) {
    const own = entries.filter((entry) => entry.employeeId === employee.id);
    const actual: WorkBlock[] = own.map((entry) => {
      const durations = calculateEntryDurations(entry, { autoBreakDeduction: settings.autoBreakDeduction, now });

      return {
        date: localDateKey(entry.clockInAt, timeZone),
        start: entry.clockInAt.getTime(),
        end: entry.clockOutAt!.getTime(),
        workedMinutes: durations.workedMinutes,
        // Automatischer Pausenabzug gilt als genommene Pause; ohne Pausenerfassung wird nicht geprüft (s. u.).
        breakMinutes: entry.breakMinutesOverride ?? (settings.autoBreakDeduction ? durations.breakMinutes : durations.clockedBreakMinutes),
      };
    });
    const recent = actual.filter((block) => block.date >= timeRange.from);

    for (const finding of findArbzgViolations(recent, { checkBreaks })) {
      findings.push({ ...finding, source: "time", employee: person(employee) });
    }

    // Plan: geplante Schichten ab morgen, mit den letzten echten Zeiten als Vorlauf für die Ruhezeit.
    const planned: WorkBlock[] = (shifts.get(employee.id) ?? [])
      .filter((shift) => shift.date >= planRange.from && shift.date <= planRange.to)
      .map((shift) => ({
        date: shift.date,
        start: shift.startAt.getTime(),
        end: shift.endAt.getTime(),
        workedMinutes: toShiftView(shift).plannedMinutes,
        breakMinutes: shift.breakMinutes,
      }));

    if (planned.length) {
      const lead = recent.filter((block) => block.date >= addDaysIso(today, -1));

      for (const finding of findArbzgViolations([...lead, ...planned])) {
        if (finding.date >= planRange.from && finding.rule !== "weekly") {
          findings.push({ ...finding, source: "plan", employee: person(employee) });
        }
      }
    }

    const sundaysWorked = new Set(actual.filter((block) => block.date >= sundaysSince && weekdayIndex(block.date) === 6).map((block) => block.date)).size;

    if (sundaysWorked > 0) {
      sundays.push({ ...person(employee), worked: sundaysWorked, projectedOff: projectSundaysOff(sundaysWorked, sundaysElapsed) });
    }
  }

  findings.sort((a, b) => b.date.localeCompare(a.date) || a.employee.name.localeCompare(b.employee.name, "de"));
  sundays.sort((a, b) => b.worked - a.worked || a.name.localeCompare(b.name, "de"));

  return { timeRange, planRange, findings, sundays, sundaysSince };
}

// ---------------------------------------------------------------------------
// Personal
// ---------------------------------------------------------------------------

function toStaffRecord(employee: {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  offboardedAt: Date | null;
}): StaffRecord {
  return {
    id: employee.id,
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(employee.startDate) ? employee.startDate : "",
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(employee.endDate) ? employee.endDate : "",
    former: employee.status === "former",
    exitDate: employee.offboardedAt ? employee.offboardedAt.toISOString().slice(0, 10) : "",
  };
}

function parseWeeklyHours(value: string) {
  const match = /(\d+(?:[.,]\d+)?)/.exec(value);

  return match ? Number(match[1].replace(",", ".")) : null;
}

export const FULL_TIME_HOURS = 35;

export type StaffAnalytics = {
  today: string;
  active: number;
  fullTime: number;
  partTime: number;
  entries: number;
  exits: number;
  turnover: number;
  averageTenure: number | null;
  headcount: Array<{ month: string; count: number }>;
  contracts: Array<{ label: string; count: number }>;
  locations: Array<{ label: string; count: number }>;
  deadlines: Array<StaffDeadline & { employee: AnalyticsPerson }>;
  movements: Array<{ kind: "entry" | "exit"; date: string; employee: AnalyticsPerson }>;
};

export async function getStaffAnalytics(tenantSlug: string): Promise<StaffAnalytics> {
  const access = await requireTenantAccess(tenantSlug, "employees", "read");
  const { today } = await todayFor(access);
  const employees = await prisma.tenantEmployee.findMany({
    where: await scopedEmployeeWhere(access),
    select: {
      id: true,
      key: true,
      name: true,
      initials: true,
      startDate: true,
      endDate: true,
      status: true,
      offboardedAt: true,
      contract: true,
      weeklyHours: true,
      location: true,
      contractDetails: { select: { probation: true } },
    },
  });
  const records = employees.map((employee) => ({ employee, record: toStaffRecord(employee) }));
  const active = records.filter(({ record }) => !record.former);
  const months = lastMonths(today, 12);
  const headcount = headcountByMonth(
    records.map(({ record }) => record),
    months,
    today,
  );
  const span = { from: `${months[0]}-01`, to: today };
  const movements = staffMovements(
    records.map(({ record }) => record),
    span,
  );
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  const hours = active.map(({ employee }) => parseWeeklyHours(employee.weeklyHours));
  const tenures = active
    .map(({ record }) => tenureYears(record.startDate, today))
    .filter((value): value is number => value !== null);
  const countBy = (values: string[]) =>
    [...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>())]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"));

  return {
    today,
    active: active.length,
    fullTime: hours.filter((value) => value !== null && value >= FULL_TIME_HOURS).length,
    partTime: hours.filter((value) => value === null || value < FULL_TIME_HOURS).length,
    entries: movements.entries.length,
    exits: movements.exits.length,
    turnover: turnoverRate(
      movements.exits.length,
      headcount.reduce((sum, item) => sum + item.count, 0) / Math.max(1, headcount.length),
    ),
    averageTenure: tenures.length ? tenures.reduce((sum, value) => sum + value, 0) / tenures.length : null,
    headcount,
    contracts: countBy(active.map(({ employee }) => employee.contract.trim() || "—")),
    locations: countBy(active.map(({ employee }) => employee.location.trim()).filter(Boolean)),
    deadlines: active
      .flatMap(({ employee, record }) =>
        upcomingStaffDeadlines(
          {
            startDate: record.startDate,
            fixedTermEnd: record.endDate,
            probation: employee.contractDetails?.probation ?? "",
          },
          today,
        ).map((deadline) => ({ ...deadline, employee: person(employee) })),
      )
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8),
    movements: [
      ...movements.entries.map((record) => ({ kind: "entry" as const, date: record.startDate, employee: person(byId.get(record.id)!) })),
      ...movements.exits.map((record) => ({
        kind: "exit" as const,
        date: record.exitDate || record.endDate,
        employee: person(byId.get(record.id)!),
      })),
    ].sort((a, b) => b.date.localeCompare(a.date)),
  };
}


// ---------------------------------------------------------------------------
// Urlaubskonten (Abwesenheiten)
// ---------------------------------------------------------------------------

export type VacationAccountAnalytics = {
  year: number;
  accounts: Array<
    AnalyticsPerson & {
      entitlement: number;
      taken: number;
      requested: number;
      remaining: number;
      carryover: number;
      carryoverExpiresAt: string | null;
    }
  >;
  taken: number;
  remaining: number;
  /** Übertrag, der noch verfällt, und sein frühestes Verfallsdatum. */
  expiringCarryover: number;
  expiringAt: string | null;
};

/** Urlaubskonten wie auf der Urlaubsseite (Anspruch laut Vertrag, genommen, beantragt, Rest). */
export async function getVacationAccountAnalytics(tenantSlug: string): Promise<VacationAccountAnalytics | null> {
  const access = await getOptionalTenantAccess(tenantSlug, "vacation", "read");

  if (!access) return null;

  const [{ getEmployeesForTenant }, { getVacationRequestsForTenant }] = await Promise.all([
    import("@/lib/employee-service"),
    import("@/lib/vacation-service"),
  ]);
  const [employees, requests] = await Promise.all([
    getEmployeesForTenant(tenantSlug).catch(() => null),
    getVacationRequestsForTenant(tenantSlug).catch(() => null),
  ]);

  if (!employees) return null;

  const { today } = await todayFor(access);
  const accounts = employees
    .filter((employee) => employee.dbId && employee.status !== "former")
    .map((employee) => ({
      id: employee.dbId!,
      key: employee.id,
      name: employee.name,
      initials: employee.initials,
      entitlement: employee.vacationTotal + employee.vacationCarryover + employee.vacationManualCorrection,
      taken: employee.vacationTaken,
      requested: (requests ?? [])
        .filter((request) => request.employeeId === employee.dbId && request.status === "pending")
        .reduce((sum, request) => sum + (Number.parseInt(request.days, 10) || 0), 0),
      remaining: employee.vacationRemaining,
      carryover: employee.vacationCarryover,
      carryoverExpiresAt: employee.vacationCarryoverExpiresAt ?? null,
    }))
    .sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name, "de"));
  const expiring = accounts.filter((account) => account.carryover > 0 && account.carryoverExpiresAt && account.carryoverExpiresAt >= today);

  return {
    year: Number(today.slice(0, 4)),
    accounts,
    taken: accounts.reduce((sum, account) => sum + account.taken, 0),
    remaining: accounts.reduce((sum, account) => sum + account.remaining, 0),
    expiringCarryover: expiring.reduce((sum, account) => sum + account.carryover, 0),
    expiringAt: expiring.map((account) => account.carryoverExpiresAt!).sort()[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const analyticsTabs = ["overtime", "absences", "arbzg", "staff"] as const;
export type AnalyticsTab = (typeof analyticsTabs)[number];

export function isAnalyticsTab(value: unknown): value is AnalyticsTab {
  return typeof value === "string" && (analyticsTabs as readonly string[]).includes(value);
}

const hours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
const deDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const monthLabel = (month: string) => `${MONTH_LABELS[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`;

const ARBZG_LABELS: Record<ArbzgFinding["rule"], string> = {
  maxDaily: "Höchstarbeitszeit (§3)",
  weekly: "Wochenarbeitszeit (§3)",
  break: "Pause (§4)",
  rest: "Ruhezeit (§5)",
};

const DEADLINE_LABELS: Record<StaffDeadline["kind"], string> = {
  fixedTermEnd: "Befristung endet",
  probationEnd: "Probezeit endet",
  anniversary: "Betriebszugehörigkeit",
};

export function describeArbzgFinding(finding: ArbzgFinding) {
  const h = (minutes = 0) => hours(minutes).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  switch (finding.rule) {
    case "maxDaily":
      return `${h(finding.minutes)} Std. gearbeitet (max. 10 Std.)`;
    case "weekly":
      return `${h(finding.minutes)} Std. in der Woche ab ${deDate(finding.date)} (max. 60 Std.)`;
    case "break":
      return `${finding.breakMinutes} Min. Pause bei ${h(finding.minutes)} Std. Arbeit (mind. ${finding.requiredBreakMinutes} Min.)`;
    case "rest":
      return `Nur ${h(finding.restMinutes)} Std. Ruhezeit seit ${deDate(finding.previousDate ?? finding.date)} (mind. 11 Std.)`;
  }
}

/** Datei für einen Analyse-Tab (Excel oder PDF) — mit denselben Rechten wie die Ansicht. */
export async function exportReportAnalytics(input: { tenantSlug: string; tab: AnalyticsTab; format: "xlsx" | "pdf" }) {
  const { buildTablePdf, buildTableXlsx } = await import("@/lib/report-export");
  const { recordTenantAudit } = await import("@/lib/audit");
  const access =
    input.tab === "staff"
      ? await requireTenantAccess(input.tenantSlug, "employees", "read")
      : input.tab === "absences"
        ? ((await getOptionalTenantAccess(input.tenantSlug, "vacation", "read")) ??
          (await requireTenantAccess(input.tenantSlug, "sickness", "read")))
        : await requireTenantAccess(input.tenantSlug, "timeTracking", "read");
  const { tenantName } = await loadTenantContext(access.tenantId);
  const generated = `Erstellt am ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`;
  let table: Omit<import("@/lib/report-export").TableExportInput, "tenantName">;

  if (input.tab === "overtime") {
    const data = await getOvertimeAnalytics(input.tenantSlug);

    table = {
      title: "Überstunden",
      meta: [`Arbeitszeitkonten ${monthLabel(data.months[0])} – ${monthLabel(data.months.at(-1)!)} · Ist − Soll in Dezimalstunden`, generated],
      columns: [
        { label: "Mitarbeiter", width: 28 },
        { label: "Vertrag", width: 22 },
        ...data.months.map((month) => ({ label: monthLabel(month), width: 10, align: "right" as const })),
        { label: "Saldo", width: 12, align: "right" },
      ],
      rows: data.accounts.map((account) => [
        account.name,
        [account.contract, account.weeklyHours].filter(Boolean).join(" · "),
        ...account.monthly.map(hours),
        hours(account.total),
      ]),
      notes: ["Soll laut veröffentlichtem Schichtplan bis heute, ohne Urlaubs- und Krankheitstage."],
    };
  } else if (input.tab === "absences") {
    const [vacation, sickness] = await Promise.all([
      getVacationAccountAnalytics(input.tenantSlug),
      getSicknessAnalytics(input.tenantSlug),
    ]);

    table = vacation
      ? {
          title: "Urlaubskonten",
          meta: [`Urlaubsjahr ${vacation.year}`, generated],
          columns: [
            { label: "Mitarbeiter", width: 28 },
            { label: "Anspruch", width: 12, align: "right" },
            { label: "Genommen", width: 12, align: "right" },
            { label: "Beantragt", width: 12, align: "right" },
            { label: "Rest", width: 12, align: "right" },
            { label: "Übertrag", width: 12, align: "right" },
            { label: "Übertrag verfällt", width: 16 },
          ],
          rows: vacation.accounts.map((account) => [
            account.name,
            account.entitlement,
            account.taken,
            account.requested,
            account.remaining,
            account.carryover,
            account.carryoverExpiresAt ? deDate(account.carryoverExpiresAt) : "",
          ]),
          notes: sickness ? [`Krankenquote: ${sickness.months.map((month, index) => `${monthLabel(month)} ${sickness.rates[index].toLocaleString("de-DE")} %`).join(" · ")}`] : [],
        }
      : {
          title: "Krankenquote",
          meta: [generated],
          columns: [
            { label: "Monat", width: 16 },
            { label: "Krankenquote (%)", width: 18, align: "right" },
          ],
          rows: sickness!.months.map((month, index) => [monthLabel(month), sickness!.rates[index]]),
        };
  } else if (input.tab === "arbzg") {
    const data = await getArbzgAnalytics(input.tenantSlug);

    table = {
      title: "Arbeitszeitgesetz",
      meta: [
        `Zeiterfassung ${deDate(data.timeRange.from)} – ${deDate(data.timeRange.to)} · Plan ${deDate(data.planRange.from)} – ${deDate(data.planRange.to)}`,
        generated,
      ],
      columns: [
        { label: "Datum", width: 12 },
        { label: "Mitarbeiter", width: 24 },
        { label: "Regel", width: 22 },
        { label: "Details", width: 52 },
        { label: "Quelle", width: 14 },
      ],
      rows: data.findings.map((finding) => [
        deDate(finding.date),
        finding.employee.name,
        ARBZG_LABELS[finding.rule],
        describeArbzgFinding(finding),
        finding.source === "plan" ? "Plan" : "Zeiterfassung",
      ]),
      notes: data.sundays.map((entry) => `${entry.name}: ${entry.worked} Sonntage seit ${deDate(data.sundaysSince)} · ≈ ${entry.projectedOff} frei/Jahr (mind. 15, §11 ArbZG)`),
    };
  } else {
    const data = await getStaffAnalytics(input.tenantSlug);

    table = {
      title: "Personal",
      meta: [
        `${data.active} aktive Mitarbeiter · ${data.entries} Eintritte · ${data.exits} Austritte (12 Monate) · Fluktuation ${data.turnover.toLocaleString("de-DE")} %`,
        generated,
      ],
      columns: [
        { label: "Datum", width: 12 },
        { label: "Mitarbeiter", width: 28 },
        { label: "Frist", width: 30 },
      ],
      rows: data.deadlines.map((deadline) => [
        deDate(deadline.date),
        deadline.employee.name,
        deadline.kind === "anniversary" ? `${deadline.years} Jahre ${DEADLINE_LABELS.anniversary}` : DEADLINE_LABELS[deadline.kind],
      ]),
      notes: [
        `Vertragsarten: ${data.contracts.map((item) => `${item.label} ${item.count}`).join(" · ")}`,
        `Standorte: ${data.locations.map((item) => `${item.label} ${item.count}`).join(" · ")}`,
      ],
    };
  }

  const full = { ...table, tenantName };
  const buffer = input.format === "pdf" ? await buildTablePdf(full) : buildTableXlsx(full);
  const stamp = new Date().toISOString().slice(0, 10);

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Report exportiert",
    source: "Reports",
    entityType: "report-analytics",
    entityId: input.tab,
    detail: `${table.title} · ${input.format.toUpperCase()} · ${table.rows.length} Zeilen`,
  });

  return {
    filename: `${table.title
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")}-${stamp}.${input.format}`,
    contentType:
      input.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    base64: buffer.toString("base64"),
  };
}
