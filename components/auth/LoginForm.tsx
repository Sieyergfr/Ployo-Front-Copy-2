"use client";

import AuthAlert from "@/components/auth/AuthAlert";
import SocialSignInButtons from "@/components/auth/SocialSignInButtons";
import PrimaryButton from "@/components/Buttons/PrimaryButton";
import Checkbox from "@/components/inputs/checkbox";
import PasswordInput from "@/components/inputs/password-input";
import TextInput from "@/components/inputs/text-input";
import { useToast } from "@/components/Toasts";
import { authClient } from "@/lib/auth-client";
import { LoaderCircle, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm({ next }: { next?: string }) {
  const target = next ?? "/select";
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("Auth.login");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  async function handleResendVerification() {
    if (!unverifiedEmail || isResending) {
      return;
    }

    setIsResending(true);

    const { error: resendError } = await authClient.sendVerificationEmail({
      email: unverifiedEmail,
      callbackURL: target,
    });

    setIsResending(false);

    if (resendError) {
      const message =
        resendError.message ?? t("resendVerificationErrorFallback");
      setError(message);
      toast({
        tone: "error",
        title: t("resendVerificationErrorTitle"),
        subtitle: message,
      });
      return;
    }

    toast({
      tone: "success",
      title: t("resendVerificationSuccessTitle"),
      subtitle: t("resendVerificationSuccessBody"),
    });
    router.push(`/confirm?email=${encodeURIComponent(unverifiedEmail)}`);
  }

  return (
    <div className="mt-7">
      <SocialSignInButtons target={target} disabled={isPending} onError={setError} />

      <form
        className="flex flex-col gap-[14px]"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setUnverifiedEmail(null);
          setIsPending(true);

          const formData = new FormData(event.currentTarget);
          const email = String(formData.get("email") ?? "");
          const password = String(formData.get("password") ?? "");
          const rememberMe = formData.get("stay_logged") === "on";

          const { data: signInData, error: signInError } = await authClient.signIn.email({
            email,
            password,
            rememberMe,
            callbackURL: target,
          });

          setIsPending(false);

          // Bei aktivem 2FA liefert better-auth statt einer Session ein
          // `twoFactorRedirect`-Signal — nicht Teil des generierten Typs für
          // signIn.email, da signIn selbst nicht zum two-factor-Plugin gehört.
          const twoFactorRedirect = (signInData as { twoFactorRedirect?: boolean } | null)
            ?.twoFactorRedirect;

          if (!signInError && twoFactorRedirect) {
            router.push(`/login/2fa?next=${encodeURIComponent(target)}`);
            return;
          }

          if (signInError) {
            if (signInError.code === "EMAIL_NOT_VERIFIED") {
              setUnverifiedEmail(email);
              toast({
                tone: "error",
                title: t("unverifiedErrorTitle"),
                subtitle: t("unverifiedErrorBody"),
              });
              return;
            }

            const message = signInError.message ?? t("signInErrorFallback");
            setError(message);
            toast({
              tone: "error",
              title: t("signInErrorTitle"),
              subtitle: message,
            });
            return;
          }

          toast({
            tone: "success",
            title: t("signInSuccessTitle"),
            subtitle: t("signInSuccessBody"),
          });
          router.push(target);
          router.refresh();
        }}
      >
        {error && <AuthAlert>{error}</AuthAlert>}

        {unverifiedEmail && (
          <div className="rounded-[10px] border border-danger/20 bg-danger/5 px-3 py-3 text-[12.5px] text-ink">
            <div className="flex items-center gap-2 font-medium">
              <MailCheck size={15} strokeWidth={2} />
              {t("unverifiedTitle")}
            </div>
            <p className="mt-1 text-muted-2">
              {t("unverifiedBody", { email: unverifiedEmail })}
            </p>
            <button
              type="button"
              className="btn btn-secondary mt-3 w-full"
              disabled={isResending}
              onClick={handleResendVerification}
            >
              {isResending ? t("resendingVerification") : t("resendVerification")}
            </button>
          </div>
        )}

        <TextInput
          id="email"
          label={t("emailLabel")}
          type="email"
          placeholder={t("emailPlaceholder")}
          autoComplete="email"
          required
        />

        <div className="field">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="password" className="label">
              {t("passwordLabel")}
            </label>
            <Link
              href="/forgot-password"
              className="au-text-link au-focus rounded text-[12.5px] font-medium text-muted-2 no-underline"
            >
              {t("forgotPassword")}
            </Link>
          </div>
          <PasswordInput
            id="password"
            placeholder={t("passwordPlaceholder")}
            autoComplete="current-password"
            required
          />
        </div>

        <Checkbox id="stay_logged">
          <span>{t("stayLoggedIn")}</span>
        </Checkbox>

        <PrimaryButton type="submit" disabled={isPending} className="au-focus mt-1">
          {isPending && (
            <LoaderCircle size={16} strokeWidth={2} className="au-spin" aria-hidden="true" />
          )}
          <span className="leading-tight">
            {isPending ? t("submitting") : t("submit")}
          </span>
        </PrimaryButton>
      </form>
    </div>
  );
}
