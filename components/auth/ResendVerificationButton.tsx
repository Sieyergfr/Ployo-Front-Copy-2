"use client";

import { useToast } from "@/components/Toasts";
import { authClient } from "@/lib/auth-client";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** "Erneut senden" für den Bestätigungslink nach der Registrierung. */
export default function ResendVerificationButton({ email }: { email: string }) {
  const { toast } = useToast();
  const t = useTranslations("Auth.confirm");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  return (
    <button
      type="button"
      disabled={state !== "idle"}
      className="au-text-link au-focus cursor-pointer rounded border-0 bg-transparent p-1 text-[13px] font-semibold text-ink disabled:cursor-default"
      onClick={async () => {
        setState("sending");

        const { error } = await authClient.sendVerificationEmail({
          email,
          callbackURL: "/select",
        });

        if (error) {
          setState("idle");
          toast({
            tone: "error",
            title: t("resendErrorTitle"),
            subtitle: error.message ?? t("resendErrorFallback"),
          });
          return;
        }

        setState("sent");
      }}
    >
      {state === "sent" ? t("resent") : state === "sending" ? t("resending") : t("resend")}
    </button>
  );
}
