export const metadata = {
  title: "AGB",
};

export default function AgbPage() {
  return (
    <article className="flex flex-col gap-6 text-sm leading-7 text-ink">
      <h1 className="text-2xl font-semibold">
        Allgemeine Geschäftsbedingungen (AGB)
      </h1>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">§ 1 Geltungsbereich</h2>
        <p>
          Diese AGB gelten für alle Verträge zwischen Ployo, Inhaber: Sieyer
          Ghafoori, Rupertigaustraße 17, 81671 München („Anbieter“)
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
          der jeweils gültigen Leistungsbeschreibung. Der Anbieter strebt
          eine Verfügbarkeit von 99,5 % im Jahresmittel an; ausgenommen
          hiervon sind angekündigte Wartungsfenster sowie Umstände außerhalb
          des Einflussbereichs des Anbieters (höhere Gewalt, Ausfälle bei
          Vorlieferanten).
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">§ 3 Vertragsschluss, Laufzeit, Kündigung</h2>
        <p>
          Der Vertrag kommt mit Buchung eines Plans durch den Kunden
          zustande und läuft, je nach gewähltem Abrechnungszeitraum,
          monatlich oder jährlich. Er verlängert sich automatisch um den
          jeweils gleichen Zeitraum, sofern er nicht gekündigt wird. Beide
          Parteien können den Vertrag jederzeit zum Ende des laufenden
          Abrechnungszeitraums kündigen; die Kündigung wird zum nächsten
          Abrechnungszeitpunkt wirksam. Eine Mindestvertragslaufzeit besteht
          nicht.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">§ 4 Entgelte und Zahlung</h2>
        <p>
          Die Entgelte richten sich nach dem gebuchten Plan und dem
          gewählten Abrechnungszeitraum:
          <br />
          Starter: 29,00 € / Monat bzw. 278,40 € / Jahr (bis 5 Mitarbeiter)
          <br />
          Professional: 59,00 € / Monat bzw. 566,40 € / Jahr (bis 25
          Mitarbeiter)
          <br />
          Business: 99,00 € / Monat bzw. 950,40 € / Jahr (bis 50 Mitarbeiter)
          <br />
          Alle Preise verstehen sich zzgl. der gesetzlichen
          Umsatzsteuer. Die Abrechnung erfolgt im Voraus für den jeweiligen
          Zeitraum und wird automatisch über den Zahlungsdienstleister
          Stripe eingezogen.
        </p>
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
        <p>
          Der Kunde kann die für ihn relevanten Daten während der
          Vertragslaufzeit sowie bei Vertragsende in einem gängigen,
          weiterverarbeitbaren Format exportieren. Nach Beendigung des
          Vertrags werden die Daten des Kunden nach Ablauf einer Frist von
          30 Tagen endgültig gelöscht, sofern keine gesetzlichen
          Aufbewahrungspflichten entgegenstehen.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">§ 7 Haftung</h2>
        <p>
          Der Anbieter haftet unbeschränkt bei Vorsatz und grober
          Fahrlässigkeit sowie bei der Verletzung von Leben, Körper oder
          Gesundheit. Bei leicht fahrlässiger Verletzung wesentlicher
          Vertragspflichten (Kardinalpflichten), deren Erfüllung die
          ordnungsgemäße Durchführung des Vertrags überhaupt erst ermöglicht
          und auf deren Einhaltung der Kunde regelmäßig vertrauen darf, ist
          die Haftung der Höhe nach auf den bei Vertragsschluss
          vorhersehbaren, vertragstypischen Schaden begrenzt. Im Übrigen ist
          die Haftung für leicht fahrlässig verursachte Schäden
          ausgeschlossen. Die vorstehenden Beschränkungen gelten nicht für
          Ansprüche nach dem Produkthaftungsgesetz.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">§ 8 Schlussbestimmungen</h2>
        <p>
          Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist
          München, soweit gesetzlich zulässig.
        </p>
      </section>

      <p className="text-muted">Stand: 13.08.2026</p>
    </article>
  );
}
