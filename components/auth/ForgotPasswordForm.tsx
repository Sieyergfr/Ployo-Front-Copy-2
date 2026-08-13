"use client";

import PrimaryButton from "@/components/Buttons/PrimaryButton";
import TextInput from "@/components/inputs/text-input";
import { useToast } from "@/components/Toasts";
import { authClient } from "@/lib/auth-client";
import { ArrowLeft, ArrowRight, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordForm() {
  const { toast } = useToast();
  const t = useTranslations("Auth.forgotPassword");
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
          const message = resetError.message ?? t("errorFallback");
          setError(message);
          toast({
            tone: "error",
            title: t("errorTitle"),
            subtitle: message,
          });
          return;
        }

        setSentTo(email);
        toast({
          tone: "success",
          title: t("toastSuccessTitle"),
          subtitle: t("toastSuccessBody"),
        });
      }}
    >
      <div className="card-form">
        <TextInput
          id="email"
          label={t("emailLabel")}
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
            {t("requestedTitle")}
          </div>
          <p className="mt-1 text-muted">
            {t("requestedBody", { email: sentTo })}
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
          {isPending ? t("submitting") : t("submit")}
        </span>
        <ArrowRight size={12} strokeWidth={3} color="currentColor" />
      </PrimaryButton>

      <Link
        href="/login"
        className="btn btn-secondary flex items-center justify-center gap-2"
      >
        <ArrowLeft size={14} strokeWidth={2.2} />
        {t("backToLogin")}
      </Link>
    </form>
  );
}
