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
          [FIRMENNAME], [ANSCHRIFT], E-Mail: [DATENSCHUTZ-E-MAIL]
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
          DSGVO). Server-Logs werden nach [SPEICHERDAUER, z. B. 14 Tagen]
          gelöscht.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">3. Cookies</h2>
        <p>
          Wir verwenden ausschließlich technisch notwendige Cookies für die
          Anmeldung und Sitzungsverwaltung (Session-Cookies). Es findet kein
          Tracking zu Werbezwecken statt; eine Einwilligung ist hierfür nicht
          erforderlich (§ 25 Abs. 2 TDDDG).
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
          Unsere Anwendung wird bei [HOSTING-ANBIETER, RECHENZENTRUMS-STANDORT]
          betrieben. Hochgeladene Dokumente werden in einem S3-kompatiblen
          Objektspeicher von OVHcloud am Standort Frankfurt am Main
          (Deutschland) gespeichert. Mit allen Dienstleistern bestehen
          Auftragsverarbeitungsverträge.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">7. E-Mail-Versand</h2>
        <p>
          Für Transaktions-E-Mails (z. B. Passwort zurücksetzen, Einladungen)
          nutzen wir [E-MAIL-DIENSTLEISTER]. Dabei wird Ihre E-Mail-Adresse an
          diesen Dienstleister übermittelt (Art. 6 Abs. 1 lit. b DSGVO).
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">8. Speicherdauer</h2>
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
        <h2 className="text-base font-semibold">9. Ihre Rechte</h2>
        <p>
          Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung
          (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung
          (Art. 18), Datenübertragbarkeit (Art. 20) sowie Widerspruch gegen
          Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21).
          Zudem haben Sie das Recht, sich bei einer
          Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO).
          Kontaktieren Sie uns hierzu unter [DATENSCHUTZ-E-MAIL].
        </p>
      </section>

      <p className="text-muted">Stand: [DATUM]</p>
    </article>
  );
}
