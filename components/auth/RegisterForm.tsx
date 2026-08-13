"use client";

import PrimaryButton from "@/components/Buttons/PrimaryButton";
import Checkbox from "@/components/inputs/checkbox";
import PasswordInput from "@/components/inputs/password-input";
import TextInput from "@/components/inputs/text-input";
import { useToast } from "@/components/Toasts";
import { authClient } from "@/lib/auth-client";
import { ArrowRight } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);

        const formData = new FormData(event.currentTarget);
        const firstName = String(formData.get("firstName") ?? "").trim();
        const lastName = String(formData.get("lastName") ?? "").trim();
        const email = String(formData.get("email") ?? "");
        const password = String(formData.get("password") ?? "");
        const passwordRepeat = String(formData.get("password_repeat") ?? "");
        const termsAccepted = formData.get("terms") === "on";

        if (password !== passwordRepeat) {
          const message = t("passwordMismatch");
          setError(message);
          return;
        }

        if (!termsAccepted) {
          const message = t("termsRequired");
          setError(message);
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
          const message = signUpError.message ?? t("signUpErrorFallback");
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
      <div className="card-form">
        <div className="card-form-grid">
          <TextInput
            id="firstName"
            type="text"
            label={t("firstNameLabel")}
            placeholder="Anna"
            autoComplete="given-name"
            required
          />
          <TextInput
            id="lastName"
            type="text"
            label={t("lastNameLabel")}
            placeholder="Müller"
            autoComplete="family-name"
            required
          />
        </div>
        <TextInput
          id="email"
          type="email"
          label={t("emailLabel")}
          placeholder="name@unternehmen.de"
          autoComplete="email"
          required
        />
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

        <Checkbox id="terms" alignItems="start">
          {t("termsPrefix")}{" "}
          <Link href="/agb" className="text-ink underline underline-offset-2">
            {t("termsLink")}
          </Link>{" "}
          {t("termsMiddle")}{" "}
          <Link href="/datenschutz" className="text-ink underline underline-offset-2">
            {t("privacyLink")}
          </Link>{" "}
          {t("termsSuffix")}
        </Checkbox>
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
    </form>
  );
}
