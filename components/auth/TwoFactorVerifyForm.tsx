"use client";

import PrimaryButton from "@/components/Buttons/PrimaryButton";
import TextInput from "@/components/inputs/text-input";
import { useToast } from "@/components/Toasts";
import { authClient } from "@/lib/auth-client";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function TwoFactorVerifyForm({ next }: { next?: string }) {
  const target = next ?? "/select";
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("Auth.twoFactor");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setIsPending(true);

        const formData = new FormData(event.currentTarget);
        const code = String(formData.get("code") ?? "").trim();

        const { error: verifyError } = useBackupCode
          ? await authClient.twoFactor.verifyBackupCode({ code })
          : await authClient.twoFactor.verifyTotp({ code });

        setIsPending(false);

        if (verifyError) {
          const message = verifyError.message ?? t("invalidCode");
          setError(message);
          toast({ tone: "error", title: t("errorTitle"), subtitle: message });
          return;
        }

        router.push(target);
        router.refresh();
      }}
    >
      <div className="card-form">
        <TextInput
          id="code"
          label={useBackupCode ? t("backupCodeLabel") : t("codeLabel")}
          placeholder={useBackupCode ? "xxxx-xxxx" : "123456"}
          autoComplete="one-time-code"
          inputMode={useBackupCode ? "text" : "numeric"}
          required
          autoFocus
        />
      </div>

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

      <button
        type="button"
        className="self-center text-[12.5px] font-medium text-ink underline underline-offset-2"
        onClick={() => {
          setUseBackupCode((value) => !value);
          setError(null);
        }}
      >
        {useBackupCode ? t("useAuthenticatorCode") : t("useBackupCode")}
      </button>
    </form>
  );
}
