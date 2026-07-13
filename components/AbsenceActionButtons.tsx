"use client";

import { createVacationRequestAction } from "@/app/(dashboard)/u/[tenant]/urlaub/actions";
import { useUniversalPopup } from "@/components/UniversalPopup";
import { employees as sampleEmployees } from "@/lib/employees";
import { CalendarPlus, Plus, Stethoscope } from "lucide-react";

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
          <input
            id="vacation-start"
            name="startDate"
            type="date"
            className="input"
            min={today}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="vacation-end" className="label">
            Bis
          </label>
          <input
            id="vacation-end"
            name="endDate"
            type="date"
            className="input"
            min={today}
            required
          />
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
        <button type="submit" className="btn btn-primary">
          <CalendarPlus size={15} />
          Antrag erfassen
        </button>
      </div>
    </form>
  );
}

function SicknessReportForm({ onDone }: { onDone: () => void }) {
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
        onDone();
      }}
    >
      <EmployeeSelect employees={employees} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="sick-start" className="label">
            Krank seit
          </label>
          <input id="sick-start" name="start" type="date" className="input" required />
        </div>
        <div className="field">
          <label htmlFor="sick-end" className="label">
            Voraussichtlich bis
          </label>
          <input id="sick-end" name="end" type="date" className="input" />
        </div>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" name="certificate" className="peer sr-only" />
        <span className="checkbox" />
        <span className="checkbox-label">
          Arbeitsunfaehigkeitsbescheinigung liegt vor
        </span>
      </label>
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary">
          <Stethoscope size={15} />
          Krankmeldung erfassen
        </button>
      </div>
    </form>
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
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() =>
        openPopup({
          title: "Krankmeldung erfassen",
          content: <SicknessReportForm onDone={closePopup} />,
        })
      }
    >
      <Plus size={15} strokeWidth={2} />
      Krankmeldung erfassen
    </button>
  );
}
