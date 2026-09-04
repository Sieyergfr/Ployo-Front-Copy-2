"use client";

import {
  applyShiftTemplateAction,
  approveWishFreeRequestAction,
  createShiftAction,
  createWishFreeRequestAction,
  deleteShiftAction,
  deleteShiftTemplateAction,
  publishShiftWeekAction,
  resetShiftWeekAction,
  rejectWishFreeRequestAction,
  saveShiftTemplateAction,
  unpublishShiftWeekAction,
  updateShiftAction,
  updateShiftTemplateAction,
} from "@/app/(dashboard)/u/[tenant]/schichtplanung/actions";
import {
  ShiftSettingsDrawerButton,
  type ShiftPlanningSettings,
} from "@/components/ActionDrawers";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import DatePickerField from "@/components/DatePickerField";
import FormSubmitButton from "@/components/FormSubmitButton";
import { ListSearchBox } from "@/components/ListSearchBox";
import PageHeader from "@/components/PageHeader";
import {
  type ShiftLocationOption,
  type ShiftEmployeeOption,
} from "@/lib/shift-service";
import { type Shift, type ShiftDay } from "@/lib/shifts";
import { calculateBreakMinutes } from "@/lib/shift-break-rule";
import { type ShiftTemplateEntry } from "@/lib/shift-templates";
import { openingHoursForWeekday, type OpeningHoursWeekday } from "@/lib/opening-hours";
import {
  type WishFreeFilter,
  type WishFreeRequest,
  type WishFreeRequestStatus,
} from "@/lib/wish-free";
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CalendarX,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Send,
  Undo2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations>;

type ShiftTemplateSummary = {
  id: string;
  name: string;
  entries: ShiftTemplateEntry[];
};

type ShiftPlanningClientProps = {
  tenant: string;
  year: number;
  week: number;
  weekLabel: string;
  weekRange: string;
  conflictCount: number;
  status: "draft" | "published";
  publishedAt: string | null;
  /** Veröffentlicht, seither aber bearbeitet — Mitarbeiter sehen diesen Stand noch nicht. */
  hasUnpublishedChanges?: boolean;
  days: ShiftDay[];
  employees: ShiftEmployeeOption[];
  locations: ShiftLocationOption[];
  wishFreeRequests: WishFreeRequest[];
  shiftSettings: ShiftPlanningSettings;
  templates: ShiftTemplateSummary[];
  canManage?: boolean;
  canDelete?: boolean;
  canManageSettings?: boolean;
};

type DrawerState = {
  day: ShiftDay;
  shift?: Shift;
};

function getWishFreeStatusLabels(t: T): Record<WishFreeRequestStatus, string> {
  return {
    open: t("wishFreeStatusOpen"),
    approved: t("wishFreeStatusApproved"),
    rejected: t("wishFreeStatusRejected"),
  };
}

function getWishFreeFilters(t: T): { label: string; value: WishFreeFilter }[] {
  return [
    { label: t("wishFreeStatusOpen"), value: "open" },
    { label: t("wishFreeStatusApproved"), value: "approved" },
    { label: t("wishFreeStatusRejected"), value: "rejected" },
    { label: t("wishFreeFilterAll"), value: "all" },
  ];
}

function getWeeksInISOYear(year: number) {
  const december28 = new Date(Date.UTC(year, 11, 28));
  const january4 = new Date(Date.UTC(year, 0, 4));
  const january4Day = january4.getUTCDay() || 7;
  const yearStart = new Date(january4);

  yearStart.setUTCDate(january4.getUTCDate() - january4Day + 1);

  return Math.floor((december28.getTime() - yearStart.getTime()) / 604800000) + 1;
}

