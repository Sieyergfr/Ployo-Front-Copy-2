import "server-only";

/**
 * Zentrale, im Code gepflegte Löschfristen-Kategorien (DSGVO-Löschkonzept).
 * Einzige Quelle der Wahrheit für alle Aufbewahrungs-/Anonymisierungslogik
 * (cron/cleanup, Löschantrags-Workflow) — bewusst NICHT als DB-Tabelle oder
 * UI-Einstellung, weil es sich um gesetzliche Fristen handelt, keine
 * geschäftliche Präferenz pro Mandant. Anpassung ausschließlich durch
 * Ändern dieser Datei.
 *
 * Rechtsgrundlagen (Stand 2026-09-03, siehe Loeschkonzept.md für die
 * ausführliche Begründung):
 *
 * - lohn_sozialversicherung: §147 Abs. 1 Nr. 4 AO / §257 HGB — 8 Jahre für
 *   Buchungsbelege (inkl. Gehaltsabrechnungen). Die Verkürzung von 10 auf
 *   8 Jahre kam durch das Vierte Bürokratieentlastungsgesetz (BEG IV, in
 *   Kraft seit 1.1.2025), NICHT durch das oft zitierte
 *   "Wachstumschancengesetz". §28f SGB IV bindet SV-Unterlagen praktisch an
 *   die letzte Betriebsprüfung (≤5 Jahre) — da Ployo den Prüfungszeitpunkt
 *   nicht kennt und beide Datenarten gemeinsam verarbeitet werden, gilt
 *   hier einheitlich die längere, sicherere 8-Jahres-Frist.
 * - personaldaten: keine gesetzliche Aufbewahrungspflicht. Richtwert ist die
 *   zivilrechtliche Regelverjährung (§195, §199 BGB, 3 Jahre) für mögliche
 *   Ansprüche aus dem Arbeitsverhältnis.
 * - gesundheit_freitext: Art. 9 DSGVO (besondere Kategorie), keine feste
 *   gesetzliche Frist. Datenminimierungsgebot (Art. 5 Abs. 1 lit. c/e
 *   DSGVO) spricht für die kürzeste vertretbare Frist.
 * - arbeitszeit: §17 MiLoG, §16 Abs. 2 ArbZG — 2 Jahre.
 *
 * Audit-Logs (TenantAuditLog) sind bewusst nicht Teil dieser Tabelle — die
 * Aufbewahrung läuft bereits korrekt über `TenantSettings.auditRetentionMonths`.
 */
export const RETENTION_POLICIES = {
  personaldaten: {
    months: 36,
    /** Frist läuft ab dem exakten Fristbeginn-Datum selbst, nicht ab einem Kalenderjahresende (siehe "calendarYearEnd" bei lohn_sozialversicherung). */
    fristBeginnAnchor: "exact",
    legalBasis: "§195, §199 BGB (regelmäßige zivilrechtliche Verjährung)",
    fristBeginn: "offboardedAt (Austrittsdatum)",
    beschreibung:
      "Stammdaten und Personalakte/Vertragsdaten ohne eigene Aufbewahrungspflicht (Name, Adresse, Notfallkontakte, Geburtsdaten).",
  },
  lohn_sozialversicherung: {
    months: 96,
    /** §147 AO knüpft an den Schluss des Kalenderjahres der Ausstellung an, nicht an das exakte Ausstellungsdatum (Audit-Finding M04). */
    fristBeginnAnchor: "calendarYearEnd",
    legalBasis:
      "§147 Abs. 1 Nr. 4 AO / §257 HGB (BEG IV, seit 1.1.2025); deckt §28f SGB IV mit ab",
    fristBeginn: "Ende des Kalenderjahres der Ausstellung",
    beschreibung:
      "Gehaltsabrechnungen und sozialversicherungsrelevante Daten (TenantPayrollStatement, SV-Nummer, Krankenkasse).",
  },
  gesundheit_freitext: {
    months: 12,
    fristBeginnAnchor: "exact",
    legalBasis:
      "Art. 5 Abs. 1 lit. c/e DSGVO (Datenminimierung, keine feste gesetzliche Frist)",
    fristBeginn: "Abschluss des Krankheitsfalls (closedAt)",
    beschreibung:
      "Freitext-Feld TenantSicknessReport.note (Art. 9 DSGVO). Reine Fehlzeit-Metadaten (Datum/Dauer) sind davon nicht betroffen.",
  },
  arbeitszeit: {
    months: 24,
    fristBeginnAnchor: "exact",
    legalBasis: "§17 MiLoG, §16 Abs. 2 ArbZG",
    fristBeginn: "Erfassungsdatum",
    beschreibung: "Arbeitszeit-/Schichtdokumentation (TenantShift).",
  },
  consent_nachweis: {
    months: 36,
    fristBeginnAnchor: "exact",
    legalBasis:
      "§195, §199 BGB (regelmäßige zivilrechtliche Verjährung — Nachweis der Rechtmäßigkeit der Verarbeitung, Art. 7 Abs. 1 DSGVO)",
    fristBeginn: "createdAt",
    beschreibung:
      "Cookie-Consent-Nachweis (ConsentRecord: IP-Adresse, User-Agent, Zustimmungswert) — hat keine harte FK/Kaskade zu User und wurde bisher gar nicht automatisch bereinigt (Audit-Finding M05).",
  },
} as const;

export type RetentionCategory = keyof typeof RETENTION_POLICIES;

/**
 * Anker, ab dem die Monatsfrist einer Kategorie zu laufen beginnt — entweder
 * das übergebene Datum selbst ("exact") oder der 31.12. seines Kalenderjahres
 * ("calendarYearEnd", z. B. §147 AO). Durchgängig UTC-basiert, damit das
 * Ergebnis nicht von der Server-Zeitzone abhängt (siehe `from` als
 * DB-`DateTime`, ein absoluter Zeitpunkt ohne eigene Zeitzone).
 */
function retentionAnchor(category: RetentionCategory, from: Date): Date {
  if (RETENTION_POLICIES[category].fristBeginnAnchor === "calendarYearEnd") {
    // Der "Schluss des Kalenderjahres" (§147 AO) ist der Zeitpunkt, an dem
    // das Jahr VOLLSTÄNDIG abgelaufen ist — das ist exakt der Beginn des 1.
    // Januar des Folgejahres, nicht der Beginn (00:00 UTC) des 31. Dezember
    // desselben Jahres. Die vorherige Berechnung ließ die Frist rund einen
    // Tag zu früh enden: ein Beleg vom 01.02.2020 (8 Jahre Frist) galt schon
    // am 31.12.2028 00:00 UTC statt erst am 01.01.2029 00:00 UTC als
    // löschbar (Audit-Finding M04).
    return new Date(Date.UTC(from.getUTCFullYear() + 1, 0, 1));
  }

  return from;
}

/** Datum, an dem eine Kategorie-Frist für den übergebenen Fristbeginn abläuft. */
export function retentionExpiryDate(category: RetentionCategory, from: Date): Date {
  const expiry = new Date(retentionAnchor(category, from));
  expiry.setUTCMonth(expiry.getUTCMonth() + RETENTION_POLICIES[category].months);
  return expiry;
}

/** Datum, ab dem eine Kategorie-Frist als abgelaufen gilt, ausgehend vom übergebenen Fristbeginn. */
export function retentionCutoff(category: RetentionCategory, from: Date, now: Date = new Date()): boolean {
  return retentionExpiryDate(category, from) <= now;
}
