"use client";

import { createReminderAction } from "@/app/(dashboard)/u/[tenant]/erinnerungen/actions";
import { LinkedFileBrowser } from "@/components/ActionDrawers";
import DatePickerField from "@/components/DatePickerField";
import { useActionStateWithToast } from "@/components/Toasts";
import { useUniversalPopup } from "@/components/UniversalPopup";
import type { ReminderFileBrowserData } from "@/lib/files";
import { BellPlus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

type T = ReturnType<typeof useTranslations>;
type TeamOption = { id: string; name: string };

function CreateReminderForm({
  tenant,
  returnPath,
  fileBrowserData,
  teamOptions,
  onDone,
  t,
}: {
  tenant: string;
  returnPath: string;
  fileBrowserData: ReminderFileBrowserData;
  teamOptions: TeamOption[];
  onDone: () => void;
  t: T;
}) {
  const [linkedFiles, setLinkedFiles] = useState<string[]>([]);
  const [, formAction] = useActionStateWithToast(createReminderAction);

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="returnPath" value={returnPath} />
      {linkedFiles.map((fileId) => (
        <input key={fileId} type="hidden" name="linkedFiles" value={fileId} />
      ))}

      <div className="field">
        <label htmlFor="reminder-title" className="label">
          {t("titleLabel")}
        </label>
        <input
          id="reminder-title"
          name="title"
          className="input"
          placeholder={t("titlePlaceholder")}
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="reminder-date" className="label">
            {t("dueDateLabel")}
          </label>
          <DatePickerField id="reminder-date" name="dueDate" />
        </div>
        <div className="field">
          <label htmlFor="reminder-priority" className="label">
            {t("priorityLabel")}
          </label>
          <select
            id="reminder-priority"
            name="priority"
            className="input cursor-pointer bg-bg"
            defaultValue="normal"
          >
            <option value="normal">{t("priorityNormal")}</option>
            <option value="important">{t("priorityImportant")}</option>
            <option value="urgent">{t("priorityUrgent")}</option>
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="reminder-category" className="label">
            {t("categoryLabel")}
          </label>
          <input
            id="reminder-category"
            name="category"
            className="input"
            // "Allgemein" bewusst nicht übersetzt: serverseitiger Default-Wert
            // (lib/reminders.ts) für reminder.category, den auch die App über
            // ihr eigenes i18n-Wörterbuch anzeigt — echte Lokalisierung würde
            // den gespeicherten Wert je nach Locale auseinanderlaufen lassen.
            placeholder="Allgemein"
            defaultValue="Allgemein"
          />
        </div>
        <div className="field">
          <label htmlFor="reminder-context" className="label">
            {t("subjectLabel")}
          </label>
          <input
            id="reminder-context"
            name="subject"
            className="input"
            placeholder={t("subjectPlaceholder")}
          />
        </div>
      </div>
      {teamOptions.length > 0 && (
        <div className="field">
          <label htmlFor="reminder-team" className="label">
            {t("teamLabel")}
          </label>
          <select
            id="reminder-team"
            name="teamId"
            className="input cursor-pointer bg-bg"
            defaultValue=""
          >
            <option value="">{t("teamNone")}</option>
            {teamOptions.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="reminder-notes" className="label">
          {t("notesLabel")}
        </label>
        <textarea
          id="reminder-notes"
          name="notes"
          className="input min-h-24 resize-y py-3"
          placeholder={t("notesPlaceholder")}
        />
      </div>
      <LinkedFileBrowser
        selectedIds={linkedFiles}
        setSelectedIds={setLinkedFiles}
        fileBrowserData={fileBrowserData}
      />
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <button type="submit" className="btn btn-primary">
          <BellPlus size={15} />
          {t("create")}
        </button>
      </div>
    </form>
  );
}

export default function CreateReminderButton({
  tenant,
  returnPath,
  fileBrowserData,
  teamOptions = [],
}: {
  tenant: string;
  returnPath: string;
  fileBrowserData: ReminderFileBrowserData;
  teamOptions?: TeamOption[];
}) {
  const t = useTranslations("CreateReminderButton");
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() =>
        openPopup({
          title: t("create"),
          content: (
            <CreateReminderForm
              tenant={tenant}
              returnPath={returnPath}
              fileBrowserData={fileBrowserData}
              teamOptions={teamOptions}
              onDone={closePopup}
              t={t}
            />
          ),
        })
      }
    >
      <Plus size={15} strokeWidth={2} />
      {t("create")}
    </button>
  );
}
