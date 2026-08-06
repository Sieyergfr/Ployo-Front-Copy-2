export const metadata = {
  title: "Impressum",
};

/**
 * WICHTIG: Die Platzhalter in eckigen Klammern müssen vor dem Livegang mit
 * den echten Unternehmensangaben gefüllt werden (siehe TODO-USER.md).
 */
export default function ImpressumPage() {
  return (
    <article className="flex flex-col gap-6 text-sm leading-7 text-ink">
      <h1 className="text-2xl font-semibold">Impressum</h1>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Angaben gemäß § 5 DDG</h2>
        <p>
          [FIRMENNAME UND RECHTSFORM, z. B. Ployo GmbH]
          <br />
          [STRASSE HAUSNUMMER]
          <br />
          [PLZ ORT]
          <br />
          Deutschland
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Vertreten durch</h2>
        <p>[GESCHÄFTSFÜHRER/IN]</p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Kontakt</h2>
        <p>
          Telefon: [TELEFONNUMMER]
          <br />
          E-Mail: [KONTAKT-E-MAIL]
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Registereintrag</h2>
        <p>
          Registergericht: [AMTSGERICHT]
          <br />
          Registernummer: [HRB-NUMMER]
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Umsatzsteuer-ID</h2>
        <p>
          Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: [USt-IdNr.]
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">
          Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
        </h2>
        <p>
          [NAME]
          <br />
          [ANSCHRIFT]
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">EU-Streitschlichtung</h2>
        <p>
          Die Europäische Kommission stellt eine Plattform zur
          Online-Streitbeilegung (OS) bereit:{" "}
          <a
            href="https://ec.europa.eu/consumers/odr/"
            className="underline underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            https://ec.europa.eu/consumers/odr/
          </a>
          . Wir sind nicht bereit oder verpflichtet, an
          Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
          teilzunehmen.
        </p>
      </section>
    </article>
  );
}
