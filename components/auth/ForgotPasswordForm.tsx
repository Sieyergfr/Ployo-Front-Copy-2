"use client";

import PrimaryButton from "@/components/Buttons/PrimaryButton";
import TextInput from "@/components/inputs/text-input";
import { useToast } from "@/components/Toasts";
import { authClient } from "@/lib/auth-client";
import { ArrowLeft, ArrowRight, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordForm() {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setIsPending(true);

        const formData = new FormData(event.currentTarget);
        const email = String(formData.get("email") ?? "").trim();

        const { error: resetError } =
          await authClient.requestPasswordReset({
            email,
            redirectTo: "/reset-password",
          });

        setIsPending(false);

        if (resetError) {
          const message =
            resetError.message ?? "Der Reset-Link konnte nicht angefordert werden.";
          setError(message);
          toast({
            tone: "error",
            title: "Anfrage fehlgeschlagen",
            subtitle: message,
          });
          return;
        }

        setSentTo(email);
        toast({
          tone: "success",
          title: "Reset-Link angefordert",
          subtitle: "Wenn die E-Mail existiert, wurde ein Link versendet.",
        });
      }}
    >
      <div className="card-form">
        <TextInput
          id="email"
          label="E-Mail"
          type="email"
          placeholder="name@unternehmen.de"
          autoComplete="email"
          required
        />
      </div>

      {sentTo && (
        <div className="rounded-[10px] border border-success/20 bg-success/5 px-3 py-3 text-[12.5px] text-ink">
          <div className="flex items-center gap-2 font-medium">
            <MailCheck size={15} strokeWidth={2} />
            Link angefordert
          </div>
          <p className="mt-1 text-muted">
            Falls {sentTo} registriert ist, kann das Passwort über den
            zugesendeten Link zurückgesetzt werden.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-[10px] border border-danger/20 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      <PrimaryButton type="submit" disabled={isPending}>
        <span className="leading-tight">
          {isPending ? "Link anfordern..." : "Reset-Link anfordern"}
        </span>
        <ArrowRight size={12} strokeWidth={3} color="currentColor" />
      </PrimaryButton>

      <Link
        href="/login"
        className="btn btn-secondary flex items-center justify-center gap-2"
      >
        <ArrowLeft size={14} strokeWidth={2.2} />
        Zurück zum Login
      </Link>
    </form>
  );
}
