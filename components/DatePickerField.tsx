"use client";

import { useDatePreference } from "@/components/DatePreferences";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dateToInputValue, dateToDisplayValue, parseDateValue, isSameDate, isBeforeDay } from "@/lib/date-picker";

type T = ReturnType<typeof useTranslations>;

function getMonthLabels(t: T) {
  return [
    t("monthJanuary"),
    t("monthFebruary"),
    t("monthMarch"),
    t("monthApril"),
    t("monthMay"),
    t("monthJune"),
    t("monthJuly"),
    t("monthAugust"),
    t("monthSeptember"),
    t("monthOctober"),
    t("monthNovember"),
    t("monthDecember"),
  ];
}

// Fenstergröße der Jahres-Ansicht — analog zur 12er-Monatsraster, 3 Spalten x
// 4 Zeilen, damit dieselben Grid-Klassen wie im Monats-Modus wiederverwendet
// werden können.
const YEARS_WINDOW_SIZE = 12;

function getWeekdayLabels(t: T) {
  return [
    t("weekdayMon"),
    t("weekdayTue"),
    t("weekdayWed"),
    t("weekdayThu"),
    t("weekdayFri"),
    t("weekdaySat"),
    t("weekdaySun"),
  ];
}

type DatePickerFieldProps = {
  id?: string;
  name?: string;
  value?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  form?: string;
  inputClassName?: string;
  "aria-label"?: string;
  defaultValue?: string;
  min?: string;
  placeholder?: string;
  className?: string;
  /** Optional — z. B. um den `min`-Wert eines abhängigen zweiten Felds (Bis-Datum) live nachzuführen. */
  onChange?: (value: string) => void;
};

