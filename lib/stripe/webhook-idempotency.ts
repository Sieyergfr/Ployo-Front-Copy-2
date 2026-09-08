/**
 * Reine Prüflogik für den Stripe-Webhook (Audit-Finding M14), bewusst ohne
 * DB-/Stripe-SDK-Abhängigkeiten — analog zu lib/arbzg-rules.ts.
 */

/**
 * `event.created` (Stripe, Unix-Sekunden) gegen den zuletzt tatsächlich
 * angewendeten Stand vergleichen — ein verspätet zugestelltes oder aus der
 * Reihe geratenes älteres Event darf einen bereits neueren lokalen Stand
 * nicht überschreiben. Gleichstand (gleicher Zeitstempel) wird durchgelassen,
 * damit ein erster Lauf ohne bisherigen Zeitstempel nicht blockiert.
 */
export function isStaleEvent(
  tenant: { stripeLastEventCreatedAt: Date | null },
  eventCreated: number,
): boolean {
  if (!tenant.stripeLastEventCreatedAt) {
    return false;
  }

  return eventCreated * 1000 < tenant.stripeLastEventCreatedAt.getTime();
}
