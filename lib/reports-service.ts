import "server-only";
import { Prisma } from "@prisma/client";
import { recordTenantAudit } from "@/lib/audit";
import { isEmailConfigured, sendHoursReportEmail } from "@/lib/email";
import { getGermanHolidays, type Bundesland } from "@/lib/german-holidays";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  buildReportPdf,
  buildReportXlsx,
  formatIsoDateDe,
  type ReportExportInput,
} from "@/lib/report-export";
import {
  REPORT_ERRORS,
  clipPeriod,
  editableReportFields,
  isNightStartOption,
  isReportMode,
  isReportPeriod,
  normalizeReportEmail,
  resolveReportRange,
  sanitizeOverrides,
  splitSurchargeMinutes,
  type AbsencePeriod,
  type EditableReportField,
  type NightStartOption,
  type ReportMode,
  type ReportPeriod,
  type ReportRange,
} from "@/lib/report-hours";
import {
  getOptionalTenantAccess,
  requireTenantAccess,
  resolveScopeFilter,
  scopeAllowsTarget,
  type TenantAccess,
} from "@/lib/tenant-access";
import { calculateEntryDurations, eachIsoDate, isIsoDate, localDateKey } from "@/lib/time-tracking";
import {
  entryInclude,
  loadPublishedShifts,
  loadTenantContext,
  rangeBounds,
  scopedEmployeeWhere,
  toShiftView,
} from "@/lib/time-tracking-service";
import { calculateVacationWorkDays, parseVacationWorkDays } from "@/lib/vacations";

/**
 * Stunden-Reports (Seite /u/[tenant]/reports): Soll-Stunden aus dem
 * veröffentlichten Schichtplan, Ist-Stunden aus der Zeiterfassung samt
 * Nacht-/Feiertags-/Sonntagsanteil, dazu Urlaub und Krankheit im Zeitraum.
 *
 * Rechte:
 * - Ansehen + Excel-Download: "timeTracking" lesen, mit dessen own/team/all-
 *   Scope (wie die Zeiterfassungs-Verwaltung).
 * - Werte in der Tabelle anpassen, per E-Mail versenden, Empfängerliste
 *   pflegen: "timeTracking" schreiben — ein Versand gibt Arbeitszeitdaten an
 *   Dritte heraus.
 * - Urlaubs-/Krankheitsspalten nur mit Leserecht auf "vacation" bzw.
 *   "sickness" und nur für Mitarbeiter in DEREN Scope — Krankheitszeiträume
 *   sind Gesundheitsdaten (Art. 9 DSGVO) und sollen nicht über die
 *   Zeiterfassung an Leute gelangen, die sie sonst nicht sehen dürften.
 *
 * Manuelle Anpassungen werden NICHT gespeichert und ändern keine
 * Zeiteinträge — sie gelten nur für die erzeugte Datei bzw. Mail. Der Server
 * rechnet den Report dafür komplett neu und übernimmt vom Client
 * ausschließlich die vier editierbaren Zahlen (validiert), sodass sich über
 * den Export weder Mitarbeiter außerhalb des Scopes noch andere Spalten
 * einschleusen lassen. Jede Anpassung landet im Audit-Log und als Hinweis in
 * der Datei.
 */

export type ReportFilters = {
  mode: ReportMode;
  employeeIds: string[];
  teamId: string;
  locationId: string;
  period: ReportPeriod;
  /** Anker für Tag/Woche/Monat. */
  date: string;
  from: string;
  to: string;
  nightStart: NightStartOption;
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function list(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean).slice(0, 500);
}

/** Filter aus den URL-Parametern der Seite; Ungültiges fällt auf Standardwerte zurück. */
export function parseReportFilters(params: SearchParams, today: string): ReportFilters {
  const mode = single(params.mode);
  const period = single(params.period);
  const date = single(params.date);
  const nightStart = single(params.night);

  return {
    mode: isReportMode(mode) ? mode : "all",
    employeeIds: list(params.employee),
    teamId: single(params.team) ?? "",
    locationId: single(params.location) ?? "",
    period: isReportPeriod(period) ? period : "month",
    date: isIsoDate(date) ? date : today,
    from: single(params.from) ?? "",
    to: single(params.to) ?? "",
    nightStart: isNightStartOption(nightStart) ? nightStart : "20",
  };
}