export default function DatePickerField({
  id,
  name,
  defaultValue,
  min,
  max,
  value,
  required = false,
  disabled = false,
  form,
  inputClassName = "",
  "aria-label": ariaLabel,
  placeholder,
  className = "",
  onChange,
}: DatePickerFieldProps) {
  const t = useTranslations("DatePickerField");
  const datePreference = useDatePreference();
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const panelId = `${inputId}-calendar`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const monthLabels = getMonthLabels(t);
  const weekdayLabels = getWeekdayLabels(t);
  const effectivePlaceholder = placeholder ?? t("selectDate");
  const today = useMemo(() => new Date(), []);
  const initialDate = useMemo(() => parseDateValue(defaultValue), [defaultValue]);
  const minDate = useMemo(() => parseDateValue(min), [min]);
  const [internalDate, setSelectedDate] = useState<Date | null>(initialDate);
  const selectedDate = value !== undefined ? parseDateValue(value) : internalDate;
  const maxDate = useMemo(() => parseDateValue(max), [max]);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const base = initialDate ?? minDate ?? today;

    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [mode, setMode] = useState<"days" | "months" | "years">("days");
  const [yearsWindowStart, setYearsWindowStart] = useState(
    () => visibleMonth.getFullYear() - 5,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  const selectedValue = selectedDate ? dateToInputValue(selectedDate) : "";
  const selectedLabel = selectedDate ? dateToDisplayValue(selectedDate, datePreference) : "";
  const calendarDays = useMemo(() => {
    const monthStart = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1,
    );
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const gridStart = new Date(monthStart);

    gridStart.setDate(monthStart.getDate() - firstWeekday);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);

      date.setDate(gridStart.getDate() + index);

      return date;
    });
  }, [visibleMonth]);

  function moveVisible(direction: -1 | 1) {
    if (mode === "days") {
      setVisibleMonth(
        (current) => new Date(current.getFullYear(), current.getMonth() + direction, 1),
      );
      return;
    }

    if (mode === "months") {
      setVisibleMonth(
        (current) => new Date(current.getFullYear() + direction, current.getMonth(), 1),
      );
      return;
    }

    setYearsWindowStart((current) => current + direction * YEARS_WINDOW_SIZE);
  }

  // Fixed statt absolut positioniert und per Portal nach `document.body`
  // gerendert (QA-Bug BUG-022): innerhalb eines Dialogs/Drawers schnitt der
  // bisher relativ zum Eingabefeld positionierte Kalender am rechten Rand
  // ab (erzwang einen horizontalen Scrollbalken) — ein Vorfahre mit
  // begrenzter Breite/`overflow` kann `position: absolute` nicht umgehen.
  // `position: fixed` positioniert dagegen relativ zum Viewport, mit
  // eigener Kollisionserkennung sowohl vertikal (schon vorher vorhanden)
  // als auch jetzt zusätzlich horizontal.
  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current || !panelRef.current) {
      return;
    }

    function updatePosition() {
      if (!containerRef.current || !panelRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const panelHeight = panelRef.current.offsetHeight;
      const panelWidth = panelRef.current.offsetWidth;
      const margin = 8;
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const openUp = below < panelHeight + margin && above > below;
      const top = Math.max(margin, Math.min(
        openUp ? rect.top - panelHeight - margin : rect.bottom + margin,
        window.innerHeight - panelHeight - margin,
      ));
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - panelWidth - margin));
      setPanelPosition({ top, left });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      // Das Panel hängt per Portal an `document.body`, liegt also nicht im
      // Container — Klicks darin dürfen den Kalender nicht schließen.
      if (
        !containerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  function isUnavailable(date: Date) {
    return isBeforeDay(date, minDate) || Boolean(maxDate && dateToInputValue(date) > dateToInputValue(maxDate));
  }

  function chooseDate(date: Date | null) {
    setSelectedDate(date);
    setDraft(null);
    onChange?.(date ? dateToInputValue(date) : "");
    setIsOpen(false);
    inputRef.current?.focus();
  }

  useEffect(() => {
    const parsed = parseDateValue(draft ?? selectedValue);
    const hasText = Boolean(draft ?? selectedValue);
    const invalid = hasText && (!parsed || isBeforeDay(parsed, minDate) || Boolean(maxDate && dateToInputValue(parsed) > dateToInputValue(maxDate)));
    inputRef.current?.setCustomValidity(invalid ? t("invalidDate") : "");
  }, [draft, selectedValue, minDate, maxDate, t]);

  function openCalendar(focusCalendar = false) {
    if (disabled) return;
    let base = selectedDate ?? today;
    if (minDate && isBeforeDay(base, minDate)) base = minDate;
    if (maxDate && dateToInputValue(base) > dateToInputValue(maxDate)) base = maxDate;
    setVisibleMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setMode("days");
    setIsOpen(true);
    if (focusCalendar) {
      requestAnimationFrame(() => {
        const panel = panelRef.current;
        const target = panel?.querySelector<HTMLButtonElement>("[data-selected='true']:not(:disabled)")
          ?? panel?.querySelector<HTMLButtonElement>(`[data-date="${dateToInputValue(base)}"]:not(:disabled)`)
          ?? panel?.querySelector<HTMLButtonElement>("[data-date]:not(:disabled)");
        target?.focus();
      });
    }
  }

  useEffect(() => {
    const ownerForm = inputRef.current?.form;
    if (!ownerForm) return;
    const reset = () => {
      if (value === undefined) setSelectedDate(initialDate);
      setDraft(null);
      setIsOpen(false);
    };
    ownerForm.addEventListener("reset", reset);
    return () => ownerForm.removeEventListener("reset", reset);
  }, [initialDate, value]);

  const prevAriaLabel =
    mode === "days"
      ? t("prevMonth")
      : mode === "months"
        ? t("prevYear")
        : t("prevYears");
  const nextAriaLabel =
    mode === "days"
      ? t("nextMonth")
      : mode === "months"
        ? t("nextYear")
        : t("nextYears");

  return (
    <div ref={containerRef} className={`relative min-w-0 max-w-full ${className}`}>
      <input type="hidden" name={name} form={form} value={selectedValue} disabled={disabled} />
      <div className="relative min-w-0">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="none"
          form={form}
          value={draft ?? selectedLabel}
          required={required}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls={isOpen ? panelId : undefined}
          placeholder={effectivePlaceholder}
          autoComplete="off"
          className={`input box-border min-w-0 w-full !pr-11 text-left font-mono text-[13px] disabled:opacity-50 ${inputClassName}`}
          onClick={() => openCalendar()}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            const parsed = parseDateValue(text);
            setSelectedDate(parsed);
            onChange?.(parsed ? dateToInputValue(parsed) : "");
          }}
          onBlur={() => {
            if (!draft || parseDateValue(draft)) setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              openCalendar(true);
            }
            if (event.key === "Escape" && isOpen) {
              event.stopPropagation();
              setIsOpen(false);
            }
          }}
        />
        <button
          type="button"
          disabled={disabled}
          className="absolute inset-y-0 right-1 my-auto flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted-2 hover:bg-[#f0edf7] hover:text-[#7a5ac4] focus-visible:outline-2 focus-visible:outline-[#8b6ed4] disabled:cursor-not-allowed"
          aria-label={t("openCalendar")}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls={isOpen ? panelId : undefined}
          onClick={() => isOpen ? setIsOpen(false) : openCalendar(true)}
        >
          <CalendarDays size={17} />
        </button>
      </div>

      {isOpen &&
        mounted &&
        createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={ariaLabel ?? t("selectDate")}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setIsOpen(false);
              inputRef.current?.focus();
            }
            const target = event.target as HTMLElement;
            const current = parseDateValue(target.dataset.date);
            if (!current) return;
            const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"];
            if (offset !== undefined) {
              event.preventDefault();
              const next = new Date(current);
              next.setDate(next.getDate() + offset);
              if (isUnavailable(next)) return;
              setVisibleMonth(new Date(next.getFullYear(), next.getMonth(), 1));
              requestAnimationFrame(() => panelRef.current?.querySelector<HTMLButtonElement>(`[data-date="${dateToInputValue(next)}"]`)?.focus());
            }
          }}
          className="fixed z-[1200] w-[280px] max-w-[calc(100vw-16px)] max-h-[calc(100svh-16px)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-white p-3 shadow-[0_14px_40px_rgba(0,0,0,0.14)]"
          style={
            panelPosition
              ? { top: panelPosition.top, left: panelPosition.left }
              : { visibility: "hidden", top: 0, left: 0 }
          }
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-bg text-muted transition-colors hover:border-muted hover:text-ink"
              aria-label={prevAriaLabel}
              onClick={() => moveVisible(-1)}
            >
              <ChevronLeft size={15} />
            </button>
            {mode === "years" ? (
              <span className="min-w-0 flex-1 rounded-lg px-3 py-2 text-center font-mono text-[12px] font-semibold text-ink">
                {yearsWindowStart}–{yearsWindowStart + YEARS_WINDOW_SIZE - 1}
              </span>
            ) : (
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer rounded-lg px-3 py-2 text-center font-mono text-[12px] font-semibold text-ink transition-colors hover:bg-bg"
                onClick={() => {
                  if (mode === "days") {
                    setMode("months");
                    return;
                  }

                  setYearsWindowStart(visibleMonth.getFullYear() - 5);
                  setMode("years");
                }}
              >
                {mode === "days"
                  ? `${monthLabels[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`
                  : visibleMonth.getFullYear()}
              </button>
            )}
            <button
              type="button"
              className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-bg text-muted transition-colors hover:border-muted hover:text-ink"
              aria-label={nextAriaLabel}
              onClick={() => moveVisible(1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="max-h-[280px] overflow-y-auto">
            {mode === "days" && (
              <>
                <div className="mb-1 grid grid-cols-7 gap-1">
                  {weekdayLabels.map((weekday) => (
                    <div
                      key={weekday}
                      className="py-1 text-center font-mono text-[10px] font-semibold text-muted"
                    >
                      {weekday}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((date) => {
                    const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
                    const isSelected = selectedDate
                      ? isSameDate(date, selectedDate)
                      : false;
                    const isToday = isSameDate(date, today);
                    const isDisabled = isUnavailable(date);

                    return (
                      <button
                        key={dateToInputValue(date)}
                        type="button"
                        disabled={isDisabled}
                        data-date={dateToInputValue(date)}
                        data-selected={isSelected}
                        aria-label={dateToDisplayValue(date, datePreference)}
                        aria-pressed={isSelected}
                        aria-current={isToday ? "date" : undefined}
                        className={`flex aspect-square cursor-pointer items-center justify-center rounded-lg text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:text-[#D7D4CE] ${
                          isSelected
                            ? "bg-[#7a5ac4] text-white shadow-sm"
                            : isToday
                              ? "bg-[#f0edf7] text-[#7a5ac4] ring-1 ring-inset ring-[#c9b8f5] hover:bg-[#e6def5]"
                              : isCurrentMonth
                                ? "text-ink hover:bg-bg"
                                : "text-[#C0BFBA] hover:bg-bg"
                        }`}
                        onClick={() => chooseDate(date)}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {mode === "months" && (
              <div className="grid grid-cols-3 gap-2">
                {monthLabels.map((month, index) => {
                  const isSelected =
                    selectedDate &&
                    visibleMonth.getFullYear() === selectedDate.getFullYear() &&
                    index === selectedDate.getMonth();

                  return (
                    <button
                      key={month}
                      type="button"
                      className={`cursor-pointer rounded-lg border px-3 py-3 text-[12px] font-semibold transition-colors ${
                        isSelected
                          ? "border-ink bg-ink text-white"
                          : "border-border bg-bg text-ink hover:border-muted"
                      }`}
                      onClick={() => {
                        setVisibleMonth(new Date(visibleMonth.getFullYear(), index, 1));
                        setMode("days");
                      }}
                    >
                      {month.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            )}

            {mode === "years" && (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: YEARS_WINDOW_SIZE }, (_, index) => {
                  const year = yearsWindowStart + index;
                  const isSelected = selectedDate && year === selectedDate.getFullYear();

                  return (
                    <button
                      key={year}
                      type="button"
                      className={`cursor-pointer rounded-lg border px-3 py-3 text-[12px] font-semibold transition-colors ${
                        isSelected
                          ? "border-ink bg-ink text-white"
                          : "border-border bg-bg text-ink hover:border-muted"
                      }`}
                      onClick={() => {
                        setVisibleMonth(new Date(year, visibleMonth.getMonth(), 1));
                        setMode("months");
                      }}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
            <button type="button" disabled={isUnavailable(today)} className="rounded-lg px-3 py-2 text-[13px] font-semibold text-[#7a5ac4] hover:bg-[#f0edf7] disabled:opacity-40" onClick={() => chooseDate(today)}>{t("today")}</button>
            {!required && <button type="button" className="rounded-lg px-3 py-2 text-[13px] text-muted-2 hover:bg-bg" onClick={() => chooseDate(null)}>{t("clear")}</button>}
          </div>
        </div>,
        document.body,
        )}
    </div>
  );
}
