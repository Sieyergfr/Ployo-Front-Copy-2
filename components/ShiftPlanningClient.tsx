"use client";

import {
  createShiftAction,
  deleteShiftAction,
  updateShiftAction,
} from "@/app/(dashboard)/u/[tenant]/schichtplanung/actions";
import { ShiftSettingsDrawerButton } from "@/components/ActionDrawers";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import PageHeader from "@/components/PageHeader";
import {
  type ShiftEmployeeOption,
  type ShiftLocationOption,
} from "@/lib/shift-service";
import { type Shift, type ShiftDay } from "@/lib/shifts";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Save,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ShiftPlanningClientProps = {
  tenant: string;
  year: number;
  week: number;
  weekLabel: string;
  weekRange: string;
  conflictCount: number;
  days: ShiftDay[];
  employees: ShiftEmployeeOption[];
  locations: ShiftLocationOption[];
};

type DrawerState = {
  day: ShiftDay;
  shift?: Shift;
};

function getWeeksInISOYear(year: number) {
  const december28 = new Date(Date.UTC(year, 11, 28));
  const january4 = new Date(Date.UTC(year, 0, 4));
  const january4Day = january4.getUTCDay() || 7;
  const yearStart = new Date(january4);

  yearStart.setUTCDate(january4.getUTCDate() - january4Day + 1);

  return Math.floor((december28.getTime() - yearStart.getTime()) / 604800000) + 1;
}

function getAdjacentWeek(year: number, week: number, direction: -1 | 1) {
  const nextWeek = week + direction;

  if (nextWeek < 1) {
    const previousYear = year - 1;

    return { year: previousYear, week: getWeeksInISOYear(previousYear) };
  }

  const weeksInYear = getWeeksInISOYear(year);

  if (nextWeek > weeksInYear) {
    return { year: year + 1, week: 1 };
  }

  return { year, week: nextWeek };
}

