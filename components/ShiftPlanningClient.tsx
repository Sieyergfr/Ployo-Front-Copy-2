"use client";

import {
  approveWishFreeRequestAction,
  createShiftAction,
  createWishFreeRequestAction,
  deleteShiftAction,
  rejectWishFreeRequestAction,
  updateShiftAction,
} from "@/app/(dashboard)/u/[tenant]/schichtplanung/actions";
import {
  ShiftSettingsDrawerButton,
  type ShiftPlanningSettings,
} from "@/components/ActionDrawers";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import DatePickerField from "@/components/DatePickerField";
import FormSubmitButton from "@/components/FormSubmitButton";
import PageHeader from "@/components/PageHeader";
import {
  type ShiftLocationOption,
  type ShiftEmployeeOption,
} from "@/lib/shift-service";
import { type Shift, type ShiftDay } from "@/lib/shifts";
import {
  type WishFreeFilter,
  type WishFreeRequest,
  type WishFreeRequestStatus,
} from "@/lib/wish-free";
import {
  AlertCircle,
  CalendarDays,
  CalendarX,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Save,
  Send,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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
  wishFreeRequests: WishFreeRequest[];
  shiftSettings: ShiftPlanningSettings;
};

type DrawerState = {
  day: ShiftDay;
  shift?: Shift;
};

const wishFreeStatusLabels: Record<WishFreeRequestStatus, string> = {
  open: "Offen",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
};

const wishFreeFilters: { label: string; value: WishFreeFilter }[] = [
  { label: "Offen", value: "open" },
  { label: "Genehmigt", value: "approved" },
  { label: "Abgelehnt", value: "rejected" },
  { label: "Alle", value: "all" },
];

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

function WishFreeBlock({
  requests,
  onRequestClick,
}: {
  requests: WishFreeRequest[];
  onRequestClick: (request: WishFreeRequest) => void;
}) {
  if (requests.length === 0) {
    return null;
  }

  return (
    <div
      className="rounded-[9px] border border-ink/10 px-3 py-2.5 text-left"
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(14,14,14,0.055) 0, rgba(14,14,14,0.055) 1px, #ffffff 1px, #ffffff 7px)",
      }}
    >
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
        Wunschfrei
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {requests.map((request) => (
          <button
            key={request.dbId}
            type="button"
            className="cursor-pointer rounded-md bg-white/80 px-1.5 py-0.5 text-left text-[12px] font-semibold leading-snug text-ink transition-colors hover:bg-border-soft"
            onClick={() => onRequestClick(request)}
          >
            {request.employeeName}
          </button>
        ))}
      </div>
    </div>
  );
}

