import { REPORT_ERRORS } from "@/lib/report-hours";
import { TIME_CORRECTION_ERROR_STATUS, TIME_TRACKING_ERROR_STATUS } from "@/lib/time-tracking";

/**
 * Gemeinsames Fehler-Mapping für alle Route Handler unter `/api/me/*` und
 * `/api/tenants/[tenant]/*`. Die lib-Funktionen darunter (self-service.ts,
 * shift-service.ts, vacation-service.ts, sickness.ts, employee-service.ts,
 * team-service.ts, location-service.ts, role-service.ts, settings-service.ts,
 * reminders.ts, storage/storage.service.ts, billing-service.ts, ...) werfen
 * alle einfache `Error`s mit deutschsprachiger oder SCREAMING_CASE-Message
 * statt eigener Fehlerklassen — hier zentral auf HTTP-Status gemappt, damit
 * das nicht in jeder Route dupliziert wird.
 *
 * `classifySelfServiceError` ist die eigentliche Klassifikation (Message ->
 * Status oder `null` für "unbekannt/nicht sicher genug zum Anzeigen") —
 * separat exportierbar, weil `withActionErrorHandling` (lib/action-state.ts)
 * dieselbe Allowlist für Server-Action-Fehler (Toasts statt HTTP-Antworten)
 * braucht, ohne sie ein zweites Mal zu pflegen.
 */

/**
 * Exakte, fest verdrahtete "Pflichtfeld fehlt"/"ungültige Eingabe"-Meldungen
 * aus den `actions.ts`-Dateien unter `app/(dashboard)/u/[tenant]/**` (Guard-
 * Klauseln ganz am Anfang jeder Action, z. B. `if (!tenant || !name) throw
 * new Error("Standortname ist erforderlich.")`) sowie ein paar analoge
 * Validierungsmeldungen aus lib/*.ts — feste Strings ohne interpolierte
 * Daten, daher ohne Leak-Risiko 1:1 anzeigbar. Fehlten bisher komplett in
 * dieser Allowlist, obwohl die "Toasts statt Absturz"-Umstellung (siehe
 * To-Do.md) genau für sie gedacht war: jede dieser bewusst formulierten
 * Meldungen fiel dadurch auf die generische "Etwas ist schiefgelaufen"-
 * Meldung zurück und das Formular verlor seine Eingaben (QA-Bug BUG-007 —
 * betraf praktisch jedes Formular mit einer Pflichtfeld-Prüfung). Exakter
 * Abgleich (kein `includes()`), damit hier nie versehentlich eine unbekannte,
 * potenziell interne Fehlermeldung durchrutscht.
 */