function formatPublishedAt(iso: string) {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.toLocaleDateString("de-DE")} ${date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
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
  t,
}: {
  shift: Shift;
  onClick: () => void;
  t: T;
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
        <div className="text-[11px] text-[#C0BFBA]">{t("openShift")}</div>
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
  t,
}: {
  requests: WishFreeRequest[];
  onRequestClick: (request: WishFreeRequest) => void;
  t: T;
}) {
  if (requests.length === 0) {
    return null;
  }

  return (
    <div
      className="wish-free-stripes rounded-[9px] border border-ink/10 px-3 py-2.5 text-left"
    >
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
        {t("wishFree")}
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
  searchQuery,
  selectedRequestId,
  isCreating,
  onFilterChange,
  onSearchChange,
  onSelectRequest,
  onCreateRequest,
  onClose,
  canManage,
  t,
}: {
  tenant: string;
  year: number;
  week: number;
  employees: ShiftEmployeeOption[];
  requests: WishFreeRequest[];
  activeFilter: WishFreeFilter;
  searchQuery: string;
  selectedRequestId: string | null;
  isCreating: boolean;
  onFilterChange: (filter: WishFreeFilter) => void;
  onSearchChange: (query: string) => void;
  onSelectRequest: (requestId: string) => void;
  onCreateRequest: () => void;
  onClose: () => void;
  canManage: boolean;
  t: T;
}) {
  const wishFreeStatusLabels = getWishFreeStatusLabels(t);
  const wishFreeFilters = getWishFreeFilters(t);
  const statusFiltered =
    activeFilter === "all"
      ? requests
      : requests.filter((request) => request.status === activeFilter);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredRequests = normalizedQuery
    ? statusFiltered.filter((request) =>
        [request.employeeName, request.dateLabel]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : statusFiltered;
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
                {t("requestsEyebrow")}
              </div>
              <h2
                id="wishfree-drawer-title"
                className="mt-1 font-display text-[22px] font-semibold leading-tight text-ink"
              >
                {t("wishFree")}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canManage && (
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
                  {t("newRequest")}
                </button>
              )}
              <button
                type="button"
                aria-label={t("closeDrawer")}
                title={t("close")}
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

          <ListSearchBox
            value={searchQuery}
            onChange={onSearchChange}
            placeholder={t("searchPlaceholder")}
            className="mt-3"
          />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,0.85fr)_minmax(280px,1fr)] max-md:grid-cols-1">
          <div className="min-h-0 overflow-y-auto border-r border-border bg-bg p-3 max-md:max-h-[42svh] max-md:border-r-0 max-md:border-b">
            {isCreating && canManage && (
              <button
                type="button"
                className="mb-2 w-full cursor-pointer rounded-xl border border-ink bg-white p-3 text-left"
                onClick={onCreateRequest}
              >
                <div className="text-[13px] font-semibold text-ink">
                  {t("newWishFreeRequest")}
                </div>
                <div className="mt-1 font-mono text-[10px] text-muted">
                  {t("selectEmployeeAndDate")}
                </div>
              </button>
            )}
            {filteredRequests.length === 0 ? (
              <div className="rounded-xl border border-border bg-white px-4 py-6 text-center text-[12.5px] text-muted">
                {normalizedQuery ? t("noSearchResults") : t("noRequestsInFilter")}
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
                      {t("newApplication")}
                    </div>
                    <h3 className="mt-1 font-display text-[22px] font-semibold text-ink">
                      {t("createWishFree")}
                    </h3>
                  </div>

                  <div className="field mt-6">
                    <label htmlFor="wishfree-employee" className="label">
                      {t("employee")}
                    </label>
                    <select
                      id="wishfree-employee"
                      name="employeeId"
                      className="input cursor-pointer bg-bg"
                      required
                      defaultValue=""
                    >
                      <option value="" disabled>
                        {t("selectEmployee")}
                      </option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name} - {employee.location} - {employee.role}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field mt-4">
                    <div className="label">{t("date")}</div>
                    <DatePickerField name="date" />
                  </div>

                  <div className="field mt-4">
                    <label htmlFor="wishfree-reason" className="label">
                      {t("reason")}
                    </label>
                    <textarea
                      id="wishfree-reason"
                      name="reason"
                      className="input min-h-28 resize-none"
                      placeholder={t("reasonPlaceholder")}
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-2.5 border-t border-border-soft pt-4">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onFilterChange(activeFilter)}
                  >
                    {t("cancel")}
                  </button>
                  <FormSubmitButton Icon={Send} pendingLabel={t("creating")}>
                    {t("createRequest")}
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
                      <div className="label">{t("date")}</div>
                      <div className="mt-1 font-mono text-[13px] font-semibold text-ink">
                        {selectedRequest.dateLabel}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-bg px-4 py-3">
                      <div className="label">{t("status")}</div>
                      <div className="mt-1 font-mono text-[13px] font-semibold text-ink">
                        {wishFreeStatusLabels[selectedRequest.status]}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-border bg-white px-4 py-3">
                    <div className="label">{t("reason")}</div>
                    <p className="mt-2 text-[13px] leading-6 text-muted-2">
                      {selectedRequest.reason}
                    </p>
                  </div>

                  {canManage && (
                    <div className="field mt-4">
                      <label htmlFor="wishfree-reject-reason" className="label">
                        {t("rejectReasonOptional")}
                      </label>
                      <textarea
                        id="wishfree-reject-reason"
                        name="rejectReason"
                        className="input min-h-24 resize-none"
                        defaultValue={selectedRequest.rejectReason ?? ""}
                        placeholder={t("rejectReasonPlaceholder")}
                      />
                    </div>
                  )}
                </div>

                {canManage && (
                  <div className="mt-6 flex justify-end gap-2.5 border-t border-border-soft pt-4">
                    <button
                      type="submit"
                      formAction={rejectWishFreeRequestAction}
                      className="btn btn-secondary text-danger"
                    >
                      {t("reject")}
                    </button>
                    <FormSubmitButton
                      formAction={approveWishFreeRequestAction}
                      className="btn btn-primary"
                    >
                      <Check size={15} />
                      {t("accept")}
                    </FormSubmitButton>
                  </div>
                )}
              </form>
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-muted">
                {t("noRequestSelected")}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

/**
 * Ersetzt ein natives `<select>` für die Standort-Auswahl: ein natives
 * `<option>` kann keine farbige "Geschlossen"-Badge im Options-Text
 * darstellen, nur reinen Text (vorher: "(geschlossen am Mo)").
 */
function LocationPickerField({
  locations,
  weekday,
  defaultValue,
  t,
}: {
  locations: ShiftLocationOption[];
  weekday: OpeningHoursWeekday;
  defaultValue: string;
  t: T;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState(defaultValue);
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const options = useMemo(
    () =>
      locations.map((location) => ({
        id: location.id,
        label: `${location.name} - ${location.kind}`,
        closed: openingHoursForWeekday(location.openingHours, weekday).mode === "closed",
      })),
    [locations, weekday],
  );
  const selectedOption = options.find((option) => option.id === selected);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function updateDropdownRect() {
      const rect = triggerRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      setDropdownRect({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }

    updateDropdownRect();
    window.addEventListener("resize", updateDropdownRect);
    window.addEventListener("scroll", updateDropdownRect, true);

    return () => {
      window.removeEventListener("resize", updateDropdownRect);
      window.removeEventListener("scroll", updateDropdownRect, true);
    };
  }, [isOpen]);

  const dropdownId = "shift-location-dropdown";

  function choose(id: string) {
    setSelected(id);
    setIsOpen(false);
  }

  return (
    <div
      ref={wrapperRef}
      className="field"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;

        if (
          !event.currentTarget.contains(nextTarget) &&
          !document.getElementById(dropdownId)?.contains(nextTarget)
        ) {
          setIsOpen(false);
        }
      }}
    >
      <label className="label">{t("location")}</label>
      <input type="hidden" name="locationId" value={selected} />
      <button
        ref={triggerRef}
        type="button"
        className="input flex cursor-pointer items-center justify-between gap-3 bg-bg text-left"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{selectedOption ? selectedOption.label : t("noLocation")}</span>
          {selectedOption?.closed && (
            <span className="shrink-0 rounded-[6px] bg-danger/10 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.04em] text-danger">
              {t("closedBadge")}
            </span>
          )}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && dropdownRect && (
        <div
          id={dropdownId}
          role="listbox"
          className="fixed top-[var(--pos-top)] left-[var(--pos-left)] w-[var(--pos-width)] z-[1200] flex max-h-60 flex-col gap-1 overflow-y-auto rounded-[10px] border border-border bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
          style={
            {
              "--pos-top": `${dropdownRect.top}px`,
              "--pos-left": `${dropdownRect.left}px`,
              "--pos-width": `${dropdownRect.width}px`,
            } as CSSProperties
          }
        >
          <button
            type="button"
            role="option"
            aria-selected={selected === ""}
            className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
              selected === "" ? "bg-border-soft" : "hover:bg-bg"
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose("")}
          >
            <span className="text-[13px] font-medium text-ink">{t("noLocation")}</span>
            {selected === "" && <Check size={13} strokeWidth={3} className="shrink-0 text-ink" />}
          </button>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={selected === option.id}
              className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                selected === option.id ? "bg-border-soft" : "hover:bg-bg"
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option.id)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] font-medium text-ink">{option.label}</span>
                {option.closed && (
                  <span className="shrink-0 rounded-[6px] bg-danger/10 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.04em] text-danger">
                    {t("closedBadge")}
                  </span>
                )}
              </span>
              {selected === option.id && <Check size={13} strokeWidth={3} className="shrink-0 text-ink" />}
            </button>
          ))}
        </div>
      )}
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
  breakRule,
  onClose,
  canManage,
  canDelete,
  t,
}: {
  tenant: string;
  year: number;
  week: number;
  drawer: DrawerState | null;
  employees: ShiftEmployeeOption[];
  locations: ShiftLocationOption[];
  presets: ShiftPlanningSettings["presets"];
  breakRule: string;
  onClose: () => void;
  canManage: boolean;
  canDelete: boolean;
  t: T;
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

  /** Berechnet die Pause aus der Pausenregel des Mandanten neu, sobald sich Start/Ende ändern. */
  function applyBreakRule() {
    const form = document.getElementById("shift-drawer-form");

    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const start = form.elements.namedItem("startTime");
    const end = form.elements.namedItem("endTime");
    const breakMinutes = form.elements.namedItem("breakMinutes");

    if (
      start instanceof HTMLInputElement &&
      end instanceof HTMLInputElement &&
      breakMinutes instanceof HTMLInputElement &&
      start.value &&
      end.value
    ) {
      breakMinutes.value = String(
        calculateBreakMinutes(start.value, end.value, breakRule),
      );
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
              {shift ? t("editShift") : t("addShift")}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t("closeDrawer")}
            title={t("close")}
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

          <fieldset disabled={!canManage} className="flex flex-col gap-4 border-0 p-0">
          {presets.length > 0 && (
            <div className="field">
              <span className="label">{t("presetsLabel")}</span>
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
                {t("start")}
              </label>
              <input
                id="shift-start"
                name="startTime"
                type="time"
                className="input"
                defaultValue={shift?.startTime ?? "09:00"}
                onChange={applyBreakRule}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="shift-end" className="label">
                {t("end")}
              </label>
              <input
                id="shift-end"
                name="endTime"
                type="time"
                onChange={applyBreakRule}
                className="input"
                defaultValue={shift?.endTime ?? "17:00"}
                required
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="shift-break" className="label">
                {t("breakMinutes")}
              </label>
              <input
                id="shift-break"
                name="breakMinutes"
                type="number"
                min="0"
                step="1"
                className="input"
                defaultValue={shift?.breakMinutes ?? 30}
              />
            </div>
            <div className="field">
              <label htmlFor="shift-team" className="label">
                {t("team")}
              </label>
              <input
                id="shift-team"
                name="team"
                className="input"
                defaultValue={shift?.team ?? ""}
                placeholder={t("optional")}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="shift-employee" className="label">
              {t("employee")}
            </label>
            <select
              id="shift-employee"
              name="employeeId"
              className="input cursor-pointer bg-bg"
              defaultValue={shift?.employeeId ?? ""}
            >
              <option value="">{t("openShiftOption")}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} - {employee.location} - {employee.role}
                </option>
              ))}
            </select>
          </div>

          <LocationPickerField
            locations={locations}
            weekday={drawer.day.weekday as OpeningHoursWeekday}
            defaultValue={shift?.locationId ?? ""}
            t={t}
          />

          <div className="field">
            <label htmlFor="shift-note" className="label">
              {t("note")}
            </label>
            <textarea
              id="shift-note"
              name="note"
              className="input min-h-24 resize-none"
              defaultValue={shift?.note ?? ""}
              placeholder={t("notePlaceholder")}
            />
          </div>
          </fieldset>

          <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {canManage ? t("cancel") : t("closeShift")}
            </button>
            {canDelete && shift?.dbId && (
              <ConfirmSubmitButton
                className="btn btn-secondary text-danger"
                form="shift-drawer-form"
                formAction={deleteShiftAction}
                description={t("deleteShiftConfirmDescription")}
              >
                {t("delete")}
              </ConfirmSubmitButton>
            )}
            {canManage && (
              <FormSubmitButton
                Icon={Save}
                pendingLabel={t("saving")}
              >
                {t("save")}
              </FormSubmitButton>
            )}
          </div>
        </form>
      </aside>
    </div>
  );
}