function WishFreeDrawer({
  tenant,
  year,
  week,
  employees,
  requests,
  activeFilter,
  selectedRequestId,
  isCreating,
  onFilterChange,
  onSelectRequest,
  onCreateRequest,
  onClose,
}: {
  tenant: string;
  year: number;
  week: number;
  employees: ShiftEmployeeOption[];
  requests: WishFreeRequest[];
  activeFilter: WishFreeFilter;
  selectedRequestId: string | null;
  isCreating: boolean;
  onFilterChange: (filter: WishFreeFilter) => void;
  onSelectRequest: (requestId: string) => void;
  onCreateRequest: () => void;
  onClose: () => void;
}) {
  const filteredRequests =
    activeFilter === "all"
      ? requests
      : requests.filter((request) => request.status === activeFilter);
  const selectedRequest =
    requests.find((request) => request.id === selectedRequestId) ??
    filteredRequests[0] ??
    null;

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
        aria-labelledby="wishfree-drawer-title"
        className="shift-drawer-panel flex h-full w-full max-w-[620px] flex-col border-l border-border bg-white shadow-[-20px_0_70px_rgba(0,0,0,0.18)]"
      >
        <div className="border-b border-border px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] font-semibold text-muted">
                Anfragen
              </div>
              <h2
                id="wishfree-drawer-title"
                className="mt-1 font-display text-[22px] font-semibold leading-tight text-ink"
              >
                Wunschfrei
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className={`inline-flex cursor-pointer items-center gap-2 rounded-[9px] border px-3 py-2 text-[12px] font-semibold transition-colors ${
                  isCreating
                    ? "border-ink bg-ink text-white"
                    : "border-border bg-bg text-ink hover:border-muted"
                }`}
                onClick={onCreateRequest}
              >
                <Plus size={14} />
                Neue Anfrage
              </button>
              <button
                type="button"
                aria-label="Drawer schliessen"
                title="Schliessen"
                className="flex size-8 cursor-pointer items-center justify-center rounded-[9px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
                onClick={onClose}
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {wishFreeFilters.map((filter) => {
              const isActive = activeFilter === filter.value;
              const count =
                filter.value === "all"
                  ? requests.length
                  : requests.filter((request) => request.status === filter.value).length;

              return (
                <button
                  key={filter.value}
                  type="button"
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 font-mono text-[11px] font-semibold transition-colors ${
                    isActive
                      ? "border-ink bg-ink text-white"
                      : "border-border bg-bg text-muted-2 hover:border-muted hover:text-ink"
                  }`}
                  onClick={() => onFilterChange(filter.value)}
                >
                  {filter.label}
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      isActive ? "bg-white/15 text-white" : "bg-white text-muted"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,0.85fr)_minmax(280px,1fr)] max-md:grid-cols-1">
          <div className="min-h-0 overflow-y-auto border-r border-border bg-bg p-3 max-md:max-h-[42svh] max-md:border-r-0 max-md:border-b">
            {isCreating && (
              <button
                type="button"
                className="mb-2 w-full cursor-pointer rounded-xl border border-ink bg-white p-3 text-left"
                onClick={onCreateRequest}
              >
                <div className="text-[13px] font-semibold text-ink">
                  Neue Wunschfrei Anfrage
                </div>
                <div className="mt-1 font-mono text-[10px] text-muted">
                  Mitarbeiter und Datum auswaehlen
                </div>
              </button>
            )}
            {filteredRequests.length === 0 ? (
              <div className="rounded-xl border border-border bg-white px-4 py-6 text-center text-[12.5px] text-muted">
                Keine Anfragen in diesem Filter.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredRequests.map((request) => {
                  const isSelected = selectedRequest?.id === request.id;

                  return (
                    <button
                      key={request.id}
                      type="button"
                      className={`cursor-pointer rounded-xl border p-3 text-left transition-colors ${
                        isSelected
                          ? "border-ink bg-white"
                          : "border-border bg-white hover:border-muted"
                      }`}
                      onClick={() => onSelectRequest(request.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-ink">
                            {request.employeeName}
                          </div>
                          <div className="mt-1 font-mono text-[10px] text-muted">
                            {request.dateLabel}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-border-soft px-2 py-1 font-mono text-[9px] font-semibold text-muted-2">
                          {wishFreeStatusLabels[request.status]}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto p-6">
            {isCreating ? (
              <form className="flex min-h-full flex-col" action={createWishFreeRequestAction}>
                <input type="hidden" name="tenant" value={tenant} />
                <input type="hidden" name="year" value={year} />
                <input type="hidden" name="week" value={week} />

                <div className="flex-1">
                  <div>
                    <div className="font-mono text-[11px] font-semibold text-muted">
                      Neuer Antrag
                    </div>
                    <h3 className="mt-1 font-display text-[22px] font-semibold text-ink">
                      Wunschfrei anlegen
                    </h3>
                  </div>

                  <div className="field mt-6">
                    <label htmlFor="wishfree-employee" className="label">
                      Mitarbeiter
                    </label>
                    <select
                      id="wishfree-employee"
                      name="employeeId"
                      className="input cursor-pointer bg-bg"
                      required
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Mitarbeiter auswaehlen
                      </option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name} - {employee.location} - {employee.role}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field mt-4">
                    <div className="label">Datum</div>
                    <DatePickerField name="date" />
                  </div>

                  <div className="field mt-4">
                    <label htmlFor="wishfree-reason" className="label">
                      Begruendung
                    </label>
                    <textarea
                      id="wishfree-reason"
                      name="reason"
                      className="input min-h-28 resize-none"
                      placeholder="Optionaler Grund fuer den Wunschfrei Antrag"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-2.5 border-t border-border-soft pt-4">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onFilterChange(activeFilter)}
                  >
                    Abbrechen
                  </button>
                  <FormSubmitButton Icon={Send} pendingLabel="Wird erstellt...">
                    Antrag erstellen
                  </FormSubmitButton>
                </div>
              </form>
            ) : selectedRequest ? (
              <form
                key={selectedRequest.dbId}
                className="flex min-h-full flex-col"
              >
                <input type="hidden" name="tenant" value={tenant} />
                <input type="hidden" name="year" value={year} />
                <input type="hidden" name="week" value={week} />
                <input type="hidden" name="requestId" value={selectedRequest.dbId} />
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white">
                      {selectedRequest.employeeName
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-[20px] font-semibold text-ink">
                        {selectedRequest.employeeName}
                      </h3>
                      <p className="mt-0.5 truncate text-[12px] text-muted-2">
                        {selectedRequest.role} {"\u00b7"} {selectedRequest.location}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border bg-bg px-4 py-3">
                      <div className="label">Datum</div>
                      <div className="mt-1 font-mono text-[13px] font-semibold text-ink">
                        {selectedRequest.dateLabel}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-bg px-4 py-3">
                      <div className="label">Status</div>
                      <div className="mt-1 font-mono text-[13px] font-semibold text-ink">
                        {wishFreeStatusLabels[selectedRequest.status]}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-border bg-white px-4 py-3">
                    <div className="label">Begruendung</div>
                    <p className="mt-2 text-[13px] leading-6 text-muted-2">
                      {selectedRequest.reason}
                    </p>
                  </div>

                  <div className="field mt-4">
                    <label htmlFor="wishfree-reject-reason" className="label">
                      Grund bei Ablehnung optional
                    </label>
                    <textarea
                      id="wishfree-reject-reason"
                      name="rejectReason"
                      className="input min-h-24 resize-none"
                      defaultValue={selectedRequest.rejectReason ?? ""}
                      placeholder="Optionaler Hinweis fuer die Ablehnung"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-2.5 border-t border-border-soft pt-4">
                  <button
                    type="submit"
                    formAction={rejectWishFreeRequestAction}
                    className="btn btn-secondary text-danger"
                  >
                    Ablehnen
                  </button>
                  <FormSubmitButton
                    formAction={approveWishFreeRequestAction}
                    className="btn btn-primary"
                  >
                    <Check size={15} />
                    Annehmen
                  </FormSubmitButton>
                </div>
              </form>
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-muted">
                Keine Anfrage ausgewaehlt.
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function ShiftDrawer({
  tenant,
  year,
  week,
  drawer,
  employees,
  locations,
  presets,
  onClose,
}: {
  tenant: string;
  year: number;
  week: number;
  drawer: DrawerState | null;
  employees: ShiftEmployeeOption[];
  locations: ShiftLocationOption[];
  presets: ShiftPlanningSettings["presets"];
  onClose: () => void;
}) {
  if (!drawer) {
    return null;
  }

  const shift = drawer.shift;
  const action = shift?.dbId ? updateShiftAction : createShiftAction;

  /** Übernimmt eine gespeicherte Standardschicht in die Zeitfelder. */
  function applyPreset(preset: ShiftPlanningSettings["presets"][number]) {
    const form = document.getElementById("shift-drawer-form");

    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const start = form.elements.namedItem("startTime");
    const end = form.elements.namedItem("endTime");
    const breakMinutes = form.elements.namedItem("breakMinutes");

    if (start instanceof HTMLInputElement) start.value = preset.start;
    if (end instanceof HTMLInputElement) end.value = preset.end;
    if (breakMinutes instanceof HTMLInputElement) {
      breakMinutes.value = String(Number.parseInt(preset.pause, 10) || 0);
    }
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

          {presets.length > 0 && (
            <div className="field">
              <span className="label">Standardschichten</span>
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.label}
                    <span className="font-mono text-[10px] text-muted">
                      {preset.start}-{preset.end}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
            <FormSubmitButton
              Icon={Save}
              pendingLabel="Wird gespeichert..."
            >
              Speichern
            </FormSubmitButton>
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
  wishFreeRequests,
  shiftSettings,
}: ShiftPlanningClientProps) {
  const router = useRouter();
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [isWishFreeDrawerOpen, setIsWishFreeDrawerOpen] = useState(false);
  const [isCreatingWishFreeRequest, setIsCreatingWishFreeRequest] = useState(false);
  const [wishFreeFilter, setWishFreeFilter] = useState<WishFreeFilter>("open");
  const [selectedWishFreeRequestId, setSelectedWishFreeRequestId] = useState<
    string | null
  >(null);
  const openWishFreeCount = wishFreeRequests.filter(
    (request) => request.status === "open",
  ).length;
  const approvedWishFreeByDate = useMemo(() => {
    const grouped = new Map<string, WishFreeRequest[]>();

    wishFreeRequests
      .filter((request) => request.status === "approved")
      .forEach((request) => {
        const dayRequests = grouped.get(request.date) ?? [];

        dayRequests.push(request);
        grouped.set(request.date, dayRequests);
      });

    return grouped;
  }, [wishFreeRequests]);

  function navigateWeek(direction: -1 | 1) {
    const next = getAdjacentWeek(year, week, direction);

    router.push(`/u/${tenant}/schichtplanung?year=${next.year}&week=${next.week}`);
  }

  function openWishFreeDrawer() {
    setIsWishFreeDrawerOpen(true);
    setIsCreatingWishFreeRequest(false);
    setWishFreeFilter("open");
    setSelectedWishFreeRequestId(
      wishFreeRequests.find((request) => request.status === "open")?.id ?? null,
    );
  }

  function openWishFreeRequest(request: WishFreeRequest) {
    setIsCreatingWishFreeRequest(false);
    setWishFreeFilter(request.status);
    setSelectedWishFreeRequestId(request.id);
    setIsWishFreeDrawerOpen(true);
  }

  function openCreateWishFreeRequest() {
    setIsCreatingWishFreeRequest(true);
    setSelectedWishFreeRequestId(null);
    setIsWishFreeDrawerOpen(true);
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
          <ShiftSettingsDrawerButton
            tenant={tenant}
            year={year}
            week={week}
            settings={shiftSettings}
          />
          <button
            type="button"
            className="relative inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-white px-3.5 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:border-muted hover:bg-bg"
            onClick={openWishFreeDrawer}
          >
            <CalendarX size={15} />
            Wunschfrei
            {openWishFreeCount > 0 && (
              <span
                aria-label={`${openWishFreeCount} neue Wunschfrei Anfragen`}
                className="absolute -right-1.5 -top-1.5 size-3 rounded-full border-2 border-white bg-warning"
              />
            )}
          </button>
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
                    <WishFreeBlock
                      requests={approvedWishFreeByDate.get(day.id) ?? []}
                      onRequestClick={openWishFreeRequest}
                    />
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
        presets={shiftSettings.presets}
        onClose={() => setDrawer(null)}
      />

      {isWishFreeDrawerOpen && (
        <WishFreeDrawer
          tenant={tenant}
          year={year}
          week={week}
          employees={employees}
          requests={wishFreeRequests}
          activeFilter={wishFreeFilter}
          selectedRequestId={selectedWishFreeRequestId}
          isCreating={isCreatingWishFreeRequest}
          onFilterChange={(filter) => {
            setWishFreeFilter(filter);
            setIsCreatingWishFreeRequest(false);
            setSelectedWishFreeRequestId(null);
          }}
          onSelectRequest={(requestId) => {
            setIsCreatingWishFreeRequest(false);
            setSelectedWishFreeRequestId(requestId);
          }}
          onCreateRequest={openCreateWishFreeRequest}
          onClose={() => setIsWishFreeDrawerOpen(false)}
        />
      )}
    </>
  );
}
