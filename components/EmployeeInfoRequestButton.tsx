"use client";

import { useActionState, useState } from "react";
import { createEmployeeInfoRequestAction } from "@/app/(dashboard)/u/[tenant]/employees/actions";
import DatePickerField from "@/components/DatePickerField";
import FormSubmitButton from "@/components/FormSubmitButton";
import { FormErrorBanner } from "@/components/FormFeedback";
import { useCloseOnSuccess, useUniversalPopup } from "@/components/UniversalPopup";
import type { ActionState } from "@/lib/action-state";
import { FileText, MessageSquarePlus, PenLine, Plus, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";

const initialState: ActionState = {};

type ItemDraft = { id: number; kind: "document" | "field"; label: string; required: boolean };

/** Häufige Elemente für "Schnell hinzufügen" — [Typ, Übersetzungsschlüssel]. */
const QUICK_ITEMS: Array<["document" | "field", string]> = [
  ["document", "quick.idCard"],
  ["field", "quick.taxId"],
  ["field", "quick.socialSecurity"],
  ["field", "quick.healthInsurance"],
  ["field", "quick.iban"],
  ["document", "quick.healthCertificate"],
  ["document", "quick.residencePermit"],
];

let nextItemId = 1;

/** Elemente einer mehrteiligen Anfrage (M7): Dokument oder Angabe, Pflicht oder optional. */
function InfoRequestItemsEditor() {
  const t = useTranslations("EmployeeInfoRequestButton");
  const [items, setItems] = useState<ItemDraft[]>([{ id: nextItemId++, kind: "document", label: "", required: true }]);
  const update = (id: number, patch: Partial<ItemDraft>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const add = (kind: "document" | "field" = "document", label = "") =>
    setItems((current) => [...current.filter((item) => item.label.trim()), { id: nextItemId++, kind, label, required: true }]);
  const used = new Set(items.map((item) => item.label.trim()));

  return (
    <div className="flex flex-col gap-2">
      <span className="label">{t("itemsLabel")}</span>
      {items.map((item) => (
        <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-[12px] border border-border bg-white p-2">
          <input type="hidden" name="itemKind" value={item.kind} />
          <input type="hidden" name="itemRequired" value={item.required ? "1" : "0"} />
          <span role="radiogroup" aria-label={t("itemKind")} className="inline-flex gap-0.5 rounded-[9px] bg-[#f2f1ed] p-0.5">
            {(["document", "field"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={item.kind === kind}
                onClick={() => update(item.id, { kind })}
                className={`inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-[7px] border-0 px-2.5 text-[12.5px] font-semibold ${item.kind === kind ? "bg-white text-ink shadow-[0_1px_2px_rgba(14,14,14,0.1)]" : "bg-transparent text-muted-2"}`}
              >
                {kind === "document" ? <FileText size={13} /> : <PenLine size={13} />}
                {kind === "document" ? t("kindDocument") : t("kindField")}
              </button>
            ))}
          </span>
          <input
            name="itemLabel"
            value={item.label}
            onChange={(event) => update(item.id, { label: event.target.value })}
            placeholder={item.kind === "document" ? t("documentPlaceholder") : t("fieldPlaceholder")}
            aria-label={t("itemLabel")}
            className="input min-w-[160px] flex-1"
          />
          <button
            type="button"
            role="switch"
            aria-checked={item.required}
            onClick={() => update(item.id, { required: !item.required })}
            className={`min-h-8 cursor-pointer rounded-[8px] border px-2.5 text-[12px] font-semibold ${item.required ? "border-ink bg-ink text-white" : "border-border bg-white text-muted-2"}`}
          >
            {item.required ? t("required") : t("optional")}
          </button>
          {items.length > 1 && (
            <button
              type="button"
              aria-label={t("removeItem")}
              onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
              className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent text-muted hover:bg-bg hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => add()}
        className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-[8px] border-0 bg-transparent px-1 py-1 text-[13px] font-semibold text-[#6b4fc4]"
      >
        <Plus size={14} />
        {t("addItem")}
      </button>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[10px] tracking-[0.08em] text-muted uppercase">{t("quickAdd")}</span>
        {QUICK_ITEMS.filter(([, key]) => !used.has(t(key))).map(([kind, key]) => (
          <button
            key={key}
            type="button"
            onClick={() => add(kind, t(key))}
            className="inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-[8px] border border-border bg-white px-2 text-[12px] font-medium text-ink hover:bg-bg"
          >
            {kind === "document" ? <FileText size={12} /> : <PenLine size={12} />}
            {t(key)}
          </button>
        ))}
      </div>
    </div>
  );
}

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
  const [state, formAction, isPending] = useActionState(
    createEmployeeInfoRequestAction,
    initialState,
  );
  useCloseOnSuccess(state, isPending, onDone);

  return (
    <form className="flex flex-col gap-4" action={formAction}>
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
          placeholder={t("titlePlaceholderOptional")}
        />
      </div>
      <InfoRequestItemsEditor />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="info-request-due" className="label">
            {t("dueDate")}
          </label>
          <DatePickerField id="info-request-due" name="dueAt" />
        </div>
        <div className="field">
          <label htmlFor="info-request-due-time" className="label">
            {t("dueTime")}
          </label>
          <input
            id="info-request-due-time"
            name="dueTime"
            type="time"
            className="input"
          />
        </div>
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
      <FormErrorBanner message={state.error} />
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
  className = "btn btn-primary btn-sm",
  label,
}: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  employeeName: string;
  className?: string;
  label?: string;
}) {
  const { openPopup, closePopup } = useUniversalPopup();
  const t = useTranslations("EmployeeInfoRequestButton");

  return (
    <button
      type="button"
      className={className}
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
      {label ?? t("button")}
    </button>
  );
}
