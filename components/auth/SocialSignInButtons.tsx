"use client";

import { useToast } from "@/components/Toasts";
import { authClient } from "@/lib/auth-client";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useState } from "react";

type SocialProvider = "google" | "apple";

type SocialProviderConfig = Record<SocialProvider, boolean>;

/**
 * Google-/Apple-Login inkl. "oder mit E-Mail"-Trenner. Wird von Anmelden und
 * Registrieren gemeinsam genutzt — bei beiden legt der Rücksprung für eine
 * unbekannte Adresse ein Konto an (siehe `requestSignUp`).
 */
export default function SocialSignInButtons({
  target,
  disabled = false,
  onError,
}: {
  target: string;
  disabled?: boolean;
  onError: (message: string | null) => void;
}) {
  const { toast } = useToast();
  const t = useTranslations("Auth.login");
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

  async function handleSocialSignIn(provider: SocialProvider) {
    if (!providerConfig[provider]) {
      onError(
        t("socialNotConfiguredError", {
          provider: provider === "google" ? t("google") : t("apple"),
        }),
      );
      return;
    }

    onError(null);
    setSocialProvider(provider);

    const { error: signInError } = await authClient.signIn.social({
      provider,
      callbackURL: target,
      errorCallbackURL: "/login",
      // Die Provider laufen mit `disableImplicitSignUp` (lib/auth.ts) — ohne
      // dieses Flag würde der Rücksprung für eine unbekannte Adresse kein
      // Konto mehr anlegen. Im Browser soll die Erstanmeldung wie bisher
      // funktionieren; die Mobile-App sendet es bewusst nicht.
      requestSignUp: true,
    });

    setSocialProvider(null);

    if (signInError) {
      const message = signInError.message ?? t("signInErrorFallback");
      onError(message);
      toast({
        tone: "error",
        title: t("signInErrorTitle"),
        subtitle: message,
      });
    }
  }

  const providers = [
    { id: "google", icon: "/google.svg", label: t("continueWithGoogle"), name: t("google") },
    { id: "apple", icon: "/apple.svg", label: t("continueWithApple"), name: t("apple") },
  ] as const;

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            className="btn btn-secondary au-focus flex min-w-0 items-center justify-center gap-2 px-3 py-2.5"
            disabled={Boolean(socialProvider) || disabled || !providerConfig[provider.id]}
            title={
              providerConfig[provider.id]
                ? t("socialConfiguredTitle", { provider: provider.name })
                : t("socialNotConfiguredTitle", { provider: provider.name })
            }
            onClick={() => handleSocialSignIn(provider.id)}
          >
            <Image src={provider.icon} alt="" width={18} height={18} aria-hidden="true" />
            <span className="truncate">
              {socialProvider === provider.id ? t("connecting") : provider.label}
            </span>
          </button>
        ))}
      </div>

      <div aria-hidden="true" className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-ink/[0.08]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-2">
          {t("orWithEmail")}
        </span>
        <span className="h-px flex-1 bg-ink/[0.08]" />
      </div>
    </>
  );
}
