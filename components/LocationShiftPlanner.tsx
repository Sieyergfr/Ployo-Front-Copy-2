"use client";

import EmployeeSelector from "@/components/EmployeeSelector";
import type { Location } from "@/lib/locations";
import type { Shift, ShiftDay } from "@/lib/shifts";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Save,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type SelectedWeek = {
  year: number;
  week: number;
};

type ShiftDrawerState = {
  title: string;
  day: ShiftDay;
  shift?: Shift;
};

function getAdjacentWeek(selectedWeek: SelectedWeek, direction: -1 | 1) {
  const nextWeek = selectedWeek.week + direction;

  if (nextWeek < 1) {
    return { year: selectedWeek.year - 1, week: 52 };
  }

  if (nextWeek > 53) {
    return { year: selectedWeek.year + 1, week: 1 };
  }

  return { ...selectedWeek, week: nextWeek };
}

function makeLocationDays(location: Location, selectedWeek: SelectedWeek): ShiftDay[] {
  return location.shiftPlan.days.map((day, dayIndex) => {
    const employeeShifts = location.shiftPlan.employees
      .map((employee) => ({
        employee,
        time: employee.days[dayIndex],
      }))
      .filter((item) => item.time);

    return {
      id: `${location.id}-${selectedWeek.year}-${selectedWeek.week}-${day.label}`,
      weekday: day.label,
      date: day.date,
      isWeekend: day.weekend,
      shifts: employeeShifts.map((item, index) => ({
        id: `${location.id}-${day.label}-${item.employee.initials}-${index}`,
        time: item.time ?? "",
        assignee: item.employee.name,
        location: location.name,
        team: "Standortteam",
        conflict: dayIndex === 3 && index === 0,
      })),
    };
  });
}

function WeekSwitcher({
  selectedWeek,
  setSelectedWeek,
}: {
  selectedWeek: SelectedWeek;
  setSelectedWeek: (week: SelectedWeek) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-white p-1">
      <button
        type="button"
        className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink"
        onClick={() => setSelectedWeek(getAdjacentWeek(selectedWeek, -1))}
        aria-label="Vorherige Woche"
      >
        <ChevronLeft size={15} />
      </button>
      <div className="min-w-[118px] rounded-lg px-3 py-2 text-center font-mono text-[12px] font-semibold text-ink">
        KW {selectedWeek.week} · {selectedWeek.year}
      </div>
      <button
        type="button"
        className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink"
        onClick={() => setSelectedWeek(getAdjacentWeek(selectedWeek, 1))}
        aria-label="Nächste Woche"
      >
        <ChevronRight size={15} />
      </button>
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
      <div className="truncate text-[12px] font-semibold text-ink">
        {shift.assignee}
      </div>
      <div className="truncate text-[10.5px] text-muted">
        {shift.location} · {shift.team}
      </div>
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
  onAddShift,
  onEditShift,
}: {
  day: ShiftDay;
  index: number;
  onAddShift: (day: ShiftDay) => void;
  onEditShift: (day: ShiftDay, shift: Shift) => void;
}) {
  return (
    <div className={`flex min-h-[260px] flex-col ${index > 0 ? "border-l border-border" : ""}`}>
      <div className={`border-b border-border px-2.5 py-3 text-center ${day.isWeekend ? "bg-bg" : "bg-white"}`}>
        <div className={`font-mono text-[11px] font-semibold ${day.isWeekend ? "text-danger" : "text-muted"}`}>
          {day.weekday}
        </div>
        <div className="mt-0.5 font-mono text-[9px] text-[#B0B0AB]">{day.date}</div>
      </div>
      <div className="flex min-h-[160px] flex-col gap-1.5 p-2">
        {day.shifts.map((shift) => (
          <ShiftCard key={shift.id} day={day} shift={shift} onEdit={onEditShift} />
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

  const start = drawer.shift?.time.split("-")[0] ?? "09:00";
  const end = drawer.shift?.time.split("-")[1] ?? "17:00";
  const defaultEmployeeId = drawer.shift?.assignee
    ? drawer.shift.assignee.toLowerCase().replaceAll(" ", "-")
    : undefined;

  return (
    <div
      className="action-drawer-backdrop fixed inset-0 z-[1000] flex justify-end bg-black/35 backdrop-blur-[4px]"
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
        aria-labelledby="location-shift-drawer-title"
        className="action-drawer-panel h-full w-full max-w-[520px] overflow-y-auto border-l border-border bg-white p-6 shadow-[-20px_0_70px_rgba(0,0,0,0.18)]"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] font-semibold text-muted">
              {drawer.day.weekday} · {drawer.day.date}
            </div>
            <h2
              id="location-shift-drawer-title"
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

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onClose();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="location-shift-start" className="label">
                Start
              </label>
              <input id="location-shift-start" type="time" className="input" defaultValue={start} />
            </div>
            <div className="field">
              <label htmlFor="location-shift-end" className="label">
                Ende
              </label>
              <input id="location-shift-end" type="time" className="input" defaultValue={end} />
            </div>
          </div>
          <EmployeeSelector
            label="Mitarbeiter"
            name="shiftEmployees"
            mode="multi"
            defaultSelectedIds={defaultEmployeeId ? [defaultEmployeeId] : []}
          />
          <div className="flex items-center gap-2 rounded-xl border border-border bg-bg p-3 text-[12.5px] text-muted-2">
            <Clock3 size={15} className="text-muted" />
            Bearbeitung ist auf diesen Standort begrenzt.
          </div>
          <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary">
              <Save size={15} />
              Speichern
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

export default function LocationShiftPlanner({ location }: { location: Location }) {
  const [selectedWeek, setSelectedWeek] = useState<SelectedWeek>({
    year: 2026,
    week: 26,
  });
  const [drawer, setDrawer] = useState<ShiftDrawerState | null>(null);
  const days = useMemo(
    () => makeLocationDays(location, selectedWeek),
    [location, selectedWeek],
  );
  const conflictCount = days.reduce(
    (total, day) => total + day.shifts.filter((shift) => shift.conflict).length,
    0,
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={15} className="text-muted" />
          <span className="font-mono text-[11px] text-muted">
            {location.name} · nur dieser Standort
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-[10px] border border-danger/20 bg-danger/10 px-3.5 py-2.5">
            <span className="size-[7px] shrink-0 rounded-full bg-danger" />
            <span className="font-mono text-[12px] font-semibold text-danger">
              {conflictCount} Konflikte
            </span>
          </div>
          <WeekSwitcher selectedWeek={selectedWeek} setSelectedWeek={setSelectedWeek} />
        </div>
      </div>

      <section className="overflow-hidden rounded-card border border-border bg-white">
        <div className="overflow-x-auto">
          <div className="grid min-w-[700px] [grid-template-columns:repeat(7,minmax(130px,1fr))]">
            {days.map((day, index) => (
              <ShiftDayColumn
                key={day.id}
                day={day}
                index={index}
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
    </>
  );
}
