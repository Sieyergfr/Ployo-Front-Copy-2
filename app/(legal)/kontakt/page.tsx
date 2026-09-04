import ContactForm from "@/components/ContactForm";
import Link from "next/link";

export const metadata = {
  title: "Kontakt & Support",
};

/**
 * Öffentliche Support-Seite. Beide App-Stores verlangen im Eintrag eine
 * erreichbare Support-URL — bis hierher zeigte der Footer-Link "Kontakt" auf
 * `#`, und `/kontakt` gab es gar nicht. Dieselbe Route ist damit auch das
 * Ziel, das in App Store Connect und Google Play als Support-URL steht.
 */
export default function KontaktPage() {
  return (
    <article className="flex flex-col gap-6 text-sm leading-7 text-ink">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Kontakt &amp; Support</h1>
        <p className="text-muted">
          Fragen zur Ployo-App, zu Ihrem Konto oder zum Datenschutz? Schreiben
          Sie uns — wir antworten in der Regel innerhalb eines Werktags.
        </p>
      </div>

      <section className="rounded-card border border-border bg-white px-6 py-6">
        <ContactForm />
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Direkt erreichbar</h2>
        <p>
          E-Mail:{" "}
          <a href="mailto:info@ployo.io" className="underline underline-offset-2">
            info@ployo.io
          </a>
          <br />
          Postanschrift und Telefonnummer stehen im{" "}
          <Link href="/impressum" className="underline underline-offset-2">
            Impressum
          </Link>
          .
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Konto und Daten</h2>
        <p>
          Ihr Konto löschen können Sie jederzeit selbst — in der App unter
          &bdquo;Profil &rarr; Konto &amp; Sicherheit&ldquo; oder{" "}
          <Link href="/konto-loeschung" className="underline underline-offset-2">
            hier über die Webseite
          </Link>
          . Wie wir Ihre Daten verarbeiten, steht in der{" "}
          <Link href="/datenschutz" className="underline underline-offset-2">
            Datenschutzerklärung
          </Link>
          .
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Sie sind Mitarbeiterin oder Mitarbeiter?</h2>
        <p className="text-muted">
          Fragen zu Schichten, Urlaub, Krankmeldungen oder Ihren Dokumenten
          beantwortet Ihr Betrieb — wir haben als Anbieter der Software keinen
          Einblick in einzelne Personalentscheidungen. Bei technischen
          Problemen mit der App helfen wir gerne weiter.
        </p>
      </section>
    </article>
  );
}
