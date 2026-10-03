"use client";

import { DataTableStatus } from "@/components/DataTable";
import { employeeStatusConfig, type Employee } from "@/lib/employees";
import { AlertTriangle, CalendarClock, Eye, FileText, Phone, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function EmployeeQuickView({
  employee,
  href,
}: {
  employee: Employee;
  href: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const status = employeeStatusConfig[employee.status];
  const primaryEmergency =
    employee.emergencyContacts.find((contact) => contact.isPrimary) ??
    employee.emergencyContacts[0];
  const t = useTranslations("EmployeeQuickView");

  // Esc schließt den Dialog nicht (QA-Bug BUG-021).
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
        title={t("title")}
        aria-label={t("openLabel", { name: employee.name })}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(true);
        }}
      >
        <Eye size={14} />
      </button>
      {isOpen && (
        <div
          className="action-drawer-backdrop fixed inset-0 z-[1000] flex justify-end bg-black/35 backdrop-blur-[4px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t("dialogLabel", { name: employee.name })}
            className="action-drawer-panel h-full w-full max-w-[460px] overflow-y-auto border-l border-border bg-white p-6 shadow-[-20px_0_70px_rgba(0,0,0,0.18)]"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-white">
                  {employee.initials}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-[24px] font-semibold leading-tight text-ink">
                    {employee.name}
                  </h2>
                  <div className="mt-1 text-[12px] text-muted">
                    {employee.role} · {employee.location}
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-label={t("closeLabel")}
                title={t("close")}
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
                onClick={() => setIsOpen(false)}
              >
                <X size={15} />
              </button>
            </div>

            <div className="grid gap-3">
              <div className="rounded-xl border border-border bg-bg p-4">
                <DataTableStatus label={status.label} tone={status.tone} />
                <div className="mt-3 grid grid-cols-1 gap-3 text-[12.5px] sm:grid-cols-2">
                  <div>
                    <div className="font-mono text-[9.5px] uppercase text-muted">
                      {t("employeeNumber")}
                    </div>
                    <div className="mt-1 font-mono text-ink">{employee.employeeNumber}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[9.5px] uppercase text-muted">
                      {t("startDate")}
                    </div>
                    <div className="mt-1 font-mono text-ink">{employee.startDate}</div>
                  </div>
                </div>
              </div>

              {primaryEmergency && (
                <div className="rounded-xl border border-danger/25 bg-danger/10 p-4">
                  <div className="mb-2 flex items-center gap-2 text-danger">
                    <AlertTriangle size={16} />
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em]">
                      {t("emergencyContact")}
                    </span>
                  </div>
                  <div className="text-[14px] font-semibold text-ink">
                    {primaryEmergency.name}
                  </div>
                  <div className="mt-1 text-[12px] text-muted">
                    {primaryEmergency.relation}
                  </div>
                  <div className="mt-3 flex items-center gap-2 font-mono text-[12px] text-danger">
                    <Phone size={14} />
                    {primaryEmergency.phone}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CalendarClock size={15} className="text-muted" />
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                    {t("upcomingShifts")}
                  </span>
                </div>
                {employee.shifts.length === 0 ? (
                  <p className="m-0 text-[12.5px] text-muted">{t("noUpcomingShifts")}</p>
                ) : (
                  employee.shifts.slice(0, 3).map((shift, index) => (
                    <div
                      key={`${shift.day}-${index}`}
                      className="flex items-center gap-3 border-t border-border-soft py-2 first:border-t-0 first:pt-0"
                    >
                      <span className="w-7 shrink-0 font-mono text-[11px] font-semibold text-ink">
                        {shift.day}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                        {shift.label}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted">
                        {shift.time}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-xl border border-border bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <FileText size={15} className="text-muted" />
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                    {t("recentDocuments")}
                  </span>
                </div>
                {employee.files.slice(0, 3).map((file) => (
                  <div key={file.name} className="border-t border-border-soft py-2">
                    <div className="truncate text-[12.5px] font-semibold text-ink">
                      {file.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted">
                      {file.updatedAt}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Link href={href} className="btn btn-primary mt-5 w-full justify-center">
              {t("openRecord")}
            </Link>
          </aside>
        </div>
      )}
    </>
  );
}
