"use client";

import DatePickerField from "@/components/DatePickerField";

import {
  addReportRecipientAction,
  exportHoursReportAction,
  removeReportRecipientAction,
  sendHoursReportAction,
} from "@/app/(dashboard)/u/[tenant]/reports/actions";
import { dbInputClass } from "@/components/dashboard/DbDrawer";
import { DbCard, avatarColor, ctaClass, secondaryClass } from "@/components/dashboard/ui";
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
  Download,
  Info,
  Loader2,
  Mail,
  Plus,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, useSyncExternalStore, useTransition, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

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

function formatHoursShort(minutes: number, locale: string) {
  return (minutes / 60).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatSigned(minutes: number, locale: string, digits: number) {
  const value = Math.round((minutes / 60) * 10 ** digits) / 10 ** digits;
  const text = Math.abs(value).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : `±${text}`;
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
  selectionName,
}: {
  filters: ReportFilters;
  range: ReportRange;
  today: string;
  selectionName?: string;
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
      className={`db-focus min-h-9 cursor-pointer rounded-[8px] border-0 px-3 text-[13px] font-medium ${
        period === value ? "bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "bg-transparent text-[#6e6e6b]"
      }`}
      aria-pressed={period === value}
    >
      {label}
    </button>
  );
  const control = `${dbInputClass} min-h-11 !w-auto bg-white`;
  const stepButton =
    "db-act db-focus flex size-9 cursor-pointer items-center justify-center rounded-[9px] border border-[#ecebe7] bg-white text-ink disabled:cursor-default disabled:opacity-40";

  return (
    <DbCard className="mb-4 p-[18px]">
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className={stepButton}
            aria-label={t("previous")}
            disabled={!range.previous || isPending}
            onClick={() => {
              setDate(range.previous!);
              navigate({ period: range.period, date: range.previous! });
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex min-w-0 flex-col">
            <span className="font-display text-[19px] leading-tight font-semibold tracking-[-0.3px]">{rangeLabel}</span>
            <span className="truncate text-[12.5px] text-[#6e6e6b]">{selectionName || t("modeAll")}</span>
          </div>
          <button
            type="button"
            className={stepButton}
            aria-label={t("next")}
            disabled={!range.next || isPending}
            onClick={() => {
              setDate(range.next!);
              navigate({ period: range.period, date: range.next! });
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex gap-0.5 rounded-[10px] bg-[#f2f1ed] p-[3px]" role="group" aria-label={t("period")}>
            {periodButton("day", t("periodDay"))}
            {periodButton("week", t("periodWeek"))}
            {periodButton("month", t("periodMonth"))}
            {periodButton("custom", t("periodCustom"))}
          </div>

          {period === "custom" ? (
            <>
              <DatePickerField
                aria-label={t("from")}
                inputClassName={control}
                value={from}
                max={to || undefined}
                onChange={setFrom}
                required
              />
              <span className="text-[#9a9a96]">–</span>
              <DatePickerField
                aria-label={t("to")}
                inputClassName={control}
                value={to}
                min={from || undefined}
                onChange={setTo}
                required
              />
            </>
          ) : (
            <DatePickerField
              aria-label={period === "day" ? t("day") : period === "week" ? t("weekContaining") : t("monthContaining")}
              inputClassName={control}
              value={date}
              onChange={setDate}
              required
            />
          )}

          <span className="mx-0.5 hidden h-7 w-px bg-[#ecebe7] sm:block" />

          <select
            aria-label={t("selection")}
            className={`${control} cursor-pointer`}
            value={mode}
            onChange={(event) => setMode(event.target.value as typeof mode)}
          >
            <option value="all">{t("modeAll")}</option>
            <option value="employee">{t("modeEmployee")}</option>
            <option value="employees">{t("modeEmployees")}</option>
            <option value="team">{t("modeTeam")}</option>
            <option value="location">{t("modeLocation")}</option>
          </select>
          {mode === "team" && (
            <select
              aria-label={t("team")}
              className={`${control} cursor-pointer`}
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
          )}
          {mode === "location" && (
            <select
              aria-label={t("location")}
              className={`${control} cursor-pointer`}
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
          )}

          <select
            aria-label={t("nightWindow")}
            className={`${control} cursor-pointer`}
            value={nightStart}
            onChange={(event) => setNightStart(event.target.value as typeof nightStart)}
          >
            <option value="20">{t("night20Short")}</option>
            <option value="23">{t("night23Short")}</option>
          </select>

          <button type="submit" className={secondaryClass} disabled={isPending}>
            {isPending && <Loader2 size={15} className="animate-spin" />}
            {t("apply")}
          </button>
        </div>

        {(mode === "employee" || mode === "employees") && (
          <div className="max-w-[560px]">
            <EmployeeSelector
              key={mode}
              label={mode === "employee" ? t("employee") : t("employees")}
              name="employee"
              mode={mode === "employee" ? "single" : "multi"}
              defaultSelectedIds={mode === "employee" ? filters.employeeIds.slice(0, 1) : filters.employeeIds}
              options={employees}
            />
          </div>
        )}
      </form>
    </DbCard>
  );
}

// ---------------------------------------------------------------------------
// Tabelle
// ---------------------------------------------------------------------------

type DraftValues = Record<string, Partial<Record<EditableReportField, string>>>;

export function HoursReportTable({
  tenant,
  rows,
  canEdit,
  showVacation,
  showSickness,
  recipients,
  emailConfigured,
  disabled,
  range,
  today,
}: {
  tenant: string;
  range: ReportRange;
  today: string;
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

  const exportFile = (format: "xlsx" | "pdf") => {
    if (!ensureValid()) return;
    startExport(async () => {
      const result = await exportHoursReportAction({ tenant, query, format, overrides: resolved.overrides });
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
          className={`w-[72px] rounded-[7px] border px-1.5 py-1 text-right text-[13.5px] tabular-nums outline-none focus:border-[#8b6fe0] focus:bg-white ${
            invalid
              ? "border-danger bg-danger/5 text-danger"
              : changed
                ? "border-[#E0B252] bg-[#FFF6E0] text-ink"
                : "border-transparent bg-transparent text-ink hover:border-[#e4e3df]"
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

  const totalDiff = resolved.values.reduce((sum, row) => sum + rowDiff(row), 0);
  const plannedToDate = resolved.values.reduce((sum, row) => sum + row.plannedToDateMinutes, 0);
  const surcharge = totals.nightMinutes + totals.holidayMinutes + totals.sundayMinutes;
  const running = range.to >= today && range.from <= today;
  const vacationDays = resolved.values.reduce((sum, row) => sum + (row.vacations ?? []).reduce((total, period) => total + period.days, 0), 0);
  const sicknessDays = resolved.values.reduce((sum, row) => sum + (row.sickness ?? []).reduce((total, period) => total + period.days, 0), 0);
  const showAbsence = showVacation || showSickness;
  const kpis = [
    { label: t("kpiPlanned"), value: totals.plannedMinutes, caption: running ? t("kpiPlannedToDate", { hours: formatHoursShort(plannedToDate, locale) }) : t("kpiPlannedCaption"), tone: "" },
    { label: t("kpiWorked"), value: totals.workedMinutes, caption: t("kpiWorkedCaption"), tone: "" },
    { label: t("kpiDiff"), value: totalDiff, caption: t("kpiDiffCaption"), tone: totalDiff > 0 ? "text-[#1f5d2c]" : totalDiff < 0 ? "text-[#b4332a]" : "", signed: true },
    { label: t("kpiSurcharge"), value: surcharge, caption: t("kpiSurchargeCaption"), tone: "text-[#6b4fc4]" },
  ];
  const th = "px-3 py-3 text-left font-mono text-[10px] font-normal tracking-[0.08em] text-[#6e6e6b] uppercase";
  const thRight = `${th} text-right`;
  const actions = (
    <>
      <button type="button" className={secondaryClass} onClick={() => exportFile("pdf")} disabled={disabled || isExporting || resolved.values.length === 0}>
        {isExporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
        {t("exportPdf")}
      </button>
      <button type="button" className={secondaryClass} onClick={() => exportFile("xlsx")} disabled={disabled || isExporting || resolved.values.length === 0}>
        {isExporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
        {t("exportExcel")}
      </button>
      {canEdit && (
        <button type="button" className={ctaClass} onClick={openSendDialog} disabled={disabled || resolved.values.length === 0}>
          <Mail size={15} />
          {t("sendEmail")}
        </button>
      )}
    </>
  );

  return (
    <>
      <ReportActionsPortal>{actions}</ReportActionsPortal>

      <section className="mb-4 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {kpis.map((kpi) => (
          <DbCard key={kpi.label} className="db-insight flex flex-col gap-1.5 p-[16px]">
            <span className="text-[13px] font-medium text-[#6e6e6b]">{kpi.label}</span>
            <span className={`font-display text-[28px] leading-none font-semibold tracking-[-1px] ${kpi.tone}`}>
              {kpi.signed ? formatSigned(kpi.value, locale, 1) : formatHoursShort(kpi.value, locale)}
              <span className="ml-1 font-sans text-[13px] font-normal tracking-normal text-[#9a9a96]">{t("hoursUnit")}</span>
            </span>
            <span className="text-[12.5px] text-[#6e6e6b]">{kpi.caption}</span>
          </DbCard>
        ))}
      </section>

      <DbCard className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ecebe7] px-[18px] py-3 text-[12.5px] text-[#6e6e6b]">
          <span className="flex items-center gap-2">
            <Info size={14} className="text-[#6b4fc4]" />
            {canEdit ? t("editHintShort") : t("legendShort")}
          </span>
          {running && (
            <span className="flex items-center gap-1.5 text-[#2c64c9]">
              <span className="size-1.5 rounded-full bg-[#2c64c9]" />
              {t("runningHint", { time: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) })}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-[13.5px]">
            <thead className="border-b border-[#ecebe7]">
              <tr>
                <th className={`${th} sticky left-0 z-10 bg-white pl-[18px]`}>{t("columnEmployee")}</th>
                <th className={thRight}>{t("columnPlannedShort")}</th>
                <th className={thRight}>{t("columnWorkedShort")}</th>
                <th className={thRight}>{t("columnDiff")}</th>
                <th className={thRight}>{t("columnNightShort")}</th>
                <th className={thRight}>{t("columnHolidayShort")}</th>
                <th className={thRight}>{t("columnSundayShort")}</th>
                {showAbsence && <th className={`${th} pr-[18px]`}>{t("columnAbsence")}</th>}
              </tr>
            </thead>
            <tbody>
              {resolved.values.length === 0 && (
                <tr>
                  <td colSpan={7 + Number(showAbsence)} className="px-5 py-10 text-center text-[#6e6e6b]">
                    {disabled ? t("selectionMissing") : t("noRows")}
                  </td>
                </tr>
              )}
              {resolved.values.map((row) => {
                const diff = rowDiff(row);

                return (
                  <tr key={row.employeeId} className="border-b border-[#f0efeb] align-middle last:border-b-0">
                    <td className="sticky left-0 z-10 bg-white py-2.5 pr-3 pl-[18px]">
                      <span className="flex items-center gap-2.5">
                        <span
                          className="flex size-8 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-white"
                          style={{ background: avatarColor(row.employeeId) }}
                        >
                          {initialsOf(row.name)}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold">{row.name}</span>
                          <span className="font-mono text-[11px] text-[#9a9a96]">
                            {row.employeeNumber || "—"}
                            {row.openEntries > 0 && <span className="ml-1.5 font-sans text-[#1f7a3e]">● {t("clockedIn")}</span>}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatHours(row.plannedMinutes, locale)}</td>
                    <td className="px-3 py-2 text-right">{hoursCell(row, "workedMinutes")}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={`inline-block rounded-[6px] px-1.5 py-[2px] text-[12.5px] font-semibold tabular-nums ${
                          Math.abs(diff) < 1 ? "bg-[#f2f1ed] text-[#6e6e6b]" : diff > 0 ? "bg-[rgba(47,122,74,0.12)] text-[#1f5d2c]" : "bg-[#f2f1ed] text-[#6e6e6b]"
                        }`}
                      >
                        {formatSigned(diff, locale, 2)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{hoursCell(row, "nightMinutes")}</td>
                    <td className="px-3 py-2 text-right">{hoursCell(row, "holidayMinutes")}</td>
                    <td className="px-3 py-2 text-right">{hoursCell(row, "sundayMinutes")}</td>
                    {showAbsence && (
                      <td className="py-2.5 pr-[18px] pl-3">
                        <AbsenceChips vacations={showVacation ? row.vacations : []} sickness={showSickness ? row.sickness : []} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {resolved.values.length > 0 && (
              <tfoot className="border-t-2 border-ink">
                <tr className="text-[13.5px] font-semibold tabular-nums">
                  <td className="sticky left-0 z-10 bg-white py-3 pr-3 pl-[18px]">{t("total")}</td>
                  <td className="px-3 py-3 text-right">{formatHours(totals.plannedMinutes, locale)}</td>
                  <td className="px-3 py-3 text-right">{formatHours(totals.workedMinutes, locale)}</td>
                  <td className={`px-3 py-3 text-right ${totalDiff > 0 ? "text-[#1f5d2c]" : totalDiff < 0 ? "text-[#b4332a]" : ""}`}>
                    {formatSigned(totalDiff, locale, 2)}
                  </td>
                  <td className="px-3 py-3 text-right">{formatHours(totals.nightMinutes, locale)}</td>
                  <td className="px-3 py-3 text-right">{formatHours(totals.holidayMinutes, locale)}</td>
                  <td className="px-3 py-3 text-right">{formatHours(totals.sundayMinutes, locale)}</td>
                  {showAbsence && (
                    <td className="py-3 pr-[18px] pl-3 text-[12.5px] font-medium text-[#3d3d3a]">
                      {[
                        showVacation && vacationDays > 0 ? t("absenceVacation", { count: vacationDays }) : null,
                        showSickness && sicknessDays > 0 ? t("absenceSickness", { count: sicknessDays }) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </DbCard>

      <p className="mt-3 text-[12px] leading-[1.5] text-[#9a9a96]">{t("legendDesign")}</p>

      {changedCount > 0 && (
        <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#ecebe7] bg-white px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
          <span className="text-[13px] text-[#9a5b00]">{t("changedCount", { count: changedCount })}</span>
          <button type="button" className={secondaryClass} onClick={() => setDrafts({})}>
            <RotateCcw size={15} />
            {t("resetAll")}
          </button>
        </div>
      )}
    </>
  );
}

function AbsenceChips({ vacations, sickness }: { vacations: AbsencePeriod[] | null; sickness: AbsencePeriod[] | null }) {
  const t = useTranslations("ReportsPage");
  const locale = useLocale();
  const vacationDays = (vacations ?? []).reduce((sum, period) => sum + period.days, 0);
  const sicknessDays = (sickness ?? []).reduce((sum, period) => sum + period.days, 0);
  const title = (periods: AbsencePeriod[] | null) =>
    (periods ?? [])
      .map((period) => (period.from === period.to ? shortDate(period.from, locale) : `${shortDate(period.from, locale)}–${shortDate(period.to, locale)}`))
      .join(", ");

  if (vacationDays === 0 && sicknessDays === 0) {
    return <span className="text-[#b5b4af]">–</span>;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {vacationDays > 0 && (
        <span title={title(vacations)} className="rounded-[6px] bg-[rgba(31,122,108,0.10)] px-1.5 py-[2px] text-[12px] font-medium text-[#1f6b5f]">
          {t("absenceVacation", { count: vacationDays })}
        </span>
      )}
      {sicknessDays > 0 && (
        <span title={title(sickness)} className="rounded-[6px] bg-[rgba(180,51,42,0.10)] px-1.5 py-[2px] text-[12px] font-medium text-[#b4332a]">
          {t("absenceSickness", { count: sicknessDays })}
          {(sickness ?? []).some((period) => period.open) ? ` · ${t("open")}` : ""}
        </span>
      )}
    </span>
  );
}

/** Ist − Soll bis heute, ohne Soll an Abwesenheitstagen. */
function rowDiff(row: HoursReportRow) {
  return row.workedMinutes - (row.plannedToDateMinutes - row.absencePlannedMinutes);
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);

  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
}

/** Die Export-Knöpfe gehören laut Design in den Seitenkopf — dort liegt ein leerer Platzhalter. */
function ReportActionsPortal({ children }: { children: ReactNode }) {
  const target = useSyncExternalStore(
    noopSubscribe,
    () => document.getElementById(REPORT_ACTIONS_SLOT),
    () => null,
  );

  return target ? createPortal(children, target) : null;
}

const noopSubscribe = () => () => {};

export const REPORT_ACTIONS_SLOT = "report-actions";

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

