"use client";

import { useActionState } from "react";
import { createEmployeeAction } from "@/app/(dashboard)/u/[tenant]/employees/actions";
import DatePickerField from "@/components/DatePickerField";
import FormSubmitButton from "@/components/FormSubmitButton";
import { FieldErrors, FormErrorBanner } from "@/components/FormFeedback";
import { useUniversalPopup } from "@/components/UniversalPopup";
import type { ActionState } from "@/lib/action-state";
import { Plus, Send } from "lucide-react";

const initialState: ActionState = {};

type InviteEmployeeButtonProps = {
  tenant: string;
  locations: string[];
  permissionRoles: string[];
  teams: string[];
  employeeNumberRequired: boolean;
};

function InviteEmployeeForm({
  tenant,
  locations,
  permissionRoles,
  teams,
  employeeNumberRequired,
  onDone,
}: InviteEmployeeButtonProps & { onDone: () => void }) {
  const [state, formAction] = useActionState(createEmployeeAction, initialState);

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />

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
        />
        <FieldErrors errors={state.fieldErrors?.email} />
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
            {locations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
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
            {teams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="invite-role" className="label">
            Berechtigungsrolle
          </label>
          <select
            id="invite-role"
            name="role"
            className="input cursor-pointer bg-bg"
            defaultValue={permissionRoles[0] ?? "Mitarbeiter"}
          >
            {permissionRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="invite-contract" className="label">
            Vertrag
          </label>
          <select
            id="invite-contract"
            name="contract"
            className="input cursor-pointer bg-bg"
            defaultValue="Unbefristet"
          >
            <option value="Unbefristet">Unbefristet</option>
            <option value="Teilzeit">Teilzeit</option>
            <option value="Befristet">Befristet</option>
            <option value="Werkstudentin">Werkstudentin</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="invite-start-date" className="label">
            Eintritt
          </label>
          <DatePickerField id="invite-start-date" name="startDate" />
        </div>

        <div className="field">
          <label htmlFor="invite-employee-number" className="label">
            Personalnummer{employeeNumberRequired ? "" : " (optional)"}
          </label>
          <input
            id="invite-employee-number"
            name="employeeNumber"
            className="input input-mono"
            placeholder={
              employeeNumberRequired ? "z. B. MA-0042" : "Wird automatisch vergeben"
            }
            required={employeeNumberRequired}
          />
        </div>
      </div>

      <p className="m-0 text-[12.5px] leading-[1.55] text-muted-2">
        Der Mitarbeiter wird angelegt und kann danach in der Personalakte
        vervollständigt werden.
      </p>

      <FormErrorBanner message={state.error} />

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <FormSubmitButton
          Icon={Send}
          pendingLabel="Wird angelegt..."
        >
          Anlegen
        </FormSubmitButton>
      </div>
    </form>
  );
}

export default function InviteEmployeeButton(props: InviteEmployeeButtonProps) {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => {
        openPopup({
          title: "Mitarbeiter anlegen",
          content: <InviteEmployeeForm {...props} onDone={closePopup} />,
        });
      }}
    >
      <Plus size={15} strokeWidth={2} />
      Anlegen
    </button>
  );
}
