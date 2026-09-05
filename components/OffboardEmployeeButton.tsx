"use client";

import {
  offboardEmployeeAction,
  reactivateEmployeeAction,
} from "@/app/(dashboard)/u/[tenant]/employees/actions";
import DatePickerField from "@/components/DatePickerField";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useActionStateWithToast } from "@/components/Toasts";
import { useUniversalPopup } from "@/components/UniversalPopup";
import { LogOut, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations>;

function OffboardForm({
  tenant,
  employeeId,
  employeeHandle,
  employeeName,
  onDone,
  t,
}: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  employeeName: string;
  onDone: () => void;
  t: T;
}) {
  const [, formAction] = useActionStateWithToast(offboardEmployeeAction);

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="employeeHandle" value={employeeHandle} />
      <div className="rounded-xl border border-border bg-bg p-3 text-[12.5px] text-muted-2">
        {t.rich("offboardNotice", {
          employeeName,
          bold: (chunks) => <span className="font-semibold text-ink">{chunks}</span>,
        })}
      </div>
      <div className="field">
        <label htmlFor="offboard-end-date" className="label">
          {t("endDateLabel")}
        </label>
        <DatePickerField id="offboard-end-date" name="endDate" />
      </div>
      <div className="field">
        <label htmlFor="offboard-reason" className="label">
          {t("reasonLabel")}
        </label>
        <textarea
          id="offboard-reason"
          name="reason"
          className="input min-h-20 resize-none"
          placeholder={t("reasonPlaceholder")}
        />
      </div>
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <FormSubmitButton
          Icon={LogOut}
          pendingLabel={t("saving")}
          className="btn btn-secondary text-danger"
        >
          {t("confirmOffboard")}
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
  const t = useTranslations("OffboardEmployeeButton");
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm text-danger"
      onClick={() =>
        openPopup({
          title: t("offboardTitle"),
          content: (
            <OffboardForm
              tenant={tenant}
              employeeId={employeeId}
              employeeHandle={employeeHandle}
              employeeName={employeeName}
              onDone={closePopup}
              t={t}
            />
          ),
        })
      }
    >
      <LogOut size={14} />
      {t("offboard")}
    </button>
  );
}

function ReactivateForm({
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
  const [, formAction] = useActionStateWithToast(reactivateEmployeeAction);

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="employeeHandle" value={employeeHandle} />
      <p className="m-0 text-[13px] leading-[1.55] text-muted-2">
        {t("reactivateNotice")}
      </p>
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <FormSubmitButton Icon={RotateCcw} pendingLabel={t("reactivating")}>
          {t("reactivate")}
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
  const t = useTranslations("OffboardEmployeeButton");
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={() =>
        openPopup({
          title: t("reactivateTitle"),
          content: (
            <ReactivateForm
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
      <RotateCcw size={14} />
      {t("reactivate")}
    </button>
  );
}
