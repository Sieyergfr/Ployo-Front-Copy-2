"use client";

import { useActionState } from "react";
import { uploadPayrollStatementAction } from "@/app/(dashboard)/u/[tenant]/employees/actions";
import FormSubmitButton from "@/components/FormSubmitButton";
import { FieldErrors, FormErrorBanner } from "@/components/FormFeedback";
import { useUniversalPopup } from "@/components/UniversalPopup";
import type { ActionState } from "@/lib/action-state";
import { Plus, Upload } from "lucide-react";
import { useTranslations } from "next-intl";

const initialState: ActionState = {};

type T = ReturnType<typeof useTranslations>;

function PayrollUploadForm({
  tenant,
  employeeId,
  employeeHandle,
  onDone,
  t,
}: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  onDone: () => void;
  t: T;
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
          {t("periodLabel")}
        </label>
        <input
          id="payroll-period"
          name="period"
          className="input"
          placeholder={t("periodPlaceholder")}
          required
        />
        <FieldErrors errors={state.fieldErrors?.period} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="payroll-gross" className="label">
            {t("grossLabel")}
          </label>
          <input id="payroll-gross" name="gross" className="input" placeholder={t("grossPlaceholder")} />
        </div>
        <div className="field">
          <label htmlFor="payroll-net" className="label">
            {t("netLabel")}
          </label>
          <input id="payroll-net" name="net" className="input" placeholder={t("netPlaceholder")} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="payroll-file" className="label">
          {t("fileLabel")}
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
          {t("cancel")}
        </button>
        <FormSubmitButton Icon={Upload} pendingLabel={t("uploading")}>
          {t("upload")}
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
  const t = useTranslations("PayrollUploadButton");
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={() =>
        openPopup({
          title: t("uploadTitle"),
          content: (
            <PayrollUploadForm
              tenant={tenant}
              employeeId={employeeId}
              employeeHandle={employeeHandle}
              onDone={closePopup}
              t={t}
            />
          ),
        })
      }
    >
      <Plus size={14} />
      {t("uploadStatement")}
    </button>
  );
}
