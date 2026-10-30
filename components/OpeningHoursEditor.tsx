"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  MAX_OPENING_HOURS_RANGES_PER_DAY,
  OPENING_HOURS_WEEKDAYS,
  OPENING_HOURS_WEEKDAY_LABELS as WEEKDAY_LABELS,
  type OpeningHoursDay,
  type OpeningHoursMode,
  type OpeningHoursRange,
  type OpeningHoursWeekday,
} from "@/lib/opening-hours";

const DEFAULT_RANGE: OpeningHoursRange = { start: "09:00", end: "18:00", breakMinutes: 30 };

function withDefaults(defaultValue: OpeningHoursDay[]): OpeningHoursDay[] {
  return OPENING_HOURS_WEEKDAYS.map(
    (weekday) =>
      defaultValue.find((day) => day.weekday === weekday) ?? {
        weekday,
        mode: "closed" as OpeningHoursMode,
        ranges: [],
      },
  );
}

type OpeningHoursEditorProps = {
  /** Name des versteckten Formularfelds (JSON-serialisiert). */
  name?: string;
  defaultValue: OpeningHoursDay[];
  /**
   * Zeigt zusätzlich einen "Standard verwenden"-Umschalter — für
   * Standort-Öffnungszeiten, die den Mandanten-Standard übernehmen können.
   * Ohne diese Prop (z. B. beim Mandanten-Standard selbst) immer aktiv.
   */
  allowInherit?: boolean;
  /** Nur relevant mit `allowInherit` — ob der Standort initial eigene Zeiten hinterlegt hat. */
  initiallyCustom?: boolean;
  /** `form`-Attribut der versteckten Inputs — nötig, wenn dieser Editor außerhalb des eigentlichen `<form>`-Elements gerendert wird (Standort-Bearbeiten-Seite). */
  formId?: string;
};

