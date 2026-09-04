"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type EmployeeSelectorMode = "single" | "multi";

export type EmployeeSelectorOption = {
  id: string;
  initials: string;
  name: string;
  employeeNumber: string;
  location: string;
  team: string;
  role: string;
};

type ListPosition = {
  /** Fixe Position von oben, nur relevant wenn `openUpward` false ist. */
  top: number;
  /** Fixe Position von unten (Abstand zum Viewport-Rand), nur relevant wenn `openUpward` true ist. */
  bottom: number;
  left: number;
  width: number;
  openUpward: boolean;
};

export default function EmployeeSelector({
  label,
  name = "employees",
  mode = "single",
  defaultSelectedIds = [],
  options,
  form,
}: {
  label?: string;
  name?: string;
  mode?: EmployeeSelectorMode;
  defaultSelectedIds?: string[];
  options?: EmployeeSelectorOption[];
  /** `form`-Attribut der versteckten Inputs — nötig, wenn dieser Selector außerhalb des eigentlichen `<form>`-Elements gerendert wird. */
  form?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [listPosition, setListPosition] = useState<ListPosition | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(defaultSelectedIds);
  const fieldRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("EmployeeSelector");
  const employeeOptions = useMemo(() => options ?? [], [options]);
  const selectedEmployees = employeeOptions.filter((employee) =>
    selectedIds.includes(employee.id),
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleEmployees = useMemo(
    () =>
      employeeOptions.filter((employee) =>
        [
          employee.name,
          employee.employeeNumber,
          employee.location,
          employee.team,
          employee.role,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      ),
    [employeeOptions, normalizedQuery],
  );
  const summary =
    selectedEmployees.length === 0
      ? t("placeholder")
      : mode === "single"
        ? selectedEmployees[0].name
        : t("selectedCount", { count: selectedEmployees.length });

  function toggleEmployee(employeeId: string) {
    setSelectedIds((current) => {
      if (mode === "single") {
        setIsOpen(false);
        return [employeeId];
      }

      return current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId];
    });
  }

  // Über ein Portal nach `document.body` gerendert (siehe unten): ein
  // `position: fixed` reicht dafür nicht mehr aus, die Position muss anhand
  // der tatsächlichen Bildschirmkoordinaten des Felds berechnet werden.
  useLayoutEffect(() => {
    if (!isOpen || !fieldRef.current || !listRef.current) {
      return;
    }

    const fieldRect = fieldRef.current.getBoundingClientRect();
    const listHeight = listRef.current.offsetHeight;
    const spaceBelow = window.innerHeight - fieldRect.bottom;
    const spaceAbove = fieldRect.top;
    const openUpward = spaceBelow < listHeight + 8 && spaceAbove > spaceBelow;

    setListPosition({
      top: fieldRect.bottom + 6,
      bottom: window.innerHeight - fieldRect.top + 6,
      left: fieldRect.left,
      width: fieldRect.width,
      openUpward,
    });
  }, [isOpen, visibleEmployees.length]);

  // Schließt das Dropdown bei Klick außerhalb — sowohl außerhalb des Felds
  // als auch außerhalb der (jetzt portalten) Liste, da beide nach dem
  // Portal-Wechsel nicht mehr im selben DOM-Teilbaum liegen und ein reiner
  // `onBlur`-Check auf das Feld die Liste fälschlich als "außerhalb" werten würde.
  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (fieldRef.current?.contains(target) || listRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  return (
    <div ref={fieldRef} className="field relative">
      <span className="label">{label ?? t("defaultLabel")}</span>
      {selectedIds.map((employeeId) => (
        <input key={employeeId} type="hidden" name={name} value={employeeId} form={form} />
      ))}
      <button
        type="button"
        className="input flex cursor-pointer items-center justify-between gap-3 bg-white text-left"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={selectedEmployees.length > 0 ? "truncate text-ink" : "text-muted"}>
          {summary}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            aria-multiselectable={mode === "multi"}
            style={
              {
                "--pos-left": `${listPosition?.left ?? 0}px`,
                "--pos-width": `${listPosition?.width ?? 0}px`,
                "--pos-top":
                  listPosition && !listPosition.openUpward ? `${listPosition.top}px` : "auto",
                "--pos-bottom":
                  listPosition?.openUpward ? `${listPosition.bottom}px` : "auto",
              } as CSSProperties
            }
            // Erste Messung, bevor `listPosition` berechnet ist: unsichtbar
            // rendern statt an Position (0,0) aufzublitzen.
            className={`fixed left-[var(--pos-left)] top-[var(--pos-top)] bottom-[var(--pos-bottom)] w-[var(--pos-width)] z-[1200] rounded-[12px] border border-border bg-white p-2 shadow-[0_12px_32px_rgba(0,0,0,0.12)] ${listPosition ? "visible" : "invisible"}`}
          >
            <div className="input-wrapper mb-2">
              <Search size={14} className="input-icon-left" />
              <input
                type="search"
                className="input input-with-icon-left bg-bg py-2.5 text-[12.5px]"
                placeholder={t("searchPlaceholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="grid max-h-[320px] gap-1.5 overflow-y-auto pr-1">
              {visibleEmployees.map((employee) => {
                const isSelected = selectedIds.includes(employee.id);

                return (
                  <button
                    key={employee.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-[10px] border p-2.5 text-left transition-colors ${
                      isSelected
                        ? "border-ink bg-bg"
                        : "border-border bg-white hover:border-muted"
                    }`}
                    onClick={() => toggleEmployee(employee.id)}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
                      {employee.initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">
                        {employee.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                        {employee.team} · {employee.role}
                      </span>
                    </span>
                    {mode === "multi" && (
                      <span
                        className={`flex size-5 shrink-0 items-center justify-center rounded-[6px] border ${
                          isSelected
                            ? "border-ink bg-ink text-white"
                            : "border-border bg-white text-transparent"
                        }`}
                      >
                        <Check size={13} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
