"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/components/Toasts";
import { UnsavedChangesGuard } from "@/components/EditSafety";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";

export default function ChangeEmailForm({
  currentEmail,
  emailVerified,
  smtpConfigured,
}: {
  currentEmail: string;
  emailVerified: boolean;
  smtpConfigured: boolean;
}) {
  const t = useTranslations("ChangeEmailForm");
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  if (requested) {
    return (
      <div className="field">
        <label className="label">{t("emailLabel")}</label>
        <input className="input bg-bg" defaultValue={currentEmail} readOnly />
        <p className="mt-1 text-[11.5px] text-success">
          {t("confirmationSentTo", { current: currentEmail, newEmail })}
        </p>
      </div>
    );
  }

  if (isEditing) {
    return (
      <form
        className="field"
        onSubmit={async (event) => {
          event.preventDefault();
          setIsPending(true);
          setError(null);

          const { error: changeError } = await authClient.changeEmail({
            newEmail,
            callbackURL: "/konto",
          });

          setIsPending(false);

          if (changeError) {
            const message = changeError.message ?? t("changeFailedDefault");
            setError(message);
            toast({ tone: "error", title: t("toastErrorTitle"), subtitle: message });
            return;
          }

          setRequested(true);
          toast({
            tone: "success",
            title: t("toastSuccessTitle"),
            subtitle: t("toastSuccessSubtitle", { email: currentEmail }),
          });
        }}
      >
        <UnsavedChangesGuard active={isEditing} />
        <label htmlFor="account-new-email" className="label">
          {t("newEmailLabel")}
        </label>
        <input
          id="account-new-email"
          type="email"
          className="input"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          placeholder={t("newEmailPlaceholder")}
          required
          autoFocus
        />
        {error && <p className="mt-1 text-[11.5px] text-danger">{error}</p>}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setIsEditing(false);
              setError(null);
              setNewEmail("");
            }}
          >
            {t("cancel")}
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={isPending}>
            {isPending ? t("sending") : t("sendConfirmationLink")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="field">
      <label htmlFor="account-email" className="label">
        {t("emailLabel")}
      </label>
      <input id="account-email" className="input bg-bg" defaultValue={currentEmail} readOnly />
      <p className="mt-1 text-[11.5px] text-muted">
        {emailVerified ? t("verified") : t("notVerified")}
      </p>
      {smtpConfigured ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm mt-2"
          onClick={() => setIsEditing(true)}
        >
          <Mail size={13} />
          {t("changeEmail")}
        </button>
      ) : (
        <p className="mt-1 text-[11.5px] text-muted">
          {t("smtpNotConfiguredHint")}
        </p>
      )}
    </div>
  );
}
