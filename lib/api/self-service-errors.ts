/**
 * Gemeinsames Fehler-Mapping für alle Route Handler unter `/api/me/*` und
 * `/api/tenants/[tenant]/*`. Die lib-Funktionen darunter (self-service.ts,
 * shift-service.ts, vacation-service.ts, sickness.ts, employee-service.ts,
 * team-service.ts, location-service.ts, role-service.ts, settings-service.ts,
 * reminders.ts, storage/storage.service.ts, billing-service.ts, ...) werfen
 * alle einfache `Error`s mit deutschsprachiger oder SCREAMING_CASE-Message
 * statt eigener Fehlerklassen — hier zentral auf HTTP-Status gemappt, damit
 * das nicht in jeder Route dupliziert wird.
 */
export function mapSelfServiceError(error: unknown): Response {
  if (!(error instanceof Error)) {
    throw error;
  }

  const message = error.message;

  if (
    message === "FORBIDDEN" ||
    message === "TWO_FACTOR_REQUIRED" ||
    // lib/storage/storage.service.ts assertFolderPinAccess() — gesperrter
    // Ordner der zentralen Ablage ohne (gültige) PIN.
    message === "FOLDER_LOCKED" ||
    message.startsWith("Keine Berechtigung")
  ) {
    return Response.json({ error: message }, { status: 403 });
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
    return Response.json({ error: message }, { status: 409 });
  }

  if (
    message.includes("nicht gefunden") ||
    message === "TEAM_NOT_FOUND" ||
    message === "TEAM_MEMBER_NOT_FOUND" ||
    message === "EMPLOYEE_NOT_FOUND" ||
    message === "ROLE_NOT_FOUND"
  ) {
    return Response.json({ error: message }, { status: 404 });
  }

  // lib/stripe/plans.ts checkEmployeeLimit() — Plan-/Abo-Grenze erreicht,
  // reachable über den Self-Service-"Personalakte anlegen"-Pfad.
  if (message.includes("aktives Abonnement") || message.includes("Plan erlaubt maximal")) {
    return Response.json({ error: message }, { status: 402 });
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
    message.includes("lässt sich nicht vollständig wiederherstellen")
  ) {
    return Response.json({ error: message }, { status: 400 });
  }

  // lib/billing-service.ts — Stripe ist serverseitig nicht konfiguriert
  // (fehlende Env-Vars), kein Client-Fehler.
  if (message === "STRIPE_NOT_CONFIGURED") {
    return Response.json({ error: message }, { status: 503 });
  }

  // lib/storage/virus-scan.ts assertNoVirus() — clamd nicht erreichbar,
  // Timeout oder unerwartete Antwort. Upload wird im Zweifel abgelehnt
  // (fail-closed), daher 503 statt 500.
  if (message.includes("Virenscan derzeit nicht verfügbar")) {
    return Response.json({ error: message }, { status: 503 });
  }

  throw error;
}
