"use client";

import { createEmployeeFolderTemplateAction } from "@/app/(dashboard)/u/[tenant]/employees/actions";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useActionStateWithToast } from "@/components/Toasts";
import { useUniversalPopup } from "@/components/UniversalPopup";
import { FolderPlus } from "lucide-react";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations>;

function FolderTemplateForm({ tenant, onDone, t }: { tenant: string; onDone: () => void; t: T }) {
  const [, formAction] = useActionStateWithToast(createEmployeeFolderTemplateAction);

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />

      <div className="field">
        <label htmlFor="folder-template-name" className="label">
          {t("folderNameLabel")}
        </label>
        <input
          id="folder-template-name"
          className="input"
          name="name"
          placeholder={t("folderNamePlaceholder")}
          required
        />
      </div>

      <p className="m-0 text-[12.5px] leading-[1.55] text-muted-2">
        {t("hint")}
      </p>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <FormSubmitButton Icon={FolderPlus} pendingLabel={t("creating")}>
          {t("createTemplate")}
        </FormSubmitButton>
      </div>
    </form>
  );
}

export default function FolderTemplateButton({ tenant }: { tenant: string }) {
  const t = useTranslations("FolderTemplateButton");
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() =>
        openPopup({
          title: t("createTemplate"),
          content: <FolderTemplateForm tenant={tenant} onDone={closePopup} t={t} />,
        })
      }
    >
      <FolderPlus size={14} />
      {t("trigger")}
    </button>
  );
}
