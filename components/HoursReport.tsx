"use client";

import {
  addReportRecipientAction,
  exportHoursReportAction,
  removeReportRecipientAction,
  sendHoursReportAction,
} from "@/app/(dashboard)/u/[tenant]/reports/actions";
import EmployeeSelector from "@/components/EmployeeSelector";
import { FormErrorBanner } from "@/components/FormFeedback";
import { useToast } from "@/components/Toasts";
import { useUniversalPopup } from "@/components/UniversalPopup";
import {
  editableReportFields,
  minutesToDecimalHours,
  parseHoursInput,
  type AbsencePeriod,
  type EditableReportField,
  type ReportOverrides,
  type ReportRange,
} from "@/lib/report-hours";
import type {
  HoursReportRow,
  ReportEmployeeOption,
  ReportFilters,
  ReportSelectOption,
} from "@/lib/reports-service";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Mail,
  Plus,
  RotateCcw,
  Search,
  Send,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function formatHours(minutes: number, locale: string) {
  return minutesToDecimalHours(minutes).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    // Ohne Tausenderpunkt — der Wert landet auch im Eingabefeld und muss dort wieder parsebar sein.
    useGrouping: false,
  });
}

function formatDate(date: string, locale: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: "UTC" });
}

function shortDate(date: string, locale: string) {
  return formatDate(date, locale, { day: "2-digit", month: "2-digit" });
}

