/**
 * Resturlaubs-Übertrag zum Jahreswechsel (Audit-Finding M02) — BUrlG §7 Abs. 3
 * i. V. m. BAG 9 AZR 541/15: nicht verbrauchter Urlaub verfällt nur zum
 * 31.03. des Folgejahres, wenn der Arbeitgeber rechtzeitig und konkret auf
 * den drohenden Verfall hingewiesen hat. Ohne diesen Hinweis bleibt der
 * Anspruch bestehen — kein automatischer Verfall.
 *
 * Bewusst KEIN vollständiges Jahres-Ledger (keine Historie, welcher Antrag
 * aus welchem Jahrgang stammt) — `TenantEmployee` führt nur EINEN aktuellen
 * Carryover-Saldo (`vacationCarryover`/`vacationCarryoverExpiresAt`/
 * `vacationCarryoverRemindedAt`), fortgeschrieben von `rollOverVacationCarryover`
 * (Cronjob, einmal pro Jahreswechsel) statt je Antrag verbucht.
 */

export type VacationCarryoverState = {
  carryover: number;
  expiresAt: Date | null;
  remindedAt: Date | null;
};

/**
 * Erstes Jahr, für das im System erfasste Urlaubsanträge als vollständig
 * gelten dürfen — Anträge wurden erst ab Mitte 2026 durchgängig erfasst.
 * Für ein Vorjahr VOR diesem Jahr bedeutet "keine Anträge gefunden" NICHT
 * "0 Tage genommen", sondern "keine Daten vorhanden": ein Übertrag darf
 * dafür nicht fingiert werden (Aufrufer in `vacation-service.ts` muss für
 * ein solches Vorjahr `previousYearTotal`/`previousYearTaken` als 0
 * übergeben, statt echte DB-Werte zu ermitteln). Ohne diese Grenze schrieb
 * der allererste Rollover-Lauf jedem Bestandsmitarbeiter fälschlich den
 * kompletten aktuellen Jahresanspruch nochmal als Übertrag gut, weil für
 * das (nicht erfasste) Vorjahr 0 Anträge gefunden wurden.
 */
export const FIRST_TRACKED_VACATION_YEAR = 2026;

/** 31.03. des übergebenen Jahres, 23:59:59.999 UTC. */
export function marchThirtyFirst(year: number): Date {
  return new Date(Date.UTC(year, 2, 31, 23, 59, 59, 999));
}

/**
 * Übernimmt einen noch nicht verfallenen Alt-Carryover unverändert und
 * addiert den zum Jahreswechsel neu entstandenen Resturlaub des gerade
 * abgelaufenen Jahres. Ob der Alt-Carryover verfallen ist, entscheidet
 * `shouldForfeitCarryover` VOR diesem Aufruf — hier wird nur fortgeschrieben.
 * Idempotent innerhalb desselben Jahres (`now`): ein bereits für dieses Jahr
 * gesetztes `expiresAt` wird nicht erneut verarbeitet, damit ein täglich
 * laufender Cronjob nicht bei jedem Lauf erneut aufaddiert.
 */
export function rollOverVacationCarryover(input: {
  now: Date;
  currentState: VacationCarryoverState;
  previousYearTotal: number;
  previousYearTaken: number;
}): VacationCarryoverState {
  const year = input.now.getUTCFullYear();

  if (input.currentState.expiresAt && input.currentState.expiresAt.getUTCFullYear() === year) {
    return input.currentState;
  }

  const freshRemainder = Math.max(0, input.previousYearTotal - input.previousYearTaken);

  return {
    carryover: input.currentState.carryover + freshRemainder,
    expiresAt: marchThirtyFirst(year),
    remindedAt: null,
  };
}

/**
 * true, wenn jetzt der richtige Zeitpunkt ist, den Mitarbeiter auf den
 * drohenden Verfall hinzuweisen (innerhalb von `leadDays` vor der Frist, noch
 * nicht hingewiesen, noch Restguthaben vorhanden).
 */
export function isCarryoverReminderDue(
  state: VacationCarryoverState,
  now: Date,
  leadDays = 30,
): boolean {
  if (state.carryover <= 0 || !state.expiresAt || state.remindedAt) {
    return false;
  }

  const leadStart = new Date(state.expiresAt.getTime() - leadDays * 86_400_000);

  return now >= leadStart && now <= state.expiresAt;
}

/**
 * true, wenn der Carryover jetzt verfallen darf — NUR wenn die Frist
 * abgelaufen ist UND rechtzeitig (vor der Frist) ein dokumentierter Hinweis
 * erfolgt ist. Ohne Hinweis bleibt der Anspruch bestehen (BAG 9 AZR 541/15).
 */
export function shouldForfeitCarryover(state: VacationCarryoverState, now: Date): boolean {
  return (
    state.carryover > 0 &&
    state.expiresAt !== null &&
    now > state.expiresAt &&
    state.remindedAt !== null &&
    state.remindedAt <= state.expiresAt
  );
}
