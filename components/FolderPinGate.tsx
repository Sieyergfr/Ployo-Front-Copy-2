"use client";

import { verifyFolderPinAction } from "@/app/(dashboard)/u/[tenant]/dateien/actions";
import { FormErrorBanner } from "@/components/FormFeedback";
import FormSubmitButton from "@/components/FormSubmitButton";
import type { ActionState } from "@/lib/action-state";
import { Lock } from "lucide-react";
import { useActionState } from "react";

const initialState: ActionState = {};

export default function FolderPinGate({
  tenant,
  folderPath,
  folderName,
  returnPath,
}: {
  tenant: string;
  folderPath: string;
  folderName: string;
  returnPath: string;
}) {
  const [state, formAction] = useActionState(verifyFolderPinAction, initialState);

  return (
    <section className="rounded-card border border-border bg-white px-6 py-10">
      <div className="mx-auto flex max-w-[320px] flex-col items-center text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-bg text-muted">
          <Lock size={18} />
        </span>
        <h2 className="mt-4 font-display text-[18px] font-semibold text-ink">
          {folderName} ist geschützt
        </h2>
        <p className="mt-1.5 text-[13px] text-muted-2">
          Bitte die 6-stellige PIN eingeben, um diesen Ordner zu öffnen.
        </p>

        <form action={formAction} className="mt-5 flex w-full flex-col gap-3">
          <input type="hidden" name="tenant" value={tenant} />
          <input type="hidden" name="folderPath" value={folderPath} />
          <input type="hidden" name="returnPath" value={returnPath} />
          <input
            id="folder-pin-input"
            name="pin"
            className="input input-mono text-center text-[16px] tracking-[0.4em]"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="••••••"
            autoFocus
            required
          />
          <FormErrorBanner message={state.error} />
          <FormSubmitButton className="btn btn-primary w-full justify-center" pendingLabel="Prüfe...">
            Ordner öffnen
          </FormSubmitButton>
        </form>
      </div>
    </section>
  );
}