const templateWeekdayOptions = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

function TemplateEntryRow({
  index,
  entry,
  locations,
  onRemove,
  t,
}: {
  index: number;
  entry: ShiftTemplateEntry;
  locations: ShiftLocationOption[];
  onRemove: () => void;
  t: T;
}) {
  return (
    <div className="grid grid-cols-2 items-end gap-2 rounded-xl border border-border-soft bg-bg p-2.5 sm:grid-cols-3 lg:grid-cols-[minmax(0,90px)_repeat(2,minmax(0,90px))_minmax(0,80px)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <div className="field">
        <label className="label" htmlFor={`entry-weekday-${index}`}>
          {t("day")}
        </label>
        <select
          id={`entry-weekday-${index}`}
          name="entryWeekday"
          className="input cursor-pointer bg-white text-[12px]"
          defaultValue={entry.weekday}
        >
          {templateWeekdayOptions.map((weekday) => (
            <option key={weekday} value={weekday}>
              {weekday}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor={`entry-start-${index}`}>
          {t("from")}
        </label>
        <input
          id={`entry-start-${index}`}
          type="time"
          name="entryStartTime"
          className="input text-[12px]"
          defaultValue={entry.startTime}
          required
        />
      </div>
      <div className="field">
        <label className="label" htmlFor={`entry-end-${index}`}>
          {t("to")}
        </label>
        <input
          id={`entry-end-${index}`}
          type="time"
          name="entryEndTime"
          className="input text-[12px]"
          defaultValue={entry.endTime}
          required
        />
      </div>
      <div className="field">
        <label className="label" htmlFor={`entry-break-${index}`}>
          {t("breakLabel")}
        </label>
        <input
          id={`entry-break-${index}`}
          type="number"
          min={0}
          name="entryBreakMinutes"
          className="input text-[12px]"
          defaultValue={entry.breakMinutes}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor={`entry-team-${index}`}>
          {t("team")}
        </label>
        <input
          id={`entry-team-${index}`}
          type="text"
          name="entryTeam"
          className="input text-[12px]"
          defaultValue={entry.team}
          placeholder={t("optional")}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor={`entry-location-${index}`}>
          {t("location")}
        </label>
        <select
          id={`entry-location-${index}`}
          name="entryLocationId"
          className="input cursor-pointer bg-white text-[12px]"
          defaultValue={entry.locationId}
        >
          <option value="">{t("noLocation")}</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        aria-label={t("removeEntryAria")}
        title={t("removeEntryAria")}
        className="col-span-2 flex size-8 cursor-pointer items-center justify-center justify-self-end rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger sm:col-span-3 lg:col-span-1 lg:justify-self-auto"
        onClick={onRemove}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function TemplateEditDrawer({
  tenant,
  year,
  week,
  template,
  locations,
  onClose,
  t,
}: {
  tenant: string;
  year: number;
  week: number;
  template: ShiftTemplateSummary | null;
  locations: ShiftLocationOption[];
  onClose: () => void;
  t: T;
}) {
  const [rows, setRows] = useState<Array<ShiftTemplateEntry & { key: number }>>(
    () => (template?.entries ?? []).map((entry, index) => ({ ...entry, key: index })),
  );
  const nextKeyRef = useRef(rows.length);

  if (!template) {
    return null;
  }

  function addRow() {
    nextKeyRef.current += 1;
    setRows((current) => [
      ...current,
      {
        key: nextKeyRef.current,
        weekday: "Mo",
        startTime: "09:00",
        endTime: "17:00",
        breakMinutes: 30,
        team: "",
        locationId: "",
      },
    ]);
  }

  function removeRow(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
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
        aria-labelledby="template-drawer-title"
        className="h-full w-full max-w-[720px] overflow-y-auto border-l border-border bg-white p-6 shadow-[-20px_0_70px_rgba(0,0,0,0.18)]"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2
            id="template-drawer-title"
            className="font-display text-[22px] font-semibold leading-tight text-ink"
          >
            {t("editTemplate")}
          </h2>
          <button
            type="button"
            aria-label={t("closeShift")}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-bg"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <form
          id="template-edit-form"
          action={updateShiftTemplateAction}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="tenant" value={tenant} />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="week" value={week} />
          <input type="hidden" name="templateId" value={template.id} />

          <div className="field">
            <label className="label" htmlFor="template-edit-name">
              {t("templateNameLabel")}
            </label>
            <input
              id="template-edit-name"
              type="text"
              name="templateName"
              className="input"
              defaultValue={template.name}
              required
            />
          </div>

          <div className="flex flex-col gap-2.5">
            {rows.map((row, index) => (
              <TemplateEntryRow
                key={row.key}
                index={index}
                entry={row}
                locations={locations}
                onRemove={() => removeRow(row.key)}
                t={t}
              />
            ))}
            {rows.length === 0 && (
              <p className="text-[12.5px] text-muted">
                {t("noEntriesInTemplate")}
              </p>
            )}
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm w-fit"
            onClick={addRow}
          >
            <Plus size={14} />
            {t("addShift")}
          </button>

          <div className="mt-2 flex justify-end gap-2.5 border-t border-border-soft pt-4">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t("cancel")}
            </button>
            <FormSubmitButton Icon={Save} pendingLabel={t("saving")}>
              {t("save")}
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
  status,
  publishedAt,
  hasUnpublishedChanges = false,
  days,
  employees,
  locations,
  wishFreeRequests,
  shiftSettings,
  templates,
  canManage = true,
  canDelete = canManage,
  canManageSettings = true,
}: ShiftPlanningClientProps) {
  const t = useTranslations("ShiftPlanningClient");
  const router = useRouter();
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplateSummary | null>(null);
  const [isWishFreeDrawerOpen, setIsWishFreeDrawerOpen] = useState(false);
  const [isCreatingWishFreeRequest, setIsCreatingWishFreeRequest] = useState(false);
  const [wishFreeFilter, setWishFreeFilter] = useState<WishFreeFilter>("open");
  const [wishFreeSearch, setWishFreeSearch] = useState("");
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
    setWishFreeSearch("");
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

  // Ein Tag wird zweimal gerendert: als Spalte im Querscroll-Wochenraster
  // (`md:`+) und als eigener Abschnitt in der gestapelten Tagesansicht
  // (unterhalb `md:`) — gleicher Inhalt, damit beide Ansichten nie
  // auseinanderlaufen. `isFirst` steuert nur den Trenner (links bei Spalten,
  // oben bei gestapelten Abschnitten).
  function renderShiftDay(day: ShiftDay, isFirst: boolean) {
    return (
      <div
        key={day.id}
        className={`flex flex-col md:min-h-[calc(100svh-280px)] ${
          isFirst ? "" : "border-t border-border md:border-t-0 md:border-l"
        }`}
      >
        <div
          className={`border-b border-border px-2.5 py-3 text-center ${
            day.understaffed
              ? "bg-danger/10"
              : day.isWeekend
                ? "bg-bg"
                : "bg-white"
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
          {day.understaffed && (
            <div
              className="mt-1 flex items-center justify-center gap-1 font-mono text-[9px] font-semibold text-danger"
              title={t("understaffedTitle", {
                staffed: day.staffedCount ?? 0,
                min: shiftSettings.minStaffing,
              })}
            >
              <AlertTriangle size={10} />
              {day.staffedCount ?? 0}/{shiftSettings.minStaffing}
            </div>
          )}
        </div>
        <div className="flex min-h-[130px] flex-1 flex-col gap-1.5 p-2">
          <WishFreeBlock
            requests={approvedWishFreeByDate.get(day.id) ?? []}
            onRequestClick={openWishFreeRequest}
            t={t}
          />
          {day.shifts.map((shift) => (
            <ShiftCard
              key={shift.dbId ?? shift.id}
              shift={shift}
              onClick={() => setDrawer({ day, shift })}
              t={t}
            />
          ))}
          {canManage && (
            <button
              type="button"
              aria-label={t("addShiftAria", { weekday: day.weekday })}
              title={t("addShift")}
              className="flex w-full cursor-pointer items-center justify-center rounded-[9px] border-[1.5px] border-dashed border-[#DEDAD4] bg-transparent p-[7px] text-[#C0BFBA] transition-colors hover:border-muted hover:text-muted-2"
              onClick={() => setDrawer({ day })}
            >
              <Plus size={15} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative left-1/2 w-[calc(100vw-236px)] -translate-x-1/2 px-[clamp(24px,4vw,60px)] max-md:w-screen max-md:px-4">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("pageTitle")}
          subtitle={<span className="font-mono">{weekLabel} {"\u00b7"} {weekRange}</span>}
          className="mb-7"
        >
          {/* Veröffentlicht, aber seither bearbeitet: die Badge zeigt bewusst
              wieder "Entwurf" — der aktuelle Stand ist für Mitarbeiter noch
              nicht sichtbar (sie sehen den Schnappschuss der letzten
              Veröffentlichung). */}
          {status === "published" && !hasUnpublishedChanges ? (
            <div className="inline-flex items-center gap-2 rounded-[10px] border border-success/20 bg-success/10 px-3.5 py-2.5">
              <span className="size-[7px] shrink-0 rounded-full bg-success" />
              <span className="font-mono text-[12px] font-semibold text-success">
                {t("published")}{publishedAt ? ` · ${formatPublishedAt(publishedAt)}` : ""}
              </span>
            </div>
          ) : status === "published" ? (
            <div className="inline-flex items-center gap-2 rounded-[10px] border border-warning/25 bg-warning/10 px-3.5 py-2.5">
              <span className="size-[7px] shrink-0 rounded-full bg-warning" />
              <span className="font-mono text-[12px] font-semibold text-[#7A4E00]">
                {t("draftUnpublishedChanges")}
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-bg px-3.5 py-2.5">
              <span className="size-[7px] shrink-0 rounded-full bg-muted" />
              <span className="font-mono text-[12px] font-semibold text-muted-2">
                {t("draft")}
              </span>
            </div>
          )}
          {canManage && (
            <form action={publishShiftWeekAction}>
              <input type="hidden" name="tenant" value={tenant} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="week" value={week} />
              <FormSubmitButton
                Icon={Send}
                pendingLabel={t("publishing")}
                className="btn btn-secondary"
              >
                {status === "published" ? t("publishAgain") : t("publish")}
              </FormSubmitButton>
            </form>
          )}
          {canManage && status === "published" && hasUnpublishedChanges && (
            <form id="shift-week-reset-form" action={resetShiftWeekAction}>
              <input type="hidden" name="tenant" value={tenant} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="week" value={week} />
              <ConfirmSubmitButton
                form="shift-week-reset-form"
                className="btn btn-secondary"
                title={t("discardChangesTitle")}
                confirmLabel={t("resetLabel")}
                description={t("resetConfirmDescription")}
              >
                <Undo2 size={15} />
                {t("resetToPublished")}
              </ConfirmSubmitButton>
            </form>
          )}
          {canManage && status === "published" && (
            <form action={unpublishShiftWeekAction}>
              <input type="hidden" name="tenant" value={tenant} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="week" value={week} />
              <FormSubmitButton
                Icon={RotateCcw}
                pendingLabel={t("unpublishing")}
                className="btn btn-secondary"
              >
                {t("backToDraft")}
              </FormSubmitButton>
            </form>
          )}
          <div className="inline-flex items-center gap-2 rounded-[10px] border border-danger/20 bg-danger/10 px-3.5 py-2.5">
            <span className="size-[7px] shrink-0 rounded-full bg-danger" />
            <span className="font-mono text-[12px] font-semibold text-danger">
              {t("conflictsOpenCount", { count: conflictCount })}
            </span>
          </div>
          <ShiftSettingsDrawerButton
            tenant={tenant}
            year={year}
            week={week}
            settings={shiftSettings}
            canManage={canManageSettings}
          />
          <button
            type="button"
            className="relative inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-white px-3.5 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:border-muted hover:bg-bg"
            onClick={openWishFreeDrawer}
          >
            <CalendarX size={15} />
            {t("wishFree")}
            {openWishFreeCount > 0 && (
              <span
                aria-label={t("openWishFreeRequestsAria", { count: openWishFreeCount })}
                className="absolute -right-1.5 -top-1.5 size-3 rounded-full border-2 border-white bg-warning"
              />
            )}
          </button>
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-white p-1">
            <button
              type="button"
              className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink"
              onClick={() => navigateWeek(-1)}
              aria-label={t("previousWeek")}
            >
              <ChevronLeft size={15} />
            </button>
            <span className="min-w-[118px] rounded-lg px-3 py-2 text-center font-mono text-[12px] font-semibold text-ink">
              {t("weekLabel", { week, year })}
            </span>
            <button
              type="button"
              className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink"
              onClick={() => navigateWeek(1)}
              aria-label={t("nextWeek")}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </PageHeader>

        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white px-4 py-3">
          <CalendarDays size={15} className="text-muted" />
          <span className="font-mono text-[11px] text-muted">{t("planningLabel")}</span>
          <span className="text-[12.5px] text-muted-2">
            {t("planningSummary", { employeeCount: employees.length, locationCount: locations.length })}
          </span>
        </div>

        {canManage && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white px-4 py-3">
          <span className="font-mono text-[11px] text-muted">{t("weekTemplatesLabel")}</span>

          {templates.length > 0 ? (
            <form action={applyShiftTemplateAction} className="flex items-center gap-2">
              <input type="hidden" name="tenant" value={tenant} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="week" value={week} />
              <select
                name="templateId"
                className="input input-mono cursor-pointer bg-white text-[12px]"
                defaultValue=""
                required
              >
                <option value="" disabled>
                  {t("selectTemplate")}
                </option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.entries.length})
                  </option>
                ))}
              </select>
              <FormSubmitButton className="btn btn-secondary btn-sm" pendingLabel={t("applying")}>
                {t("applyToThisWeek")}
              </FormSubmitButton>
            </form>
          ) : (
            <span className="text-[12px] text-muted-2">{t("noTemplatesSaved")}</span>
          )}

          <form action={saveShiftTemplateAction} className="ml-auto flex items-center gap-2">
            <input type="hidden" name="tenant" value={tenant} />
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="week" value={week} />
            <input
              type="text"
              name="templateName"
              placeholder={t("templateNameLabel")}
              className="input text-[12px]"
              required
            />
            <FormSubmitButton
              Icon={Save}
              className="btn btn-secondary btn-sm"
              pendingLabel={t("saving")}
            >
              {t("saveAsTemplate")}
            </FormSubmitButton>
          </form>

          {templates.length > 0 && (
            <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-border-soft pt-2.5">
              {templates.map((template) => (
                <span
                  key={template.id}
                  className="flex items-center gap-1 rounded-[7px] bg-border-soft py-0.5 pr-1 pl-2"
                >
                  <span className="font-mono text-[10px] text-muted-2">
                    {template.name} ({template.entries.length})
                  </span>
                  <button
                    type="button"
                    aria-label={t("editTemplateAria", { name: template.name })}
                    title={t("editTemplate")}
                    className="flex size-5 cursor-pointer items-center justify-center rounded-[5px] text-muted transition-colors hover:bg-bg hover:text-ink"
                    onClick={() => setEditingTemplate(template)}
                  >
                    <Pencil size={10} />
                  </button>
                  {canDelete && (
                    <form action={deleteShiftTemplateAction}>
                      <input type="hidden" name="tenant" value={tenant} />
                      <input type="hidden" name="templateId" value={template.id} />
                      <button
                        type="submit"
                        aria-label={t("deleteTemplateAria", { name: template.name })}
                        title={t("deleteTemplateTitle")}
                        className="flex size-5 cursor-pointer items-center justify-center rounded-[5px] text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <X size={11} />
                      </button>
                    </form>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        )}

        <section className="overflow-hidden rounded-card border border-border bg-white">
          <div className="hidden overflow-x-auto md:block">
            <div className="grid min-w-[900px] [grid-template-columns:repeat(7,minmax(150px,1fr))]">
              {days.map((day, index) => renderShiftDay(day, index === 0))}
            </div>
          </div>
          <div className="flex flex-col md:hidden">
            {days.map((day, index) => renderShiftDay(day, index === 0))}
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
        breakRule={shiftSettings.breakRule}
        onClose={() => setDrawer(null)}
        canManage={canManage}
        canDelete={canDelete}
        t={t}
      />

      <TemplateEditDrawer
        key={editingTemplate?.id ?? "none"}
        tenant={tenant}
        year={year}
        week={week}
        template={editingTemplate}
        locations={locations}
        onClose={() => setEditingTemplate(null)}
        t={t}
      />

      {isWishFreeDrawerOpen && (
        <WishFreeDrawer
          tenant={tenant}
          year={year}
          week={week}
          employees={employees}
          requests={wishFreeRequests}
          canManage={canManage}
          activeFilter={wishFreeFilter}
          searchQuery={wishFreeSearch}
          selectedRequestId={selectedWishFreeRequestId}
          isCreating={isCreatingWishFreeRequest}
          onFilterChange={(filter) => {
            setWishFreeFilter(filter);
            setIsCreatingWishFreeRequest(false);
            setSelectedWishFreeRequestId(null);
          }}
          onSearchChange={setWishFreeSearch}
          onSelectRequest={(requestId) => {
            setIsCreatingWishFreeRequest(false);
            setSelectedWishFreeRequestId(requestId);
          }}
          onCreateRequest={openCreateWishFreeRequest}
          onClose={() => setIsWishFreeDrawerOpen(false)}
          t={t}
        />
      )}
    </>
  );
}