/**
 * Filter aus einem Query-String (Dashboard-Actions, App-API) — dieselbe
 * Quelle wie beim Rendern, der Client kann also nichts anderes anfordern,
 * als er über die URL ohnehin sehen dürfte. Ohne "date" setzt der Service
 * den heutigen Tag in der Zeitzone des Betriebs ein.
 */
export function parseReportFiltersFromQuery(query: unknown): ReportFilters {
  const params = new URLSearchParams(typeof query === "string" ? query.slice(0, 20_000) : "");
  const record: Record<string, string | string[]> = {};

  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    record[key] = values.length > 1 ? values : values[0];
  }

  return parseReportFilters(record, typeof record.date === "string" ? record.date : "");
}

/** Gegenstück zu `parseReportFilters` — für Links (blättern) und den Client. */
export function reportFiltersToParams(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams({ mode: filters.mode, period: filters.period, night: filters.nightStart });

  if (filters.mode === "employee" || filters.mode === "employees") {
    for (const id of filters.mode === "employee" ? filters.employeeIds.slice(0, 1) : filters.employeeIds) {
      params.append("employee", id);
    }
  }
  if (filters.mode === "team" && filters.teamId) params.set("team", filters.teamId);
  if (filters.mode === "location" && filters.locationId) params.set("location", filters.locationId);
  if (filters.period === "custom") {
    params.set("from", filters.from);
    params.set("to", filters.to);
  } else {
    params.set("date", filters.date);
  }

  return params;
}

export type HoursReportRow = {
  employeeId: string;
  name: string;
  employeeNumber: string;
  plannedMinutes: number;
  workedMinutes: number;
  nightMinutes: number;
  holidayMinutes: number;
  sundayMinutes: number;
  /** Soll der bis jetzt beendeten Schichten (für die Differenz im laufenden Zeitraum). */
  plannedToDateMinutes: number;
  /** Davon an Urlaubs-/Krankheitstagen (nur soweit für den Betrachter sichtbar). */
  absencePlannedMinutes: number;
  /** Noch laufende Stempelungen (bis "jetzt" gezählt). */
  openEntries: number;
  /** null = keine Berechtigung für diesen Mitarbeiter. */
  vacations: AbsencePeriod[] | null;
  sickness: AbsencePeriod[] | null;
};

export type ReportSelectOption = { id: string; name: string };

export type ReportEmployeeOption = {
  id: string;
  initials: string;
  name: string;
  employeeNumber: string;
  location: string;
  team: string;
  role: string;
};

export type HoursReportView = {
  filters: ReportFilters;
  range: ReportRange;
  today: string;
  rows: HoursReportRow[];
  /** Aufgelöste Auswahl (z. B. Name des Teams) — leer, wenn noch nichts gewählt ist. */
  selectionName: string;
  /** Modus verlangt eine Auswahl, die noch fehlt (z. B. "Team" ohne Team). */
  selectionMissing: boolean;
  employees: ReportEmployeeOption[];
  teams: ReportSelectOption[];
  locations: ReportSelectOption[];
  showVacation: boolean;
  showSickness: boolean;
  canEdit: boolean;
  recipients: string[];
  emailConfigured: boolean;
  timeTrackingEnabled: boolean;
};

function canWrite(access: TenantAccess) {
  return access.permissionLevel === "write" || access.permissionLevel === "admin";
}

function requireWrite(access: TenantAccess) {
  if (!canWrite(access)) {
    throw new Error("FORBIDDEN");
  }
}

const SICKNESS_DATE = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export type ComputedReport = {
  tenantName: string;
  timeZone: string;
  today: string;
  range: ReportRange;
  rows: HoursReportRow[];
  selectionName: string;
  selectionMissing: boolean;
  showVacation: boolean;
  showSickness: boolean;
  timeTrackingEnabled: boolean;
  scopedEmployees: Array<{
    id: string;
    name: string;
    initials: string;
    employeeNumber: string;
    location: string;
    team: string;
    role: string;
    status: string;
  }>;
};

