"use client";

import { useUniversalPopup } from "@/components/UniversalPopup";
import { BellPlus, Plus } from "lucide-react";

function CreateReminderForm({ onDone }: { onDone: () => void }) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onDone();
      }}
    >
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
          <input id="reminder-date" name="date" type="date" className="input" required />
        </div>
        <div className="field">
          <label htmlFor="reminder-priority" className="label">
            Priorität
          </label>
          <select id="reminder-priority" name="priority" className="input cursor-pointer bg-bg" defaultValue="normal">
            <option value="normal">Normal</option>
            <option value="important">Wichtig</option>
            <option value="urgent">Dringend</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="reminder-context" className="label">
          Bezug
        </label>
        <input id="reminder-context" name="context" className="input" placeholder="Mitarbeiter, Team oder Standort" />
      </div>
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>Abbrechen</button>
        <button type="submit" className="btn btn-primary"><BellPlus size={15} /> Erinnerung erstellen</button>
      </div>
    </form>
  );
}

export default function CreateReminderButton() {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() =>
        openPopup({
          title: "Erinnerung erstellen",
          content: <CreateReminderForm onDone={closePopup} />,
        })
      }
    >
      <Plus size={15} strokeWidth={2} />
      Erinnerung erstellen
    </button>
  );
}
