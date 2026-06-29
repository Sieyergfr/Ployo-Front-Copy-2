"use client";

import { useUniversalPopup } from "@/components/UniversalPopup";
import { Plus, Send } from "lucide-react";

function InviteEmployeeForm({ onDone }: { onDone: () => void }) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onDone();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="invite-first-name" className="label">
            Vorname
          </label>
          <input
            id="invite-first-name"
            name="firstName"
            className="input"
            placeholder="Sophie"
            autoComplete="given-name"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="invite-last-name" className="label">
            Nachname
          </label>
          <input
            id="invite-last-name"
            name="lastName"
            className="input"
            placeholder="Wagner"
            autoComplete="family-name"
            required
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="invite-email" className="label">
          E-Mail-Adresse
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          className="input"
          placeholder="sophie.wagner@example.com"
          autoComplete="email"
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="invite-location" className="label">
            Standort
          </label>
          <select
            id="invite-location"
            name="location"
            className="input cursor-pointer bg-bg"
            defaultValue=""
          >
            <option value="" disabled>
              Auswählen
            </option>
            <option value="München">München</option>
            <option value="Berlin">Berlin</option>
            <option value="Hamburg">Hamburg</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="invite-team" className="label">
            Team
          </label>
          <select
            id="invite-team"
            name="team"
            className="input cursor-pointer bg-bg"
            defaultValue=""
          >
            <option value="" disabled>
              Auswählen
            </option>
            <option value="Verkauf">Verkauf</option>
            <option value="Logistik">Logistik</option>
            <option value="Service">Service</option>
            <option value="Empfang">Empfang</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="invite-role" className="label">
          Zugriff
        </label>
        <select
          id="invite-role"
          name="role"
          className="input cursor-pointer bg-bg"
          defaultValue="employee"
        >
          <option value="employee">Mitarbeiter</option>
          <option value="lead">Teamleitung</option>
          <option value="hr">HR</option>
        </select>
      </div>

      <p className="m-0 text-[12.5px] leading-[1.55] text-muted-2">
        Der Mitarbeiter erhält eine Einladung per E-Mail und ergänzt persönliche
        Daten, Dokumente und weitere Angaben selbst.
      </p>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary">
          <Send size={15} strokeWidth={2} />
          Einladung senden
        </button>
      </div>
    </form>
  );
}

export default function InviteEmployeeButton() {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => {
        openPopup({
          title: "Mitarbeiter einladen",
          content: <InviteEmployeeForm onDone={closePopup} />,
        });
      }}
    >
      <Plus size={15} strokeWidth={2} />
      Einladen
    </button>
  );
}