export async function computeReport(
  access: TenantAccess,
  filters: ReportFilters,
): Promise<ComputedReport> {
  const { tenantName, timeZone, settings } = await loadTenantContext(access.tenantId);
  const now = new Date();
  const today = localDateKey(now, timeZone);
  const range = resolveReportRange({
    period: filters.period,
    anchor: filters.date || today,
    from: filters.from,
    to: filters.to,
  });

  const scopedEmployees = await prisma.tenantEmployee.findMany({
    where: await scopedEmployeeWhere(access),
    select: {
      id: true,
      name: true,
      initials: true,
      employeeNumber: true,
      location: true,
      team: true,
      role: true,
      status: true,
      workDaysJson: true,
    },
    orderBy: { name: "asc" },
  });
  const scopedIds = new Set(scopedEmployees.map((employee) => employee.id));

  // Auswahl → Mitarbeiter-IDs, immer geschnitten mit dem Scope.
  let selectedIds: string[] = [];
  let selectionName = "";
  let selectionMissing = false;
  let explicitPick = false;

  if (filters.mode === "all") {
    selectedIds = [...scopedIds];
  } else if (filters.mode === "employee" || filters.mode === "employees") {
    const picked = filters.mode === "employee" ? filters.employeeIds.slice(0, 1) : filters.employeeIds;
    selectedIds = picked.filter((id) => scopedIds.has(id));
    selectionMissing = selectedIds.length === 0;
    explicitPick = true;
    selectionName = scopedEmployees
      .filter((employee) => selectedIds.includes(employee.id))
      .map((employee) => employee.name)
      .join(", ");
  } else if (filters.mode === "team") {
    const team = filters.teamId
      ? await prisma.tenantTeam.findFirst({
          where: { id: filters.teamId, tenantId: access.tenantId },
          select: { name: true, members: { select: { employeeId: true } } },
        })
      : null;
    selectionMissing = !team;
    selectionName = team?.name ?? "";
    selectedIds = (team?.members ?? []).map((member) => member.employeeId).filter((id) => scopedIds.has(id));
  } else {
    const location = filters.locationId
      ? await prisma.tenantLocation.findFirst({
          where: { id: filters.locationId, tenantId: access.tenantId },
          select: { name: true, members: { select: { employeeId: true } } },
        })
      : null;
    selectionMissing = !location;
    selectionName = location?.name ?? "";
    selectedIds = (location?.members ?? []).map((member) => member.employeeId).filter((id) => scopedIds.has(id));
  }

  const selectedSet = new Set(selectedIds);
  const employees = scopedEmployees.filter((employee) => selectedSet.has(employee.id));
  const employeeIds = employees.map((employee) => employee.id);

  // Bewusst nacheinander: beide lösen dieselbe Session auf.
  const vacationAccess = await getOptionalTenantAccess(access.tenantSlug, "vacation", "read");
  const sicknessAccess = await getOptionalTenantAccess(access.tenantSlug, "sickness", "read");
  const [vacationScope, sicknessScope] = await Promise.all([
    vacationAccess ? resolveScopeFilter(vacationAccess) : null,
    sicknessAccess ? resolveScopeFilter(sicknessAccess) : null,
  ]);
  const vacationEmployeeIds = vacationScope
    ? employeeIds.filter((id) => scopeAllowsTarget(vacationScope, employees.find((employee) => employee.id === id)!))
    : [];
  const sicknessEmployeeIds = sicknessScope
    ? employeeIds.filter((id) => scopeAllowsTarget(sicknessScope, employees.find((employee) => employee.id === id)!))
    : [];

  const [entries, shiftsByEmployee, vacations, sicknessReports, locations, locationMemberships] = await Promise.all([
    employeeIds.length
      ? prisma.tenantTimeEntry.findMany({
          where: {
            tenantId: access.tenantId,
            employeeId: { in: employeeIds },
            clockInAt: rangeBounds(range.from, range.to, timeZone),
          },
          include: entryInclude,
          orderBy: { clockInAt: "asc" },
        })
      : [],
    loadPublishedShifts(access.tenantId, employeeIds, range.from, range.to, timeZone),
    vacationEmployeeIds.length
      ? prisma.tenantVacationRequest.findMany({
          where: {
            tenantId: access.tenantId,
            employeeId: { in: vacationEmployeeIds },
            status: "approved",
            startDate: { lte: range.to },
            endDate: { gte: range.from },
          },
          select: { employeeId: true, startDate: true, endDate: true },
          orderBy: { startDate: "asc" },
        })
      : [],
    sicknessEmployeeIds.length
      ? prisma.tenantSicknessReport.findMany({
          where: {
            tenantId: access.tenantId,
            employeeId: { in: sicknessEmployeeIds },
            startDate: { lte: SICKNESS_DATE(range.to) },
            OR: [{ endDate: null }, { endDate: { gte: SICKNESS_DATE(range.from) } }],
          },
          select: { employeeId: true, startDate: true, endDate: true },
          orderBy: { startDate: "asc" },
        })
      : [],
    prisma.tenantLocation.findMany({
      where: { tenantId: access.tenantId },
      select: { id: true, name: true, bundesland: true },
    }),
    employeeIds.length
      ? prisma.tenantLocationMember.findMany({
          where: { employeeId: { in: employeeIds }, location: { tenantId: access.tenantId } },
          select: { employeeId: true, location: { select: { bundesland: true } } },
          orderBy: { location: { name: "asc" } },
        })
      : [],
  ]);

  // Bundesland je Mitarbeiter: Hauptstandort, sonst erste Standortzuordnung.
  const bundeslandByLocationName = new Map(locations.map((location) => [location.name, location.bundesland]));
  const bundeslandOf = (employee: { id: string; location: string }): Bundesland | null =>
    (bundeslandByLocationName.get(employee.location) as Bundesland | null | undefined) ??
    (locationMemberships.find((member) => member.employeeId === employee.id)?.location.bundesland as
      | Bundesland
      | null
      | undefined) ??
    null;

  const holidayCache = new Map<string, Map<string, string>>();
  const holidayChecker = (bundesland: Bundesland | null) => (date: string) => {
    const key = `${bundesland ?? "-"}:${date.slice(0, 4)}`;
    let holidays = holidayCache.get(key);
    if (!holidays) {
      holidays = getGermanHolidays(Number(date.slice(0, 4)), bundesland);
      holidayCache.set(key, holidays);
    }
    return holidays.has(date);
  };

  const vacationSet = new Set(vacationEmployeeIds);
  const sicknessSet = new Set(sicknessEmployeeIds);
  const sicknessOpenEnd = today < range.to ? today : range.to;

  const rows = employees.flatMap((employee): HoursReportRow[] => {
    const bundesland = bundeslandOf(employee);
    const isHoliday = holidayChecker(bundesland);
    const own = entries.filter((entry) => entry.employeeId === employee.id);
    const totals = { workedMinutes: 0, nightMinutes: 0, holidayMinutes: 0, sundayMinutes: 0 };

    for (const entry of own) {
      const durations = calculateEntryDurations(entry, {
        autoBreakDeduction: settings.autoBreakDeduction,
        now,
      });
      const split = splitSurchargeMinutes(
        {
          clockInAt: entry.clockInAt,
          endAt: entry.clockOutAt ?? now,
          breaks: entry.breaks,
          workedMinutes: durations.workedMinutes,
        },
        { timeZone, nightStart: filters.nightStart, isHoliday },
      );
      totals.workedMinutes += durations.workedMinutes;
      totals.nightMinutes += split.nightMinutes;
      totals.holidayMinutes += split.holidayMinutes;
      totals.sundayMinutes += split.sundayMinutes;
    }

    const workDays = parseVacationWorkDays(employee.workDaysJson);
    const employeeVacations = vacationSet.has(employee.id)
      ? vacations
          .filter((vacation) => vacation.employeeId === employee.id)
          .flatMap((vacation): AbsencePeriod[] => {
            const clipped = clipPeriod(vacation.startDate, vacation.endDate, range);
            return clipped
              ? [{ ...clipped, days: calculateVacationWorkDays(clipped.from, clipped.to, workDays, bundesland) }]
              : [];
          })
      : null;
    const employeeSickness = sicknessSet.has(employee.id)
      ? sicknessReports
          .filter((report) => report.employeeId === employee.id)
          .flatMap((report): AbsencePeriod[] => {
            const start = report.startDate.toISOString().slice(0, 10);
            const end = report.endDate ? report.endDate.toISOString().slice(0, 10) : null;
            const clipped = clipPeriod(start, end ?? sicknessOpenEnd, range);
            return clipped
              ? [{ ...clipped, days: eachIsoDate(clipped.from, clipped.to).length, open: end === null }]
              : [];
          })
      : null;

    // Ausgeschiedene in Sammelauswahlen nur, wenn im Zeitraum noch etwas anliegt (Nachweis).
    if (
      employee.status === "former" &&
      !explicitPick &&
      own.length === 0 &&
      !employeeVacations?.length &&
      !employeeSickness?.length
    ) {
      return [];
    }

    const shiftViews = (shiftsByEmployee.get(employee.id) ?? []).map(toShiftView);
    const absent = (date: string) =>
      [...(employeeVacations ?? []), ...(employeeSickness ?? [])].some((period) => period.from <= date && period.to >= date);
    // Nur bereits beendete Schichten — eine laufende oder spätere Schicht von heute zählt noch nicht ins Soll.
    const shiftsToDate = shiftViews.filter((shift) => new Date(shift.endAt) <= now);

    return [
      {
        employeeId: employee.id,
        name: employee.name,
        employeeNumber: employee.employeeNumber,
        plannedMinutes: shiftViews.reduce((sum, shift) => sum + shift.plannedMinutes, 0),
        plannedToDateMinutes: shiftsToDate.reduce((sum, shift) => sum + shift.plannedMinutes, 0),
        absencePlannedMinutes: shiftsToDate
          .filter((shift) => absent(shift.date))
          .reduce((sum, shift) => sum + shift.plannedMinutes, 0),
        ...totals,
        openEntries: own.filter((entry) => !entry.clockOutAt).length,
        vacations: employeeVacations,
        sickness: employeeSickness,
      },
    ];
  });

  return {
    tenantName,
    timeZone,
    today,
    range,
    rows,
    selectionName,
    selectionMissing,
    showVacation: vacationAccess !== null,
    showSickness: sicknessAccess !== null,
    timeTrackingEnabled: settings.enabled,
    scopedEmployees,
  };
}