const KNOWN_ACTION_GUARD_MESSAGES = new Set([
  "Bitte angeben, welche Information benötigt wird.",
  "Bitte die Vertrags-PDF auswählen.",
  "Bitte die vollständige Adresse angeben.",
  "Bitte ein Austrittsdatum angeben.",
  "Bitte ein JPEG-, PNG- oder WebP-Bild hochladen.",
  "Bitte ein Kündigungsdatum auswählen.",
  "Bitte ein gültiges Austrittsdatum angeben.",
  "Bitte eine 6-stellige PIN für den geschützten Ordner angeben.",
  "Bitte eine gueltige E-Mail-Adresse angeben.",
  "Bitte eine gültige E-Mail-Adresse angeben.",
  "Bitte eine gültige Kontakt-E-Mail-Adresse angeben.",
  "Bitte einen Kündigungsgrund angeben.",
  "Bitte einen Namen für die Vorlage angeben.",
  "Bitte einen Namen mit mindestens zwei Zeichen angeben.",
  "Bitte Mitarbeiter und Beginn der Krankmeldung angeben.",
  "Bitte mindestens eine Kategorie auswählen.",
  "Checkout konnte nicht gestartet werden.",
  "Das Bild darf höchstens 2 MB groß sein.",
  "Das neue Passwort muss mindestens 12 Zeichen lang sein.",
  "Datei konnte nicht entfernt werden.",
  "Datei konnte nicht gelöscht werden.",
  "Datei konnte nicht hochgeladen werden.",
  "Die Datei ist kein gültiges Bild.",
  "Die neuen Passwörter stimmen nicht überein.",
  "Diese Arbeitsbereich-URL ist nicht erlaubt.",
  "Es besteht noch kein Abonnement, das gewechselt werden könnte.",
  "Für diesen Mandanten besteht noch kein Stripe-Kunde.",
  "Gehaltsabrechnungen benötigen eine PDF-Datei.",
  "Gültige E-Mail ist erforderlich.",
  "Jeder Vertrag benötigt eine PDF-Datei.",
  "Kein Mitarbeiterprofil mit diesem Konto verknüpft.",
  "Keine Mitarbeiter ausgewählt.",
  "Name und Telefonnummer sind erforderlich.",
  "Personalnummer konnte nicht vergeben werden.",
  "Stripe hat keine Checkout-URL zurückgegeben.",
  "Titel und Fälligkeit sind erforderlich.",
  "Unternehmensname ist erforderlich.",
  "Einladung konnte nicht versendet werden.",
  "Erinnerung konnte nicht aktualisiert werden.",
  "Erinnerung konnte nicht erledigt werden.",
  "Erinnerung konnte nicht erstellt werden.",
  "Erinnerung konnte nicht gelöscht werden.",
  "Hauptkontakt konnte nicht festgelegt werden.",
  "Krankmeldung konnte nicht abgeschlossen werden.",
  "Krankmeldung konnte nicht aktualisiert werden.",
  "Mitarbeiter konnte nicht entfernt werden.",
  "Mitarbeiter konnte nicht gelöscht werden.",
  "Mitarbeiter konnte nicht gespeichert werden.",
  "Mitarbeiter konnte nicht hinzugefügt werden.",
  "Mitarbeiter konnte nicht reaktiviert werden.",
  "Mitarbeiter konnten nicht hinzugefügt werden.",
  "Mitarbeiter wurde nicht gefunden.",
  "Name darf nicht leer sein.",
  "Notfallkontakt konnte nicht gelöscht werden.",
  "Notfallkontakt konnte nicht gespeichert werden.",
  "Ordner konnte nicht erstellt werden.",
  "Ordnername ist erforderlich.",
  "Planungseinstellungen konnten nicht gespeichert werden.",
  "Rolle konnte nicht gelöscht werden.",
  "Rollenname ist erforderlich.",
  "Schicht konnte nicht erstellt werden.",
  "Schicht konnte nicht gelöscht werden.",
  "Schicht konnte nicht gespeichert werden.",
  "Schichtplan konnte nicht auf Entwurf zurückgesetzt werden.",
  "Schichtplan konnte nicht veröffentlicht werden.",
  "Schichtplan konnte nicht zurückgesetzt werden.",
  "Sichtbarkeit konnte nicht geändert werden.",
  "QR-Code konnte nicht erzeugt werden.",
  "Standort konnte nicht gelöscht werden.",
  "Standort konnte nicht gespeichert werden.",
  "Standortname ist erforderlich.",
  "Team konnte nicht gelöscht werden.",
  "Team konnte nicht gespeichert werden.",
  "Teamleitung konnte nicht gespeichert werden.",
  "Teamname ist erforderlich.",
  "Teamrolle konnte nicht gespeichert werden.",
  "Titel und Vertragsbeginn sind erforderlich.",
  "Titel, Mitarbeiter und Vertragsbeginn sind erforderlich.",
  "Urlaubsantrag konnte nicht abgelehnt werden.",
  "Urlaubsantrag konnte nicht aktualisiert werden.",
  "Urlaubsantrag konnte nicht erstellt werden.",
  "Urlaubsantrag konnte nicht gelöscht werden.",
  "Urlaubsantrag konnte nicht genehmigt werden.",
  "Version konnte nicht hochgeladen werden.",
  "Vertrag konnte nicht aktualisiert werden.",
  "Vorlage konnte nicht angewendet werden.",
  "Vorlage konnte nicht gelöscht werden.",
  "Vorlage konnte nicht gespeichert werden.",
  "Wunschfrei Anfrage konnte nicht abgelehnt werden.",
  "Wunschfrei Anfrage konnte nicht erstellt werden.",
  "Wunschfrei Anfrage konnte nicht genehmigt werden.",
  "Zahlungsverwaltung konnte nicht geöffnet werden.",
]);

