export const metadata = {
  title: "Impressum",
};

export default function ImpressumPage() {
  return (
    <article className="flex flex-col gap-6 text-sm leading-7 text-ink">
      <h1 className="text-2xl font-semibold">Impressum</h1>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Angaben gemäß § 5 DDG</h2>
        <p>
          Ployo, Inhaber: Sieyer Ghafoori
          <br />
          Rupertigaustraße 17
          <br />
          81671 München
          <br />
          Deutschland
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Kontakt</h2>
        <p>
          Telefon: +49 152 08733320
          <br />
          E-Mail: info@ployo.io
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Umsatzsteuer-ID</h2>
        <p>
          Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: DE342236060
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">
          Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
        </h2>
        <p>
          Sieyer Ghafoori
          <br />
          Rupertigaustraße 17, 81671 München
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
