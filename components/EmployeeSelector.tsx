"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";

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

export default function EmployeeSelector({
  label = "Mitarbeiter",
  name = "employees",
  mode = "single",
  defaultSelectedIds = [],
  options,
}: {
  label?: string;
  name?: string;
  mode?: EmployeeSelectorMode;
  defaultSelectedIds?: string[];
  options?: EmployeeSelectorOption[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(defaultSelectedIds);
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
      ? "Mitarbeiter auswählen"
      : mode === "single"
        ? selectedEmployees[0].name
        : `${selectedEmployees.length} Mitarbeiter ausgewählt`;

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

  return (
    <div
      className="field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <span className="label">{label}</span>
      {selectedIds.map((employeeId) => (
        <input key={employeeId} type="hidden" name={name} value={employeeId} />
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

      {isOpen && (
        <div
          role="listbox"
          aria-multiselectable={mode === "multi"}
          className="mt-1.5 rounded-[12px] border border-border bg-white p-2 shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
        >
          <div className="input-wrapper mb-2">
            <Search size={14} className="input-icon-left" />
            <input
              type="search"
              className="input input-with-icon-left bg-bg py-2.5 text-[12.5px]"
              placeholder="Name, Team oder Rolle"
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
                  onMouseDown={(event) => event.preventDefault()}
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
        </div>
      )}
    </div>
  );
}