/** Seite /u/[tenant]/reports. */
export async function getHoursReport(tenantSlug: string, params: SearchParams): Promise<HoursReportView> {
  const access = await requireTenantAccess(tenantSlug, "timeTracking", "read");
  const { timeZone } = await loadTenantContext(access.tenantId);
  const filters = parseReportFilters(params, localDateKey(new Date(), timeZone));

  let report: ComputedReport;
  try {
    report = await computeReport(access, filters);
  } catch (error) {
    // Ungültiger benutzerdefinierter Zeitraum (z. B. von > bis) → auf den
    // laufenden Monat zurückfallen statt die Seite scheitern zu lassen.
    if (error instanceof Error && error.message === REPORT_ERRORS.invalidRange) {
      filters.period = "month";
      report = await computeReport(access, filters);
    } else {
      throw error;
    }
  }

  const [teams, locations, recipients] = await Promise.all([
    prisma.tenantTeam.findMany({
      where: { tenantId: access.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.tenantLocation.findMany({
      where: { tenantId: access.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    canWrite(access)
      ? prisma.tenantReportRecipient.findMany({
          where: { tenantId: access.tenantId },
          select: { email: true },
          orderBy: { email: "asc" },
        })
      : [],
  ]);

  return {
    filters,
    range: report.range,
    today: report.today,
    rows: report.rows,
    selectionName: report.selectionName,
    selectionMissing: report.selectionMissing,
    employees: report.scopedEmployees
      .filter((employee) => employee.status !== "former")
      .map((employee) => ({
        id: employee.id,
        initials: employee.initials,
        name: employee.name,
        employeeNumber: employee.employeeNumber,
        location: employee.location,
        team: employee.team,
        role: employee.role,
      })),
    teams,
    locations,
    showVacation: report.showVacation,
    showSickness: report.showSickness,
    canEdit: canWrite(access),
    recipients: recipients.map((recipient) => recipient.email),
    emailConfigured: isEmailConfigured() || process.env.NODE_ENV !== "production",
    timeTrackingEnabled: report.timeTrackingEnabled,
  };
}

// ---------------------------------------------------------------------------
// Export / Versand
// ---------------------------------------------------------------------------

export const reportFormats = ["xlsx", "pdf"] as const;
export type ReportFormat = (typeof reportFormats)[number];

export function isReportFormat(value: unknown): value is ReportFormat {
  return typeof value === "string" && (reportFormats as readonly string[]).includes(value);
}

const FIELD_LABELS: Record<EditableReportField, string> = {
  workedMinutes: "Ist",
  nightMinutes: "Nacht",
  holidayMinutes: "Feiertag",
  sundayMinutes: "Sonntag",
};

function selectionLabelDe(filters: ReportFilters, report: ComputedReport) {
  switch (filters.mode) {
    case "all":
      return "Alle Mitarbeiter";
    case "employee":
      return `Mitarbeiter: ${report.selectionName}`;
    case "employees":
      return `${report.rows.length} Mitarbeiter`;
    case "team":
      return `Team: ${report.selectionName}`;
    case "location":
      return `Standort: ${report.selectionName}`;
  }
}

type ExportInput = {
  tenantSlug: string;
  filters: ReportFilters;
  overrides: unknown;
  format: ReportFormat;
};

type BuiltReport = {
  access: TenantAccess;
  report: ComputedReport;
  file: { filename: string; content: Buffer; contentType: string };
  rangeLabel: string;
  selectionLabel: string;
  adjustmentSummary: string;
};

async function buildReportFile(access: TenantAccess, input: ExportInput): Promise<BuiltReport> {
  const report = await computeReport(access, input.filters);

  if (report.selectionMissing) {
    throw new Error("Keine Mitarbeiter ausgewählt.");
  }

  const maxMinutes = (eachIsoDate(report.range.from, report.range.to).length + 1) * 24 * 60;
  // Ohne Schreibrecht keine Anpassungen — sie werden dann schlicht ignoriert.
  const overrides = canWrite(access)
    ? sanitizeOverrides(input.overrides, new Set(report.rows.map((row) => row.employeeId)), maxMinutes)
    : {};

  const adjustments: string[] = [];
  const rows: ReportExportInput["rows"] = report.rows.map((row) => {
    const override = overrides[row.employeeId] ?? {};
    const adjusted: string[] = [];
    const values = { ...row };

    for (const field of editableReportFields) {
      const value = override[field];
      if (value !== undefined && value !== row[field]) {
        adjusted.push(FIELD_LABELS[field]);
        adjustments.push(`${row.name} ${FIELD_LABELS[field]} ${row[field]}→${value} Min.`);
        values[field] = value;
      }
    }

    return {
      name: row.name,
      employeeNumber: row.employeeNumber,
      plannedMinutes: values.plannedMinutes,
      workedMinutes: values.workedMinutes,
      nightMinutes: values.nightMinutes,
      holidayMinutes: values.holidayMinutes,
      sundayMinutes: values.sundayMinutes,
      vacations: row.vacations,
      sickness: row.sickness,
      adjusted,
    };
  });

  const rangeLabel =
    report.range.from === report.range.to
      ? formatIsoDateDe(report.range.from)
      : `${formatIsoDateDe(report.range.from)} – ${formatIsoDateDe(report.range.to)}`;
  const selectionLabel = selectionLabelDe(input.filters, report);
  const generatedAt = new Intl.DateTimeFormat("de-DE", {
    timeZone: report.timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  const exportInput: ReportExportInput = {
    tenantName: report.tenantName,
    title: "Stundenreport",
    rangeLabel,
    selectionLabel,
    nightLabel: `Nachtarbeit ${input.filters.nightStart}:00–06:00 Uhr`,
    generatedLabel: `Erstellt am ${generatedAt} von ${access.userName}`,
    rows,
    showVacation: report.showVacation,
    showSickness: report.showSickness,
  };
  const baseName = `stundenreport_${report.range.from}_${report.range.to}`;
  const file =
    input.format === "pdf"
      ? { filename: `${baseName}.pdf`, content: await buildReportPdf(exportInput), contentType: "application/pdf" }
      : {
          filename: `${baseName}.xlsx`,
          content: buildReportXlsx(exportInput),
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        };

  return {
    access,
    report,
    file,
    rangeLabel,
    selectionLabel,
    adjustmentSummary: adjustments.length > 0 ? ` · Manuell angepasst: ${adjustments.join("; ")}` : "",
  };
}

/** Download der Report-Datei (Excel, auf Wunsch auch PDF). */
export async function exportHoursReport(input: ExportInput) {
  const access = await requireTenantAccess(input.tenantSlug, "timeTracking", "read");
  const built = await buildReportFile(access, input);

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Stundenreport exportiert",
    source: "Reports",
    entityType: "hours-report",
    entityId: `${built.report.range.from}_${built.report.range.to}`,
    detail: `${input.format.toUpperCase()} · ${built.rangeLabel} · ${built.selectionLabel} · ${built.report.rows.length} Mitarbeiter${built.adjustmentSummary}`,
  });

  return {
    filename: built.file.filename,
    contentType: built.file.contentType,
    base64: built.file.content.toString("base64"),
  };
}

const MAX_RECIPIENTS = 10;

/** Versand an gespeicherte und/oder neu eingegebene Empfänger (je eine eigene Mail). */
export async function sendHoursReport(input: ExportInput & {
  recipients: string[];
  newEmail: string;
  saveNewEmail: boolean;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "timeTracking", "write");
  requireWrite(access);

  if (!isEmailConfigured() && process.env.NODE_ENV === "production") {
    throw new Error(REPORT_ERRORS.emailNotConfigured);
  }

  // Gespeicherte Empfänger nur aus der Liste dieses Betriebs übernehmen.
  const saved = await prisma.tenantReportRecipient.findMany({
    where: { tenantId: access.tenantId, email: { in: input.recipients.map((email) => email.trim().toLowerCase()) } },
    select: { email: true },
  });
  const recipients = new Set(saved.map((recipient) => recipient.email));
  const newEmail = input.newEmail.trim() ? normalizeReportEmail(input.newEmail) : "";

  if (newEmail) recipients.add(newEmail);
  if (recipients.size === 0) throw new Error(REPORT_ERRORS.noRecipients);
  if (recipients.size > MAX_RECIPIENTS) throw new Error(REPORT_ERRORS.tooManyRecipients);

  const limit = await checkRateLimit({
    key: `hours-report-email:${access.userId}`,
    limit: 30,
    windowSeconds: 3600,
  });
  if (!limit.allowed) throw new Error(REPORT_ERRORS.rateLimited);

  const built = await buildReportFile(access, input);

  if (newEmail && input.saveNewEmail) {
    await addRecipient(access, newEmail);
  }

  for (const to of recipients) {
    await sendHoursReportEmail({
      to,
      tenantName: built.report.tenantName,
      rangeLabel: built.rangeLabel,
      selectionLabel: built.selectionLabel,
      senderName: access.userName,
      attachment: built.file,
    });
  }

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Stundenreport versendet",
    source: "Reports",
    entityType: "hours-report",
    entityId: `${built.report.range.from}_${built.report.range.to}`,
    detail: `${input.format.toUpperCase()} an ${[...recipients].join(", ")} · ${built.rangeLabel} · ${built.selectionLabel} · ${built.report.rows.length} Mitarbeiter${built.adjustmentSummary}`,
  });

  return { sent: recipients.size };
}

// ---------------------------------------------------------------------------
// Empfängerliste
// ---------------------------------------------------------------------------

async function addRecipient(access: TenantAccess, email: string) {
  try {
    await prisma.tenantReportRecipient.create({
      data: { tenantId: access.tenantId, email, createdBy: access.userName },
    });
  } catch (error) {
    // Schon in der Liste — kein Fehler.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Report-Empfänger hinzugefügt",
    source: "Reports",
    entityType: "report-recipient",
    entityId: email,
    detail: email,
  });
}

export async function addReportRecipient(input: { tenantSlug: string; email: string }) {
  const access = await requireTenantAccess(input.tenantSlug, "timeTracking", "write");
  requireWrite(access);
  const email = normalizeReportEmail(input.email);
  await addRecipient(access, email);
  return email;
}

export async function removeReportRecipient(input: { tenantSlug: string; email: string }) {
  const access = await requireTenantAccess(input.tenantSlug, "timeTracking", "write");
  requireWrite(access);
  const email = input.email.trim().toLowerCase();
  const { count } = await prisma.tenantReportRecipient.deleteMany({
    where: { tenantId: access.tenantId, email },
  });

  if (count > 0) {
    await recordTenantAudit({
      tenantId: access.tenantId,
      actorId: access.userId,
      actorName: access.userName,
      action: "Report-Empfänger entfernt",
      source: "Reports",
      entityType: "report-recipient",
      entityId: email,
      detail: email,
    });
  }
}

