"use client";

import AuthCardHeader, { AuthPill } from "@/components/auth/AuthCardHeader";
import PrimaryButton from "@/components/Buttons/PrimaryButton";
import Checkbox from "@/components/inputs/checkbox";
import TextInput from "@/components/inputs/text-input";
import { useToast } from "@/components/Toasts";
import { authClient } from "@/lib/auth-client";
import { Clock, KeyRound, LoaderCircle, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const CODE_LENGTH = 6;
const TOTP_PERIOD = 30;
// Umfang des Fortschrittsrings (r = 30).
const RING_CIRCUMFERENCE = 188.5;

function secondsLeftInPeriod() {
  return TOTP_PERIOD - (Math.floor(Date.now() / 1000) % TOTP_PERIOD);
}

/**
 * Sechs Kästchen, hinter denen ein einziges unsichtbares Eingabefeld liegt —
 * so funktionieren Einfügen und das Autofill von `one-time-code` weiterhin.
 */
function CodeBoxes({
  code,
  hasError,
  label,
  onChange,
}: {
  code: string;
  hasError: boolean;
  label: string;
  onChange: (code: string) => void;
}) {
  const [focused, setFocused] = useState(false);

  function box(index: number) {
    const char = code.charAt(index);
    const active =
      focused &&
      (index === code.length || (code.length === CODE_LENGTH && index === CODE_LENGTH - 1));

    return (
      <div
        key={index}
        className={`au-box flex h-[52px] min-w-0 flex-1 items-center justify-center rounded-[10px] border border-border-light bg-bg font-display text-[22px] font-semibold text-ink min-[421px]:h-[60px] min-[421px]:text-[26px] ${
          active ? "au-box-active" : ""
        } ${hasError && !char ? "au-box-error" : ""}`}
      >
        {active && !char ? <span className="au-caret" /> : char}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="code"
        className="text-center font-mono text-[10px] uppercase tracking-[0.06em] text-muted-2"
      >
        {label}
      </label>
      <div className="relative">
        <div aria-hidden="true" className="flex items-center gap-2">
          {[0, 1, 2].map(box)}
          <span className="h-0.5 w-1.5 shrink-0 rounded-sm bg-[#c9c8c3] min-[421px]:w-2.5" />
          {[3, 4, 5].map(box)}
        </div>
        <input
          id="code"
          name="code"
          className="au-otp-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          value={code}
          autoFocus
          onChange={(event) =>
            onChange(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))
          }
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>
    </div>
  );
}

export default function TwoFactorVerifyForm({ next }: { next?: string }) {
  const target = next ?? "/select";
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("Auth.twoFactor");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [code, setCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(TOTP_PERIOD);

  // Erst nach dem Mount ticken, damit Server- und Client-Render
  // übereinstimmen (die Restzeit hängt von der Uhrzeit ab).
  useEffect(() => {
    const interval = setInterval(() => setSecondsLeft(secondsLeftInPeriod()), 1000);
    return () => clearInterval(interval);
  }, []);

  const ringOffset = (RING_CIRCUMFERENCE * (1 - secondsLeft / TOTP_PERIOD)).toFixed(1);

  return (
    <>
      <AuthCardHeader
        badge={
          <div className="relative size-16">
            <svg
              width="64"
              height="64"
              viewBox="0 0 64 64"
              aria-hidden="true"
              className="absolute inset-0 -rotate-90"
            >
              <circle cx="32" cy="32" r="30" fill="none" stroke="rgba(139,110,212,0.15)" strokeWidth="2" />
              {!useBackupCode && (
                <circle
                  className="au-totp"
                  cx="32"
                  cy="32"
                  r="30"
                  fill="none"
                  stroke="#8b6ed4"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={ringOffset}
                />
              )}
            </svg>
            <span className="au-icon-badge absolute inset-1.5 flex items-center justify-center rounded-full text-[#7a3c9c]">
              {useBackupCode ? (
                <KeyRound size={22} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Smartphone size={22} strokeWidth={1.75} aria-hidden="true" />
              )}
            </span>
          </div>
        }
        pill={<AuthPill>{t("pill")}</AuthPill>}
        title={useBackupCode ? t("backupTitle") : t("title")}
        subtitle={useBackupCode ? t("backupSubtitle") : t("subtitle")}
      />

      <form
        className="mt-[26px] flex flex-col gap-[14px]"
        data-au-medium
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);

          const formData = new FormData(event.currentTarget);
          const trustDevice = formData.get("trust_device") === "on";
          const submittedCode = useBackupCode
            ? String(formData.get("backupCode") ?? "").trim()
            : code;

          if (!useBackupCode && submittedCode.length !== CODE_LENGTH) {
            setError(t("incompleteCode"));
            return;
          }

          if (useBackupCode && !submittedCode) {
            setError(t("incompleteBackupCode"));
            return;
          }

          setIsPending(true);

          const { error: verifyError } = useBackupCode
            ? await authClient.twoFactor.verifyBackupCode({ code: submittedCode, trustDevice })
            : await authClient.twoFactor.verifyTotp({ code: submittedCode, trustDevice });

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
        {useBackupCode ? (
          <TextInput
            id="backupCode"
            label={t("backupCodeLabel")}
            placeholder="xxxx-xxxx"
            autoComplete="off"
            spellCheck={false}
            className="au-backup-input"
            autoFocus
          />
        ) : (
          <>
            <CodeBoxes
              code={code}
              hasError={Boolean(error)}
              label={t("codeLabel")}
              onChange={(value) => {
                setCode(value);
                setError(null);
              }}
            />
            <span className="flex items-center justify-center gap-1.5 text-center text-[12px] text-muted-2">
              <Clock size={13} strokeWidth={2} className="shrink-0 text-muted" aria-hidden="true" />
              {t("codeRefreshHint")}
            </span>
          </>
        )}

        {error && (
          <span role="alert" className="text-center text-[12px] text-danger">
            {error}
          </span>
        )}

        <Checkbox id="trust_device">
          <span>{t("trustDevice")}</span>
        </Checkbox>

        <PrimaryButton type="submit" disabled={isPending} className="au-focus">
          {isPending && (
            <LoaderCircle size={16} strokeWidth={2} className="au-spin" aria-hidden="true" />
          )}
          <span className="leading-tight">
            {isPending ? t("submitting") : t("submit")}
          </span>
        </PrimaryButton>
      </form>

      <div className="mt-[22px] flex flex-col items-center gap-1.5 border-t border-ink/[0.06] pt-[18px] text-center">
        <button
          type="button"
          className="au-text-link au-focus cursor-pointer rounded border-0 bg-transparent p-1.5 text-[13.5px] font-semibold text-ink"
          onClick={() => {
            setUseBackupCode((value) => !value);
            setError(null);
          }}
        >
          {useBackupCode ? t("useAuthenticatorCode") : t("useBackupCode")}
        </button>
        <span className="text-[12.5px] text-muted-2">
          {t("noAccess")}{" "}
          <a
            href="mailto:info@ployo.io"
            className="au-text-link au-focus rounded text-muted-2 underline underline-offset-2"
          >
            {t("contactSupport")}
          </a>
        </span>
      </div>
    </>
  );
}
