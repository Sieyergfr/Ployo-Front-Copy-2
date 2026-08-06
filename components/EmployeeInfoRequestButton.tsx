"use client";

import { createEmployeeInfoRequestAction } from "@/app/(dashboard)/u/[tenant]/employees/actions";
import DatePickerField from "@/components/DatePickerField";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useUniversalPopup } from "@/components/UniversalPopup";
import { MessageSquarePlus, Send } from "lucide-react";

function InfoRequestForm({
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
    <form className="flex flex-col gap-4" action={createEmployeeInfoRequestAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="employeeHandle" value={employeeHandle} />
      <div className="rounded-xl border border-border bg-bg p-3 text-[12.5px] text-muted-2">
        Anfrage an <span className="font-semibold text-ink">{employeeName}</span>.
        Die Anfrage wird in der Personalakte dokumentiert. Eine automatische
        Benachrichtigung an den Mitarbeiter erfolgt noch nicht.
      </div>
      <div className="field">
        <label htmlFor="info-request-title" className="label">
          Benoetigte Information
        </label>
        <input
          id="info-request-title"
          name="title"
          className="input"
          placeholder="z. B. neue Adresse, Zertifikat, Bankdaten"
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="info-request-due" className="label">
            Frist
          </label>
          <DatePickerField id="info-request-due" name="dueAt" />
        </div>
        <label className="checkbox-row mt-6">
          <input type="checkbox" name="fileRequested" className="peer sr-only" />
          <span className="checkbox" />
          <span className="checkbox-label">Datei gewuenscht</span>
        </label>
      </div>
      <div className="field">
        <label htmlFor="info-request-message" className="label">
          Nachricht
        </label>
        <textarea
          id="info-request-message"
          name="message"
          className="input min-h-28 resize-none"
          placeholder="Kurz erklaeren, was hochgeladen oder bestaetigt werden soll"
        />
      </div>
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <FormSubmitButton Icon={Send} pendingLabel="Wird gespeichert...">
          Anfrage speichern
        </FormSubmitButton>
      </div>
    </form>
  );
}

export default function EmployeeInfoRequestButton({
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
      className="btn btn-primary btn-sm"
      onClick={() =>
        openPopup({
          title: "Info anfragen",
          content: (
            <InfoRequestForm
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
      <MessageSquarePlus size={14} />
      Info anfragen
    </button>
  );
}
