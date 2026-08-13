import "server-only";
import Stripe from "stripe";

/**
 * Zentraler Stripe-Client. Ohne STRIPE_SECRET_KEY bleibt Billing inaktiv —
 * Aufrufer muessen vorher isStripeConfigured() pruefen, analog zu
 * isEmailConfigured() in lib/email.ts.
 */

let cachedStripeClient: Stripe | null = null;

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function createStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }

  return new Stripe(secretKey);
}

export function getStripeClient() {
  cachedStripeClient ??= createStripeClient();

  return cachedStripeClient;
}
