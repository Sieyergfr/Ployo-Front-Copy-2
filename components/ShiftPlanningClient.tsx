"use client";

import { ShiftSettingsDrawerButton } from "@/components/ActionDrawers";
import PageHeader from "@/components/PageHeader";
import { employees } from "@/lib/employees";
import { locations } from "@/lib/locations";
import {
  shiftConflictCount,
  shiftDays,
  type Shift,
  type ShiftDay,
} from "@/lib/shifts";
import {
  AlertCircle,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type ShiftWeek = {
  id: string;
  label: string;
  range: string;
  holidays: Array<{ date: string; label: string }>;
  days: ShiftDay[];
};

type SelectedWeek = {
  year: number;
  week: number;
};

type ShiftDrawerState = {
  title: string;
  day: ShiftDay;
  shift?: Shift;
};

type DropdownOption = {
  value: string;
  label: string;
  meta?: string;
};

type ShiftPreset = {
  id: string;
  label: string;
  start: string;
  end: string;
  breakMinutes: string;
};

type ShiftLocationBlockState = {
  id: string;
  locationId: string;
  start: string;
  end: string;
  breakMinutes: string;
  employeeIds: string[];
};

const shiftPresets: ShiftPreset[] = [
  { id: "early", label: "Früh", start: "06:00", end: "14:00", breakMinutes: "30" },
  { id: "day", label: "Tag", start: "09:00", end: "17:00", breakMinutes: "30" },
  { id: "late", label: "Spät", start: "14:00", end: "22:00", breakMinutes: "45" },
  { id: "short", label: "Kurz", start: "10:00", end: "15:00", breakMinutes: "15" },
];

const locationOptions = locations.map((location) => ({
  value: location.id,
  label: location.name,
  meta: location.kind,
}));

const locationAccentStyles = {
  "bg-ink": {
    bg: "bg-ink",
    text: "text-ink",
    surface: "bg-ink/10",
    border: "border-ink/15",
  },
  "bg-success": {
    bg: "bg-success",
    text: "text-success",
    surface: "bg-success/10",
    border: "border-success/15",
  },
  "bg-[#2A6FDB]": {
    bg: "bg-[#2A6FDB]",
    text: "text-[#2A6FDB]",
    surface: "bg-[#2A6FDB]/10",
    border: "border-[#2A6FDB]/15",
  },
  "bg-[#8B6ED4]": {
    bg: "bg-[#8B6ED4]",
    text: "text-[#8B6ED4]",
    surface: "bg-[#8B6ED4]/10",
    border: "border-[#8B6ED4]/15",
  },
} satisfies Record<string, { bg: string; text: string; surface: string; border: string }>;

function getLocationAccent(accentClassName?: string) {
  return (
    locationAccentStyles[accentClassName as keyof typeof locationAccentStyles] ?? {
      bg: "bg-border",
      text: "text-muted",
      surface: "bg-bg",
      border: "border-border",
    }
  );
}

const shiftWeeks: ShiftWeek[] = [
  {
    id: "kw-23",
    label: "KW 23",
    range: "01.06-07.06.2026",
    holidays: [{ date: "04.06", label: "Fronleichnam" }],
    days: shiftDays.map((day, index) => ({
      ...day,
      id: `kw23-${day.id}`,
      date: ["01.06", "02.06", "03.06", "04.06", "05.06", "06.06", "07.06"][index],
    })),
  },
  {
    id: "kw-26",
    label: "KW 26",
    range: "22.06-28.06.2026",
    holidays: [],
    days: shiftDays,
  },
  {
    id: "kw-27",
    label: "KW 27",
    range: "29.06-05.07.2026",
    holidays: [],
    days: shiftDays.map((day, index) => ({
      ...day,
      id: `kw27-${day.id}`,
      date: ["29.06", "30.06", "01.07", "02.07", "03.07", "04.07", "05.07"][index],
    })),
  },
];

function getWeeksInISOYear(year: number) {
  const december28 = new Date(Date.UTC(year, 11, 28));
  const yearStart = getISOWeekStart(year, 1);

  return Math.floor((december28.getTime() - yearStart.getTime()) / 604800000) + 1;
}

function getISOWeekStart(year: number, week: number) {
  const january4 = new Date(Date.UTC(year, 0, 4));
  const january4Day = january4.getUTCDay() || 7;
  const weekStart = new Date(january4);

  weekStart.setUTCDate(january4.getUTCDate() - january4Day + 1 + (week - 1) * 7);

  return weekStart;
}

function getISOWeekFromDate(date: Date): SelectedWeek {
  const utcDate = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = utcDate.getUTCDay() || 7;

  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);

  const year = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );

  return { year, week };
}

