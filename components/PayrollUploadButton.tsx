"use client";

import { useActionState } from "react";
import { uploadPayrollStatementAction } from "@/app/(dashboard)/u/[tenant]/employees/actions";
import FormSubmitButton from "@/components/FormSubmitButton";
import { FieldErrors, FormErrorBanner } from "@/components/FormFeedback";
import { useUniversalPopup } from "@/components/UniversalPopup";
import type { ActionState } from "@/lib/action-state";
import { Plus, Upload } from "lucide-react";

const initialState: ActionState = {};

function PayrollUploadForm({
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
  const [state, formAction] = useActionState(
    uploadPayrollStatementAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="employeeHandle" value={employeeHandle} />

      <div className="field">
        <label htmlFor="payroll-period" className="label">
          Zeitraum
        </label>
        <input
          id="payroll-period"
          name="period"
          className="input"
          placeholder="Januar 2026"
          required
        />
        <FieldErrors errors={state.fieldErrors?.period} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="payroll-gross" className="label">
            Brutto (optional)
          </label>
          <input id="payroll-gross" name="gross" className="input" placeholder="3.500,00 €" />
        </div>
        <div className="field">
          <label htmlFor="payroll-net" className="label">
            Netto (optional)
          </label>
          <input id="payroll-net" name="net" className="input" placeholder="2.310,00 €" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="payroll-file" className="label">
          PDF-Datei
        </label>
        <input
          id="payroll-file"
          name="file"
          type="file"
          accept="application/pdf"
          className="input"
          required
        />
        <FieldErrors errors={state.fieldErrors?.file} />
      </div>

      <FormErrorBanner message={state.error} />

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <FormSubmitButton Icon={Upload} pendingLabel="Wird hochgeladen...">
          Hochladen
        </FormSubmitButton>
      </div>
    </form>
  );
}

export default function PayrollUploadButton({
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
          title: "Gehaltsabrechnung hochladen",
          content: (
            <PayrollUploadForm
              tenant={tenant}
              employeeId={employeeId}
              employeeHandle={employeeHandle}
              onDone={closePopup}
            />
          ),
        })
      }
    >
      <Plus size={14} />
      Abrechnung hochladen
    </button>
  );
}
