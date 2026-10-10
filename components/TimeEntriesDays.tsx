"use client";

import {
  correctTimeEntryAction,
  createTimeEntryAction,
  deleteTimeEntryAction,
} from "@/app/(dashboard)/u/[tenant]/zeiterfassung/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { FormErrorBanner } from "@/components/FormFeedback";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useActionStateWithToast } from "@/components/Toasts";
import { useCloseOnSuccess, useUniversalPopup } from "@/components/UniversalPopup";
import type { ActionState } from "@/lib/action-state";
import { formatDuration } from "@/lib/time-tracking";
import type { DaySummaryView, TimeEntryView } from "@/lib/time-tracking-service";
import { MapPin, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

const initialState: ActionState = {};

type EditContext = {
  tenant: string;
  employeeId: string;
  canWrite: boolean;
  canDelete: boolean;
};

function formatDay(date: string, locale: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

function TimeEntryForm({
  tenant,
  employeeId,
  entry,
  defaultDate,
  onDone,
}: {
  tenant: string;
  employeeId: string;
  entry?: TimeEntryView;
  defaultDate?: string;
  onDone: () => void;
}) {
  const t = useTranslations("TimeTracking");
  const [state, formAction, isPending] = useActionState(
    entry ? correctTimeEntryAction : createTimeEntryAction,
    initialState,
  );
  useCloseOnSuccess(state, isPending, onDone);
  const idPrefix = entry ? `time-entry-${entry.id}` : "time-entry-new";

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="employeeId" value={employeeId} />
      {entry && <input type="hidden" name="entryId" value={entry.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="field">
          <label htmlFor={`${idPrefix}-date`} className="label">
            {t("date")}
          </label>
          <input
            id={`${idPrefix}-date`}
            name="date"
            type="date"
            className="input"
            defaultValue={entry?.date ?? defaultDate}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-start`} className="label">
            {t("start")}
          </label>
          <input
            id={`${idPrefix}-start`}
            name="startTime"
            type="time"
            className="input"
            defaultValue={entry?.clockInTime}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-end`} className="label">
            {t("end")}
          </label>
          <input
            id={`${idPrefix}-end`}
            name="endTime"
            type="time"
            className="input"
            defaultValue={entry?.clockOutTime ?? ""}
            required={!entry?.isOpen}
          />
        </div>
      </div>
      <p className="-mt-2 text-[12px] text-muted">
        {t("endHint")} {entry?.isOpen ? t("endOpenHint") : ""}
      </p>
      <div className="field">
        <label htmlFor={`${idPrefix}-break`} className="label">
          {t("breakLabel")}
        </label>
        <input
          id={`${idPrefix}-break`}
          name="breakMinutes"
          type="number"
          min={0}
          max={1440}
          className="input"
          defaultValue={entry?.breakMinutesOverride ?? (entry ? "" : 0)}
          placeholder={entry ? String(entry.clockedBreakMinutes) : undefined}
        />
        <p className="mt-1 text-[12px] text-muted">{t("breakHint")}</p>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-note`} className="label">
          {t("reason")}
        </label>
        <input
          id={`${idPrefix}-note`}
          name="note"
          className="input"
          maxLength={500}
          placeholder={t("reasonPlaceholder")}
          required
        />
      </div>
      <FormErrorBanner message={state.error} />
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <FormSubmitButton Icon={Save} pendingLabel={t("saving")}>
          {t("save")}
        </FormSubmitButton>
      </div>
    </form>
  );
}

function DeleteEntryButton({ tenant, entryId }: { tenant: string; entryId: string }) {
  const t = useTranslations("TimeTracking");
  const [, formAction] = useActionStateWithToast(deleteTimeEntryAction);
  const formId = `delete-time-entry-${entryId}`;

  return (
    <form id={formId} action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="entryId" value={entryId} />
      <ConfirmSubmitButton
        className="btn btn-secondary btn-sm text-danger"
        title={t("deleteConfirm")}
        confirmLabel={t("delete")}
      >
        <Trash2 size={13} />
      </ConfirmSubmitButton>
    </form>
  );
}

export function AddTimeEntryButton({
  tenant,
  employeeId,
  defaultDate,
}: {
  tenant: string;
  employeeId: string;
  defaultDate: string;
}) {
  const t = useTranslations("TimeTracking");
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() =>
        openPopup({
          title: t("addTitle"),
          content: (
            <TimeEntryForm
              tenant={tenant}
              employeeId={employeeId}
              defaultDate={defaultDate}
              onDone={closePopup}
            />
          ),
        })
      }
    >
      <Plus size={15} />
      {t("addEntry")}
    </button>
  );
}

/**
 * Per QR-Code gescannter Standort beim Ein-/Ausstempeln (App). Gleicher
 * Standort → eine Angabe, abweichend → beide.
 */
function ScannedLocations({ entry }: { entry: TimeEntryView }) {
  const t = useTranslations("TimeTracking");
  const clockIn = entry.clockInLocation?.name ?? "";
  const clockOut = entry.clockOutLocation?.name ?? "";

  if (!clockIn && !clockOut) return null;

  const label =
    clockIn && clockOut && clockIn === clockOut
      ? t("scannedAt", { location: clockIn })
      : [
          clockIn ? t("scannedIn", { location: clockIn }) : null,
          clockOut ? t("scannedOut", { location: clockOut }) : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted-2">
      <MapPin size={11} className="shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function EntryRow({ entry, edit }: { entry: TimeEntryView; edit?: EditContext }) {
  const t = useTranslations("TimeTracking");
  const { openPopup, closePopup } = useUniversalPopup();
  const badges = [
    entry.isOpen ? t("running") : null,
    entry.autoClosed ? t("autoClosed") : null,
    entry.source === "manual" ? t("manual") : entry.corrected ? t("corrected") : null,
    entry.breakDeducted ? t("breakDeducted") : null,
  ].filter((badge): badge is string => Boolean(badge));

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold tabular-nums text-ink">
          {entry.clockInTime}–{entry.clockOutTime ?? "…"}
          <span className="ml-2 font-normal text-muted">
            {t("breakMinutes", { minutes: entry.breakMinutes })}
          </span>
        </div>
        <ScannedLocations entry={entry} />
        {(badges.length > 0 || entry.note) && (
          <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11.5px] text-muted">
            {badges.map((badge) => (
              <span key={badge} className="rounded-full bg-bg px-2 py-0.5">
                {badge}
              </span>
            ))}
            {entry.note && <span className="truncate italic">„{entry.note}“</span>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12.5px] tabular-nums text-ink">
          {formatDuration(entry.workedMinutes)}
        </span>
        {edit?.canWrite && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-label={t("edit")}
            onClick={() =>
              openPopup({
                title: t("editTitle"),
                content: (
                  <TimeEntryForm
                    tenant={edit.tenant}
                    employeeId={edit.employeeId}
                    entry={entry}
                    onDone={closePopup}
                  />
                ),
              })
            }
          >
            <Pencil size={13} />
          </button>
        )}
        {edit?.canDelete && <DeleteEntryButton tenant={edit.tenant} entryId={entry.id} />}
      </div>
    </div>
  );
}

/**
 * Tagesliste "Soll (veröffentlichte Schichten) vs. Ist (gestempelt)". Ohne
 * `edit` reine Ansicht ("Meine Zeiten"), mit `edit` für die Verwaltung.
 */
export default function TimeEntriesDays({
  days,
  today,
  edit,
}: {
  days: DaySummaryView[];
  today: string;
  edit?: EditContext;
}) {
  const t = useTranslations("TimeTracking");
  const locale = useLocale();

  return (
    <section className="overflow-hidden rounded-card border border-border bg-white">
      {days.map((day) => {
        const isEmpty = day.entries.length === 0 && day.shifts.length === 0;

        return (
          <div
            key={day.date}
            className={`grid gap-3 border-t border-border-soft px-6 py-3.5 first:border-t-0 sm:grid-cols-[150px_1fr_auto] ${
              day.date === today ? "bg-[#F5F8FF]" : ""
            }`}
          >
            <div>
              <div className="text-[13.5px] font-semibold text-ink">
                {formatDay(day.date, locale)}
                {day.date === today && (
                  <span className="ml-2 font-mono text-[10px] uppercase text-muted">{t("today")}</span>
                )}
              </div>
              {day.shifts.map((shift) => (
                <div key={shift.id} className="text-[11.5px] text-muted">
                  {t("plannedShort", { start: shift.startTime, end: shift.endTime })}
                  {shift.location ? ` · ${shift.location}` : ""}
                </div>
              ))}
            </div>
            <div className="min-w-0">
              {day.entries.length === 0 ? (
                <div className="py-1.5 text-[12.5px] text-muted">{isEmpty ? "—" : t("noEntries")}</div>
              ) : (
                day.entries.map((entry) => <EntryRow key={entry.id} entry={entry} edit={edit} />)
              )}
            </div>
            <div className="text-right font-mono text-[12px] tabular-nums text-muted-2 sm:min-w-[110px]">
              {!isEmpty && (
                <>
                  <div className="text-[13px] font-semibold text-ink">{formatDuration(day.workedMinutes)}</div>
                  {day.plannedMinutes > 0 && (
                    <div>
                      {t("planned")} {formatDuration(day.plannedMinutes)}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function TimeTotals({
  totals,
}: {
  totals: { workedMinutes: number; breakMinutes: number; plannedMinutes: number };
}) {
  const t = useTranslations("TimeTracking");
  const difference = totals.workedMinutes - totals.plannedMinutes;
  const tiles = [
    { label: t("worked"), value: formatDuration(totals.workedMinutes) },
    { label: t("planned"), value: formatDuration(totals.plannedMinutes) },
    { label: t("difference"), value: `${difference > 0 ? "+" : ""}${formatDuration(difference)}` },
    { label: t("breaks"), value: formatDuration(totals.breakMinutes) },
  ];

  return (
    <section className="mb-5 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-card border border-border bg-white px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-muted">{tile.label}</div>
          <div className="mt-1.5 text-[22px] font-semibold tabular-nums text-ink">{tile.value}</div>
        </div>
      ))}
    </section>
  );
}
