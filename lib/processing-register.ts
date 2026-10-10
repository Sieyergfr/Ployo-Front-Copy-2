import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSettingsManager } from "@/lib/settings-service";
import { recordTenantAudit } from "@/lib/audit";
import { RETENTION_POLICIES, type RetentionCategory } from "@/lib/data-retention";

export type ProcessingRegisterEntry = {
  id: string;
  title: string;
  zweck: string;
  betroffenePersonen: string;
  datenkategorien: string;
  rechtsgrundlage: string;
  empfaenger?: string;
  loeschfrist: string;
  /** Verknüpfung zur Löschfristen-Kategorie (lib/data-retention.ts), sofern zutreffend. */
  retentionCategory?: RetentionCategory;
};

type ProcessingRegisterTemplate = ProcessingRegisterEntry & {
  /** Prüft anhand tatsächlicher Nutzung, ob diese Verarbeitung für den Mandanten zutrifft. */
  appliesTo: (context: { tenantId: string; employeeCount: number }) => Promise<boolean>;
};

function retentionText(category: RetentionCategory) {
  const policy = RETENTION_POLICIES[category];
  return `${policy.months / 12} Jahre (${policy.legalBasis}), Fristbeginn: ${policy.fristBeginn}`;
}

/**
 * Inhaltliche Vorlage aus Teil B von
 * Verzeichnis-von-Verarbeitungstaetigkeiten-Entwurf.md — pro Mandant
 * umformuliert (Ployo als Auftragsverarbeiter, der Mandant als
 * Verantwortlicher). Teil A (Ployo als Verantwortlicher für die eigenen
 * Kundenkonten) gehört nicht hierher — das ist Ployos eigenes Verzeichnis,
 * nicht das des Mandanten.
 */
