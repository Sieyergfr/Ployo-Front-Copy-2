"use client";

import { useActionState } from "react";
import { confirmAccountDeletionAction } from "@/app/konto-loeschung/actions";
import { FormErrorBanner } from "@/components/FormFeedback";
import type { ActionState } from "@/lib/action-state";
import { ShieldCheck, Trash2 } from "lucide-react";

const initialState: ActionState = {};

export default function AccountDeletionConfirmForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    confirmAccountDeletionAction,
    initialState,
  );

  if (state.success) {
    return (
      <div className="rounded-[10px] border border-success/20 bg-success/5 px-4 py-4 text-[13.5px] text-ink">
        <div className="flex items-center gap-2 font-medium">
          <ShieldCheck size={16} strokeWidth={2} />
          Konto gelöscht
        </div>
        <p className="mt-1.5 leading-[1.55] text-muted">
          Ihre Zugangsdaten, Sitzungen, Social-Login-Verknüpfungen und
          Push-Token wurden gelöscht. Personal- und Beschäftigungsdaten, die
          Ihr Arbeitgeber gesetzlich aufbewahren muss, bleiben davon
          unberührt.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <FormErrorBanner message={state.error} />

      <button
        type="submit"
        className="btn btn-secondary w-full border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
        disabled={isPending}
      >
        <Trash2 size={15} />
        {isPending ? "Wird gelöscht …" : "Konto endgültig löschen"}
      </button>
    </form>
  );
}
