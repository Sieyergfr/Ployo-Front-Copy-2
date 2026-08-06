export const metadata = {
  title: "AGB",
};

/**
 * WICHTIG: Struktur-Vorlage. Die AGB müssen vor dem Livegang juristisch
 * geprüft und vervollständigt werden (siehe TODO-USER.md).
 */
export default function AgbPage() {
  return (
    <article className="flex flex-col gap-6 text-sm leading-7 text-ink">
      <h1 className="text-2xl font-semibold">
        Allgemeine Geschäftsbedingungen (AGB)
      </h1>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">§ 1 Geltungsbereich</h2>
        <p>
          Diese AGB gelten für alle Verträge zwischen [FIRMENNAME] („Anbieter“)
          und Unternehmen („Kunde“) über die Nutzung der
          Software-as-a-Service-Lösung „Ployo“. Das Angebot richtet sich
          ausschließlich an Unternehmer im Sinne des § 14 BGB.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">§ 2 Leistungsgegenstand</h2>
        <p>
          Der Anbieter stellt dem Kunden eine webbasierte Anwendung zur
          Verwaltung von Personaldaten, Schichtplänen, Abwesenheiten und
          Dokumenten zur Verfügung. Umfang und Verfügbarkeit ergeben sich aus
          der jeweils gültigen Leistungsbeschreibung. [VERFÜGBARKEITS-SLA
          ERGÄNZEN]
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">§ 3 Vertragsschluss, Laufzeit, Kündigung</h2>
        <p>[REGELUNGEN ZU LAUFZEIT, VERLÄNGERUNG UND KÜNDIGUNGSFRISTEN]</p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">§ 4 Entgelte und Zahlung</h2>
        <p>[PREISE, ABRECHNUNGSZEITRÄUME, ZAHLUNGSBEDINGUNGEN]</p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">§ 5 Pflichten des Kunden</h2>
        <p>
          Der Kunde ist für die Rechtmäßigkeit der von ihm verarbeiteten
          personenbezogenen Daten verantwortlich und stellt sicher, dass die
          Nutzung durch seine Beschäftigten datenschutzkonform erfolgt. Die
          Parteien schließen einen Auftragsverarbeitungsvertrag gemäß
          Art. 28 DSGVO.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">§ 6 Datensicherung und Datenherausgabe</h2>
        <p>[BACKUP-REGELUNGEN, EXPORT BEI VERTRAGSENDE, LÖSCHFRISTEN]</p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">§ 7 Haftung</h2>
        <p>[HAFTUNGSREGELUNGEN]</p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">§ 8 Schlussbestimmungen</h2>
        <p>
          Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist
          [ORT], soweit gesetzlich zulässig.
        </p>
      </section>

      <p className="text-muted">Stand: [DATUM]</p>
    </article>
  );
}
