"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
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
  const [days, setDays] = useState<OpeningHoursDay[]>(() => withDefaults(defaultValue));
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
          Eigene Öffnungszeiten für diesen Standort festlegen
        </label>
      )}

      {!useCustom ? (
        <>
          <input type="hidden" name={name} value="[]" form={formId} />
          <p className="text-[12.5px] text-muted">
            Es gelten die Standard-Öffnungszeiten des Unternehmens (Schichtplanung
            {" "}
            {"→"} Einstellungen).
          </p>
        </>
      ) : (
        <>
          <input type="hidden" name={name} value={JSON.stringify(days)} form={formId} />
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
                    aria-label={`${WEEKDAY_LABELS[day.weekday]} Modus`}
                  >
                    <option value="closed">Geschlossen</option>
                    <option value="24h">Rund um die Uhr</option>
                    <option value="custom">Benutzerdefiniert</option>
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
                          aria-label={`${WEEKDAY_LABELS[day.weekday]} Beginn ${index + 1}`}
                        />
                        <span className="text-muted">–</span>
                        <input
                          type="time"
                          className="input w-auto bg-white"
                          value={range.end}
                          onChange={(event) =>
                            updateRange(day.weekday, index, { end: event.target.value })
                          }
                          aria-label={`${WEEKDAY_LABELS[day.weekday]} Ende ${index + 1}`}
                        />
                        <select
                          className="input w-auto cursor-pointer bg-white"
                          value={String(range.breakMinutes)}
                          onChange={(event) =>
                            updateRange(day.weekday, index, {
                              breakMinutes: Number.parseInt(event.target.value, 10) || 0,
                            })
                          }
                          aria-label={`${WEEKDAY_LABELS[day.weekday]} Pause ${index + 1}`}
                        >
                          <option value="0">Keine Pause</option>
                          <option value="15">15m Pause</option>
                          <option value="30">30m Pause</option>
                          <option value="45">45m Pause</option>
                          <option value="60">60m Pause</option>
                        </select>
                        {day.ranges.length > 1 && (
                          <button
                            type="button"
                            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-danger/30 hover:text-danger"
                            onClick={() => removeRange(day.weekday, index)}
                            aria-label={`${WEEKDAY_LABELS[day.weekday]} Zeitfenster ${index + 1} entfernen`}
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
                          Zeitfenster hinzufügen
                        </button>
                        {day.ranges.length === 1 && (
                          <span className="text-[11.5px] text-muted">
                            z. B. für eine Mittagsschließung
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
