"use client";

import AuthAlert from "@/components/auth/AuthAlert";
import AuthCardHeader, { AuthIconBadge, AuthSteps } from "@/components/auth/AuthCardHeader";
import PrimaryButton from "@/components/Buttons/PrimaryButton";
import TextInput from "@/components/inputs/text-input";
import { useToast } from "@/components/Toasts";
import { authClient } from "@/lib/auth-client";
import { ArrowRight, KeyRound, LoaderCircle, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

// Wartezeit, bevor ein weiterer Reset-Link angefordert werden kann.
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Passwort vergessen in zwei Schritten: E-Mail eingeben, dann Hinweis auf
 * den zugesendeten Link (Schritt 3 ist /reset-password aus der E-Mail).
 */
export default function ForgotPasswordForm() {
  const { toast } = useToast();
  const t = useTranslations("Auth.forgotPassword");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timeout = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timeout);
  }, [cooldown]);

  async function requestReset(email: string) {
    setError(null);
    setIsPending(true);

    const { error: resetError } = await authClient.requestPasswordReset({
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
      return false;
    }

    setCooldown(RESEND_COOLDOWN_SECONDS);
    return true;
  }

  if (sentTo) {
    return (
      <>
        <AuthSteps current={2} />
        <AuthCardHeader
          badge={
            <AuthIconBadge>
              <MailCheck size={24} strokeWidth={1.75} aria-hidden="true" />
            </AuthIconBadge>
          }
          title={t("requestedTitle")}
          subtitle={t.rich("requestedBody", {
            email: sentTo,
            strong: (chunks) => <strong className="font-semibold text-ink">{chunks}</strong>,
          })}
        />

        {error && (
          <div className="mt-6">
            <AuthAlert>{error}</AuthAlert>
          </div>
        )}

        <Link href="/login" className="btn btn-secondary au-focus mt-7 flex w-full min-h-12 no-underline">
          {t("backToLogin")}
        </Link>

        <p className="mt-[22px] text-center text-[13.5px] text-muted-2">
          {cooldown > 0 ? (
            <>
              {t("noEmail")}{" "}
              {t("resendIn")}{" "}
              <span className="font-mono text-ink">
                0:{String(cooldown).padStart(2, "0")}
              </span>
            </>
          ) : (
            <>
              {t("noEmail")}{" "}
              <button
                type="button"
                disabled={isPending}
                className="au-text-link au-focus cursor-pointer rounded border-0 bg-transparent p-1 text-[13.5px] font-semibold text-ink"
                onClick={async () => {
                  if (await requestReset(sentTo)) {
                    setResent(true);
                  }
                }}
              >
                {t("resend")}
              </button>
            </>
          )}
        </p>
        {resent && (
          <p role="status" className="mt-2 text-center text-[12.5px] text-success">
            {t("resent")}
          </p>
        )}
        <p className="mt-2.5 text-center text-[12.5px] text-muted-2">{t("checkSpam")}</p>
      </>
    );
  }

  return (
    <>
      <AuthSteps current={1} />
      <AuthCardHeader
        badge={
          <AuthIconBadge>
            <KeyRound size={24} strokeWidth={1.75} aria-hidden="true" />
          </AuthIconBadge>
        }
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <form
        className="mt-7 flex flex-col gap-[14px]"
        onSubmit={async (event) => {
          event.preventDefault();

          const formData = new FormData(event.currentTarget);
          const email = String(formData.get("email") ?? "").trim();

          if (await requestReset(email)) {
            setSentTo(email);
            toast({
              tone: "success",
              title: t("toastSuccessTitle"),
              subtitle: t("toastSuccessBody"),
            });
          }
        }}
      >
        <TextInput
          id="email"
          label={t("emailLabel")}
          type="email"
          placeholder={t("emailPlaceholder")}
          autoComplete="email"
          required
        />

        {error && <AuthAlert>{error}</AuthAlert>}

        <PrimaryButton type="submit" disabled={isPending} className="au-focus mt-1">
          {isPending && (
            <LoaderCircle size={16} strokeWidth={2} className="au-spin" aria-hidden="true" />
          )}
          <span className="leading-tight">
            {isPending ? t("submitting") : t("submit")}
          </span>
          {!isPending && <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />}
        </PrimaryButton>
      </form>

      <p className="mt-6 text-center text-[13.5px] text-muted-2">
        {t("remembered")}{" "}
        <Link href="/login" className="au-text-link au-focus rounded font-semibold text-ink no-underline">
          {t("signIn")}
        </Link>
      </p>
    </>
  );
}
