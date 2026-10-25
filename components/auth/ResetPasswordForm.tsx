"use client";

import AuthAlert from "@/components/auth/AuthAlert";
import AuthCardHeader, { AuthIconBadge, AuthSteps } from "@/components/auth/AuthCardHeader";
import PrimaryButton from "@/components/Buttons/PrimaryButton";
import PasswordInput from "@/components/inputs/password-input";
import { useToast } from "@/components/Toasts";
import { authClient } from "@/lib/auth-client";
import { ArrowRight, Check, Circle, LoaderCircle, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

// Muss zu `minPasswordLength` in lib/auth.ts passen.
const MIN_PASSWORD_LENGTH = 12;

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const t = useTranslations("Auth.resetPassword");
  const token = searchParams.get("token") ?? "";
  const callbackError = searchParams.get("error");
  const [error, setError] = useState<string | null>(
    callbackError === "INVALID_TOKEN" ? t("invalidToken") : null,
  );
  const [repeatError, setRepeatError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");

  // Nur die Mindestlänge erzwingt auch der Server; die übrigen Punkte sind
  // Empfehlungen und blockieren das Absenden nicht.
  const rules = [
    { ok: password.length >= MIN_PASSWORD_LENGTH, label: t("ruleLength", { count: MIN_PASSWORD_LENGTH }) },
    { ok: /[a-z]/.test(password) && /[A-Z]/.test(password), label: t("ruleCase") },
    { ok: /\d/.test(password), label: t("ruleNumber") },
  ];
  const matches = !repeatError && passwordRepeat.length > 0 && passwordRepeat === password;

  if (isDone) {
    return (
      <div role="status" className="flex flex-col items-center py-2 text-center">
        <span className="au-success-pop flex size-16 items-center justify-center rounded-full bg-ink text-white">
          <Check size={28} strokeWidth={2.5} aria-hidden="true" />
        </span>
        <h1 className="mt-7 font-display text-[26px] leading-[1.1] font-semibold tracking-[-0.8px] text-ink">
          {t("successTitle")}
        </h1>
        <p className="mt-2.5 max-w-[320px] text-[14px] leading-[1.6] text-muted-2">
          {t("successBody")}
        </p>
        <Link href="/login" className="btn btn-block btn-primary au-focus mt-7 no-underline">
          <span>{t("backToLogin")}</span>
          <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <>
      <AuthSteps current={3} />
      <AuthCardHeader
        badge={
          <AuthIconBadge>
            <Lock size={24} strokeWidth={1.75} aria-hidden="true" />
          </AuthIconBadge>
        }
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <form
        className="mt-7 flex flex-col gap-[14px]"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setRepeatError(null);

          if (!token) {
            setError(t("invalidToken"));
            return;
          }

          if (password.length < MIN_PASSWORD_LENGTH) {
            setError(t("tooShort", { count: MIN_PASSWORD_LENGTH }));
            return;
          }

          if (!passwordRepeat) {
            setRepeatError(t("repeatRequired"));
            return;
          }

          if (password !== passwordRepeat) {
            setRepeatError(t("passwordMismatch"));
            return;
          }

          setIsPending(true);

          const { error: resetError } = await authClient.resetPassword({
            token,
            newPassword: password,
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

          setIsDone(true);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <PasswordInput
            showStrength
            id="password"
            label={t("passwordLabel")}
            placeholder={t("passwordPlaceholder", { count: MIN_PASSWORD_LENGTH })}
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
          />
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {rules.map((rule) => (
              <li
                key={rule.label}
                className={`flex items-center gap-2 text-[12.5px] ${rule.ok ? "text-ink" : "text-muted-2"}`}
              >
                {rule.ok ? (
                  <Check size={14} strokeWidth={2.5} className="text-success" aria-hidden="true" />
                ) : (
                  <Circle size={14} strokeWidth={2} className="text-muted" aria-hidden="true" />
                )}
                {rule.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-1.5">
          <PasswordInput
            id="password_repeat"
            label={t("passwordRepeatLabel")}
            placeholder={t("passwordRepeatLabel")}
            autoComplete="new-password"
            value={passwordRepeat}
            onChange={(event) => {
              setPasswordRepeat(event.target.value);
              setRepeatError(null);
            }}
          />
          {repeatError && <span className="text-[12px] text-danger">{repeatError}</span>}
          {matches && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-success">
              <span className="size-1.5 rounded-full bg-success" />
              {t("passwordsMatch")}
            </span>
          )}
        </div>

        {error && <AuthAlert>{error}</AuthAlert>}

        <PrimaryButton type="submit" disabled={isPending || !token} className="au-focus mt-1">
          {isPending && (
            <LoaderCircle size={16} strokeWidth={2} className="au-spin" aria-hidden="true" />
          )}
          <span className="leading-tight">
            {isPending ? t("submitting") : t("submit")}
          </span>
        </PrimaryButton>
      </form>
    </>
  );
}