export function OpeningHoursEditor({
  name = "openingHours",
  defaultValue,
  allowInherit = false,
  initiallyCustom = true,
  formId,
}: OpeningHoursEditorProps) {
  const t = useTranslations("OpeningHoursEditor");
  const [days, setDays] = useState<OpeningHoursDay[]>(() => withDefaults(defaultValue));
  const [bulkDays, setBulkDays] = useState<OpeningHoursWeekday[]>(["Mo", "Di", "Mi", "Do", "Fr"]);
  const [bulkMode, setBulkMode] = useState<OpeningHoursMode>("custom");
  const [bulkRange, setBulkRange] = useState<OpeningHoursRange>({ ...DEFAULT_RANGE });
  const [useCustom, setUseCustom] = useState(!allowInherit || initiallyCustom);

  function updateDay(weekday: OpeningHoursWeekday, patch: Partial<OpeningHoursDay>) {
    setDays((current) =>
      current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)),
    );
  }

  function updateRange(
    weekday: OpeningHoursWeekday,
    index: number,
    patch: Partial<OpeningHoursRange>,
  ) {
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday
          ? {
              ...day,
              ranges: day.ranges.map((range, rangeIndex) =>
                rangeIndex === index ? { ...range, ...patch } : range,
              ),
            }
          : day,
      ),
    );
  }

  function addRange(weekday: OpeningHoursWeekday) {
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday && day.ranges.length < MAX_OPENING_HOURS_RANGES_PER_DAY
          ? { ...day, ranges: [...day.ranges, { ...DEFAULT_RANGE }] }
          : day,
      ),
    );
  }

  function removeRange(weekday: OpeningHoursWeekday, index: number) {
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday
          ? { ...day, ranges: day.ranges.filter((_, rangeIndex) => rangeIndex !== index) }
          : day,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {allowInherit && (
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-ink">
          <input
            type="checkbox"
            checked={useCustom}
            onChange={(event) => setUseCustom(event.target.checked)}
          />
          {t("useCustomLabel")}
        </label>
      )}

      {!useCustom ? (
        <>
          <input type="hidden" name={name} value="[]" form={formId} />
          <p className="text-[12.5px] text-muted">
            {t("defaultHoursNote")}
          </p>
        </>
      ) : (
        <>
          <input type="hidden" name={name} value={JSON.stringify(days)} form={formId} />
          <details className="rounded-xl border border-[#d9d0ee] bg-[#f7f5fb] p-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-[#6b4fc4]">{t("bulkTitle")}</summary>
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {(["weekdays", "weekend", "allDays"] as const).map((group) => <button key={group} type="button" className="rounded-lg border border-border bg-white px-3 py-2 text-[12px]" onClick={() => setBulkDays(group === "weekdays" ? ["Mo", "Di", "Mi", "Do", "Fr"] : group === "weekend" ? ["Sa", "So"] : [...OPENING_HOURS_WEEKDAYS])}>{t(group)}</button>)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {OPENING_HOURS_WEEKDAYS.map((day) => <button key={day} type="button" aria-label={WEEKDAY_LABELS[day]} aria-pressed={bulkDays.includes(day)} className={`min-h-10 min-w-10 rounded-lg border px-2 text-[12px] font-semibold ${bulkDays.includes(day) ? "border-[#8b6ed4] bg-[#8b6ed4] text-white" : "border-border bg-white text-ink"}`} onClick={() => setBulkDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])}>{day}</button>)}
              </div>
              <select aria-label={t("bulkMode")} value={bulkMode} onChange={(event) => setBulkMode(event.target.value as OpeningHoursMode)} className="input bg-white">
                <option value="custom">{t("modeCustom")}</option><option value="closed">{t("modeClosed")}</option><option value="24h">{t("mode24h")}</option>
              </select>
              {bulkMode === "custom" && <div className="grid grid-cols-2 gap-2">
                <label className="field"><span className="label">{t("bulkStart")}</span><input type="time" value={bulkRange.start} className="input bg-white" onChange={(event) => setBulkRange((range) => ({ ...range, start: event.target.value }))} /></label>
                <label className="field"><span className="label">{t("bulkEnd")}</span><input type="time" value={bulkRange.end} className="input bg-white" onChange={(event) => setBulkRange((range) => ({ ...range, end: event.target.value }))} /></label>
                <label className="field col-span-2"><span className="label">{t("bulkBreak")}</span><select className="input bg-white" value={bulkRange.breakMinutes} onChange={(event) => setBulkRange((range) => ({ ...range, breakMinutes: Number(event.target.value) }))}>{[0, 15, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes === 0 ? t("noBreak") : `${minutes} min`}</option>)}</select></label>
              </div>}
              <button type="button" disabled={!bulkDays.length || (bulkMode === "custom" && (!bulkRange.start || !bulkRange.end))} className="min-h-10 self-start rounded-lg bg-ink px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40" onClick={() => setDays((current) => current.map((day) => bulkDays.includes(day.weekday) ? { ...day, mode: bulkMode, ranges: bulkMode === "custom" ? [{ ...bulkRange }] : [] } : day))}>{t("bulkApply", { count: bulkDays.length })}</button>
              <p className="m-0 text-[12px] text-muted-2">{t("bulkHint")}</p>
            </div>
          </details>
          {/* Wochentage nebeneinander statt untereinander: gestapelt war die
              Liste im Bearbeiten-Modus unnötig lang, obwohl die Zeile die volle
              Breite hat. */}
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {days.map((day) => (
              <div
                key={day.weekday}
                className="rounded-[10px] border border-border-light bg-bg p-2.5"
              >
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12.5px] font-medium text-ink">
                    {WEEKDAY_LABELS[day.weekday]}
                  </span>
                  <select
                    className="input w-full cursor-pointer bg-white sm:w-auto"
                    value={day.mode}
                    onChange={(event) => {
                      const mode = event.target.value as OpeningHoursMode;

                      updateDay(day.weekday, {
                        mode,
                        ranges: mode === "custom" ? (day.ranges.length ? day.ranges : [{ ...DEFAULT_RANGE }]) : [],
                      });
                    }}
                    aria-label={t("modeAria", { weekday: WEEKDAY_LABELS[day.weekday] })}
                  >
                    <option value="closed">{t("modeClosed")}</option>
                    <option value="24h">{t("mode24h")}</option>
                    <option value="custom">{t("modeCustom")}</option>
                  </select>
                </div>

                {day.mode === "custom" && (
                  <div className="mt-2.5 flex flex-col gap-2 border-t border-border-light pt-2.5">
                    {day.ranges.map((range, index) => (
                      <div key={index} className="flex flex-wrap items-center gap-2">
                        <input
                          type="time"
                          className="input w-auto bg-white"
                          value={range.start}
                          onChange={(event) =>
                            updateRange(day.weekday, index, { start: event.target.value })
                          }
                          aria-label={t("startAria", { weekday: WEEKDAY_LABELS[day.weekday], index: index + 1 })}
                        />
                        <span className="text-muted">–</span>
                        <input
                          type="time"
                          className="input w-auto bg-white"
                          value={range.end}
                          onChange={(event) =>
                            updateRange(day.weekday, index, { end: event.target.value })
                          }
                          aria-label={t("endAria", { weekday: WEEKDAY_LABELS[day.weekday], index: index + 1 })}
                        />
                        <select
                          className="input w-auto cursor-pointer bg-white"
                          value={String(range.breakMinutes)}
                          onChange={(event) =>
                            updateRange(day.weekday, index, {
                              breakMinutes: Number.parseInt(event.target.value, 10) || 0,
                            })
                          }
                          aria-label={t("breakAria", { weekday: WEEKDAY_LABELS[day.weekday], index: index + 1 })}
                        >
                          <option value="0">{t("noBreak")}</option>
                          <option value="15">{t("break15")}</option>
                          <option value="30">{t("break30")}</option>
                          <option value="45">{t("break45")}</option>
                          <option value="60">{t("break60")}</option>
                        </select>
                        {day.ranges.length > 1 && (
                          <button
                            type="button"
                            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-danger/30 hover:text-danger"
                            onClick={() => removeRange(day.weekday, index)}
                            aria-label={t("removeRangeAria", { weekday: WEEKDAY_LABELS[day.weekday], index: index + 1 })}
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                    {day.ranges.length < MAX_OPENING_HOURS_RANGES_PER_DAY && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="flex w-fit cursor-pointer items-center gap-1.5 rounded-[8px] border border-dashed border-border px-2.5 py-1.5 text-[12px] font-medium text-muted-2 transition-colors hover:border-muted hover:text-ink"
                          onClick={() => addRange(day.weekday)}
                        >
                          <Plus size={13} />
                          {t("addRange")}
                        </button>
                        {day.ranges.length === 1 && (
                          <span className="text-[11.5px] text-muted">
                            {t("lunchBreakHint")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
