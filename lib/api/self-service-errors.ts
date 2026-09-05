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
function classifySelfServiceError(message: string): number | null {
  if (
    message === "FORBIDDEN" ||
    message === "TWO_FACTOR_REQUIRED" ||
    // lib/storage/storage.service.ts assertFolderPinAccess() — gesperrter
    // Ordner der zentralen Ablage ohne (gültige) PIN.
    message === "FOLDER_LOCKED" ||
    message.startsWith("Keine Berechtigung")
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
    // lib/shift-service.ts saveShiftTemplateFromWeek()/updateShiftTemplate()
    // — Vorlagenname pro Mandant eindeutig (@@unique([tenantId, name])).
    message.includes("gibt bereits eine Vorlage namens") ||
    // lib/self-service.ts submitInfoRequestResponse() — stornierte Anfrage
    // kann nicht mehr beantwortet werden.
    message.includes("wurde storniert") ||
    // lib/wish-free-service.ts createMyWishFreeRequest()/deleteMyWishFreeRequest()
    // — Doppelanfrage für denselben Tag bzw. bereits entschiedene Anfrage.
    message.includes("bereits eine Wunschfrei-Anfrage vor") ||
    message.includes("nicht mehr zurückziehen")
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
    message === "INVALID_SICKNESS_DATES" ||
    message === "TEAM_LEAD_CANNOT_BE_REMOVED" ||
    message === "SYSTEM_ROLE" ||
    message.startsWith("Ungültiger") ||
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
    message.includes("Enddatum darf nicht vor dem Startdatum") ||
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
    message.includes("MuSchG")
  ) {
    return 400;
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

export function mapSelfServiceError(error: unknown): Response {
  if (!(error instanceof Error)) {
    throw error;
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