function classifySelfServiceError(message: string): number | null {
  if (KNOWN_ACTION_GUARD_MESSAGES.has(message)) {
    return 400;
  }

  // lib/time-tracking-service.ts — feste Stempeluhr-/Korrekturmeldungen mit
  // eigenem Status (z. B. "bereits eingestempelt" → 409).
  const timeTrackingStatus = TIME_TRACKING_ERROR_STATUS.get(message);

  if (timeTrackingStatus !== undefined) {
    return timeTrackingStatus;
  }

  const timeCorrectionStatus = TIME_CORRECTION_ERROR_STATUS.get(message);

  if (timeCorrectionStatus !== undefined) {
    return timeCorrectionStatus;
  }

  // lib/reports-service.ts — feste Meldungen der Stunden-Reports.
  if ((Object.values(REPORT_ERRORS) as string[]).includes(message)) {
    return message === REPORT_ERRORS.rateLimited ? 429 : message === REPORT_ERRORS.emailNotConfigured ? 503 : 400;
  }

  if (
    message === "FORBIDDEN" ||
    message === "TWO_FACTOR_REQUIRED" ||
    // lib/storage/storage.service.ts assertFolderPinAccess() — gesperrter
    // Ordner der zentralen Ablage ohne (gültige) PIN.
    message === "FOLDER_LOCKED" ||
    message.startsWith("Keine Berechtigung") ||
    // lib/employee-service.ts — Self-Service-Zugriff auf eine fremde Personalakte.
    message.includes("gehört nicht zu Ihrem Konto") ||
    // lib/shift-service.ts requireTenantWideShiftManager() — Team-Planer
    // ohne "all"-Scope bei wochenweiten Aktionen (Veröffentlichen etc.).
    message.includes("erfordert uneingeschränkte Schichtplan-Berechtigung") ||
    // lib/vacation-service.ts setTenantVacationRequestStatus() (Audit-Finding H10).
    message === "Über den eigenen Urlaubsantrag kann nicht selbst entschieden werden."
  ) {
    return 403;
  }

  if (
    message.includes("keiner Personalakte zugeordnet") ||
    message.includes("mit keiner Personalakte verknüpft") ||
    message.includes("bereits mit einer Personalakte verknüpft") ||
    message.includes("bereits mit einem Konto verknüpft") ||
    message === "ROLE_IN_USE" ||
    // lib/employee-service.ts deleteEmployeeAccess() — Personalakte ohne
    // (noch) verknüpftes Konto, nichts zu löschen.
    message === "EMPLOYEE_ACCESS_NOT_LINKED" ||
    // lib/account-service.ts scheduleOwnAccountDeletion()/
    // deleteUserAccessImmediately() — solange der Nutzer alleinige/r
    // Inhaber/in eines Mandanten ist.
    message.includes("alleinige/r Inhaber") ||
    // lib/employee-service.ts deleteEmployeeAccess() — letzte/r Inhaber/in.
    message.includes("einzige Inhaber/in dieses Mandanten") ||
    // lib/vacation-service.ts setTenantVacationRequestStatus()/
    // updateTenantVacationRequest() — paralleler Statuswechsel (Compare-and-Set).
    message.startsWith("Der Genehmigungsstatus dieses Antrags hat sich zwischenzeitlich geändert") ||
    // lib/shift-service.ts saveShiftTemplateFromWeek()/updateShiftTemplate()
    // — Vorlagenname pro Mandant eindeutig (@@unique([tenantId, name])).
    message.includes("gibt bereits eine Vorlage namens") ||
    // lib/self-service.ts submitInfoRequestResponse() — stornierte Anfrage
    // kann nicht mehr beantwortet werden.
    message.includes("wurde storniert") ||
    // lib/wish-free-service.ts createMyWishFreeRequest()/deleteMyWishFreeRequest()
    // — Doppelanfrage für denselben Tag bzw. bereits entschiedene Anfrage.
    message.includes("bereits eine Wunschfrei-Anfrage vor") ||
    message.includes("nicht mehr zurückziehen") ||
    // lib/location-service.ts/team-service.ts/role-service.ts — doppelter
    // Standort-/Team-/Rollenname pro Mandant (QA-Bug BUG-006).
    message.includes("existiert bereits") ||
    // lib/employee-service.ts createTenantEmployeeRecord()/updateTenantEmployee()
    // — Personalnummer bzw. E-Mail bereits an eine andere Personalakte
    // vergeben (QA-Bug BUG-005/BUG-007).
    message.includes("bereits vergeben") ||
    message.includes("bereits an einen anderen Mitarbeiter vergeben") ||
    message.includes("bereits einer anderen Personalakte zugeordnet") ||
    // lib/vacation-service.ts assertNoVacationOverlap() — QA-Bug BUG-001.
    message.includes("bereits ein offener oder genehmigter Urlaubsantrag") ||
    // lib/shift-service.ts assertArbzgCompliant() — Schicht überschneidet
    // sich mit einer bestehenden Schicht derselben Person. Fehlte bisher, die
    // App zeigte deshalb nur "Es ist ein Fehler aufgetreten."
    message.startsWith("Konflikt mit bestehender Schicht:") ||
    // lib/retention-service.ts assertFileDeletionAllowed() (Legal Hold/
    // Aufbewahrungsfrist) sowie lib/storage/storage.service.ts
    // softDeleteTenantFileFolder()/restoreTenantFileDeletion().
    message.startsWith("Löschung gesperrt") ||
    message.startsWith("Ordner kann nicht gelöscht werden") ||
    message.startsWith("Bitte zuerst den Ordner") ||
    message.includes("Frist zum Wiederherstellen ist abgelaufen")
  ) {
    return 409;
  }

  if (
    message.includes("nicht gefunden") ||
    message === "TEAM_NOT_FOUND" ||
    message === "TEAM_MEMBER_NOT_FOUND" ||
    message === "EMPLOYEE_NOT_FOUND" ||
    message === "ROLE_NOT_FOUND"
  ) {
    return 404;
  }

  // lib/stripe/plans.ts checkEmployeeLimit() — Plan-/Abo-Grenze erreicht,
  // reachable über den Self-Service-"Personalakte anlegen"-Pfad.
  if (message.includes("aktives Abonnement") || message.includes("Plan erlaubt maximal")) {
    return 402;
  }

  if (
    // lib/sickness.ts create-/update-/closeTenantSicknessReport() — vormals
    // der rohe Code "INVALID_SICKNESS_DATES" (QA-Bug BUG-007: erschien
    // wortwörtlich als Toast-Text statt einer verständlichen Meldung).
    message.includes("Enddatum darf nicht vor dem") ||
    message === "TEAM_LEAD_CANNOT_BE_REMOVED" ||
    message === "SYSTEM_ROLE" ||
    message.startsWith("Ungültiger") ||
    // lib/employee-service.ts assertKnownOrgReferences() — unbekannter
    // Standort/Team/Berechtigungsrolle beim Anlegen/Bearbeiten eines
    // Mitarbeiters.
    message.startsWith("Unbekannt") ||
    // lib/employee-service.ts assertValidEmployeeName()/assertValidPhone()/
    // assertValidTaxId()/assertValidIban(), lib/address.ts
    // assertValidAddressFormat() — Feldformat-Validierungen (QA-Bug BUG-008).
    message.includes("darf höchstens") ||
    message.includes("gültige Telefonnummer") ||
    message.includes("Steuer-Identifikationsnummer") ||
    message.includes("gültige IBAN") ||
    message.includes("gültige deutsche Postleitzahl") ||
    message.startsWith("Bitte eine Datei") ||
    message.includes("zu groß") ||
    message.includes("Dateityp wird nicht unterstützt") ||
    // lib/storage/virus-scan.ts assertNoVirus() — ClamAV hat eine Signatur
    // gefunden.
    message.includes("vom Virenscan als schädlich erkannt") ||
    // lib/vacation-service.ts validateVacationDateRange() — exakte Strings,
    // kein Fehlercode dort (anders als bei Krankmeldungen).
    message.startsWith("Bitte gültige Datumswerte") ||
    // lib/wish-free-service.ts createMyWishFreeRequest()
    message.startsWith("Bitte ein gültiges Datum") ||
    message.includes("Vergangenheit liegen") ||
    // lib/vacation-service.ts validateVacationDateRange()/lib/sickness.ts —
    // außerhalb der Beschäftigungsdauer (QA-Bug BUG-009).
    message.includes("vor dem Eintrittsdatum") ||
    // lib/vacation-service.ts calculateAndValidateVacationWorkDays() — Zeitraum
    // ohne einen einzigen Arbeitstag (Audit-Finding M01). Fehlte bisher: die
    // App zeigte beim Urlaubsantrag nur "Es ist ein Fehler aufgetreten."
    message.startsWith("Der gewählte Zeitraum enthält laut hinterlegtem Dienstplan keinen") ||
    // lib/payroll-service.ts uploadPayrollStatement()
    message.startsWith("Bitte einen Abrechnungszeitraum angeben") ||
    // lib/employee-service.ts createTenantEmployeeRecord()
    message.startsWith("Für diesen Mandanten ist eine Personalnummer verpflichtend") ||
    // lib/storage/storage.service.ts validateUploadFileContent() (H08).
    message.startsWith("Diese Datei enthält aktive Inhalte") ||
    message.startsWith("Der Dateiinhalt entspricht nicht der Dateiendung") ||
    // lib/account-service.ts confirmAccountDeletionByToken()
    message.startsWith("Dieser Link ist ungueltig oder abgelaufen") ||
    message.includes("nach dem Austrittsdatum") ||
    // lib/account-service.ts changeAccountPassword()/scheduleOwnAccountDeletion()
    // — bewusst vage Meldung bei falschem Passwort (kein Enumeration-Leak).
    message.includes("Passwort prüfen") ||
    // lib/shift-service.ts saveShiftTemplateFromWeek() — Zielwoche leer.
    message.includes("enthält keine Schichten") ||
    // lib/shift-service.ts resetShiftWeekToPublished() — nichts zum
    // Zurücksetzen bzw. Alt-Schnappschuss ohne vollständige Daten.
    message.includes("noch nicht veröffentlicht") ||
    message.includes("lässt sich nicht vollständig wiederherstellen") ||
    // lib/shift-service.ts assertArbzgCompliant() — §3/§5 ArbZG (Höchst-
    // arbeitszeit/Ruhezeit), § 14/17/18 JArbSchG (Nachtruhe/Sonntagsruhe für
    // Jugendliche) sowie § 5/6 MuSchG (Beschäftigungsverbot bei aktiver
    // Mutterschutz-Kennzeichnung). Die ArbZG/JArbSchG-Texte standen bisher
    // nicht in dieser Allowlist, fielen also seit der Toast-Umstellung auf
    // die generische Fehlermeldung zurück, obwohl es sorgfältig formulierte,
    // gesetzeszitierende Texte sind — hier nachgetragen.
    message.includes("ArbZG") ||
    message.includes("JArbSchG") ||
    message.includes("MuSchG") ||
    // lib/shift-service.ts assertArbzgCompliant() — Pause länger als die
    // Schicht selbst (QA-Bug BUG-008).
    message.includes("darf nicht länger sein als die Schicht selbst") ||
    // lib/shift-service.ts assertPublishedShiftsArbzgCompliant() — Sammelmeldung beim
    // Veröffentlichen; enthält die Einzelmeldungen oben (inkl. Überschneidung).
    message.startsWith("Veröffentlichung abgebrochen")
  ) {
    return 400;
  }

  // lib/tenant-access.ts assertBillingAccess() — Mandant wegen Abo gesperrt
  // (Checkout nicht abgeschlossen oder Zahlung fehlgeschlagen).
  if (message === "SUBSCRIPTION_REQUIRED") {
    return 402;
  }

  // lib/billing-service.ts — Stripe ist serverseitig nicht konfiguriert
  // (fehlende Env-Vars), kein Client-Fehler.
  if (message === "STRIPE_NOT_CONFIGURED") {
    return 503;
  }

  // lib/storage/virus-scan.ts assertNoVirus() — clamd nicht erreichbar,
  // Timeout oder unerwartete Antwort. Upload wird im Zweifel abgelehnt
  // (fail-closed), daher 503 statt 500.
  if (message.includes("Virenscan derzeit nicht verfügbar")) {
    return 503;
  }

  return null;
}