function downloadBase64(file: { filename: string; contentType: string; base64: string }) {
  const binary = atob(file.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

export function ReportFilterBar({
  filters,
  range,
  today,
  employees,
  teams,
  locations,
}: {
  filters: ReportFilters;
  range: ReportRange;
  today: string;
  employees: ReportEmployeeOption[];
  teams: ReportSelectOption[];
  locations: ReportSelectOption[];
}) {
  const t = useTranslations("ReportsPage");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState(filters.mode);
  const [period, setPeriod] = useState(filters.period);
  const [nightStart, setNightStart] = useState(filters.nightStart);
  const [teamId, setTeamId] = useState(filters.teamId);
  const [locationId, setLocationId] = useState(filters.locationId);
  const [from, setFrom] = useState(filters.period === "custom" ? filters.from : range.from);
  const [to, setTo] = useState(filters.period === "custom" ? filters.to : range.to);
  const [date, setDate] = useState(filters.period === "custom" ? today : filters.date);

  const navigate = (overrides: { period?: typeof period; date?: string } = {}) => {
    const params = new URLSearchParams({ mode, night: nightStart });
    const nextPeriod = overrides.period ?? period;
    params.set("period", nextPeriod);

    if (mode === "employee" || mode === "employees") {
      const selected = formRef.current
        ? new FormData(formRef.current).getAll("employee").map(String)
        : filters.employeeIds;
      for (const id of mode === "employee" ? selected.slice(0, 1) : selected) params.append("employee", id);
    }
    if (mode === "team" && teamId) params.set("team", teamId);
    if (mode === "location" && locationId) params.set("location", locationId);

    if (nextPeriod === "custom") {
      params.set("from", from);
      params.set("to", to);
    } else {
      params.set("date", overrides.date ?? date);
    }

    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    navigate();
  };

  const rangeLabel =
    range.period === "day"
      ? formatDate(range.from, locale, { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
      : range.period === "month"
        ? formatDate(range.from, locale, { month: "long", year: "numeric" })
        : `${formatDate(range.from, locale, { day: "2-digit", month: "2-digit", year: "numeric" })} – ${formatDate(
            range.to,
            locale,
            { day: "2-digit", month: "2-digit", year: "numeric" },
          )}`;

  const periodButton = (value: typeof period, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setPeriod(value)}
      className={`rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold ${
        period === value ? "bg-white text-ink shadow-sm" : "text-muted-2"
      }`}
      aria-pressed={period === value}
    >
      {label}
    </button>
  );

  return (
    <section className="mb-5 rounded-card border border-border bg-white px-5 py-4">
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="field">
            <label htmlFor="report-mode" className="label">
              {t("selection")}
            </label>
            <select
              id="report-mode"
              className="input"
              value={mode}
              onChange={(event) => setMode(event.target.value as typeof mode)}
            >
              <option value="all">{t("modeAll")}</option>
              <option value="employee">{t("modeEmployee")}</option>
              <option value="employees">{t("modeEmployees")}</option>
              <option value="team">{t("modeTeam")}</option>
              <option value="location">{t("modeLocation")}</option>
            </select>
          </div>

          <div className="min-w-0">
            {(mode === "employee" || mode === "employees") && (
              <EmployeeSelector
                key={mode}
                label={mode === "employee" ? t("employee") : t("employees")}
                name="employee"
                mode={mode === "employee" ? "single" : "multi"}
                defaultSelectedIds={mode === "employee" ? filters.employeeIds.slice(0, 1) : filters.employeeIds}
                options={employees}
              />
            )}
            {mode === "team" && (
              <div className="field">
                <label htmlFor="report-team" className="label">
                  {t("team")}
                </label>
                <select
                  id="report-team"
                  className="input"
                  value={teamId}
                  onChange={(event) => setTeamId(event.target.value)}
                >
                  <option value="">{t("chooseTeam")}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {mode === "location" && (
              <div className="field">
                <label htmlFor="report-location" className="label">
                  {t("location")}
                </label>
                <select
                  id="report-location"
                  className="input"
                  value={locationId}
                  onChange={(event) => setLocationId(event.target.value)}
                >
                  <option value="">{t("chooseLocation")}</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {mode === "all" && <p className="pt-7 text-[12.5px] text-muted">{t("modeAllHint")}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="field">
            <span className="label">{t("period")}</span>
            <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-bg p-1" role="group">
              {periodButton("day", t("periodDay"))}
              {periodButton("week", t("periodWeek"))}
              {periodButton("month", t("periodMonth"))}
              {periodButton("custom", t("periodCustom"))}
            </div>
          </div>

          {period === "custom" ? (
            <>
              <div className="field">
                <label htmlFor="report-from" className="label">
                  {t("from")}
                </label>
                <input
                  id="report-from"
                  type="date"
                  className="input"
                  value={from}
                  max={to || undefined}
                  onChange={(event) => setFrom(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="report-to" className="label">
                  {t("to")}
                </label>
                <input
                  id="report-to"
                  type="date"
                  className="input"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => setTo(event.target.value)}
                  required
                />
              </div>
            </>
          ) : (
            <div className="field">
              <label htmlFor="report-date" className="label">
                {period === "day" ? t("day") : period === "week" ? t("weekContaining") : t("monthContaining")}
              </label>
              <input
                id="report-date"
                type="date"
                className="input"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="report-night" className="label">
              {t("nightWindow")}
            </label>
            <select
              id="report-night"
              className="input"
              value={nightStart}
              onChange={(event) => setNightStart(event.target.value as typeof nightStart)}
            >
              <option value="20">{t("night20")}</option>
              <option value="23">{t("night23")}</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {t("apply")}
          </button>
        </div>
      </form>

      <div className="mt-4 flex items-center gap-2 border-t border-border-soft pt-4">
        {range.previous && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-label={t("previous")}
            onClick={() => {
              setDate(range.previous!);
              navigate({ period: range.period, date: range.previous! });
            }}
          >
            <ChevronLeft size={15} />
          </button>
        )}
        <span className="min-w-0 flex-1 text-center text-[14px] font-semibold text-ink sm:flex-none sm:min-w-[180px]">
          {rangeLabel}
        </span>
        {range.next && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-label={t("next")}
            onClick={() => {
              setDate(range.next!);
              navigate({ period: range.period, date: range.next! });
            }}
          >
            <ChevronRight size={15} />
          </button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tabelle
// ---------------------------------------------------------------------------

type DraftValues = Record<string, Partial<Record<EditableReportField, string>>>;

function AbsenceCell({ periods, unitKey }: { periods: AbsencePeriod[] | null; unitKey: "workdays" | "calendarDays" }) {
  const t = useTranslations("ReportsPage");
  const locale = useLocale();

  if (periods === null) {
    return <span className="text-muted-2" title={t("noAbsencePermission")}>—</span>;
  }
  if (periods.length === 0) {
    return <span className="text-muted-2">—</span>;
  }

  const total = periods.reduce((sum, period) => sum + period.days, 0);

  return (
    <div className="flex flex-col gap-0.5">
      {periods.map((period) => (
        <span key={`${period.from}-${period.to}`} className="whitespace-nowrap">
          {period.from === period.to
            ? shortDate(period.from, locale)
            : `${shortDate(period.from, locale)}–${shortDate(period.to, locale)}`}
          {period.open && <span className="text-[#9A5B00]"> · {t("open")}</span>}
        </span>
      ))}
      <span className="font-semibold text-ink">{t(unitKey, { count: total })}</span>
    </div>
  );
}

export function HoursReportTable({
  tenant,
  rows,
  canEdit,
  showVacation,
  showSickness,
  recipients,
  emailConfigured,
  disabled,
}: {
  tenant: string;
  rows: HoursReportRow[];
  canEdit: boolean;
  showVacation: boolean;
  showSickness: boolean;
  recipients: string[];
  emailConfigured: boolean;
  /** Keine gültige Auswahl — Export/Versand deaktivieren. */
  disabled: boolean;
}) {
  const t = useTranslations("ReportsPage");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { openPopup, closePopup } = useUniversalPopup();
  const [drafts, setDrafts] = useState<DraftValues>({});
  const [isExporting, startExport] = useTransition();
  const query = searchParams.toString();

  const fieldLabels: Record<EditableReportField, string> = {
    workedMinutes: t("columnWorked"),
    nightMinutes: t("columnNight"),
    holidayMinutes: t("columnHoliday"),
    sundayMinutes: t("columnSunday"),
  };

  /** Angezeigte (ggf. angepasste) Werte je Zeile + Fehlerstatus der Eingaben. */
  const resolved = useMemo(() => {
    const overrides: ReportOverrides = {};
    const values = rows.map((row) => {
      const draft = drafts[row.employeeId] ?? {};
      const result = { ...row } as HoursReportRow & { invalid: Partial<Record<EditableReportField, boolean>>; changed: Partial<Record<EditableReportField, boolean>> };
      result.invalid = {};
      result.changed = {};

      for (const field of editableReportFields) {
        const raw = draft[field];
        if (raw === undefined) continue;
        const parsed = parseHoursInput(raw);
        if (parsed === null) continue;
        if (Number.isNaN(parsed)) {
          result.invalid[field] = true;
          continue;
        }
        if (parsed !== row[field]) {
          result[field] = parsed;
          result.changed[field] = true;
          overrides[row.employeeId] = { ...overrides[row.employeeId], [field]: parsed };
        }
      }

      return result;
    });

    const invalid = values.some((row) => Object.keys(row.invalid).length > 0);

    return { values, overrides, invalid };
  }, [rows, drafts]);

  const totals = useMemo(() => {
    const sum = (pick: (row: HoursReportRow) => number) =>
      resolved.values.reduce((total, row) => total + pick(row), 0);
    return {
      plannedMinutes: sum((row) => row.plannedMinutes),
      workedMinutes: sum((row) => row.workedMinutes),
      nightMinutes: sum((row) => row.nightMinutes),
      holidayMinutes: sum((row) => row.holidayMinutes),
      sundayMinutes: sum((row) => row.sundayMinutes),
    };
  }, [resolved]);

  const changedCount = Object.values(resolved.overrides).reduce(
    (sum, fields) => sum + Object.keys(fields).length,
    0,
  );

  const setDraft = (employeeId: string, field: EditableReportField, value: string) =>
    setDrafts((current) => ({ ...current, [employeeId]: { ...current[employeeId], [field]: value } }));

  const resetDraft = (employeeId: string, field: EditableReportField) =>
    setDrafts((current) => {
      const next = { ...current[employeeId] };
      delete next[field];
      return { ...current, [employeeId]: next };
    });

  const ensureValid = () => {
    if (resolved.invalid) {
      toast({ tone: "error", title: t("invalidValues") });
      return false;
    }
    return true;
  };

  const exportExcel = () => {
    if (!ensureValid()) return;
    startExport(async () => {
      const result = await exportHoursReportAction({ tenant, query, format: "xlsx", overrides: resolved.overrides });
      if (result.error || !result.file) {
        toast({ tone: "error", title: result.error ?? t("exportFailed") });
        return;
      }
      downloadBase64(result.file);
    });
  };

  const openSendDialog = () => {
    if (!ensureValid()) return;
    openPopup({
      title: t("sendTitle"),
      content: (
        <SendReportForm
          tenant={tenant}
          query={query}
          overrides={resolved.overrides}
          initialRecipients={recipients}
          emailConfigured={emailConfigured}
          onDone={closePopup}
        />
      ),
    });
  };

  const hoursCell = (row: (typeof resolved.values)[number], field: EditableReportField) => {
    if (!canEdit) {
      return <span className="tabular-nums">{formatHours(row[field], locale)}</span>;
    }

    const draft = drafts[row.employeeId]?.[field];
    const changed = row.changed[field];
    const invalid = row.invalid[field];

    return (
      <div className="flex items-center justify-end gap-1">
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${fieldLabels[field]} – ${row.name}`}
          className={`w-[76px] rounded-[8px] border px-2 py-1 text-right font-mono text-[12.5px] tabular-nums outline-none focus:border-ink ${
            invalid
              ? "border-danger bg-danger/5 text-danger"
              : changed
                ? "border-[#E0B252] bg-[#FFF6E0] text-ink"
                : "border-border bg-white text-ink"
          }`}
          value={draft ?? formatHours(row[field], locale)}
          onChange={(event) => setDraft(row.employeeId, field, event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
        />
        {(changed || invalid) && (
          <button
            type="button"
            className="text-muted hover:text-ink"
            onClick={() => resetDraft(row.employeeId, field)}
            aria-label={t("resetValue")}
            title={t("resetValue")}
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
    );
  };

  const th = "px-3 py-2.5 text-left font-mono text-[10.5px] font-semibold uppercase tracking-[0.5px] text-muted";
  const thRight = `${th} text-right`;

  return (
    <>
      <section className="overflow-hidden rounded-card border border-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-[13px]">
            <thead className="border-b border-border bg-bg">
              <tr>
                <th className={`${th} sticky left-0 z-10 bg-bg`}>{t("columnEmployee")}</th>
                <th className={th}>{t("columnEmployeeNumber")}</th>
                <th className={thRight}>{t("columnPlanned")}</th>
                <th className={thRight}>{t("columnWorked")}</th>
                <th className={thRight}>{t("columnNight")}</th>
                <th className={thRight}>{t("columnHoliday")}</th>
                <th className={thRight}>{t("columnSunday")}</th>
                {showVacation && <th className={th}>{t("columnVacation")}</th>}
                {showSickness && <th className={th}>{t("columnSickness")}</th>}
              </tr>
            </thead>
            <tbody>
              {resolved.values.length === 0 && (
                <tr>
                  <td colSpan={7 + Number(showVacation) + Number(showSickness)} className="px-5 py-10 text-center text-muted">
                    {disabled ? t("selectionMissing") : t("noRows")}
                  </td>
                </tr>
              )}
              {resolved.values.map((row) => (
                <tr key={row.employeeId} className="border-b border-border-soft align-top last:border-b-0">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2.5 font-semibold text-ink">
                    {row.name}
                    {row.openEntries > 0 && (
                      <div className="text-[11px] font-normal text-[#1F7A3E]">● {t("clockedIn")}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-muted">{row.employeeNumber || "—"}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted">
                    {formatHours(row.plannedMinutes, locale)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{hoursCell(row, "workedMinutes")}</td>
                  <td className="px-3 py-2 text-right font-mono">{hoursCell(row, "nightMinutes")}</td>
                  <td className="px-3 py-2 text-right font-mono">{hoursCell(row, "holidayMinutes")}</td>
                  <td className="px-3 py-2 text-right font-mono">{hoursCell(row, "sundayMinutes")}</td>
                  {showVacation && (
                    <td className="px-3 py-2.5 text-[12px] text-muted">
                      <AbsenceCell periods={row.vacations} unitKey="workdays" />
                    </td>
                  )}
                  {showSickness && (
                    <td className="px-3 py-2.5 text-[12px] text-muted">
                      <AbsenceCell periods={row.sickness} unitKey="calendarDays" />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {resolved.values.length > 0 && (
              <tfoot className="border-t border-border bg-bg">
                <tr className="font-mono text-[12.5px] font-semibold tabular-nums text-ink">
                  <td className="sticky left-0 z-10 bg-bg px-3 py-2.5 font-sans">{t("total")}</td>
                  <td />
                  <td className="px-3 py-2.5 text-right">{formatHours(totals.plannedMinutes, locale)}</td>
                  <td className="px-3 py-2.5 text-right">{formatHours(totals.workedMinutes, locale)}</td>
                  <td className="px-3 py-2.5 text-right">{formatHours(totals.nightMinutes, locale)}</td>
                  <td className="px-3 py-2.5 text-right">{formatHours(totals.holidayMinutes, locale)}</td>
                  <td className="px-3 py-2.5 text-right">{formatHours(totals.sundayMinutes, locale)}</td>
                  {showVacation && <td />}
                  {showSickness && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <div className="mt-3 flex flex-col gap-1 text-[12px] text-muted">
        <p>{t("legend")}</p>
        {canEdit && <p>{t("editHint")}</p>}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
        {changedCount > 0 && (
          <>
            <span className="mr-auto text-[12.5px] text-[#9A5B00]">{t("changedCount", { count: changedCount })}</span>
            <button type="button" className="btn btn-secondary" onClick={() => setDrafts({})}>
              <RotateCcw size={15} />
              {t("resetAll")}
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={exportExcel}
          disabled={disabled || isExporting || resolved.values.length === 0}
        >
          {isExporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
          {t("exportExcel")}
        </button>
        {canEdit && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={openSendDialog}
            disabled={disabled || resolved.values.length === 0}
          >
            <Mail size={15} />
            {t("sendEmail")}
          </button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Versand
// ---------------------------------------------------------------------------

function SendReportForm({
  tenant,
  query,
  overrides,
  initialRecipients,
  emailConfigured,
  onDone,
}: {
  tenant: string;
  query: string;
  overrides: ReportOverrides;
  initialRecipients: string[];
  emailConfigured: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("ReportsPage");
  const { toast } = useToast();
  const [recipients, setRecipients] = useState(initialRecipients);
  const [selected, setSelected] = useState<string[]>(initialRecipients.length === 1 ? initialRecipients : []);
  const [newEmail, setNewEmail] = useState("");
  const [saveNewEmail, setSaveNewEmail] = useState(true);
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  const toggle = (email: string) =>
    setSelected((current) => (current.includes(email) ? current.filter((item) => item !== email) : [...current, email]));

  const remove = (email: string) =>
    startTransition(async () => {
      const result = await removeReportRecipientAction({ tenant, email });
      if (result.error) {
        setError(result.error);
        return;
      }
      setRecipients((current) => current.filter((item) => item !== email));
      setSelected((current) => current.filter((item) => item !== email));
    });

  const addToList = () => {
    setError(undefined);
    startTransition(async () => {
      const result = await addReportRecipientAction({ tenant, email: newEmail });
      if (result.error) {
        setError(result.error);
        return;
      }
      const email = newEmail.trim().toLowerCase();
      setRecipients((current) => (current.includes(email) ? current : [...current, email].sort()));
      setSelected((current) => (current.includes(email) ? current : [...current, email]));
      setNewEmail("");
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);

    if (selected.length === 0 && !newEmail.trim()) {
      setError(t("noRecipients"));
      return;
    }

    startTransition(async () => {
      const result = await sendHoursReportAction({
        tenant,
        query,
        format,
        overrides,
        recipients: selected,
        newEmail,
        saveNewEmail,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      toast({ tone: "success", title: t("sent", { count: result.sent ?? 0 }) });
      onDone();
    });
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      {!emailConfigured && <FormErrorBanner message={t("emailNotConfigured")} />}

      <div className="field">
        <span className="label">{t("format")}</span>
        <div className="flex gap-1 self-start rounded-xl border border-border bg-bg p-1" role="radiogroup">
          {(["pdf", "xlsx"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={format === value}
              onClick={() => setFormat(value)}
              className={`rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold ${
                format === value ? "bg-white text-ink shadow-sm" : "text-muted-2"
              }`}
            >
              {value === "pdf" ? "PDF" : "Excel"}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label">{t("savedRecipients")}</span>
        {recipients.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-border px-4 py-3 text-[12.5px] text-muted">
            {t("noSavedRecipients")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-soft rounded-[10px] border border-border">
            {recipients.map((email) => (
              <li key={email} className="flex items-center gap-3 px-3 py-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-[13px] text-ink">
                  <input
                    type="checkbox"
                    checked={selected.includes(email)}
                    onChange={() => toggle(email)}
                    className="h-4 w-4 accent-[#2A6FDB]"
                  />
                  <span className="truncate">{email}</span>
                </label>
                <button
                  type="button"
                  className="text-muted hover:text-danger"
                  onClick={() => remove(email)}
                  disabled={isPending}
                  aria-label={t("removeRecipient", { email })}
                  title={t("removeRecipient", { email })}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="field">
        <label htmlFor="report-new-email" className="label">
          {t("newRecipient")}
        </label>
        <div className="flex gap-2">
          <input
            id="report-new-email"
            type="email"
            className="input min-w-0 flex-1"
            placeholder={t("newRecipientPlaceholder")}
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            maxLength={254}
            autoComplete="off"
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={addToList}
            disabled={isPending || !newEmail.trim()}
          >
            <Plus size={15} />
            {t("addRecipient")}
          </button>
        </div>
        <label className="mt-2 flex items-center gap-2 text-[12.5px] text-muted">
          <input
            type="checkbox"
            checked={saveNewEmail}
            onChange={(event) => setSaveNewEmail(event.target.checked)}
            className="h-4 w-4 accent-[#2A6FDB]"
          />
          {t("saveRecipient")}
        </label>
      </div>

      <p className="text-[12px] text-muted">{t("sendHint")}</p>

      <FormErrorBanner message={error} />

      <div className="flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <button type="submit" className="btn btn-primary" disabled={isPending || !emailConfigured}>
          {isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {t("send")}
        </button>
      </div>
    </form>
  );
}

