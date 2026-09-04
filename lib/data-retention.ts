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
 * - lohn_sozialversicherung: §147 Abs. 1 Nr. 4a AO / §257 HGB — 8 Jahre für
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
    legalBasis: "§195, §199 BGB (regelmäßige zivilrechtliche Verjährung)",
    fristBeginn: "offboardedAt (Austrittsdatum)",
    beschreibung:
      "Stammdaten und Personalakte/Vertragsdaten ohne eigene Aufbewahrungspflicht (Name, Adresse, Notfallkontakte, Geburtsdaten).",
  },
  lohn_sozialversicherung: {
    months: 96,
    legalBasis:
      "§147 Abs. 1 Nr. 4a AO / §257 HGB (BEG IV, seit 1.1.2025); deckt §28f SGB IV mit ab",
    fristBeginn: "Ende des Kalenderjahres der Ausstellung",
    beschreibung:
      "Gehaltsabrechnungen und sozialversicherungsrelevante Daten (TenantPayrollStatement, SV-Nummer, Krankenkasse).",
  },
  gesundheit_freitext: {
    months: 12,
    legalBasis:
      "Art. 5 Abs. 1 lit. c/e DSGVO (Datenminimierung, keine feste gesetzliche Frist)",
    fristBeginn: "Abschluss des Krankheitsfalls (closedAt)",
    beschreibung:
      "Freitext-Feld TenantSicknessReport.note (Art. 9 DSGVO). Reine Fehlzeit-Metadaten (Datum/Dauer) sind davon nicht betroffen.",
  },
  arbeitszeit: {
    months: 24,
    legalBasis: "§17 MiLoG, §16 Abs. 2 ArbZG",
    fristBeginn: "Erfassungsdatum",
    beschreibung: "Arbeitszeit-/Schichtdokumentation (TenantShift).",
  },
} as const;

export type RetentionCategory = keyof typeof RETENTION_POLICIES;

/** Datum, ab dem eine Kategorie-Frist als abgelaufen gilt, ausgehend vom übergebenen Fristbeginn. */
export function retentionCutoff(category: RetentionCategory, from: Date, now: Date = new Date()): boolean {
  const cutoff = new Date(from);
  cutoff.setMonth(cutoff.getMonth() + RETENTION_POLICIES[category].months);
  return cutoff <= now;
}

/** Datum, an dem eine Kategorie-Frist für den übergebenen Fristbeginn abläuft. */
export function retentionExpiryDate(category: RetentionCategory, from: Date): Date {
  const expiry = new Date(from);
  expiry.setMonth(expiry.getMonth() + RETENTION_POLICIES[category].months);
  return expiry;
}
