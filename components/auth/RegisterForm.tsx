"use client";

import SocialSignInButtons from "@/components/auth/SocialSignInButtons";
import AuthAlert from "@/components/auth/AuthAlert";
import PrimaryButton from "@/components/Buttons/PrimaryButton";
import Checkbox from "@/components/inputs/checkbox";
import PasswordInput from "@/components/inputs/password-input";
import TextInput from "@/components/inputs/text-input";
import { useToast } from "@/components/Toasts";
import { authClient } from "@/lib/auth-client";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterForm({
  next,
  requiresEmailVerification = false,
}: {
  next?: string;
  requiresEmailVerification?: boolean;
}) {
  const target = next ?? "/select";
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("Auth.register");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-6" data-au-wide>
      <SocialSignInButtons target={target} disabled={isPending} onError={setError} />

      <form
        className="flex flex-col gap-[14px]"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);

          const formData = new FormData(event.currentTarget);
          const firstName = String(formData.get("firstName") ?? "").trim();
          const lastName = String(formData.get("lastName") ?? "").trim();
          const email = String(formData.get("email") ?? "");
          const password = String(formData.get("password") ?? "");
          const termsAccepted = formData.get("terms") === "on";

          if (!termsAccepted) {
            setError(t("termsRequired"));
            toast({
              tone: "error",
              title: t("signUpErrorTitle"),
              subtitle: t("termsRequired"),
            });
            return;
          }

          setIsPending(true);

          const { error: signUpError } = await authClient.signUp.email({
            email,
            password,
            name: `${firstName} ${lastName}`.trim(),
            callbackURL: target,
            // @ts-expect-error – zusätzliches Feld, wird im auth.ts-Hook geprüft
            terms: termsAccepted,
          });

          setIsPending(false);

          if (signUpError) {
            // USER_ALREADY_EXISTS wird in lib/auth.ts gesetzt. Eigener Text,
            // damit die Meldung uebersetzbar bleibt und auf die naechsten
            // Schritte zeigt (anmelden oder Passwort zuruecksetzen).
            const message =
              signUpError.code === "USER_ALREADY_EXISTS"
                ? t("emailAlreadyRegistered")
                : (signUpError.message ?? t("signUpErrorFallback"));
            setError(message);
            toast({
              tone: "error",
              title: t("signUpErrorTitle"),
              subtitle: message,
            });
            return;
          }

          // Ist die Verifizierung aktiv, besteht noch keine Sitzung – der
          // Nutzer muss zuerst den Link in der E-Mail bestätigen.
          if (requiresEmailVerification) {
            toast({
              tone: "success",
              title: t("accountCreatedTitle"),
              subtitle: t("verifyEmailBody"),
            });
            router.push(`/confirm?email=${encodeURIComponent(email)}`);
            return;
          }

          toast({
            tone: "success",
            title: t("accountCreatedTitle"),
            subtitle: t("redirectingBody"),
          });
          router.push(target);
          router.refresh();
        }}
      >
        {error && <AuthAlert>{error}</AuthAlert>}

        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
          <TextInput
            id="firstName"
            type="text"
            label={t("firstNameLabel")}
            placeholder={t("firstNamePlaceholder")}
            autoComplete="given-name"
            required
          />
          <TextInput
            id="lastName"
            type="text"
            label={t("lastNameLabel")}
            placeholder={t("lastNamePlaceholder")}
            autoComplete="family-name"
            required
          />
        </div>
        <TextInput
          id="email"
          type="email"
          label={t("emailLabel")}
          placeholder={t("emailPlaceholder")}
          autoComplete="email"
          required
        />
        <PasswordInput
          showStrength
          id="password"
          label={t("passwordLabel")}
          placeholder={t("passwordPlaceholder")}
          autoComplete="new-password"
          minLength={12}
          required
        />

        <Checkbox id="terms" alignItems="start">
          {t("termsPrefix")}{" "}
          <Link href="/agb" className="au-text-link text-ink underline underline-offset-2">
            {t("termsLink")}
          </Link>{" "}
          {t("termsMiddle")}{" "}
          <Link href="/datenschutz" className="au-text-link text-ink underline underline-offset-2">
            {t("privacyLink")}
          </Link>{" "}
          {t("termsSuffix")}
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
