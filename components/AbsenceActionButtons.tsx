"use client";

import { createVacationRequestAction } from "@/app/(dashboard)/u/[tenant]/urlaub/actions";
import { createSicknessReportAction } from "@/app/(dashboard)/u/[tenant]/krankheit/actions";
import DatePickerField from "@/components/DatePickerField";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useUniversalPopup } from "@/components/UniversalPopup";
import { CalendarPlus, Plus, Stethoscope, X } from "lucide-react";
import { useState } from "react";

type EmployeeOption = {
  id: string;
  name: string;
  location: string;
};

function todayInputValue() {
  const now = new Date();
  const offsetDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);

  return offsetDate.toISOString().slice(0, 10);
}

function EmployeeSelect({
  employees,
  name = "employee",
}: {
  employees: EmployeeOption[];
  name?: string;
}) {
  return (
    <div className="field">
      <label htmlFor="absence-employee" className="label">
        Mitarbeiter
      </label>
      <select
        id="absence-employee"
        name={name}
        className="input cursor-pointer bg-bg"
        defaultValue=""
        required
      >
        <option value="" disabled>
          Auswählen
        </option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name} - {employee.location}
          </option>
        ))}
      </select>
    </div>
  );
}

function VacationRequestForm({
  tenant,
  employees,
  onDone,
}: {
  tenant: string;
  employees: EmployeeOption[];
  onDone: () => void;
}) {
  const today = todayInputValue();

  return (
    <form className="flex flex-col gap-4" action={createVacationRequestAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <EmployeeSelect employees={employees} name="employeeId" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="vacation-start" className="label">
            Von
          </label>
          <DatePickerField id="vacation-start" name="startDate" min={today} />
        </div>
        <div className="field">
          <label htmlFor="vacation-end" className="label">
            Bis
          </label>
          <DatePickerField id="vacation-end" name="endDate" min={today} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="vacation-note" className="label">
          Notiz
        </label>
        <textarea
          id="vacation-note"
          name="note"
          className="input min-h-20 resize-none"
          placeholder="Optionaler Hinweis"
        />
      </div>
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <FormSubmitButton
          Icon={CalendarPlus}
          pendingLabel="Antrag wird erfasst..."
        >
          Antrag erfassen
        </FormSubmitButton>
      </div>
    </form>
  );
}

function SicknessReportForm({ tenant, employees, onDone }: { tenant: string; employees: EmployeeOption[]; onDone: () => void }) {
  return (
    <form className="flex flex-col gap-4" action={createSicknessReportAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <div className="rounded-xl border border-border bg-bg p-3 text-[12.5px] leading-5 text-muted-2">
        Krankmeldung erfassen und optional direkt eine AU-Bescheinigung oder
        vorhandene Datei verknuepfen.
      </div>

      <EmployeeSelect employees={employees} name="employeeId" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="sick-start" className="label">
            Krank seit
          </label>
          <DatePickerField id="sick-start" name="startDate" />
        </div>
        <div className="field">
          <label htmlFor="sick-end" className="label">
            Voraussichtlich bis
          </label>
          <DatePickerField id="sick-end" name="endDate" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="sick-certificate-status" className="label">
            Bescheinigung
          </label>
          <select
            id="sick-certificate-status"
            name="certificateStatus"
            className="input cursor-pointer bg-bg"
            defaultValue="pending"
          >
            <option value="pending">Wird nachgereicht</option>
            <option value="received">Liegt vor</option>
            <option value="not-required">Nicht erforderlich</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sick-report-channel" className="label">
            Meldeweg
          </label>
          <select
            id="sick-report-channel"
            name="reportChannel"
            className="input cursor-pointer bg-bg"
            defaultValue="phone"
          >
            <option value="phone">Telefonisch</option>
            <option value="email">E-Mail</option>
            <option value="app">Mitarbeiter-App</option>
            <option value="manager">Fuehrungskraft</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="sick-note" className="label">
          Notiz
        </label>
        <textarea
          id="sick-note"
          name="note"
          className="input min-h-24 resize-none"
          placeholder="Rueckmeldung, Vertretung oder Besonderheiten"
        />
      </div>
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <FormSubmitButton Icon={Stethoscope} pendingLabel="Wird erfasst...">Krankmeldung erfassen</FormSubmitButton>
      </div>
    </form>
  );
}

function SicknessReportDrawer({
  tenant,
  employees,
  isOpen,
  onClose,
}: {
  tenant: string;
  employees: EmployeeOption[];
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) {
    return null;
  }

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
        aria-labelledby="sickness-report-drawer-title"
        className="action-drawer-panel h-full w-full max-w-[560px] overflow-y-auto border-l border-border bg-white p-6 shadow-[-20px_0_70px_rgba(0,0,0,0.18)]"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] font-semibold text-muted">
              Abwesenheit
            </div>
            <h2
              id="sickness-report-drawer-title"
              className="mt-1 font-display text-[22px] font-semibold leading-tight text-ink"
            >
              Krankmeldung erfassen
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

        <SicknessReportForm tenant={tenant} employees={employees} onDone={onClose} />
      </aside>
    </div>
  );
}

export function VacationRequestButton({
  tenant,
  employees,
}: {
  tenant: string;
  employees: EmployeeOption[];
}) {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() =>
        openPopup({
          title: "Urlaubsantrag erfassen",
          content: (
            <VacationRequestForm
              tenant={tenant}
              employees={employees}
              onDone={closePopup}
            />
          ),
        })
      }
    >
      <Plus size={15} strokeWidth={2} />
      Antrag erfassen
    </button>
  );
}

export function SicknessReportButton({ tenant, employees }: { tenant: string; employees: EmployeeOption[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setIsOpen(true)}
      >
        <Plus size={15} strokeWidth={2} />
        Krankmeldung erfassen
      </button>
      <SicknessReportDrawer tenant={tenant} employees={employees} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
