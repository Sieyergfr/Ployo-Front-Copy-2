"use client";

import PrimaryButton from "@/components/Buttons/PrimaryButton";
import Checkbox from "@/components/inputs/checkbox";
import PasswordInput from "@/components/inputs/password-input";
import TextInput from "@/components/inputs/text-input";
import { useToast } from "@/components/Toasts";
import { authClient } from "@/lib/auth-client";
import { ArrowRight, MailCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type SocialProvider = "google" | "apple";

type SocialProviderConfig = Record<SocialProvider, boolean>;

export default function LoginForm({ next }: { next?: string }) {
  const target = next ?? "/select";
  const router = useRouter();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [providerConfig, setProviderConfig] = useState<SocialProviderConfig>({
    apple: false,
    google: false,
  });
  const [socialProvider, setSocialProvider] = useState<SocialProvider | null>(
    null,
  );

  useEffect(() => {
    let isMounted = true;

    fetch("/api/auth-config")
      .then((response) => response.json())
      .then((data: { providers?: Partial<SocialProviderConfig> }) => {
        if (!isMounted) {
          return;
        }

        setProviderConfig({
          apple: Boolean(data.providers?.apple),
          google: Boolean(data.providers?.google),
        });
      })
      .catch(() => {
        if (isMounted) {
          setProviderConfig({ apple: false, google: false });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

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
        resendError.message ??
        "Der Bestätigungslink konnte nicht versendet werden.";
      setError(message);
      toast({
        tone: "error",
        title: "Versand fehlgeschlagen",
        subtitle: message,
      });
      return;
    }

    toast({
      tone: "success",
      title: "Bestätigungslink versendet",
      subtitle: "Bitte prüfen Sie Ihr Postfach.",
    });
    router.push(`/confirm?email=${encodeURIComponent(unverifiedEmail)}`);
  }

  async function handleSocialSignIn(provider: SocialProvider) {
    if (!providerConfig[provider]) {
      const message = `${provider === "google" ? "Google" : "Apple"} Login ist noch nicht konfiguriert.`;
      setError(message);
      return;
    }

    setError(null);
    setSocialProvider(provider);

    const { error: signInError } = await authClient.signIn.social({
      provider,
      callbackURL: target,
      errorCallbackURL: "/login",
    });

    setSocialProvider(null);

    if (signInError) {
      const message = signInError.message ?? "Anmeldung fehlgeschlagen.";
      setError(message);
      toast({
        tone: "error",
        title: "Anmeldung fehlgeschlagen",
        subtitle: message,
      });
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
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
              title: "E-Mail nicht bestätigt",
              subtitle:
                "Bitte bestätigen Sie Ihre E-Mail-Adresse, um sich anzumelden.",
            });
            return;
          }

          const message = signInError.message ?? "Anmeldung fehlgeschlagen.";
          setError(message);
          toast({
            tone: "error",
            title: "Anmeldung fehlgeschlagen",
            subtitle: message,
          });
          return;
        }

        toast({
          tone: "success",
          title: "Willkommen zurück",
          subtitle: "Sie werden weitergeleitet.",
        });
        router.push(target);
        router.refresh();
      }}
    >
      <div className="card-form">
        <TextInput
          id="email"
          label="E-Mail"
          type="email"
          placeholder="name@unternehmen.de"
          autoComplete="email"
          required
        />
        <PasswordInput
          id="password"
          label="Passwort"
          placeholder="password"
          autoComplete="current-password"
          required
        />
        <Checkbox id="stay_logged">
          <span>Angemeldet bleiben</span>
        </Checkbox>
        <Link
          href="/forgot-password"
          className="self-start text-[12.5px] font-medium text-ink underline underline-offset-2"
        >
          Passwort vergessen?
        </Link>
      </div>

      {unverifiedEmail && (
        <div className="rounded-[10px] border border-danger/20 bg-danger/5 px-3 py-3 text-[12.5px] text-ink">
          <div className="flex items-center gap-2 font-medium">
            <MailCheck size={15} strokeWidth={2} />
            E-Mail-Adresse noch nicht bestätigt
          </div>
          <p className="mt-1 text-muted">
            {unverifiedEmail} wurde noch nicht bestätigt. Fordern Sie einen
            neuen Bestätigungslink an, um sich anmelden zu können.
          </p>
          <button
            type="button"
            className="btn btn-secondary mt-3 w-full"
            disabled={isResending}
            onClick={handleResendVerification}
          >
            {isResending
              ? "Wird versendet..."
              : "Bestätigungslink erneut senden"}
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-[10px] border border-danger/20 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      <PrimaryButton type="submit" disabled={isPending}>
        <span className="leading-tight">
          {isPending ? "Anmelden..." : "Anmelden"}
        </span>
        <ArrowRight size={12} strokeWidth={3} color="currentColor" />
      </PrimaryButton>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border-soft" />
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
          oder
        </span>
        <span className="h-px flex-1 bg-border-soft" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn btn-secondary flex min-w-0 items-center justify-center gap-2 px-3"
          disabled={Boolean(socialProvider) || isPending || !providerConfig.google}
          title={
            providerConfig.google
              ? "Mit Google anmelden"
              : "Google Login ist noch nicht konfiguriert"
          }
          onClick={() => handleSocialSignIn("google")}
        >
          <Image
            src="/google.svg"
            alt=""
            width={16}
            height={16}
            aria-hidden="true"
          />
          <span className="truncate">
            {socialProvider === "google" ? "Verbinden..." : "Google"}
          </span>
        </button>

        <button
          type="button"
          className="btn btn-secondary flex min-w-0 items-center justify-center gap-2 px-3"
          disabled={Boolean(socialProvider) || isPending || !providerConfig.apple}
          title={
            providerConfig.apple
              ? "Mit Apple anmelden"
              : "Apple Login ist noch nicht konfiguriert"
          }
          onClick={() => handleSocialSignIn("apple")}
        >
          <Image
            src="/apple.svg"
            alt=""
            width={16}
            height={16}
            aria-hidden="true"
          />
          <span className="truncate">
            {socialProvider === "apple" ? "Verbinden..." : "Apple"}
          </span>
        </button>
      </div>
    </form>
  );
}
