"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createAndLinkOwnEmployeeAction,
  linkOwnEmployeeAction,
  unlinkOwnEmployeeAction,
} from "@/app/(dashboard)/u/[tenant]/mein-bereich/actions";
import EmployeeSelector from "@/components/EmployeeSelector";
import FormSubmitButton from "@/components/FormSubmitButton";
import { FieldErrors, FormErrorBanner } from "@/components/FormFeedback";
import { useUniversalPopup } from "@/components/UniversalPopup";
import type { ActionState } from "@/lib/action-state";
import { Link2, Unlink, UserPlus } from "lucide-react";

const initialState: ActionState = {};

type UnlinkedEmployee = {
  id: string;
  initials: string;
  name: string;
  employeeNumber: string;
  location: string;
  team: string;
  role: string;
};

/**
 * `linkOwnEmployeeAction`/`createAndLinkOwnEmployeeAction` revalidieren nur
 * die Seite dahinter (kein Redirect wie beim Admin-Anlegeflow) — ohne dies
 * bliebe das Popup nach einer erfolgreichen Verknüpfung offen stehen.
 */
function useCloseOnSuccess(
  state: ActionState,
  isPending: boolean,
  onDone: () => void,
) {
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      onDone();
    }

    wasPending.current = isPending;
  }, [isPending, state, onDone]);
}

function LinkExistingForm({
  tenant,
  employees,
  onDone,
}: {
  tenant: string;
  employees: UnlinkedEmployee[];
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(linkOwnEmployeeAction, initialState);
  useCloseOnSuccess(state, isPending, onDone);

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />

      <EmployeeSelector
        label="Personalakte"
        name="employeeId"
        mode="single"
        options={employees}
      />
      <FieldErrors errors={state.fieldErrors?.employeeId} />

      <p className="m-0 text-[12.5px] leading-[1.55] text-muted-2">
        Ihr Konto wird mit der ausgewählten, noch unverknüpften Personalakte
        verbunden.
      </p>

      <FormErrorBanner message={state.error} />

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <FormSubmitButton Icon={Link2} pendingLabel="Wird verknüpft...">
          Verknüpfen
        </FormSubmitButton>
      </div>
    </form>
  );
}

function CreateOwnForm({
  tenant,
  defaultFirstName,
  defaultLastName,
  defaultEmail,
  onDone,
}: {
  tenant: string;
  defaultFirstName: string;
  defaultLastName: string;
  defaultEmail: string;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    createAndLinkOwnEmployeeAction,
    initialState,
  );
  useCloseOnSuccess(state, isPending, onDone);

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="own-first-name" className="label">
            Vorname
          </label>
          <input
            id="own-first-name"
            name="firstName"
            className="input"
            defaultValue={defaultFirstName}
            autoComplete="given-name"
          />
        </div>

        <div className="field">
          <label htmlFor="own-last-name" className="label">
            Nachname
          </label>
          <input
            id="own-last-name"
            name="lastName"
            className="input"
            defaultValue={defaultLastName}
            autoComplete="family-name"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="own-email" className="label">
          E-Mail-Adresse
        </label>
        <input
          id="own-email"
          name="email"
          type="email"
          className="input"
          defaultValue={defaultEmail}
          autoComplete="email"
        />
        <FieldErrors errors={state.fieldErrors?.email} />
      </div>

      <p className="m-0 text-[12.5px] leading-[1.55] text-muted-2">
        Ihre Personalakte wird angelegt und automatisch mit Ihrem Konto
        verknüpft. Weitere Angaben können Sie danach in Mein Bereich
        ergänzen.
      </p>

      <FormErrorBanner message={state.error} />

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <FormSubmitButton Icon={UserPlus} pendingLabel="Wird angelegt...">
          Anlegen
        </FormSubmitButton>
      </div>
    </form>
  );
}

function UnlinkConfirmForm({
  tenant,
  employeeName,
  onDone,
}: {
  tenant: string;
  employeeName: string;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(unlinkOwnEmployeeAction, initialState);
  useCloseOnSuccess(state, isPending, onDone);

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />

      <p className="m-0 text-[13px] leading-[1.55] text-muted-2">
        Ihr Konto wird von der Personalakte &quot;{employeeName}&quot; getrennt. Die
        Personalakte selbst bleibt erhalten.
      </p>

      <FormErrorBanner message={state.error} />

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <FormSubmitButton
          Icon={Unlink}
          pendingLabel="Wird getrennt..."
          className="btn btn-secondary border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
        >
          Verknüpfung aufheben
        </FormSubmitButton>
      </div>
    </form>
  );
}

export function UnlinkOwnEmployeeButton({
  tenant,
  employeeName,
}: {
  tenant: string;
  employeeName: string;
}) {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm text-danger"
      onClick={() =>
        openPopup({
          title: "Verknüpfung aufheben",
          content: (
            <UnlinkConfirmForm tenant={tenant} employeeName={employeeName} onDone={closePopup} />
          ),
        })
      }
    >
      Verknüpfung aufheben
    </button>
  );
}

type SelfServiceEmployeeLinkProps = {
  tenant: string;
  unlinkedEmployees: UnlinkedEmployee[];
  defaultFirstName: string;
  defaultLastName: string;
  defaultEmail: string;
};

export default function SelfServiceEmployeeLink({
  tenant,
  unlinkedEmployees,
  defaultFirstName,
  defaultLastName,
  defaultEmail,
}: SelfServiceEmployeeLinkProps) {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2.5">
      {unlinkedEmployees.length > 0 && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            openPopup({
              title: "Bestehendes Profil verknüpfen",
              content: (
                <LinkExistingForm
                  tenant={tenant}
                  employees={unlinkedEmployees}
                  onDone={closePopup}
                />
              ),
            })
          }
        >
          <Link2 size={15} />
          Bestehendes Profil verknüpfen
        </button>
      )}

      <button
        type="button"
        className="btn btn-primary"
        onClick={() =>
          openPopup({
            title: "Neues Profil anlegen",
            content: (
              <CreateOwnForm
                tenant={tenant}
                defaultFirstName={defaultFirstName}
                defaultLastName={defaultLastName}
                defaultEmail={defaultEmail}
                onDone={closePopup}
              />
            ),
          })
        }
      >
        <UserPlus size={15} />
        Neues Profil anlegen
      </button>
    </div>
  );
}
