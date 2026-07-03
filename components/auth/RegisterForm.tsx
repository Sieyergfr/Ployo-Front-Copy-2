"use client";

import PrimaryButton from "@/components/Buttons/PrimaryButton";
import Checkbox from "@/components/inputs/checkbox";
import PasswordInput from "@/components/inputs/password-input";
import TextInput from "@/components/inputs/text-input";
import { authClient } from "@/lib/auth-client";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterForm() {
  const router = useRouter();
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
          setError("Die Passwörter stimmen nicht überein.");
          return;
        }

        if (!termsAccepted) {
          setError("Bitte akzeptieren Sie die Nutzungsbedingungen.");
          return;
        }

        setIsPending(true);

        const { error: signUpError } = await authClient.signUp.email({
          email,
          password,
          name: `${firstName} ${lastName}`.trim(),
          callbackURL: "/select",
        });

        setIsPending(false);

        if (signUpError) {
          setError(signUpError.message ?? "Registrierung fehlgeschlagen.");
          return;
        }

        router.push("/select");
        router.refresh();
      }}
    >
      <div className="card-form">
        <div className="card-form-grid">
          <TextInput
            id="firstName"
            type="text"
            label="Vorname"
            placeholder="Anna"
            autoComplete="given-name"
            required
          />
          <TextInput
            id="lastName"
            type="text"
            label="Nachname"
            placeholder="Müller"
            autoComplete="family-name"
            required
          />
        </div>
        <TextInput
          id="email"
          type="email"
          label="E-Mail"
          placeholder="name@unternehmen.de"
          autoComplete="email"
          required
        />
        <PasswordInput
          showStrength
          id="password"
          label="Passwort"
          placeholder="password"
          autoComplete="new-password"
          required
        />
        <PasswordInput
          id="password_repeat"
          label="Passwort wiederholen"
          placeholder="password"
          autoComplete="new-password"
          required
        />

        <Checkbox id="terms" alignItems="start">
          Ich stimme den{" "}
          <Link href="/terms" className="text-ink underline underline-offset-2">
            Nutzungsbedingungen
          </Link>{" "}
          und der{" "}
          <Link href="/privacy" className="text-ink underline underline-offset-2">
            Datenschutzerklärung
          </Link>{" "}
          zu.
        </Checkbox>
      </div>

      {error && (
        <p className="rounded-[10px] border border-danger/20 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      <PrimaryButton type="submit" disabled={isPending}>
        <span className="leading-tight">
          {isPending ? "Konto erstellen..." : "Konto erstellen"}
        </span>
        <ArrowRight size={12} strokeWidth={3} color="currentColor" />
      </PrimaryButton>
    </form>
  );
}
