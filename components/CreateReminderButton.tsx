"use client";

import { createReminderAction } from "@/app/(dashboard)/u/[tenant]/erinnerungen/actions";
import { LinkedFileBrowser } from "@/components/ActionDrawers";
import DatePickerField from "@/components/DatePickerField";
import { useUniversalPopup } from "@/components/UniversalPopup";
import type { ReminderFileBrowserData } from "@/lib/files";
import { BellPlus, Plus } from "lucide-react";
import { useState } from "react";

type TeamOption = { id: string; name: string };

function CreateReminderForm({
  tenant,
  returnPath,
  fileBrowserData,
  teamOptions,
  onDone,
}: {
  tenant: string;
  returnPath: string;
  fileBrowserData: ReminderFileBrowserData;
  teamOptions: TeamOption[];
  onDone: () => void;
}) {
  const [linkedFiles, setLinkedFiles] = useState<string[]>([]);

  return (
    <form className="flex flex-col gap-4" action={createReminderAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="returnPath" value={returnPath} />
      {linkedFiles.map((fileId) => (
        <input key={fileId} type="hidden" name="linkedFiles" value={fileId} />
      ))}

      <div className="field">
        <label htmlFor="reminder-title" className="label">
          Titel
        </label>
        <input
          id="reminder-title"
          name="title"
          className="input"
          placeholder="z. B. Vertrag prüfen"
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="reminder-date" className="label">
            Fällig am
          </label>
          <DatePickerField id="reminder-date" name="dueDate" />
        </div>
        <div className="field">
          <label htmlFor="reminder-priority" className="label">
            Priorität
          </label>
          <select
            id="reminder-priority"
            name="priority"
            className="input cursor-pointer bg-bg"
            defaultValue="normal"
          >
            <option value="normal">Normal</option>
            <option value="important">Wichtig</option>
            <option value="urgent">Dringend</option>
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="reminder-category" className="label">
            Kategorie
          </label>
          <input
            id="reminder-category"
            name="category"
            className="input"
            placeholder="Allgemein"
            defaultValue="Allgemein"
          />
        </div>
        <div className="field">
          <label htmlFor="reminder-context" className="label">
            Bezug
          </label>
          <input
            id="reminder-context"
            name="subject"
            className="input"
            placeholder="Mitarbeiter, Team oder Standort"
          />
        </div>
      </div>
      {teamOptions.length > 0 && (
        <div className="field">
          <label htmlFor="reminder-team" className="label">
            Team (optional)
          </label>
          <select
            id="reminder-team"
            name="teamId"
            className="input cursor-pointer bg-bg"
            defaultValue=""
          >
            <option value="">Keinem Team zugeordnet</option>
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
          Hinweise
        </label>
        <textarea
          id="reminder-notes"
          name="notes"
          className="input min-h-24 resize-y py-3"
          placeholder="Interne Hinweise oder nächste Schritte"
        />
      </div>
      <LinkedFileBrowser
        selectedIds={linkedFiles}
        setSelectedIds={setLinkedFiles}
        fileBrowserData={fileBrowserData}
      />
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary">
          <BellPlus size={15} />
          Erinnerung erstellen
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
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() =>
        openPopup({
          title: "Erinnerung erstellen",
          content: (
            <CreateReminderForm
              tenant={tenant}
              returnPath={returnPath}
              fileBrowserData={fileBrowserData}
              teamOptions={teamOptions}
              onDone={closePopup}
            />
          ),
        })
      }
    >
      <Plus size={15} strokeWidth={2} />
      Erinnerung erstellen
    </button>
  );
}
