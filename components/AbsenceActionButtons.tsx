"use client";

import { useUniversalPopup } from "@/components/UniversalPopup";
import { employees } from "@/lib/employees";
import { CalendarPlus, Plus, Stethoscope } from "lucide-react";

function EmployeeSelect() {
  return (
    <div className="field">
      <label htmlFor="absence-employee" className="label">
        Mitarbeiter
      </label>
      <select
        id="absence-employee"
        name="employee"
        className="input cursor-pointer bg-bg"
        defaultValue=""
        required
      >
        <option value="" disabled>
          Auswählen
        </option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name} · {employee.location}
          </option>
        ))}
      </select>
    </div>
  );
}

function VacationRequestForm({ onDone }: { onDone: () => void }) {
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); onDone(); }}>
      <EmployeeSelect />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="vacation-start" className="label">Von</label>
          <input id="vacation-start" name="start" type="date" className="input" required />
        </div>
        <div className="field">
          <label htmlFor="vacation-end" className="label">Bis</label>
          <input id="vacation-end" name="end" type="date" className="input" required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="vacation-note" className="label">Notiz</label>
        <textarea id="vacation-note" name="note" className="input min-h-20 resize-none" placeholder="Optionaler Hinweis" />
      </div>
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>Abbrechen</button>
        <button type="submit" className="btn btn-primary"><CalendarPlus size={15} /> Antrag erfassen</button>
      </div>
    </form>
  );
}

function SicknessReportForm({ onDone }: { onDone: () => void }) {
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); onDone(); }}>
      <EmployeeSelect />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="sick-start" className="label">Krank seit</label>
          <input id="sick-start" name="start" type="date" className="input" required />
        </div>
        <div className="field">
          <label htmlFor="sick-end" className="label">Voraussichtlich bis</label>
          <input id="sick-end" name="end" type="date" className="input" />
        </div>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" name="certificate" className="peer sr-only" />
        <span className="checkbox" />
        <span className="checkbox-label">Arbeitsunfähigkeitsbescheinigung liegt vor</span>
      </label>
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>Abbrechen</button>
        <button type="submit" className="btn btn-primary"><Stethoscope size={15} /> Krankmeldung erfassen</button>
      </div>
    </form>
  );
}

export function VacationRequestButton() {
  const { openPopup, closePopup } = useUniversalPopup();
  return (
    <button type="button" className="btn btn-primary" onClick={() => openPopup({ title: "Urlaubsantrag erfassen", content: <VacationRequestForm onDone={closePopup} /> })}>
      <Plus size={15} strokeWidth={2} />
      Antrag erfassen
    </button>
  );
}

export function SicknessReportButton() {
  const { openPopup, closePopup } = useUniversalPopup();
  return (
    <button type="button" className="btn btn-primary" onClick={() => openPopup({ title: "Krankmeldung erfassen", content: <SicknessReportForm onDone={closePopup} /> })}>
      <Plus size={15} strokeWidth={2} />
      Krankmeldung erfassen
    </button>
  );
}
