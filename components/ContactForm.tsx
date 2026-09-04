"use client";

import { FormErrorBanner } from "@/components/FormFeedback";
import { MailCheck } from "lucide-react";
import { useState } from "react";

/**
 * Öffentliches Kontaktformular der Support-Seite.
 *
 * Schickt bewusst direkt an `POST /api/contact` statt über eine eigene Server
 * Action: die Route existiert bereits für die Mobile-App, prüft Eingaben,
 * begrenzt Anfragen pro IP und Adresse und verschickt die Mail. Eine zweite
 * Implementierung derselben Regeln würde nur auseinanderlaufen.
 */
const MIN_MESSAGE_LENGTH = 10;

export default function ContactForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);

  if (sent) {
    return (
      <div className="rounded-[10px] border border-success/20 bg-success/5 px-4 py-4 text-[13.5px] text-ink">
        <div className="flex items-center gap-2 font-medium">
          <MailCheck size={16} strokeWidth={2} />
          Nachricht verschickt
        </div>
        <p className="mt-1.5 leading-[1.55] text-muted">
          Vielen Dank — wir melden uns an der angegebenen Adresse, in der Regel
          innerhalb eines Werktags.
        </p>
      </div>
    );
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      message: String(form.get("message") ?? "").trim(),
      source: "Webseite (Kontakt)",
    };

    if (payload.message.length < MIN_MESSAGE_LENGTH) {
      setError("Bitte die Nachricht etwas ausführlicher formulieren.");
      return;
    }

    setError(undefined);
    setIsPending(true);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;

        setError(body?.error ?? "Die Nachricht konnte nicht verschickt werden.");
        return;
      }

      setSent(true);
    } catch {
      setError("Keine Verbindung zum Server. Bitte später erneut versuchen.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="field">
        <label htmlFor="name" className="label">
          Name
        </label>
        <input
          id="name"
          name="name"
          className="input"
          placeholder="Vor- und Nachname"
          autoComplete="name"
          maxLength={120}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="email" className="label">
          E-Mail-Adresse
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          placeholder="name@unternehmen.de"
          autoComplete="email"
          maxLength={200}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="message" className="label">
          Nachricht
        </label>
        <textarea
          id="message"
          name="message"
          className="input min-h-[140px] resize-y"
          placeholder="Worum geht es?"
          maxLength={5000}
          required
        />
      </div>

      <FormErrorBanner message={error} />

      <button type="submit" className="btn btn-primary w-full" disabled={isPending}>
        {isPending ? "Wird gesendet …" : "Nachricht senden"}
      </button>
    </form>
  );
}
