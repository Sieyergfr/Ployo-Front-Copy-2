"use client";

import { useActionState } from "react";
import { requestAccountDeletionAction } from "@/app/konto-loeschung/actions";
import { FormErrorBanner } from "@/components/FormFeedback";
import type { ActionState } from "@/lib/action-state";
import { MailCheck } from "lucide-react";

const initialState: ActionState = {};

export default function AccountDeletionRequestForm() {
  const [state, formAction, isPending] = useActionState(
    requestAccountDeletionAction,
    initialState,
  );

  if (state.success) {
    return (
      <div className="rounded-[10px] border border-success/20 bg-success/5 px-4 py-4 text-[13.5px] text-ink">
        <div className="flex items-center gap-2 font-medium">
          <MailCheck size={16} strokeWidth={2} />
          E-Mail unterwegs
        </div>
        <p className="mt-1.5 leading-[1.55] text-muted">
          Falls zu dieser Adresse ein Ployo-Konto existiert, haben wir soeben
          eine E-Mail mit einem Bestätigungslink verschickt. Der Link ist 15
          Minuten gültig. Bitte auch den Spam-Ordner prüfen.
        </p>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <div className="field">
        <label htmlFor="email" className="label">
          E-Mail-Adresse
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          placeholder="name@unternehmen.de"
          autoComplete="email"
          required
        />
      </div>

      <FormErrorBanner message={state.error} />

      <button type="submit" className="btn btn-primary w-full" disabled={isPending}>
        {isPending ? "Wird gesendet …" : "Löschung per E-Mail anfordern"}
      </button>
    </form>
  );
}
