"use client";

import { createEmployeeInfoRequestAction } from "@/app/(dashboard)/u/[tenant]/employees/actions";
import DatePickerField from "@/components/DatePickerField";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useUniversalPopup } from "@/components/UniversalPopup";
import { MessageSquarePlus, Send } from "lucide-react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("EmployeeInfoRequestButton");

  return (
    <form className="flex flex-col gap-4" action={createEmployeeInfoRequestAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="employeeHandle" value={employeeHandle} />
      <div className="rounded-xl border border-border bg-bg p-3 text-[12.5px] text-muted-2">
        {t.rich("requestTo", {
          name: employeeName,
          b: (chunks) => <span className="font-semibold text-ink">{chunks}</span>,
        })}
      </div>
      <div className="field">
        <label htmlFor="info-request-title" className="label">
          {t("titleLabel")}
        </label>
        <input
          id="info-request-title"
          name="title"
          className="input"
          placeholder={t("titlePlaceholder")}
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="info-request-due" className="label">
            {t("dueDate")}
          </label>
          <DatePickerField id="info-request-due" name="dueAt" />
        </div>
        <label className="checkbox-row mt-6">
          <input type="checkbox" name="fileRequested" className="peer sr-only" />
          <span className="checkbox" />
          <span className="checkbox-label">{t("fileRequested")}</span>
        </label>
      </div>
      <div className="field">
        <label htmlFor="info-request-message" className="label">
          {t("message")}
        </label>
        <textarea
          id="info-request-message"
          name="message"
          className="input min-h-28 resize-none"
          placeholder={t("messagePlaceholder")}
        />
      </div>
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <FormSubmitButton Icon={Send} pendingLabel={t("saving")}>
          {t("saveRequest")}
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
  const t = useTranslations("EmployeeInfoRequestButton");

  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      onClick={() =>
        openPopup({
          title: t("popupTitle"),
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
      {t("button")}
    </button>
  );
}
