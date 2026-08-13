"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const monthLabels = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

// Fenstergröße der Jahres-Ansicht — analog zur 12er-Monatsraster, 3 Spalten x
// 4 Zeilen, damit dieselben Grid-Klassen wie im Monats-Modus wiederverwendet
// werden können.
const YEARS_WINDOW_SIZE = 12;

const weekdayLabels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function dateToInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateToDisplayValue(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}.${date.getFullYear()}`;
}

function parseDateValue(value?: string) {
  if (!value) {
    return null;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;

    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const germanMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);

  if (germanMatch) {
    const [, day, month, year] = germanMatch;

    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return null;
}

function isSameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isBeforeDay(date: Date, minDate?: Date | null) {
  if (!minDate) {
    return false;
  }

  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const minimum = new Date(
    minDate.getFullYear(),
    minDate.getMonth(),
    minDate.getDate(),
  );

  return current < minimum;
}

type DatePickerFieldProps = {
  id?: string;
  name: string;
  defaultValue?: string;
  min?: string;
  placeholder?: string;
  className?: string;
};

export default function DatePickerField({
  id,
  name,
  defaultValue,
  min,
  placeholder = "Datum auswählen",
  className = "",
}: DatePickerFieldProps) {
  const today = useMemo(() => new Date(), []);
  const initialDate = useMemo(() => parseDateValue(defaultValue), [defaultValue]);
  const minDate = useMemo(() => parseDateValue(min), [min]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const base = initialDate ?? minDate ?? today;

    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [mode, setMode] = useState<"days" | "months" | "years">("days");
  const [yearsWindowStart, setYearsWindowStart] = useState(
    () => visibleMonth.getFullYear() - 5,
  );
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedValue = selectedDate ? dateToInputValue(selectedDate) : "";
  const selectedLabel = selectedDate ? dateToDisplayValue(selectedDate) : placeholder;
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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  const prevAriaLabel =
    mode === "days"
      ? "Vorheriger Monat"
      : mode === "months"
        ? "Vorheriges Jahr"
        : "Vorherige Jahre";
  const nextAriaLabel =
    mode === "days"
      ? "Nächster Monat"
      : mode === "months"
        ? "Nächstes Jahr"
        : "Nächste Jahre";

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input type="hidden" id={id} name={name} value={selectedValue} />
      <button
        type="button"
        className={`input flex cursor-pointer items-center justify-between gap-3 text-left ${
          isOpen ? "border-ink bg-white" : "bg-bg"
        }`}
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((current) => !current);
          setMode("days");
        }}
      >
        <span
          className={`font-mono text-[13px] font-semibold ${
            selectedDate ? "text-ink" : "text-muted"
          }`}
        >
          {selectedLabel}
        </span>
        <CalendarDays size={16} className="shrink-0 text-muted" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[60] w-[280px] rounded-xl border border-border bg-white p-3 shadow-[0_14px_40px_rgba(0,0,0,0.14)]">
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
                    const isDisabled = isBeforeDay(date, minDate);

                    return (
                      <button
                        key={dateToInputValue(date)}
                        type="button"
                        disabled={isDisabled}
                        className={`flex aspect-square cursor-pointer items-center justify-center rounded-lg text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:text-[#D7D4CE] ${
                          isSelected
                            ? "bg-ink text-white"
                            : isToday
                              ? "bg-warning/10 text-warning hover:bg-warning/15"
                              : isCurrentMonth
                                ? "text-ink hover:bg-bg"
                                : "text-[#C0BFBA] hover:bg-bg"
                        }`}
                        onClick={() => {
                          setSelectedDate(date);
                          setVisibleMonth(
                            new Date(date.getFullYear(), date.getMonth(), 1),
                          );
                          setIsOpen(false);
                        }}
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
        </div>
      )}
    </div>
  );
}
