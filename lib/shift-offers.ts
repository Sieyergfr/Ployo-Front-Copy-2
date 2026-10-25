/**
 * Schicht anbieten / Vertretung finden — feste Meldungen und die Bewertung
 * passender Personen. Ohne Datenbankzugriff, damit sie sich direkt testen
 * lässt (Service: lib/shift-offer-service.ts).
 */

export const SHIFT_OFFER_ERRORS = {
  notLinked: "Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden.",
  notFound: "Angebot nicht gefunden.",
  notPending: "Auf dieses Angebot wurde bereits geantwortet.",
  taken: "Die Schicht ist bereits vergeben.",
  absent: "Sie sind an diesem Tag abwesend und können die Schicht nicht übernehmen.",
  noRecipients: "Bitte mindestens eine Person auswählen.",
  shiftNotFound: "Schicht nicht gefunden.",
  invalidDecision: "Bitte annehmen oder ablehnen.",
} as const;

export const SHIFT_OFFER_ERROR_STATUS: ReadonlyMap<string, number> = new Map([
  [SHIFT_OFFER_ERRORS.notLinked, 409],
  [SHIFT_OFFER_ERRORS.notFound, 404],
  [SHIFT_OFFER_ERRORS.notPending, 409],
  [SHIFT_OFFER_ERRORS.taken, 409],
  [SHIFT_OFFER_ERRORS.absent, 409],
  [SHIFT_OFFER_ERRORS.noRecipients, 400],
  [SHIFT_OFFER_ERRORS.shiftNotFound, 404],
  [SHIFT_OFFER_ERRORS.invalidDecision, 400],
]);

export type ShiftOfferStatus = "pending" | "accepted" | "declined" | "closed";

export type ShiftOfferCheckId = "available" | "rest" | "hours" | "team" | "location";

export type ShiftOfferCheck = {
  id: ShiftOfferCheckId;
  ok: boolean;
};

export type ShiftOfferCandidate = {
  employeeId: string;
  name: string;
  initials: string;
  team: string;
  hasAccount: boolean;
  /** Geplante Minuten in der Woche der Schicht, inkl. dieser Schicht. */
  plannedMinutes: number;
  /** Wochen-Soll in Minuten, sofern hinterlegt. */
  targetMinutes: number | null;
  checks: ShiftOfferCheck[];
  /** 0–100; nicht verfügbare Personen haben 0. */
  score: number;
  /** Grund, falls die Person die Schicht nicht übernehmen kann (Abwesenheit, Überschneidung, ArbZG). */
  blockedReason: string | null;
  offerStatus: ShiftOfferStatus | null;
};

/**
 * Gewichtung: Verfügbarkeit ist Voraussetzung (sonst 0), danach zählen
 * Ruhezeit/ArbZG am stärksten, dann Stundenkonto, Team und Standort.
 */
export function scoreShiftOfferCandidate(checks: Record<ShiftOfferCheckId, boolean>) {
  if (!checks.available) {
    return 0;
  }

  return 20 + (checks.rest ? 35 : 0) + (checks.hours ? 20 : 0) + (checks.team ? 15 : 0) + (checks.location ? 10 : 0);
}

/** Dauer einer Schicht in Minuten abzüglich Pause; Ende ≤ Beginn heißt über Mitternacht. */
export function shiftNetMinutes(startTime: string, endTime: string, breakMinutes: number) {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);

    return (hours || 0) * 60 + (minutes || 0);
  };
  let duration = toMinutes(endTime) - toMinutes(startTime);

  if (duration <= 0) duration += 24 * 60;

  return Math.max(0, duration - Math.max(0, breakMinutes));
}
