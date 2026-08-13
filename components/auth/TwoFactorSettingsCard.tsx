"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/components/Toasts";
import { ShieldCheck, ShieldOff } from "lucide-react";

function extractSecret(totpUri: string) {
  try {
    const url = new URL(totpUri);
    return url.searchParams.get("secret") ?? totpUri;
  } catch {
    return totpUri;
  }
}

export default function TwoFactorSettingsCard({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [step, setStep] = useState<"idle" | "password" | "setup" | "disable">("idle");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");

  async function handleEnable(event: React.FormEvent) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    const { data, error: enableError } = await authClient.twoFactor.enable({ password });

    setIsPending(false);

    if (enableError || !data) {
      setError(enableError?.message ?? "2FA konnte nicht aktiviert werden.");
      return;
    }

    setTotpUri(data.totpURI);
    setBackupCodes(data.backupCodes);
    setPassword("");
    setStep("setup");
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code });

    setIsPending(false);

    if (verifyError) {
      setError(
        verifyError.message ??
          "Der Code war ungültig. Bitte prüfen Sie Ihre Authenticator-App.",
      );
      return;
    }

    toast({ tone: "success", title: "2FA aktiviert", subtitle: "Zwei-Faktor-Authentifizierung ist jetzt aktiv." });
    setEnabled(true);
    setStep("idle");
    setTotpUri(null);
    setBackupCodes(null);
    setCode("");
  }

  async function handleDisable(event: React.FormEvent) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    const { error: disableError } = await authClient.twoFactor.disable({ password });

    setIsPending(false);

    if (disableError) {
      setError(disableError.message ?? "2FA konnte nicht deaktiviert werden.");
      return;
    }

    toast({ tone: "success", title: "2FA deaktiviert" });
    setEnabled(false);
    setStep("idle");
    setPassword("");
  }

  if (step === "setup" && totpUri && backupCodes) {
    const secret = extractSecret(totpUri);

    return (
      <div className="flex flex-col gap-3">
        <p className="text-[12.5px] leading-5 text-muted">
          Fügen Sie diesen Schlüssel manuell in Ihrer Authenticator-App
          hinzu (z. B. Google Authenticator, 1Password, Authy):
        </p>
        <code className="break-all rounded-[10px] border border-border-light bg-bg px-3 py-2.5 font-mono text-[12px] text-ink">
          {secret}
        </code>

        <p className="mt-2 text-[12.5px] font-semibold text-danger">
          Backup-Codes — sicher aufbewahren, jeder Code ist einmal gültig:
        </p>
        <div className="grid grid-cols-2 gap-1.5 rounded-[10px] border border-danger/20 bg-danger/5 p-3 font-mono text-[12px] text-ink">
          {backupCodes.map((backupCode) => (
            <span key={backupCode}>{backupCode}</span>
          ))}
        </div>

        <form onSubmit={handleVerify} className="mt-2 flex flex-col gap-3">
          <div className="field">
            <label htmlFor="twofa-verify-code" className="label">
              Bestätigungscode aus der App
            </label>
            <input
              id="twofa-verify-code"
              className="input input-mono"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              inputMode="numeric"
              autoFocus
              required
            />
          </div>
          {error && (
            <p className="rounded-[10px] border border-danger/20 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setStep("idle");
                setTotpUri(null);
                setBackupCodes(null);
              }}
            >
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? "Wird geprüft..." : "Bestätigen und aktivieren"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (step === "password" || step === "disable") {
    const disabling = step === "disable";

    return (
      <form onSubmit={disabling ? handleDisable : handleEnable} className="flex flex-col gap-3">
        <div className="field">
          <label htmlFor="twofa-password" className="label">
            Passwort zur Bestätigung
          </label>
          <input
            id="twofa-password"
            type="password"
            className="input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            autoFocus
          />
        </div>
        {error && (
          <p className="rounded-[10px] border border-danger/20 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setStep("idle");
              setPassword("");
              setError(null);
            }}
          >
            Abbrechen
          </button>
          <button
            type="submit"
            className={disabling ? "btn btn-secondary border-danger/25 text-danger" : "btn btn-primary"}
            disabled={isPending}
          >
            {isPending ? "Wird verarbeitet..." : disabling ? "2FA deaktivieren" : "Weiter"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        {enabled ? (
          <>
            <ShieldCheck size={16} className="text-success" />
            Aktiv
          </>
        ) : (
          <>
            <ShieldOff size={16} className="text-muted" />
            Nicht aktiv
          </>
        )}
      </div>
      <p className="text-[12.5px] leading-5 text-muted">
        Mit Zwei-Faktor-Authentifizierung (TOTP) benötigen Sie beim Anmelden
        zusätzlich zum Passwort einen Code aus einer Authenticator-App.
      </p>
      <div className="flex justify-end">
        {enabled ? (
          <button
            type="button"
            className="btn btn-secondary border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
            onClick={() => setStep("disable")}
          >
            2FA deaktivieren
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => setStep("password")}>
            2FA aktivieren
          </button>
        )}
      </div>
    </div>
  );
}