const PROCESSING_REGISTER_TEMPLATE: ProcessingRegisterTemplate[] = [
  {
    id: "personalstammdaten",
    title: "Personalstammdaten- und Personalaktenverwaltung",
    zweck: "Verwaltung von Mitarbeiterstammdaten, Verträgen, Dokumenten.",
    betroffenePersonen: "Mitarbeiter, ehemalige Mitarbeiter",
    datenkategorien:
      "Name, Kontaktdaten, Adresse, Geburtsdaten, Notfallkontakte, Vertragsdaten",
    rechtsgrundlage: "Art. 6 Abs. 1 lit. b DSGVO (Arbeitsvertrag), § 26 BDSG",
    loeschfrist: retentionText("personaldaten"),
    retentionCategory: "personaldaten",
    appliesTo: async ({ employeeCount }) => employeeCount > 0,
  },
  {
    id: "gehaltsabrechnung",
    title: "Gehaltsabrechnung / Sozialversicherung",
    zweck: "Bereitstellung von Gehaltsabrechnungen, Verwaltung sozialversicherungsrelevanter Daten.",
    betroffenePersonen: "Mitarbeiter, ehemalige Mitarbeiter",
    datenkategorien:
      "IBAN, Steuer-ID, SV-Nummer, Krankenkasse, Gehaltsbeträge (verschlüsselt gespeichert)",
    rechtsgrundlage:
      "Art. 6 Abs. 1 lit. b, c DSGVO; steuer-/sozialversicherungsrechtliche Pflichten",
    loeschfrist: retentionText("lohn_sozialversicherung"),
    retentionCategory: "lohn_sozialversicherung",
    appliesTo: async ({ tenantId }) =>
      (await prisma.tenantPayrollStatement.count({ where: { tenantId } })) > 0,
  },
  {
    id: "krankmeldungen",
    title: "Krankmeldungs- und Gesundheitsdatenverwaltung",
    zweck: "Nachweis von Arbeitsunfähigkeit, Entgeltfortzahlung.",
    betroffenePersonen: "Mitarbeiter",
    datenkategorien:
      "Zeitraum der Erkrankung, Freitext-Notizen, Atteste (Art. 9 DSGVO, besondere Kategorie)",
    rechtsgrundlage: "Art. 9 Abs. 2 lit. b DSGVO i. V. m. § 26 BDSG",
    loeschfrist: retentionText("gesundheit_freitext"),
    retentionCategory: "gesundheit_freitext",
    appliesTo: async ({ tenantId }) =>
      (await prisma.tenantSicknessReport.count({ where: { tenantId } })) > 0,
  },
  {
    id: "schichtplanung",
    title: "Personaleinsatzplanung (Schichtplanung)",
    zweck: "Planung und Dokumentation von Arbeitszeiten.",
    betroffenePersonen: "Mitarbeiter",
    datenkategorien: "Schichtzeiten, Standort-/Teamzuordnung",
    rechtsgrundlage:
      "Art. 6 Abs. 1 lit. b, c DSGVO; §17 MiLoG, ArbZG-Dokumentationspflichten",
    loeschfrist: retentionText("arbeitszeit"),
    retentionCategory: "arbeitszeit",
    appliesTo: async ({ tenantId }) =>
      (await prisma.tenantShift.count({ where: { tenantId } })) > 0,
  },
  {
    id: "zeiterfassung",
    title: "Arbeitszeiterfassung (Stempeluhr)",
    zweck:
      "Erfassung der tatsächlich geleisteten Arbeitszeit (Beginn, Ende, Pausen) zur Erfüllung der Aufzeichnungspflichten und als Grundlage der Lohnabrechnung.",
    betroffenePersonen: "Mitarbeiter",
    datenkategorien:
      "Ein-/Ausstempelzeitpunkte, Pausenzeiten, Bezug zur geplanten Schicht, Korrekturen inkl. Grund und Bearbeiter; bei QR-Stempeln der gescannte Betriebsstandort (kein GPS/keine Geräteortung)",
    rechtsgrundlage:
      "Art. 6 Abs. 1 lit. b, c DSGVO; §16 Abs. 2 ArbZG, §17 MiLoG, BAG 1 ABR 22/21 (Pflicht zur Arbeitszeiterfassung)",
    loeschfrist: retentionText("arbeitszeit"),
    retentionCategory: "arbeitszeit",
    appliesTo: async ({ tenantId }) =>
      (await prisma.tenantTimeEntry.count({ where: { tenantId } })) > 0,
  },
  {
    id: "push-benachrichtigungen",
    title: "Push-Benachrichtigungen",
    zweck: "Benachrichtigung über neue Schichten, genehmigte Anträge, Info-Anfragen.",
    betroffenePersonen: "Mitarbeiter mit verknüpftem App-Konto",
    datenkategorien: "Geräte-/Push-Token, Benachrichtigungsinhalt",
    rechtsgrundlage: "Art. 6 Abs. 1 lit. b, f DSGVO",
    empfaenger: "Expo (650 Industries, Inc., USA) als Zustelldienst, leitet an Apple/Google weiter",
    loeschfrist: "Mit Löschung des verknüpften Nutzerkontos",
    appliesTo: async ({ employeeCount }) => employeeCount > 0,
  },
  {
    id: "selbstauskunft",
    title: "Selbstauskunft und Datenexport",
    zweck: "Erfüllung der Betroffenenrechte (Art. 15, 20 DSGVO) durch den Mitarbeiter selbst.",
    betroffenePersonen: "Mitarbeiter mit verknüpftem App-Konto",
    datenkategorien: "Alle oben genannten, im Umfang der eigenen Personalakte",
    rechtsgrundlage: "Art. 15, 20 DSGVO",
    loeschfrist: "Kein eigener Datenbestand — Auszug aus den oben genannten Kategorien",
    appliesTo: async ({ tenantId }) =>
      (await prisma.tenantEmployee.count({ where: { tenantId, userId: { not: null } } })) > 0,
  },
];

/**
 * Verzeichnis von Verarbeitungstätigkeiten (Art. 30 Abs. 2 DSGVO) für die
 * Mitarbeiterdaten, die der Mandant über Ployo als Auftragsverarbeiter
 * verwaltet — automatisch aus der tatsächlichen Nutzung erstellt (nur
 * Kategorien, für die es Datensätze gibt), keine juristische Prüfung.
 */
export async function getTenantProcessingRegister(tenantSlug: string) {
  const access = await requireSettingsManager(tenantSlug);
  const employeeCount = await prisma.tenantEmployee.count({
    where: { tenantId: access.tenantId },
  });

  const entries: ProcessingRegisterEntry[] = [];

  for (const { appliesTo, ...entry } of PROCESSING_REGISTER_TEMPLATE) {
    if (await appliesTo({ tenantId: access.tenantId, employeeCount })) {
      entries.push(entry);
    }
  }

  const session = await auth.api.getSession({ headers: await headers() });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: session?.user?.name || session?.user?.email || "System",
    action: "Verzeichnis von Verarbeitungstätigkeiten aufgerufen",
    source: "Einstellungen",
    entityType: "processing-register",
    entityId: access.tenantId,
    detail: `${entries.length} zutreffende Kategorien`,
  });

  return entries;
}
