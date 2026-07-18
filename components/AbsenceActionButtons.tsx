"use client";

import { createVacationRequestAction } from "@/app/(dashboard)/u/[tenant]/urlaub/actions";
import DatePickerField from "@/components/DatePickerField";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useUniversalPopup } from "@/components/UniversalPopup";
import { employees as sampleEmployees } from "@/lib/employees";
import { CalendarPlus, Plus, Stethoscope, Upload, X } from "lucide-react";
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
          Auswaehlen
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

function SicknessReportForm({ onDone }: { onDone: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const employees = sampleEmployees.map((employee) => ({
    id: employee.id,
    name: employee.name,
    location: employee.location,
  }));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setIsSubmitting(true);
        window.setTimeout(() => {
          setIsSubmitting(false);
          onDone();
        }, 350);
      }}
    >
      <div className="rounded-xl border border-border bg-bg p-3 text-[12.5px] leading-5 text-muted-2">
        Krankmeldung erfassen und optional direkt eine AU-Bescheinigung oder
        vorhandene Datei verknuepfen.
      </div>

      <EmployeeSelect employees={employees} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="sick-start" className="label">
            Krank seit
          </label>
          <DatePickerField id="sick-start" name="start" />
        </div>
        <div className="field">
          <label htmlFor="sick-end" className="label">
            Voraussichtlich bis
          </label>
          <DatePickerField id="sick-end" name="end" />
        </div>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" name="certificate" className="peer sr-only" />
        <span className="checkbox" />
        <span className="checkbox-label">
          Arbeitsunfaehigkeitsbescheinigung liegt vor
        </span>
      </label>
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

      <div className="rounded-xl border border-border bg-white p-3">
        <label
          htmlFor="sick-certificate-upload"
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-bg px-4 py-4 transition-colors hover:border-muted"
        >
          <Upload size={18} className="text-muted-2" />
          <span>
            <span className="block text-[13px] font-semibold text-ink">
              AU-Datei auswaehlen
            </span>
            <span className="mt-0.5 block text-[11.5px] text-muted">
              PDF, PNG oder JPG
            </span>
          </span>
        </label>
        <input
          id="sick-certificate-upload"
          name="certificateFile"
          type="file"
          accept=".pdf,image/png,image/jpeg"
          className="sr-only"
        />
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
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? (
            "Wird erfasst..."
          ) : (
            <>
              <Stethoscope size={15} />
              Krankmeldung erfassen
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function SicknessReportDrawer({
  isOpen,
  onClose,
}: {
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

        <SicknessReportForm onDone={onClose} />
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

export function SicknessReportButton() {
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
      <SicknessReportDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
