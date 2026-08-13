export const metadata = {
  title: "Datenschutzerklärung",
};

/**
 * WICHTIG: Diese Datenschutzerklärung ist eine Struktur-Vorlage und muss vor
 * dem Livegang von einer fachkundigen Person geprüft und mit den echten
 * Angaben (Platzhalter in eckigen Klammern) vervollständigt werden.
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
          Abs. 2 TDDDG). Es findet kein Tracking zu Werbezwecken statt.
          Mit Ihrer Einwilligung über den Cookie-Banner setzen wir zusätzlich
          Fehler- und Performance-Monitoring (Sentry, siehe Ziffer 8) ein,
          das ohne Ihre Zustimmung nicht aktiv ist. Sie können Ihre Auswahl
          jederzeit über &bdquo;Cookie-Einstellungen&ldquo; im Seitenfuß ändern.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">4. Registrierung und Konto</h2>
        <p>
          Bei der Registrierung verarbeiten wir Name, E-Mail-Adresse und
          Passwort (verschlüsselt gespeichert) zur Bereitstellung Ihres
          Nutzerkontos (Art. 6 Abs. 1 lit. b DSGVO). Zur Sicherheit Ihrer
          Sitzung speichern wir zudem IP-Adresse und Geräteinformationen der
          aktiven Sitzungen.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">
          5. Verarbeitung im Auftrag unserer Kunden (Ployo als
          Auftragsverarbeiter)
        </h2>
        <p>
          Nutzen Unternehmen Ployo zur Verwaltung ihrer Personaldaten
          (Mitarbeiterstammdaten, Verträge, Urlaubs- und Krankheitsdaten,
          Dokumente), verarbeiten wir diese Daten als Auftragsverarbeiter im
          Auftrag des jeweiligen Unternehmens (Art. 28 DSGVO). Verantwortlicher
          für diese Daten ist das jeweilige Unternehmen. Grundlage ist ein
          Auftragsverarbeitungsvertrag (AVV), den wir mit unseren Kunden
          abschließen.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">6. Hosting und Speicherorte</h2>
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
        <h2 className="text-base font-semibold">7. E-Mail-Versand</h2>
        <p>
          Für Transaktions-E-Mails (z. B. Passwort zurücksetzen, Einladungen)
          nutzen wir Proton AG (Schweiz). Dabei wird Ihre E-Mail-Adresse an
          diesen Dienstleister übermittelt (Art. 6 Abs. 1 lit. b DSGVO).
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">
          8. Fehler- und Performance-Monitoring (Sentry)
        </h2>
        <p>
          Mit Ihrer Einwilligung über den Cookie-Banner setzen wir Sentry
          (Functional Software, Inc., mit Datenverarbeitung in der EU) zur
          Erkennung und Behebung technischer Fehler ein. Dabei können
          Fehlermeldungen, technische Metadaten und – bei aktivierter
          Session-Aufzeichnung nach Fehlern – eine Aufzeichnung der
          Bildschirminteraktion übertragen werden (Art. 6 Abs. 1 lit. a
          DSGVO). Formulareingaben, HTTP-Bodies, Datenbankwerte und Cookies
          sind von der Übertragung ausgeschlossen. Basis-Fehlererfassung ohne
          Session-Aufzeichnung und ohne Performance-Tracing läuft unabhängig
          von Ihrer Einwilligung, um den sicheren Betrieb der Anwendung zu
          gewährleisten (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">9. Zahlungsabwicklung (Stripe)</h2>
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
        <h2 className="text-base font-semibold">10. Speicherdauer</h2>
        <p>
          Wir speichern personenbezogene Daten nur so lange, wie es für die
          jeweiligen Zwecke erforderlich ist oder gesetzliche
          Aufbewahrungspflichten bestehen. Konten können jederzeit gelöscht
          werden; Audit-Protokolle werden gemäß der im jeweiligen
          Arbeitsbereich konfigurierten Aufbewahrungsfrist automatisch
          entfernt.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">11. Ihre Rechte</h2>
        <p>
          Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung
          (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung
          (Art. 18), Datenübertragbarkeit (Art. 20) sowie Widerspruch gegen
          Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21).
          Zudem haben Sie das Recht, sich bei einer
          Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO).
          Kontaktieren Sie uns hierzu unter info@ployo.io.
        </p>
      </section>

      <p className="text-muted">Stand: 13.08.2026</p>
    </article>
  );
}