function formatWeekDate(date: Date) {
  return `${String(date.getUTCDate()).padStart(2, "0")}.${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

function formatWeekRange(startDate: Date) {
  const endDate = new Date(startDate);

  endDate.setUTCDate(startDate.getUTCDate() + 6);

  return `${formatWeekDate(startDate)}-${formatWeekDate(endDate)}.${endDate.getUTCFullYear()}`;
}

function getShiftWeek({ year, week }: SelectedWeek): ShiftWeek {
  const existingWeek =
    year === 2026
      ? shiftWeeks.find((shiftWeek) => shiftWeek.id === `kw-${week}`)
      : undefined;

  if (existingWeek) {
    return existingWeek;
  }

  const startDate = getISOWeekStart(year, week);
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startDate);

    date.setUTCDate(startDate.getUTCDate() + index);

    return formatWeekDate(date);
  });

  return {
    id: `${year}-kw-${week}`,
    label: `KW ${week}`,
    range: formatWeekRange(startDate),
    holidays: [],
    days: shiftDays.map((day, index) => ({
      ...day,
      id: `${year}-kw-${week}-${day.weekday}`,
      date: dates[index],
    })),
  };
}

function getAdjacentWeek(selectedWeek: SelectedWeek, direction: -1 | 1): SelectedWeek {
  const nextWeek = selectedWeek.week + direction;

  if (nextWeek < 1) {
    const previousYear = selectedWeek.year - 1;

    return {
      year: previousYear,
      week: getWeeksInISOYear(previousYear),
    };
  }

  const weeksInYear = getWeeksInISOYear(selectedWeek.year);

  if (nextWeek > weeksInYear) {
    return {
      year: selectedWeek.year + 1,
      week: 1,
    };
  }

  return {
    ...selectedWeek,
    week: nextWeek,
  };
}

function getShiftTimes(shift?: Shift) {
  const match = shift?.time.match(/(\d{2}:\d{2}).*(\d{2}:\d{2})/);

  return {
    start: match?.[1] ?? shiftPresets[1].start,
    end: match?.[2] ?? shiftPresets[1].end,
  };
}

function getEmployeeCategory(contract: string) {
  if (contract === "Teilzeit") {
    return "Teilzeit";
  }

  if (contract === "Werkstudentin" || contract === "Befristet") {
    return "Mini-Job";
  }

  return "Vollzeit";
}

function getPlannedWeekHours(employeeId: string) {
  const employee = employees.find((item) => item.id === employeeId);

  if (!employee) {
    return 0;
  }

  return employee.shifts.length * 8;
}

function CustomDropdownField({
  label,
  name,
  placeholder,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  placeholder: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value);
  const listboxId = `${name}-dropdown-listbox`;
  const labelId = `${name}-dropdown-label`;

  return (
    <div
      className="field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <label id={labelId} className="label">
        {label}
      </label>
      <input type="hidden" name={name} value={value} />

      <div className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-labelledby={labelId}
          aria-controls={listboxId}
          className="input flex cursor-pointer items-center justify-between gap-3 bg-bg text-left"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className={selectedOption ? "text-ink" : "text-muted"}>
            {selectedOption?.label ?? placeholder}
          </span>
          <ChevronRight
            size={14}
            className={`shrink-0 text-muted transition-transform ${
              isOpen ? "rotate-90" : ""
            }`}
          />
        </button>

        {isOpen && (
          <div
            id={listboxId}
            role="listbox"
            aria-labelledby={labelId}
            className="absolute z-50 mt-1.5 max-h-56 w-full overflow-y-auto rounded-[10px] border border-border bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
          >
            {options.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    isSelected ? "bg-border-soft" : "hover:bg-bg"
                  }`}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {option.label}
                    </span>
                    {option.meta && (
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">
                        {option.meta}
                      </span>
                    )}
                  </span>
                  {isSelected && <Check size={13} className="shrink-0 text-success" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ShiftForm({
  day,
  shift,
  onDone,
}: {
  day: ShiftDay;
  shift?: Shift;
  onDone: () => void;
}) {
  const shiftTimes = getShiftTimes(shift);
  const firstLocation = locationOptions.find((location) =>
    location.label.includes(shift?.location ?? ""),
  );
  const initialLocationId = firstLocation?.value ?? locationOptions[0]?.value ?? "";
  const initialEmployee = shift?.assignee
    ? employees.find((employee) => employee.name === shift.assignee)
    : undefined;
  const [activePresetId, setActivePresetId] = useState("day");
  const [customPreset, setCustomPreset] = useState({
    start: shiftTimes.start,
    end: shiftTimes.end,
    breakMinutes: "30",
  });
  const [blocks, setBlocks] = useState<ShiftLocationBlockState[]>([
    {
      id: `${day.id}-location-1`,
      locationId: initialLocationId,
      start: shiftTimes.start,
      end: shiftTimes.end,
      breakMinutes: "30",
      employeeIds: initialEmployee ? [initialEmployee.id] : [],
    },
  ]);
  const [collapsedEmployeeLists, setCollapsedEmployeeLists] = useState<string[]>([
    `${day.id}-location-1`,
  ]);
  const [employeeSearches, setEmployeeSearches] = useState<Record<string, string>>({});

  function applyPreset(preset: ShiftPreset) {
    setActivePresetId(preset.id);
    setCustomPreset({
      start: preset.start,
      end: preset.end,
      breakMinutes: preset.breakMinutes,
    });
    setBlocks((currentBlocks) =>
      currentBlocks.map((block) => ({
        ...block,
        start: preset.start,
        end: preset.end,
        breakMinutes: preset.breakMinutes,
      })),
    );
  }

  function updateBlock(blockId: string, update: Partial<ShiftLocationBlockState>) {
    setBlocks((currentBlocks) =>
      currentBlocks.map((block) =>
        block.id === blockId ? { ...block, ...update } : block,
      ),
    );
  }

  function addLocationBlock() {
    const blockId = `${day.id}-location-${blocks.length + 1}-${Date.now()}`;

    setBlocks((currentBlocks) => [
      ...currentBlocks,
      {
        id: blockId,
        locationId: locationOptions[0]?.value ?? "",
        start: customPreset.start,
        end: customPreset.end,
        breakMinutes: customPreset.breakMinutes,
        employeeIds: [],
      },
    ]);
    setCollapsedEmployeeLists((currentIds) => [...currentIds, blockId]);
  }

  function removeLocationBlock(blockId: string) {
    setBlocks((currentBlocks) =>
      currentBlocks.length === 1
        ? currentBlocks
        : currentBlocks.filter((block) => block.id !== blockId),
    );
    setEmployeeSearches((currentSearches) => {
      const remainingSearches = { ...currentSearches };

      delete remainingSearches[blockId];
      return remainingSearches;
    });
  }

  function toggleEmployeeList(blockId: string) {
    setCollapsedEmployeeLists((currentIds) =>
      currentIds.includes(blockId)
        ? currentIds.filter((id) => id !== blockId)
        : [...currentIds, blockId],
    );
  }

  function updateEmployeeSearch(blockId: string, value: string) {
    setEmployeeSearches((currentSearches) => ({
      ...currentSearches,
      [blockId]: value,
    }));
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onDone();
      }}
    >
      <section className="rounded-xl border border-border bg-bg p-3.5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Settings2 size={15} className="text-muted" />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
              Einstellungen
            </span>
          </div>
          <span className="font-mono text-[10px] text-muted-2">
            Uhrzeit + Pause
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {shiftPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`rounded-[9px] border px-3 py-2 text-left transition-colors ${
                activePresetId === preset.id
                  ? "border-ink bg-white"
                  : "border-border bg-white/60 hover:border-muted"
              }`}
              onClick={() => applyPreset(preset)}
            >
              <span className="block text-[12.5px] font-semibold text-ink">
                {preset.label}
              </span>
              <span className="mt-1 block font-mono text-[9.5px] text-muted">
                {preset.start}-{preset.end} · {preset.breakMinutes}m
              </span>
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="field">
            <label htmlFor="shift-default-start" className="label">
              Manuell Start
            </label>
            <input
              id="shift-default-start"
              type="time"
              className="input"
              value={customPreset.start}
              onChange={(event) => {
                setActivePresetId("manual");
                setCustomPreset((current) => ({
                  ...current,
                  start: event.target.value,
                }));
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="shift-default-end" className="label">
              Manuell Ende
            </label>
            <input
              id="shift-default-end"
              type="time"
              className="input"
              value={customPreset.end}
              onChange={(event) => {
                setActivePresetId("manual");
                setCustomPreset((current) => ({
                  ...current,
                  end: event.target.value,
                }));
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="shift-default-break" className="label">
              Pause
            </label>
            <input
              id="shift-default-break"
              type="number"
              min="0"
              step="5"
              className="input"
              value={customPreset.breakMinutes}
              onChange={(event) => {
                setActivePresetId("manual");
                setCustomPreset((current) => ({
                  ...current,
                  breakMinutes: event.target.value,
                }));
              }}
            />
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            Standort-Blöcke
          </div>
          <div className="mt-1 text-[12px] text-muted-2">
            Mitarbeiter je Standort mit individuellen Zeiten planen
          </div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addLocationBlock}>
          <Plus size={14} />
          Block
        </button>
      </div>

      <div className="flex flex-col gap-5">
        {blocks.map((block, blockIndex) => {
          const selectedEmployees = employees.filter((employee) =>
            block.employeeIds.includes(employee.id),
          );
          const selectedLocation = locationOptions.find(
            (location) => location.value === block.locationId,
          );
          const selectedLocationDetails = locations.find(
            (location) => location.id === block.locationId,
          );
          const locationAccent = getLocationAccent(selectedLocationDetails?.accentClassName);
          const isEmployeeListCollapsed = collapsedEmployeeLists.includes(block.id);
          const employeeSearch = employeeSearches[block.id] ?? "";
          const normalizedEmployeeSearch = employeeSearch.trim().toLowerCase();
          const filteredEmployees = employees.filter((employee) => {
            const employeeCategory = getEmployeeCategory(employee.contract);
            const haystack = [
              employee.name,
              employee.location,
              employee.team,
              employee.role,
              employee.weeklyHours,
              employeeCategory,
            ]
              .join(" ")
              .toLowerCase();

            return haystack.includes(normalizedEmployeeSearch);
          });

          return (
            <section
              key={block.id}
              className="relative overflow-hidden rounded-[14px] border border-border-light bg-white p-4 pt-6 shadow-[0_14px_34px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.03]"
            >
              <div
                className={`absolute inset-x-0 top-0 h-1.5 ${locationAccent.bg}`}
              />
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-border-soft pb-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] border ${locationAccent.border} ${locationAccent.surface}`}
                  >
                    <Building2 size={16} className={locationAccent.text} />
                  </span>
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                      Block {String(blockIndex + 1).padStart(2, "0")}
                    </div>
                    <div className="mt-1 truncate text-[13px] font-semibold text-ink">
                      {selectedLocation?.label ?? "Standort auswählen"}
                    </div>
                  </div>
                </div>
                <div className="rounded-[8px] border border-border bg-bg px-2.5 py-1.5 font-mono text-[10px] text-muted-2">
                  {block.start}-{block.end} · {block.employeeIds.length} MA
                </div>
              </div>

              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <CustomDropdownField
                    label={`Standort ${blockIndex + 1}`}
                    name={`location-${block.id}`}
                    placeholder="Standort auswählen"
                    options={locationOptions}
                    value={block.locationId}
                    onChange={(locationId) => updateBlock(block.id, { locationId })}
                  />
                </div>
                <button
                  type="button"
                  aria-label="Standort-Block entfernen"
                  title="Standort-Block entfernen"
                  className="mt-6 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border border-border bg-white text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={blocks.length === 1}
                  onClick={() => removeLocationBlock(block.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="field">
                  <label htmlFor={`${block.id}-start`} className="label">
                    Block Start
                  </label>
                  <input
                    id={`${block.id}-start`}
                    name={`${block.id}-start`}
                    type="time"
                    className="input"
                    value={block.start}
                    onChange={(event) => updateBlock(block.id, { start: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${block.id}-end`} className="label">
                    Block Ende
                  </label>
                  <input
                    id={`${block.id}-end`}
                    name={`${block.id}-end`}
                    type="time"
                    className="input"
                    value={block.end}
                    onChange={(event) => updateBlock(block.id, { end: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${block.id}-break`} className="label">
                    Pause
                  </label>
                  <input
                    id={`${block.id}-break`}
                    name={`${block.id}-break`}
                    type="number"
                    min="0"
                    step="5"
                    className="input"
                    value={block.breakMinutes}
                    onChange={(event) =>
                      updateBlock(block.id, { breakMinutes: event.target.value })
                    }
                  />
                </div>
              </div>

              <div className="mt-4 rounded-[12px] border border-border bg-bg">
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-3 text-left"
                  aria-expanded={!isEmployeeListCollapsed}
                  onClick={() => toggleEmployeeList(block.id)}
                >
                  <span>
                    <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                      Mitarbeiter
                    </span>
                    <span className="mt-0.5 block text-[12px] text-muted-2">
                      {block.employeeIds.length} ausgewählt
                    </span>
                  </span>
                  <ChevronRight
                    size={15}
                    className={`shrink-0 text-muted transition-transform ${
                      isEmployeeListCollapsed ? "" : "rotate-90"
                    }`}
                  />
                </button>

                {!isEmployeeListCollapsed && (
                  <div className="border-t border-border p-2.5">
                    <div className="input-wrapper mb-2.5">
                      <Search size={14} className="input-icon-left" />
                      <input
                        type="search"
                        aria-label={`Mitarbeiter in Block ${blockIndex + 1} suchen`}
                        className="input input-with-icon-left bg-white"
                        placeholder="Mitarbeiter suchen"
                        value={employeeSearch}
                        onChange={(event) =>
                          updateEmployeeSearch(block.id, event.target.value)
                        }
                      />
                    </div>
                    <div className="grid max-h-[260px] gap-2 overflow-y-auto pr-1">
                    {filteredEmployees.map((employee) => {
                      const isSelected = block.employeeIds.includes(employee.id);
                      const plannedHours = getPlannedWeekHours(employee.id);

                      return (
                        <button
                          key={employee.id}
                          type="button"
                          className={`flex cursor-pointer items-start gap-3 rounded-[10px] border p-3 text-left transition-colors ${
                            isSelected
                              ? "border-ink bg-white"
                              : "border-border bg-white/70 hover:border-muted"
                          }`}
                          onClick={() =>
                            updateBlock(block.id, {
                              employeeIds: isSelected
                                ? block.employeeIds.filter((id) => id !== employee.id)
                                : [...block.employeeIds, employee.id],
                            })
                          }
                        >
                          <span
                            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[6px] border ${
                              isSelected
                                ? "border-ink bg-ink text-white"
                                : "border-border bg-white text-transparent"
                            }`}
                          >
                            <Check size={13} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-ink">
                              {employee.name}
                            </span>
                            <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[10px] text-muted">
                              <span>{getEmployeeCategory(employee.contract)}</span>
                              <span>{employee.weeklyHours}</span>
                              <span>{plannedHours}h geplant</span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    {filteredEmployees.length === 0 && (
                      <div className="rounded-[10px] border border-dashed border-border bg-white px-3 py-4 text-center text-[12px] text-muted">
                        Keine Mitarbeiter gefunden
                      </div>
                    )}
                    </div>
                  </div>
                )}
              </div>

              {selectedEmployees.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 border-t border-border-soft pt-3">
                  {selectedEmployees.map((employee) => (
                    <div
                      key={`${block.id}-${employee.id}-times`}
                      className="rounded-[10px] bg-bg p-3"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <Clock3 size={13} className="text-muted" />
                        <span className="truncate text-[12.5px] font-semibold text-ink">
                          {employee.name}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          aria-label={`${employee.name} Start`}
                          name={`${block.id}-${employee.id}-start`}
                          type="time"
                          className="input px-2.5 py-2 text-[12px]"
                          defaultValue={block.start}
                        />
                        <input
                          aria-label={`${employee.name} Ende`}
                          name={`${block.id}-${employee.id}-end`}
                          type="time"
                          className="input px-2.5 py-2 text-[12px]"
                          defaultValue={block.end}
                        />
                        <input
                          aria-label={`${employee.name} Pause`}
                          name={`${block.id}-${employee.id}-break`}
                          type="number"
                          min="0"
                          step="5"
                          className="input px-2.5 py-2 text-[12px]"
                          defaultValue={block.breakMinutes}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary">
          <Save size={15} />
          Schicht speichern
        </button>
      </div>
    </form>
  );
}

function WeekSwitcher({
  selectedWeek,
  setSelectedWeek,
}: {
  selectedWeek: SelectedWeek;
  setSelectedWeek: (week: SelectedWeek) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(selectedWeek.year);
  const weeksInPickerYear = getWeeksInISOYear(pickerYear);
  const pickerWeeks = Array.from({ length: weeksInPickerYear }, (_, index) => index + 1);
  const currentWeek = getISOWeekFromDate(new Date());

  return (
    <div
      className="relative inline-flex items-center gap-1 rounded-xl border border-border bg-white p-1"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink"
        onClick={() => setSelectedWeek(getAdjacentWeek(selectedWeek, -1))}
        aria-label="Vorherige Woche"
      >
        <ChevronLeft size={15} />
      </button>
      <button
        type="button"
        aria-label="Kalenderwoche"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="min-w-[118px] cursor-pointer rounded-lg px-3 py-2 text-left font-mono text-[12px] font-semibold text-ink transition-colors hover:bg-bg"
        onClick={() => {
          setPickerYear(selectedWeek.year);
          setIsOpen((current) => !current);
        }}
      >
        KW {selectedWeek.week} · {selectedWeek.year}
      </button>
      <button
        type="button"
        className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink"
        onClick={() => setSelectedWeek(getAdjacentWeek(selectedWeek, 1))}
        aria-label="Nächste Woche"
      >
        <ChevronRight size={15} />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Kalenderwoche auswählen"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[340px] rounded-[14px] border border-border bg-white p-3 shadow-[0_18px_50px_rgba(0,0,0,0.16)]"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Vorheriges Jahr"
              className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink"
              onClick={() => setPickerYear((currentYear) => currentYear - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <div className="text-center">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Jahr
              </div>
              <div className="mt-0.5 font-display text-[18px] font-semibold text-ink">
                {pickerYear}
              </div>
            </div>
            <button
              type="button"
              aria-label="Nächstes Jahr"
              className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink"
              onClick={() => setPickerYear((currentYear) => currentYear + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="grid max-h-[280px] grid-cols-6 gap-1.5 overflow-y-auto pr-1">
            {pickerWeeks.map((week) => {
              const isSelected =
                selectedWeek.year === pickerYear && selectedWeek.week === week;
              const isCurrentWeek =
                currentWeek.year === pickerYear && currentWeek.week === week;

              return (
                <button
                  key={`${pickerYear}-${week}`}
                  type="button"
                  aria-label={`KW ${week}${isCurrentWeek ? ", aktuelle Kalenderwoche" : ""}`}
                  className={`h-9 cursor-pointer rounded-[9px] border font-mono text-[11px] font-semibold transition-colors ${
                    isSelected
                      ? "border-ink bg-ink text-white"
                      : isCurrentWeek
                        ? "border-success bg-success/10 text-success ring-1 ring-success/20 hover:border-success hover:bg-success/15"
                        : "border-border bg-bg text-muted-2 hover:border-muted hover:text-ink"
                  }`}
                  onClick={() => {
                    setSelectedWeek({ year: pickerYear, week });
                    setIsOpen(false);
                  }}
                >
                  {week}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ShiftCard({
  day,
  shift,
  onEdit,
}: {
  day: ShiftDay;
  shift: Shift;
  onEdit: (day: ShiftDay, shift: Shift) => void;
}) {
  const isEmpty = !shift.assignee;

  return (
    <button
      type="button"
      className={`flex w-full cursor-pointer flex-col gap-[3px] rounded-[9px] border px-2.5 py-[9px] text-left font-sans transition-colors ${
        shift.conflict
          ? "border-danger/25 bg-danger/5 hover:border-danger/40"
          : "border-border bg-bg hover:border-muted"
      }`}
      onClick={() => onEdit(day, shift)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11.5px] font-semibold text-ink">
          {shift.time}
        </span>
        {shift.conflict && <AlertCircle size={13} className="text-danger" />}
      </div>
      {isEmpty ? (
        <div className="text-[11px] text-[#C0BFBA]">Leer</div>
      ) : (
        <>
          <div className="truncate text-[12px] font-semibold text-ink">
            {shift.assignee}
          </div>
          <div className="truncate text-[10.5px] text-muted">
            {shift.location} · {shift.team}
          </div>
        </>
      )}
    </button>
  );
}

function AddShiftButton({
  day,
  onAdd,
}: {
  day: ShiftDay;
  onAdd: (day: ShiftDay) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Schicht am ${day.weekday} hinzufügen`}
      title="Schicht hinzufügen"
      className="flex w-full cursor-pointer items-center justify-center rounded-[9px] border-[1.5px] border-dashed border-[#DEDAD4] bg-transparent p-[7px] text-[#C0BFBA] transition-colors hover:border-muted hover:text-muted-2"
      onClick={() => onAdd(day)}
    >
      <Plus size={15} strokeWidth={1.8} />
    </button>
  );
}

function ShiftDayColumn({
  day,
  index,
  holiday,
  onAddShift,
  onEditShift,
}: {
  day: ShiftDay;
  index: number;
  holiday?: string;
  onAddShift: (day: ShiftDay) => void;
  onEditShift: (day: ShiftDay, shift: Shift) => void;
}) {
  return (
    <div className={`flex min-h-[210px] flex-col ${index > 0 ? "border-l border-border" : ""}`}>
      <div className={`border-b border-border px-2.5 py-3 text-center ${day.isWeekend || holiday ? "bg-bg" : "bg-white"}`}>
        <div className={`flex items-center justify-center gap-1.5 font-mono text-[11px] font-semibold ${day.isWeekend || holiday ? "text-ink" : "text-muted"}`}>
          <span>{day.weekday}</span>
          {holiday && (
            <span
              aria-label={`Feiertag: ${holiday}`}
              title={holiday}
              className="size-1.5 rounded-full bg-success"
            />
          )}
        </div>
        <div className="mt-0.5 font-mono text-[9px] text-[#B0B0AB]">{day.date}</div>
      </div>
      <div className="flex min-h-[130px] flex-col gap-1.5 p-2">
        {day.shifts.map((shift) => (
          <ShiftCard
            key={shift.id}
            day={day}
            shift={shift}
            onEdit={onEditShift}
          />
        ))}
        <AddShiftButton day={day} onAdd={onAddShift} />
      </div>
    </div>
  );
}

function ShiftDrawer({
  drawer,
  onClose,
}: {
  drawer: ShiftDrawerState | null;
  onClose: () => void;
}) {
  if (!drawer) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex justify-end bg-black/35 backdrop-blur-[4px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="shift-drawer-title"
        className="shift-drawer-panel h-full w-full max-w-[680px] overflow-y-auto border-l border-border bg-white p-6 shadow-[-20px_0_70px_rgba(0,0,0,0.18)]"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] font-semibold text-muted">
              {drawer.day.weekday} · {drawer.day.date}
            </div>
            <h2
              id="shift-drawer-title"
              className="mt-1 font-display text-[22px] font-semibold leading-tight text-ink"
            >
              {drawer.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Drawer schließen"
            title="Schließen"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
            onClick={onClose}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        <ShiftForm day={drawer.day} shift={drawer.shift} onDone={onClose} />
      </aside>
    </div>
  );
}

export default function ShiftPlanningClient() {
  const [selectedWeek, setSelectedWeek] = useState<SelectedWeek>({
    year: 2026,
    week: 26,
  });
  const [drawer, setDrawer] = useState<ShiftDrawerState | null>(null);
  const activeWeek = useMemo(() => getShiftWeek(selectedWeek), [selectedWeek]);
  const holidaysByDate = useMemo(
    () => new Map(activeWeek.holidays.map((holiday) => [holiday.date, holiday.label])),
    [activeWeek],
  );

  return (
    <>
      <PageHeader
        eyebrow="Dienstplan"
        title="Schichtplanung"
        subtitle={<span className="font-mono">{activeWeek.label} · {activeWeek.range}</span>}
        className="mb-7"
      >
        <div className="inline-flex items-center gap-2 rounded-[10px] border border-danger/20 bg-danger/10 px-3.5 py-2.5">
          <span className="size-[7px] shrink-0 rounded-full bg-danger" />
          <span className="font-mono text-[12px] font-semibold text-danger">
            {shiftConflictCount} Konflikte offen
          </span>
        </div>
        <ShiftSettingsDrawerButton />
        <WeekSwitcher selectedWeek={selectedWeek} setSelectedWeek={setSelectedWeek} />
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white px-4 py-3">
        <CalendarDays size={15} className="text-muted" />
        <span className="font-mono text-[11px] text-muted">
          Feiertage:
        </span>
        <span className="text-[12.5px] text-muted-2">
          {activeWeek.holidays.length > 0
            ? activeWeek.holidays.map((holiday) => `${holiday.date} ${holiday.label}`).join(" · ")
            : "Keine Feiertage in dieser Woche"}
        </span>
      </div>

      <section className="overflow-hidden rounded-card border border-border bg-white">
        <div className="overflow-x-auto">
          <div className="grid min-w-[700px] [grid-template-columns:repeat(7,minmax(130px,1fr))]">
            {activeWeek.days.map((day, index) => (
              <ShiftDayColumn
                key={day.id}
                day={day}
                index={index}
                holiday={holidaysByDate.get(day.date)}
                onAddShift={(selectedDay) =>
                  setDrawer({
                    title: "Schicht hinzufügen",
                    day: selectedDay,
                  })
                }
                onEditShift={(selectedDay, selectedShift) =>
                  setDrawer({
                    title: "Schicht bearbeiten",
                    day: selectedDay,
                    shift: selectedShift,
                  })
                }
              />
            ))}
          </div>
        </div>
      </section>

      <ShiftDrawer drawer={drawer} onClose={() => setDrawer(null)} />

      <div className="mt-8 text-center font-mono text-[10px] tracking-[0.4px] text-[#B0B0AB]">
        Ployo {"·"} Personalakte-System {"·"} Alle Zugriffe protokolliert{" "}
        {"·"} Server in Frankfurt
      </div>
    </>
  );
}
