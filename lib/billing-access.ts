/**
 * Abo-Sperre für Mandanten — reine Prüflogik ohne DB-/Stripe-Zugriff, damit
 * sie von lib/tenant-access.ts (zentrale Zugriffsgrenze) und der Sperrseite
 * gleichermaßen genutzt und unabhängig getestet werden kann.
 *
 * Regeln:
 * - Neu über den Assistenten angelegt (`billingRequired`) und noch nie ein
 *   Abo → gesperrt, bis der Checkout abgeschlossen ist ("setup_required").
 *   Ältere Mandanten ohne Abo (Demo-/Altbestand) bleiben unverändert offen.
 * - Zahlung fehlgeschlagen (`past_due`): Wer schon einmal bezahlt hat, läuft
 *   weiter, bis der {@link MAX_FAILED_PAYMENT_ATTEMPTS}. Versuch fehlschlägt.
 *   Stripe-Wiederholungsplan (Dashboard → Billing → fehlgeschlagene
 *   Zahlungen): Erstabbuchung + Wiederholungen nach 1, 5 und 9 Tagen, danach
 *   bleibt das Abo "überfällig" (`past_due`, wird NICHT `unpaid`) — die
 *   Sperre hängt deshalb allein an diesem Zähler. Wer noch nie bezahlt hat
 *   (Ende der Testphase), ist sofort gesperrt ("payment_failed").
 * - `unpaid` → gesperrt ("payment_failed"); `canceled`/`incomplete_expired`/
 *   `paused` → gesperrt ("subscription_inactive").
 */

/** Erstabbuchung + 3 Wiederholungen — gesperrt nach der letzten (Tag 9). */
export const MAX_FAILED_PAYMENT_ATTEMPTS = 4;

export type BillingBlockReason = "setup_required" | "payment_failed" | "subscription_inactive";

export type TenantBillingFields = {
  billingRequired: boolean;
  stripeSubscriptionStatus: string | null;
  stripeHasPaid: boolean;
  stripeFailedPaymentAttempts: number;
};

export function getBillingBlockReason(
  tenant: TenantBillingFields,
  stripeConfigured: boolean,
): BillingBlockReason | null {
  if (!stripeConfigured) {
    return null;
  }

  const status = tenant.stripeSubscriptionStatus;

  if (status === null) {
    return tenant.billingRequired ? "setup_required" : null;
  }

  if (status === "active" || status === "trialing") {
    return null;
  }

  if (status === "past_due") {
    return tenant.stripeHasPaid && tenant.stripeFailedPaymentAttempts < MAX_FAILED_PAYMENT_ATTEMPTS
      ? null
      : "payment_failed";
  }

  if (status === "unpaid") {
    return "payment_failed";
  }

  // "incomplete": erste Zahlung eines neuen Abos steht noch aus.
  if (status === "incomplete") {
    return tenant.stripeHasPaid ? "payment_failed" : "setup_required";
  }

  return "subscription_inactive";
}

/** Prisma-`select` für {@link getBillingBlockReason}. */
export const tenantBillingSelect = {
  billingRequired: true,
  stripeSubscriptionStatus: true,
  stripeHasPaid: true,
  stripeFailedPaymentAttempts: true,
} as const;

/** Nicht über lib/stripe/client.ts, das ist "server-only". */
export function isStripeConfiguredForBilling() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