function ShiftCard({
  shift,
  onClick,
}: {
  shift: Shift;
  onClick: () => void;
}) {
  const isOpen = !shift.assignee;
  const accentClassName = shift.locationAccentClassName ?? "bg-border";

  return (
    <button
      type="button"
      className={`relative flex w-full cursor-pointer flex-col gap-[3px] overflow-hidden rounded-[9px] border py-[9px] pr-2.5 pl-4 text-left font-sans transition-colors ${
        shift.conflict
          ? "border-danger/25 bg-danger/5 hover:border-danger/40"
          : "border-border bg-white hover:border-muted hover:bg-bg"
      }`}
      onClick={onClick}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${accentClassName}`} />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11.5px] font-semibold text-ink">
          {shift.time}
        </span>
        {shift.conflict && <AlertCircle size={13} className="text-danger" />}
      </div>
      {isOpen ? (
        <div className="text-[11px] text-[#C0BFBA]">Offen</div>
      ) : (
        <>
          <div className="truncate text-[12px] font-semibold text-ink">
            {shift.assignee}
          </div>
          <div className="truncate text-[10.5px] text-muted">
            {shift.location} {"\u00b7"} {shift.team}
          </div>
        </>
      )}
    </button>
  );
}

function ShiftDrawer({
  tenant,
  year,
  week,
  drawer,
  employees,
  locations,
  onClose,
}: {
  tenant: string;
  year: number;
  week: number;
  drawer: DrawerState | null;
  employees: ShiftEmployeeOption[];
  locations: ShiftLocationOption[];
  onClose: () => void;
}) {
  if (!drawer) {
    return null;
  }

  const shift = drawer.shift;
  const action = shift?.dbId ? updateShiftAction : createShiftAction;

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
        className="h-full w-full max-w-[560px] overflow-y-auto border-l border-border bg-white p-6 shadow-[-20px_0_70px_rgba(0,0,0,0.18)]"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] font-semibold text-muted">
              {drawer.day.weekday} {"\u00b7"} {drawer.day.date}
            </div>
            <h2
              id="shift-drawer-title"
              className="mt-1 font-display text-[22px] font-semibold leading-tight text-ink"
            >
              {shift ? "Schicht bearbeiten" : "Schicht hinzufuegen"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Drawer schliessen"
            title="Schliessen"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
            onClick={onClose}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        <form id="shift-drawer-form" action={action} className="flex flex-col gap-4">
          <input type="hidden" name="tenant" value={tenant} />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="week" value={week} />
          <input type="hidden" name="date" value={drawer.day.id} />
          {shift?.dbId && <input type="hidden" name="shiftId" value={shift.dbId} />}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="shift-start" className="label">
                Start
              </label>
              <input
                id="shift-start"
                name="startTime"
                type="time"
                className="input"
                defaultValue={shift?.startTime ?? "09:00"}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="shift-end" className="label">
                Ende
              </label>
              <input
                id="shift-end"
                name="endTime"
                type="time"
                className="input"
                defaultValue={shift?.endTime ?? "17:00"}
                required
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="shift-break" className="label">
                Pause Minuten
              </label>
              <input
                id="shift-break"
                name="breakMinutes"
                type="number"
                min="0"
                step="5"
                className="input"
                defaultValue={shift?.breakMinutes ?? 30}
              />
            </div>
            <div className="field">
              <label htmlFor="shift-team" className="label">
                Team
              </label>
              <input
                id="shift-team"
                name="team"
                className="input"
                defaultValue={shift?.team ?? ""}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="shift-employee" className="label">
              Mitarbeiter
            </label>
            <select
              id="shift-employee"
              name="employeeId"
              className="input cursor-pointer bg-bg"
              defaultValue={shift?.employeeId ?? ""}
            >
              <option value="">Offene Schicht</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} - {employee.location} - {employee.role}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="shift-location" className="label">
              Standort
            </label>
            <select
              id="shift-location"
              name="locationId"
              className="input cursor-pointer bg-bg"
              defaultValue={shift?.locationId ?? ""}
            >
              <option value="">Kein Standort</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} - {location.kind}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="shift-note" className="label">
              Notiz
            </label>
            <textarea
              id="shift-note"
              name="note"
              className="input min-h-24 resize-none"
              defaultValue={shift?.note ?? ""}
              placeholder="Uebergabe, Besonderheiten oder Bedarf"
            />
          </div>

          <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Abbrechen
            </button>
            {shift?.dbId && (
              <ConfirmSubmitButton
                className="btn btn-secondary text-danger"
                form="shift-drawer-form"
                formAction={deleteShiftAction}
                description="Diese Schicht wird dauerhaft aus dem Dienstplan entfernt."
              >
                Loeschen
              </ConfirmSubmitButton>
            )}
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

export default function ShiftPlanningClient({
  tenant,
  year,
  week,
  weekLabel,
  weekRange,
  conflictCount,
  days,
  employees,
  locations,
}: ShiftPlanningClientProps) {
  const router = useRouter();
  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  function navigateWeek(direction: -1 | 1) {
    const next = getAdjacentWeek(year, week, direction);

    router.push(`/u/${tenant}/schichtplanung?year=${next.year}&week=${next.week}`);
  }

  return (
    <>
      <div className="relative left-1/2 w-[calc(100vw-236px)] -translate-x-1/2 px-[clamp(24px,4vw,60px)] max-md:w-screen max-md:px-4">
        <PageHeader
          eyebrow="Dienstplan"
          title="Schichtplanung"
          subtitle={<span className="font-mono">{weekLabel} {"\u00b7"} {weekRange}</span>}
          className="mb-7"
        >
          <div className="inline-flex items-center gap-2 rounded-[10px] border border-danger/20 bg-danger/10 px-3.5 py-2.5">
            <span className="size-[7px] shrink-0 rounded-full bg-danger" />
            <span className="font-mono text-[12px] font-semibold text-danger">
              {conflictCount} Konflikte offen
            </span>
          </div>
          <ShiftSettingsDrawerButton />
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-white p-1">
            <button
              type="button"
              className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink"
              onClick={() => navigateWeek(-1)}
              aria-label="Vorherige Woche"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="min-w-[118px] rounded-lg px-3 py-2 text-center font-mono text-[12px] font-semibold text-ink">
              KW {week} {"\u00b7"} {year}
            </span>
            <button
              type="button"
              className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink"
              onClick={() => navigateWeek(1)}
              aria-label="Naechste Woche"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </PageHeader>

        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white px-4 py-3">
          <CalendarDays size={15} className="text-muted" />
          <span className="font-mono text-[11px] text-muted">Planung:</span>
          <span className="text-[12.5px] text-muted-2">
            {employees.length} Mitarbeiter {"\u00b7"} {locations.length} Standorte
          </span>
        </div>

        <section className="overflow-hidden rounded-card border border-border bg-white">
          <div className="overflow-x-auto">
            <div className="grid min-w-[900px] [grid-template-columns:repeat(7,minmax(150px,1fr))]">
              {days.map((day, index) => (
                <div
                  key={day.id}
                  className={`flex min-h-[calc(100svh-280px)] flex-col ${index > 0 ? "border-l border-border" : ""}`}
                >
                  <div
                    className={`border-b border-border px-2.5 py-3 text-center ${
                      day.isWeekend ? "bg-bg" : "bg-white"
                    }`}
                  >
                    <div
                      className={`font-mono text-[11px] font-semibold ${
                        day.isWeekend ? "text-ink" : "text-muted"
                      }`}
                    >
                      {day.weekday}
                    </div>
                    <div className="mt-0.5 font-mono text-[9px] text-[#B0B0AB]">
                      {day.date}
                    </div>
                  </div>
                  <div className="flex min-h-[130px] flex-1 flex-col gap-1.5 p-2">
                    {day.shifts.map((shift) => (
                      <ShiftCard
                        key={shift.dbId ?? shift.id}
                        shift={shift}
                        onClick={() => setDrawer({ day, shift })}
                      />
                    ))}
                    <button
                      type="button"
                      aria-label={`Schicht am ${day.weekday} hinzufuegen`}
                      title="Schicht hinzufuegen"
                      className="flex w-full cursor-pointer items-center justify-center rounded-[9px] border-[1.5px] border-dashed border-[#DEDAD4] bg-transparent p-[7px] text-[#C0BFBA] transition-colors hover:border-muted hover:text-muted-2"
                      onClick={() => setDrawer({ day })}
                    >
                      <Plus size={15} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <ShiftDrawer
        tenant={tenant}
        year={year}
        week={week}
        drawer={drawer}
        employees={employees}
        locations={locations}
        onClose={() => setDrawer(null)}
      />

    </>
  );
}
