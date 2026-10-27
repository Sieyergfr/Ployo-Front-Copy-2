"use client";

import { dbInputClass } from "@/components/dashboard/DbDrawer";
import { ctaClass, secondaryClass } from "@/components/dashboard/ui";
import { authClient } from "@/lib/auth-client";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import QRCode from "qrcode";
import { useState } from "react";

function extractSecret(totpUri: string) {
  try {
    return new URL(totpUri).searchParams.get("secret") ?? totpUri;
  } catch {
    return totpUri;
  }
}

/** Geführte 2FA-Einrichtung (Passwort → QR-Code → Code → Backup-Codes) für die Pflichtseite. */
export default function TwoFactorSetupWizard({ continueHref }: { continueHref: string }) {
  const t = useTranslations("TwoFactorSetupWizard");
  const [step, setStep] = useState<"password" | "scan" | "verify" | "backup">("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [qrSvg, setQrSvg] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const stepIndex = { password: 0, scan: 1, verify: 2, backup: 3 }[step];

  async function handlePassword(event: React.FormEvent) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    const { data, error: enableError } = await authClient.twoFactor.enable({ password });

    if (enableError || !data) {
      setIsPending(false);
      setError(enableError?.message ?? t("enableFailed"));
      return;
    }

    setSecret(extractSecret(data.totpURI));
    setQrSvg(await QRCode.toString(data.totpURI, { type: "svg", margin: 1, errorCorrectionLevel: "M" }));
    setBackupCodes(data.backupCodes);
    setPassword("");
    setIsPending(false);
    setStep("scan");
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s+/g, "") });

    setIsPending(false);

    if (verifyError) {
      setError(verifyError.message ?? t("invalidCode"));
      return;
    }

    setStep("backup");
  }

  const errorBox = error && (
    <p className="m-0 rounded-[10px] border border-[rgba(180,51,42,0.2)] bg-[rgba(180,51,42,0.05)] px-3 py-2 text-[13px] text-[#b4332a]">{error}</p>
  );

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {stepIndex > 0 && (
        <>
          <span className="flex gap-1.5" aria-hidden="true">
            {[1, 2, 3].map((index) => (
              <span key={index} className={`h-[3px] w-[26px] rounded-full ${index <= stepIndex ? "bg-[#8b6ed4]" : "bg-[#ecebe7]"}`} />
            ))}
          </span>
          <span className="font-mono text-[10.5px] tracking-[0.12em] text-[#6e6e6b] uppercase">{t("stepOf", { step: stepIndex, total: 3 })}</span>
        </>
      )}

      {step === "password" && (
        <form onSubmit={handlePassword} className="flex w-full flex-col gap-3 text-left">
          <h2 className="m-0 text-center font-display text-[22px] font-semibold tracking-[-0.5px]">{t("passwordTitle")}</h2>
          <p className="m-0 text-center text-[14px] leading-[1.55] text-[#6e6e6b]">{t("passwordBody")}</p>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">{t("passwordLabel")}</span>
            <input
              type="password"
              className={dbInputClass}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              autoFocus
            />
          </label>
          {errorBox}
          <div className="flex justify-end">
            <button type="submit" className={ctaClass} disabled={isPending}>
              {isPending ? t("processing") : t("next")}
            </button>
          </div>
        </form>
      )}

      {step === "scan" && (
        <div className="flex w-full flex-col items-center gap-3">
          <h2 className="m-0 font-display text-[22px] font-semibold tracking-[-0.5px]">{t("scanTitle")}</h2>
          <p className="m-0 text-[14px] leading-[1.55] text-[#6e6e6b]">{t("scanBody")}</p>
          <div
            className="size-[172px] rounded-[14px] border border-[#ecebe7] bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.06)] [&_svg]:size-full"
            role="img"
            aria-label={t("qrLabel")}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="flex w-full flex-col gap-1.5 text-left">
            <span className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">{t("manualKey")}</span>
            <span className="flex min-h-11 items-center justify-between gap-3 rounded-[10px] border border-dashed border-[#e4e3df] px-3">
              <code className="font-mono text-[14px] tracking-[0.06em] break-all">{secret.replace(/(.{4})/g, "$1 ").trim()}</code>
              <button
                type="button"
                className="flex cursor-pointer items-center gap-1 border-0 bg-transparent text-[13.5px] font-semibold text-[#6e6e6b] hover:text-ink"
                onClick={() => {
                  void navigator.clipboard?.writeText(secret).then(() => setCopied(true));
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? t("copied") : t("copy")}
              </button>
            </span>
          </div>
          <div className="flex w-full justify-end">
            <button type="button" className={ctaClass} onClick={() => setStep("verify")}>
              {t("next")}
            </button>
          </div>
        </div>
      )}

      {step === "verify" && (
        <form onSubmit={handleVerify} className="flex w-full flex-col items-center gap-3">
          <h2 className="m-0 font-display text-[22px] font-semibold tracking-[-0.5px]">{t("verifyTitle")}</h2>
          <p className="m-0 text-[14px] leading-[1.55] text-[#6e6e6b]">{t("verifyBody")}</p>
          <input
            className={`${dbInputClass} max-w-[240px] text-center font-mono text-[22px] tracking-[0.4em]`}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={t("codeLabel")}
            maxLength={8}
            required
            autoFocus
          />
          {errorBox}
          <div className="flex w-full justify-between">
            <button type="button" className={secondaryClass} onClick={() => setStep("scan")}>
              {t("back")}
            </button>
            <button type="submit" className={ctaClass} disabled={isPending}>
              {isPending ? t("checking") : t("activate")}
            </button>
          </div>
        </form>
      )}

      {step === "backup" && (
        <div className="flex w-full flex-col items-center gap-3">
          <h2 className="m-0 font-display text-[22px] font-semibold tracking-[-0.5px]">{t("backupTitle")}</h2>
          <p className="m-0 text-[14px] leading-[1.55] text-[#6e6e6b]">{t("backupBody")}</p>
          <div className="grid w-full grid-cols-2 gap-1.5 rounded-[12px] border border-[#ecebe7] bg-[#fafaf8] p-3.5 font-mono text-[13.5px]">
            {backupCodes.map((backupCode) => (
              <span key={backupCode}>{backupCode}</span>
            ))}
          </div>
          <div className="flex w-full justify-between">
            <button
              type="button"
              className={secondaryClass}
              onClick={() => {
                void navigator.clipboard?.writeText(backupCodes.join("\n"));
              }}
            >
              <Copy size={14} />
              {t("copyCodes")}
            </button>
            <Link href={continueHref} className={ctaClass}>
              {t("finish")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
