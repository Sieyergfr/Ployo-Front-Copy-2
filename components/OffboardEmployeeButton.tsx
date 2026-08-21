"use client";

import {
  offboardEmployeeAction,
  reactivateEmployeeAction,
} from "@/app/(dashboard)/u/[tenant]/employees/actions";
import DatePickerField from "@/components/DatePickerField";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useUniversalPopup } from "@/components/UniversalPopup";
import { LogOut, RotateCcw } from "lucide-react";

function OffboardForm({
  tenant,
  employeeId,
  employeeHandle,
  employeeName,
  onDone,
}: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  employeeName: string;
  onDone: () => void;
}) {
  return (
    <form className="flex flex-col gap-4" action={offboardEmployeeAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="employeeHandle" value={employeeHandle} />
      <div className="rounded-xl border border-border bg-bg p-3 text-[12.5px] text-muted-2">
        <span className="font-semibold text-ink">{employeeName}</span> wird als ausgeschieden
        markiert. Die Personalakte bleibt erhalten, zählt aber nicht mehr als aktive Belegschaft.
      </div>
      <div className="field">
        <label htmlFor="offboard-end-date" className="label">
          Austrittsdatum
        </label>
        <DatePickerField id="offboard-end-date" name="endDate" />
      </div>
      <div className="field">
        <label htmlFor="offboard-reason" className="label">
          Grund (optional)
        </label>
        <textarea
          id="offboard-reason"
          name="reason"
          className="input min-h-20 resize-none"
          placeholder="z. B. Eigenkündigung, Vertragsende"
        />
      </div>
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <FormSubmitButton
          Icon={LogOut}
          pendingLabel="Wird gespeichert..."
          className="btn btn-secondary text-danger"
        >
          Ausscheiden bestätigen
        </FormSubmitButton>
      </div>
    </form>
  );
}

export function OffboardEmployeeButton({
  tenant,
  employeeId,
  employeeHandle,
  employeeName,
}: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  employeeName: string;
}) {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm text-danger"
      onClick={() =>
        openPopup({
          title: "Mitarbeiter ausscheiden",
          content: (
            <OffboardForm
              tenant={tenant}
              employeeId={employeeId}
              employeeHandle={employeeHandle}
              employeeName={employeeName}
              onDone={closePopup}
            />
          ),
        })
      }
    >
      <LogOut size={14} />
      Ausscheiden
    </button>
  );
}

function ReactivateForm({
  tenant,
  employeeId,
  employeeHandle,
  onDone,
}: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  onDone: () => void;
}) {
  return (
    <form className="flex flex-col gap-4" action={reactivateEmployeeAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="employeeHandle" value={employeeHandle} />
      <p className="m-0 text-[13px] leading-[1.55] text-muted-2">
        Der Mitarbeiter wird wieder als aktiv geführt, das Austrittsdatum wird entfernt.
      </p>
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <FormSubmitButton Icon={RotateCcw} pendingLabel="Wird reaktiviert...">
          Reaktivieren
        </FormSubmitButton>
      </div>
    </form>
  );
}

export function ReactivateEmployeeButton({
  tenant,
  employeeId,
  employeeHandle,
}: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
}) {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={() =>
        openPopup({
          title: "Mitarbeiter reaktivieren",
          content: (
            <ReactivateForm
              tenant={tenant}
              employeeId={employeeId}
              employeeHandle={employeeHandle}
              onDone={closePopup}
            />
          ),
        })
      }
    >
      <RotateCcw size={14} />
      Reaktivieren
    </button>
  );
}
