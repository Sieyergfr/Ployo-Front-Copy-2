import "server-only";
import { billingCycles, tenantPlans, type BillingCycle, type TenantPlan } from "@/lib/tenants";

/**
 * Stripe-Price-IDs pro Plan/Abrechnungsintervall. Es gibt noch kein
 * Stripe-Konto — die IDs kommen ausschliesslich aus Umgebungsvariablen und
 * sind hier bewusst nicht hinterlegt. Solange die Variablen fehlen, ist
 * `undefined` der korrekte Wert (kein Fallback auf eine erfundene ID).
 */
export const planPrices: Record<TenantPlan, Record<BillingCycle, string | undefined>> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    yearly: process.env.STRIPE_PRICE_STARTER_YEARLY,
  },
  professional: {
    monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
    yearly: process.env.STRIPE_PRICE_PROFESSIONAL_YEARLY,
  },
  business: {
    monthly: process.env.STRIPE_PRICE_BUSINESS_MONTHLY,
    yearly: process.env.STRIPE_PRICE_BUSINESS_YEARLY,
  },
};

/** Maximale aktive Mitarbeiterzahl je Plan (Feature-Gating). */
export const planEmployeeLimits: Record<TenantPlan, number> = {
  starter: 5,
  professional: 25,
  business: 50,
};

export function getPlanPriceId(plan: TenantPlan, billingCycle: BillingCycle) {
  return planPrices[plan][billingCycle];
}

const healthySubscriptionStatuses = new Set(["active", "trialing"]);

export function isHealthySubscriptionStatus(status: string | null | undefined) {
  return healthySubscriptionStatuses.has(status ?? "");
}

/**
 * Reine Pruef-Funktion (kein DB-/Stripe-Zugriff), damit sie unabhaengig
 * testbar ist. Gibt eine Fehlermeldung zurueck, wenn kein weiterer
 * Mitarbeiter angelegt werden darf, sonst null.
 */
export function checkEmployeeLimit(input: {
  plan: TenantPlan;
  activeEmployeeCount: number;
  stripeConfigured: boolean;
  stripeSubscriptionStatus: string | null;
}): string | null {
  // Nur blockieren, wenn tatsächlich schon einmal ein Abo bestand und dieses
  // jetzt ungesund ist (z. B. Zahlung fehlgeschlagen). Ein `null`-Status
  // bedeutet "nie abonniert" (z. B. während der kostenlosen Testphase vor
  // dem ersten Checkout) und darf die Nutzung nicht blockieren.
  if (
    input.stripeConfigured &&
    input.stripeSubscriptionStatus !== null &&
    !isHealthySubscriptionStatus(input.stripeSubscriptionStatus)
  ) {
    return "Es besteht aktuell kein aktives Abonnement. Bitte zunächst das Zahlungsproblem in der Abrechnung beheben, bevor neue Mitarbeiter angelegt werden können.";
  }

  const limit = planEmployeeLimits[input.plan];

  if (input.activeEmployeeCount >= limit) {
    return `Der aktuelle Plan erlaubt maximal ${limit} Mitarbeiter. Bitte den Plan upgraden, um weitere Mitarbeiter anzulegen.`;
  }

  return null;
}

export function resolvePlanFromPriceId(
  priceId: string | null | undefined,
  prices: Record<TenantPlan, Record<BillingCycle, string | undefined>> = planPrices,
): { plan: TenantPlan; billingCycle: BillingCycle } | null {
  if (!priceId) {
    return null;
  }

  for (const plan of tenantPlans) {
    for (const billingCycle of billingCycles) {
      if (prices[plan][billingCycle] === priceId) {
        return { plan, billingCycle };
      }
    }
  }

  return null;
}