/** Lesbarer Text für die Abo-Sperre — auch für ältere App-Versionen, die `code` noch nicht kennen. */
export const SUBSCRIPTION_REQUIRED_MESSAGE =
  "Dein Betrieb ist derzeit eingeschränkt: Das Ployo-Abo muss abgeschlossen bzw. erneuert werden. Bitte wende dich an die Verwaltung deines Betriebs.";

/** 402 für "SUBSCRIPTION_REQUIRED" aus lib/tenant-access.ts. */
export function subscriptionRequiredResponse(): Response {
  return Response.json(
    { error: SUBSCRIPTION_REQUIRED_MESSAGE, code: "SUBSCRIPTION_REQUIRED" },
    { status: 402 },
  );
}

export function mapSelfServiceError(error: unknown): Response {
  if (!(error instanceof Error)) {
    throw error;
  }

  if (error.message === "SUBSCRIPTION_REQUIRED") {
    return subscriptionRequiredResponse();
  }

  const status = classifySelfServiceError(error.message);

  if (status === null) {
    throw error;
  }

  return Response.json({ error: error.message }, { status });
}

/**
 * Dieselbe Allowlist wie `mapSelfServiceError`, aber als Prädikat statt als
 * HTTP-Antwort — für Server Actions (lib/action-state.ts
 * `withActionErrorHandling`), die einen Toast-Text statt einer Response
 * brauchen. Ein `true` bedeutet: die Message ist eine unserer eigenen,
 * bewusst formulierten Fehlermeldungen und darf 1:1 angezeigt werden.
 */
export function isKnownSelfServiceErrorMessage(error: unknown): error is Error {
  return error instanceof Error && classifySelfServiceError(error.message) !== null;
}
