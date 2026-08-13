"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/components/Toasts";
import { UnsavedChangesGuard } from "@/components/EditSafety";
import { Mail } from "lucide-react";

export default function ChangeEmailForm({
  currentEmail,
  emailVerified,
  smtpConfigured,
}: {
  currentEmail: string;
  emailVerified: boolean;
  smtpConfigured: boolean;
}) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  if (requested) {
    return (
      <div className="field">
        <label className="label">E-Mail</label>
        <input className="input bg-bg" defaultValue={currentEmail} readOnly />
        <p className="mt-1 text-[11.5px] text-success">
          Bestätigungslink an {currentEmail} gesendet. Klicken Sie darauf, um
          den Wechsel zu {newEmail} abzuschließen.
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
            const message = changeError.message ?? "E-Mail-Änderung fehlgeschlagen.";
            setError(message);
            toast({ tone: "error", title: "Fehlgeschlagen", subtitle: message });
            return;
          }

          setRequested(true);
          toast({
            tone: "success",
            title: "Bestätigung erforderlich",
            subtitle: `Ein Bestätigungslink wurde an ${currentEmail} gesendet.`,
          });
        }}
      >
        <UnsavedChangesGuard active={isEditing} />
        <label htmlFor="account-new-email" className="label">
          Neue E-Mail
        </label>
        <input
          id="account-new-email"
          type="email"
          className="input"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          placeholder="neue-adresse@unternehmen.de"
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
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={isPending}>
            {isPending ? "Wird gesendet..." : "Bestätigungslink senden"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="field">
      <label htmlFor="account-email" className="label">
        E-Mail
      </label>
      <input id="account-email" className="input bg-bg" defaultValue={currentEmail} readOnly />
      <p className="mt-1 text-[11.5px] text-muted">
        {emailVerified ? "Bestätigt." : "Noch nicht bestätigt."}
      </p>
      {smtpConfigured ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm mt-2"
          onClick={() => setIsEditing(true)}
        >
          <Mail size={13} />
          E-Mail ändern
        </button>
      ) : (
        <p className="mt-1 text-[11.5px] text-muted">
          E-Mail-Änderung erfordert konfigurierten Mailversand.
        </p>
      )}
    </div>
  );
}
