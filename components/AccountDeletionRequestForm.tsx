"use client";

import { useActionState } from "react";
import { requestAccountDeletionAction } from "@/app/konto-loeschung/actions";
import { FormErrorBanner } from "@/components/FormFeedback";
import type { ActionState } from "@/lib/action-state";
import { MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";

const initialState: ActionState = {};

export default function AccountDeletionRequestForm() {
  const t = useTranslations("AccountDeletionRequestForm");
  const [state, formAction, isPending] = useActionState(
    requestAccountDeletionAction,
    initialState,
  );

  if (state.success) {
    return (
      <div className="rounded-[10px] border border-success/20 bg-success/5 px-4 py-4 text-[13.5px] text-ink">
        <div className="flex items-center gap-2 font-medium">
          <MailCheck size={16} strokeWidth={2} />
          {t("emailOnWayTitle")}
        </div>
        <p className="mt-1.5 leading-[1.55] text-muted">
          {t("emailOnWayBody")}
        </p>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <div className="field">
        <label htmlFor="email" className="label">
          {t("emailLabel")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          placeholder={t("emailPlaceholder")}
          autoComplete="email"
          required
        />
      </div>

      <FormErrorBanner message={state.error} />

      <button type="submit" className="btn btn-primary w-full" disabled={isPending}>
        {isPending ? t("sending") : t("requestByEmail")}
      </button>
    </form>
  );
}
