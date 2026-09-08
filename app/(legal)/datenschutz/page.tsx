export const metadata = {
  title: "Datenschutzerklärung",
  description:
    "Wie Ployo personenbezogene Daten von Nutzern und Mitarbeitern erhebt, verarbeitet und schützt.",
};

/**
 * Deckt die von der App tatsächlich verarbeiteten Datenkategorien ab
 * (Personalakte, Schichten, Urlaub/Krankheit, Dokumente, Push-Token, Kamera/
 * Fotos). Vor dem Livegang trotzdem final von einer fachkundigen Person
 * gegenpruefen lassen, insbesondere die konkreten Aufbewahrungsfristen.
 */
export default function DatenschutzPage() {
  return (
    <article className="flex flex-col gap-6 text-sm leading-7 text-ink">
      <h1 className="text-2xl font-semibold">Datenschutzerklärung</h1>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">1. Verantwortlicher</h2>
        <p>
          Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO):
          <br />
          Ployo, Inhaber: Sieyer Ghafoori, Rupertigaustraße 17, 81671 München,
          E-Mail: info@ployo.io
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">
          2. Verarbeitung beim Besuch dieser Website
        </h2>
        <p>
          Beim Aufruf unserer Website verarbeitet unser Server technisch
          notwendige Daten (IP-Adresse, Datum und Uhrzeit des Zugriffs,
          aufgerufene Seite, User-Agent), um die Website bereitzustellen und
          die Sicherheit des Betriebs zu gewährleisten (Art. 6 Abs. 1 lit. f
          DSGVO). Server-Logs werden nach 14 Tagen gelöscht.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">3. Cookies</h2>
        <p>
          Wir verwenden technisch notwendige Cookies für die Anmeldung und
          Sitzungsverwaltung (Session-Cookies) sowie zur Speicherung Ihrer
          Cookie-Auswahl; hierfür ist keine Einwilligung erforderlich (§ 25
          Abs. 2 TDDDG). Es findet kein Tracking zu Werbezwecken statt und
          es werden keine Werbe- oder Marketing-SDKs eingesetzt. Eine
          Basis-Fehlererfassung (Sentry, ohne Session-Aufzeichnung und ohne
          Performance-Tracing) läuft dabei unabhängig von Ihrer Einwilligung
          zur Gewährleistung des sicheren Betriebs (Art. 6 Abs. 1 lit. f
          DSGVO, siehe Ziffer 11). Mit Ihrer Einwilligung über den
          Cookie-Banner aktivieren wir zusätzlich Session-Aufzeichnung und
          Performance-Tracing (Sentry, siehe Ziffer 11); diese laufen ohne
          Ihre Zustimmung nicht. Sie können Ihre Auswahl jederzeit
          über &bdquo;Cookie-Einstellungen&ldquo; im Seitenfuß ändern. In der
          mobilen App gibt es keine Cookies; die entsprechenden technischen
          Funktionen übernehmen Sitzungs-Token im gerätesicheren Speicher
          (Secure Store), siehe Ziffer 4.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">4. Registrierung, Konto und Anmeldung</h2>
        <p>
          Bei der Registrierung verarbeiten wir Name, E-Mail-Adresse und
          Passwort (verschlüsselt gespeichert) zur Bereitstellung Ihres
          Nutzerkontos (Art. 6 Abs. 1 lit. b DSGVO). Zur Sicherheit Ihrer
          Sitzung speichern wir zudem IP-Adresse, Geräteinformationen und
          Zeitpunkt aktiver Sitzungen. Optional können Sie sich über
          „Mit Google anmelden“ oder „Mit Apple anmelden“ registrieren und
          anmelden; dabei erhalten wir von Google bzw. Apple Ihren Namen und
          Ihre E-Mail-Adresse (bei Apple ggf. eine von Apple bereitgestellte
          Weiterleitungsadresse). Zusätzlich können Sie eine
          Zwei-Faktor-Authentisierung (TOTP) aktivieren; dabei verarbeiten
          wir ein Geheimnis zur Erzeugung der Einmalcodes, das ausschließlich
          der Kontosicherheit dient (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">
          5. Personal- und Beschäftigungsdaten in der App (Ployo als
          Auftragsverarbeiter)
        </h2>
        <p>
          Nutzt Ihr Arbeitgeber Ployo zur Personalverwaltung, verarbeiten wir
          in seinem Auftrag als Auftragsverarbeiter (Art. 28 DSGVO)
          insbesondere folgende Datenarten. Verantwortlicher für diese Daten
          ist Ihr Arbeitgeber, nicht Ployo; Grundlage ist ein
          Auftragsverarbeitungsvertrag (AVV) zwischen Ployo und dem
          jeweiligen Unternehmen.
        </p>
        <ul className="ml-5 list-disc">
          <li>
            <strong>Stammdaten:</strong> Name, E-Mail-Adresse,
            Telefonnummer, Anschrift, Geburtsdatum, Benutzerkennung sowie
            Mandanten-, Standort-, Team- und Rollenzuordnung.
          </li>
          <li>
            <strong>Notfallkontakte:</strong> von Ihnen oder Ihrem
            Arbeitgeber hinterlegte Kontaktdaten für den Notfall.
          </li>
          <li>
            <strong>Beschäftigungsdaten:</strong> Vertrags- und
            Anstellungsdaten sowie Gehaltsabrechnungen, soweit über die App
            bereitgestellt.
          </li>
          <li>
            <strong>Schicht- und Arbeitszeitdaten:</strong> Schichtpläne,
            Arbeitszeiten, Wunschfrei- und Urlaubsanträge.
          </li>
          <li>
            <strong>Gesundheitsdaten (besondere Kategorie, Art. 9 DSGVO):</strong>{" "}
            Krankmeldungen und ärztliche Atteste. Deren Verarbeitung stützt
            sich auf Art. 9 Abs. 2 lit. b DSGVO i. V. m. arbeits- und
            sozialrechtlichen Pflichten (u. a. Entgeltfortzahlung) und wird
            technisch besonders geschützt (siehe Ziffer 8).
          </li>
          <li>
            <strong>Dokumente:</strong> von Ihnen oder Ihrem Arbeitgeber
            hochgeladene Dateien, z. B. Ausweisdokumente, Zertifikate,
            Verträge und sonstige Personalunterlagen.
          </li>
          <li>
            <strong>Support- und Info-Anfragen:</strong> von Ihnen über die
            App eingegebene Anfragen und Mitteilungen an Ihren Arbeitgeber.
          </li>
        </ul>
        <p>
          Empfänger dieser Daten sind ausschließlich befugte Personen bei
          Ihrem Arbeitgeber (entsprechend der in der App vergebenen Rollen
          und Berechtigungen) sowie die in Ziffer 9 genannten technischen
          Dienstleister von Ployo, soweit sie zur Bereitstellung der App
          erforderlich sind. Eine Weitergabe zu Werbezwecken findet nicht
          statt.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">
          6. Push-Benachrichtigungen und Geräte-Token
        </h2>
        <p>
          Wenn Sie Push-Benachrichtigungen in der App erlauben, speichern wir
          ein Geräte-/Push-Token zusammen mit Ihrer Nutzerkennung, um Sie
          z. B. über neue Schichten, Anträge oder Info-Anfragen zu
          benachrichtigen (Art. 6 Abs. 1 lit. b, f DSGVO). Der Versand
          erfolgt über den Push-Dienst Expo (650 Industries, Inc., USA), der
          die Benachrichtigung an den Push-Dienst des jeweiligen
          Betriebssystems weiterleitet (Apple Push Notification Service bzw.
          Firebase Cloud Messaging für Android). Dabei werden der
          Benachrichtigungstext (z. B. „Ihr Urlaub wurde genehmigt“) sowie
          technische Zuordnungsdaten an Expo übermittelt. Das Token wird
          gelöscht, wenn Sie sich abmelden, die Berechtigung widerrufen oder
          Ihr Konto löschen.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">7. Kamera- und Fotozugriff</h2>
        <p>
          Für das Anhängen von Krankmeldungen/Attesten und sonstigen
          Dokumenten können Sie in der App die Kamera oder Ihre Fotobibliothek
          nutzen; Dateien lassen sich zudem über den System-Dokumentenpicker
          auswählen. Der Zugriff erfolgt ausschließlich auf von Ihnen aktiv
          ausgewählte Aufnahmen bzw. Dateien (Art. 6 Abs. 1 lit. b DSGVO) und
          wird erst beim tatsächlichen Gebrauch dieser Funktion angefragt.
          Mikrofon-, Standort-, Kontakt-, SMS- und Telefonberechtigungen
          fordert die App nicht an.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">8. Technische Sicherheitsmaßnahmen</h2>
        <p>
          Sitzungen werden über sichere, httpOnly-Cookies bzw. – in der
          mobilen App – über den gerätesicheren Secure Store verwaltet.
          Gehaltsabrechnungen und andere sensible Dokumente werden
          ausschließlich über unseren eigenen Server ausgeliefert, nicht über
          öffentlich erreichbare Links. Zugriffsrechte richten sich nach den
          in der App vergebenen Rollen; ein normaler Mitarbeiterzugang kann
          nicht auf fremde Personalakten, Krankmeldungen oder
          Gehaltsabrechnungen zugreifen. Ordner in der zentralen Dateiablage
          können zusätzlich mit einer PIN geschützt werden. Sämtliche
          Übertragungen erfolgen verschlüsselt (TLS).
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">9. Hosting und Speicherorte</h2>
        <p>
          Unsere Anwendung wird bei Host Unlimited am Standort Frankfurt am
          Main (Deutschland) betrieben. Hochgeladene Dokumente werden in
          einem S3-kompatiblen
          Objektspeicher von OVHcloud am Standort Frankfurt am Main
          (Deutschland) gespeichert. Mit allen Dienstleistern bestehen
          Auftragsverarbeitungsverträge.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">10. E-Mail-Versand</h2>
        <p>
          Für Transaktions-E-Mails (z. B. Passwort zurücksetzen, Einladungen,
          Kontolöschung) nutzen wir Proton AG (Schweiz). Dabei wird Ihre
          E-Mail-Adresse an diesen Dienstleister übermittelt (Art. 6 Abs. 1
          lit. b DSGVO).
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">
          11. Fehler- und Performance-Monitoring (Sentry)
        </h2>
        <p>
          Mit Ihrer Einwilligung über den Cookie-Banner setzen wir Sentry
          (Functional Software, Inc., mit Datenverarbeitung in der EU) zur
          Erkennung und Behebung technischer Fehler ein, sowohl auf der
          Website als auch in der mobilen App. Dabei können Fehlermeldungen,
          technische Metadaten und – bei aktivierter Session-Aufzeichnung
          nach Fehlern – eine Aufzeichnung der Bildschirminteraktion
          übertragen werden (Art. 6 Abs. 1 lit. a DSGVO). Formulareingaben,
          HTTP-Bodies, Datenbankwerte und Cookies sind von der Übertragung
          ausgeschlossen. Basis-Fehlererfassung ohne Session-Aufzeichnung und
          ohne Performance-Tracing läuft unabhängig von Ihrer Einwilligung,
          um den sicheren Betrieb der Anwendung zu gewährleisten (Art. 6
          Abs. 1 lit. f DSGVO). Zusätzlich können die App-Stores (Apple,
          Google) sowie unser Build-Dienstleister Expo/EAS technische
          Absturz- und Diagnosedaten zum Produktions-Build erheben; hierfür
          gelten deren eigene Datenschutzhinweise. Unabhängig davon setzen
          wir Expo (650 Industries, Inc., USA) als Zustelldienst für echte
          Push-Benachrichtigungsinhalte ein – siehe Abschnitt 6.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">12. Zahlungsabwicklung (Stripe)</h2>
        <p>
          Für die Abrechnung kostenpflichtiger Pläne setzen wir den
          Zahlungsdienstleister Stripe Payments Europe, Ltd. ein. Dabei
          werden die zur Zahlungsabwicklung erforderlichen Daten (u. a.
          Rechnungsadresse, Zahlungsdaten) an Stripe übermittelt (Art. 6
          Abs. 1 lit. b DSGVO). Es gelten ergänzend die Datenschutzhinweise
          von Stripe.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">13. Speicherdauer und Löschung</h2>
        <p>
          Wir speichern personenbezogene Daten nur so lange, wie es für die
          jeweiligen Zwecke erforderlich ist oder gesetzliche
          Aufbewahrungspflichten bestehen. Abrechnungsrelevante Unterlagen
          (z. B. Gehaltsabrechnungen, Verträge) unterliegen den handels- und
          steuerrechtlichen Aufbewahrungsfristen (i. d. R. bis zu 10 Jahre,
          §§ 147 AO, 257 HGB); Krankmeldungen/Atteste und sonstige
          Personalunterlagen werden entsprechend der arbeitsrechtlichen
          Aufbewahrungspflichten Ihres Arbeitgebers gespeichert. Audit-
          Protokolle werden gemäß der im jeweiligen Arbeitsbereich
          konfigurierten Aufbewahrungsfrist automatisch entfernt.
        </p>
        <p>
          Ihren Konto-<strong>Zugang</strong> (Zugangsdaten, aktive
          Sitzungen, Social-Login-Verknüpfungen, Push-Token) können Sie
          jederzeit selbst löschen: in der App unter „Konto &amp;
          Sicherheit“ oder ohne Anmeldung über{" "}
          <a href="/konto-loeschung" className="underline underline-offset-2">
            ployo.io/konto-loeschung
          </a>
          . Ihre Personalakte (Stammdaten) bleibt davon unberührt und
          verbleibt bei Ihrem Arbeitgeber, soweit gesetzliche
          Aufbewahrungspflichten dies erfordern; er entscheidet über deren
          Löschung im Rahmen dieser Pflichten.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">14. Ihre Rechte</h2>
        <p>
          Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung
          (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung
          (Art. 18), Datenübertragbarkeit (Art. 20) sowie Widerspruch gegen
          Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21).
          Einen Export Ihrer eigenen Kontodaten können Sie über Ihr Konto
          anfordern. Zudem haben Sie das Recht, sich bei einer
          Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO).
          Kontaktieren Sie uns hierzu unter info@ployo.io.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">15. Werbung und Tracking</h2>
        <p>
          Ployo setzt keine Werbe- oder Tracking-SDKs Dritter ein und verkauft
          keine personenbezogenen Daten. Auf den öffentlichen Seiten
          (Startseite, Anmeldung, Registrierung, Impressum, Datenschutz, AGB,
          Kontakt) zählen wir Seitenaufrufe rein anonym auf eigener
          Infrastruktur mit: gespeichert werden nur der aufgerufene Pfad, der
          Hostname eines eventuellen Verweisers (nie die vollständige
          Verweis-URL) und der Zeitpunkt – keine IP-Adresse, keine Cookie-
          oder Geräte-ID und kein Personenbezug. Da keine personenbezogenen
          Daten verarbeitet werden, ist hierfür keine Einwilligung
          erforderlich (§ 25 Abs. 2 Nr. 2 TTDSG, Art. 6 DSGVO nicht
          einschlägig). Die Datensätze werden nach 13 Monaten automatisch
          gelöscht. Sollten künftig personenbezogene Analyse- oder
          Marketing-Dienste ergänzt werden, wird diese Erklärung vorab
          aktualisiert und – soweit erforderlich – Ihre Einwilligung
          eingeholt.
        </p>
      </section>

      <p className="text-muted">Stand: 05.09.2026</p>
    </article>
  );
}
