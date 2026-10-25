"use client";

import {
  applyShiftTemplateAction,
  deleteShiftTemplateAction,
  saveShiftTemplateAction,
} from "@/app/(dashboard)/u/[tenant]/schichtplanung/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { DbDrawer, DbField, dbInputClass } from "@/components/dashboard/DbDrawer";
import { ctaClass, secondaryClass, smallActionClass } from "@/components/dashboard/ui";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useActionStateWithToast } from "@/components/Toasts";
import type { ShiftTemplateEntry } from "@/lib/shift-templates";
import { Pencil, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

export type ShiftTemplateSummary = {
  id: string;
  name: string;
  entries: ShiftTemplateEntry[];
};

/** Wochenvorlagen: anwenden, aus der Woche speichern, bearbeiten, löschen. */
export default function ShiftTemplatesDrawer({
  tenant,
  year,
  week,
  templates,
  canDelete,
  onEdit,
  onClose,
}: {
  tenant: string;
  year: number;
  week: number;
  templates: ShiftTemplateSummary[];
  canDelete: boolean;
  onEdit: (template: ShiftTemplateSummary) => void;
  onClose: () => void;
}) {
  const t = useTranslations("ShiftUi");
  const [, applyAction] = useActionStateWithToast(applyShiftTemplateAction);
  const [, saveAction] = useActionStateWithToast(saveShiftTemplateAction);
  const [, deleteAction] = useActionStateWithToast(deleteShiftTemplateAction);
  const hidden = (
    <>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="week" value={week} />
    </>
  );

  return (
    <DbDrawer title={t("templatesTitle")} subtitle={t("templatesSubtitle")} onClose={onClose}>
      {templates.length > 0 && (
        <form action={applyAction} className="flex flex-col gap-2.5 rounded-[14px] border border-[#ecebe7] bg-[#fafaf8] p-4">
          {hidden}
          <DbField label={t("applyLabel")} hint={t("applyHint")}>
            <select name="templateId" required defaultValue="" className={dbInputClass}>
              <option value="" disabled>
                –
              </option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({t("entries", { count: template.entries.length })})
                </option>
              ))}
            </select>
          </DbField>
          <FormSubmitButton className={ctaClass} pendingLabel={t("applying")}>
            {t("applyTemplate", { week })}
          </FormSubmitButton>
        </form>
      )}

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">{t("savedTemplates")}</span>
        {templates.length === 0 && <p className="m-0 text-[13px] text-[#6e6e6b]">{t("noTemplates")}</p>}
        {templates.map((template) => (
          <div key={template.id} className="flex items-center gap-2 rounded-[12px] border border-[#ecebe7] bg-white px-3.5 py-2.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14px] font-semibold">{template.name}</span>
              <span className="text-[12px] text-[#6e6e6b]">{t("entries", { count: template.entries.length })}</span>
            </span>
            <button type="button" className={smallActionClass} onClick={() => onEdit(template)}>
              <Pencil size={13} />
              {t("edit")}
            </button>
            {canDelete && (
              <form id={`delete-template-${template.id}`} action={deleteAction}>
                <input type="hidden" name="tenant" value={tenant} />
                <input type="hidden" name="templateId" value={template.id} />
                <ConfirmSubmitButton
                  form={`delete-template-${template.id}`}
                  className={`${smallActionClass} text-[#b4332a]`}
                  title={t("delete")}
                  confirmLabel={t("delete")}
                  description={t("deleteTemplateConfirm", { name: template.name })}
                >
                  <Trash2 size={13} />
                  <span className="sr-only">{t("delete")}</span>
                </ConfirmSubmitButton>
              </form>
            )}
          </div>
        ))}
      </div>

      <form action={saveAction} className="flex flex-col gap-2.5 border-t border-[#ecebe7] pt-4">
        {hidden}
        <span className="text-[14px] font-semibold">{t("saveWeekTitle")}</span>
        <span className="text-[12.5px] text-[#6e6e6b]">{t("saveWeekHint")}</span>
        <input type="text" name="templateName" required placeholder={t("templateName")} aria-label={t("templateName")} className={dbInputClass} />
        <FormSubmitButton Icon={Save} className={secondaryClass} pendingLabel={t("saving")}>
          {t("save")}
        </FormSubmitButton>
      </form>
    </DbDrawer>
  );
}
