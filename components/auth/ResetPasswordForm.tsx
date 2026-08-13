"use client";

import PrimaryButton from "@/components/Buttons/PrimaryButton";
import PasswordInput from "@/components/inputs/password-input";
import { useToast } from "@/components/Toasts";
import { authClient } from "@/lib/auth-client";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const t = useTranslations("Auth.resetPassword");
  const token = searchParams.get("token") ?? "";
  const callbackError = searchParams.get("error");
  const [error, setError] = useState<string | null>(
    callbackError === "INVALID_TOKEN" ? t("invalidToken") : null,
  );
  const [isPending, setIsPending] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);

        const formData = new FormData(event.currentTarget);
        const password = String(formData.get("password") ?? "");
        const passwordRepeat = String(formData.get("password_repeat") ?? "");

        if (!token) {
          setError(t("invalidToken"));
          return;
        }

        if (password !== passwordRepeat) {
          setError(t("passwordMismatch"));
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

        toast({
          tone: "success",
          title: t("successTitle"),
          subtitle: t("successBody"),
        });
        router.push("/login");
        router.refresh();
      }}
    >
      <div className="card-form">
        <PasswordInput
          showStrength
          id="password"
          label={t("passwordLabel")}
          placeholder="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
        <PasswordInput
          id="password_repeat"
          label={t("passwordRepeatLabel")}
          placeholder="password"
          autoComplete="new-password"
          required
        />
      </div>

      {error && (
        <p className="rounded-[10px] border border-danger/20 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      <PrimaryButton type="submit" disabled={isPending || !token}>
        <span className="leading-tight">
          {isPending ? t("submitting") : t("submit")}
        </span>
        <ArrowRight size={12} strokeWidth={3} color="currentColor" />
      </PrimaryButton>

      <Link href="/login" className="text-center text-[12.5px] text-muted underline">
        {t("backToLogin")}
      </Link>
    </form>
  );
}
