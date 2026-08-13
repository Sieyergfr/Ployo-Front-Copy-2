import "server-only";
import { auth } from "@/lib/auth";
import { recordTenantAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireSettingsManager } from "@/lib/settings-service";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe/client";
import { getPlanPriceId, isHealthySubscriptionStatus } from "@/lib/stripe/plans";
import type { BillingCycle, TenantPlan } from "@/lib/tenants";
import { headers } from "next/headers";

/**
 * Checkout ist nur fuer den ersten Vertragsabschluss gedacht — Stripe
 * Checkout kann ein bestehendes Abo nicht aendern, sondern legt immer ein
 * neues an. Ein Plan-Wechsel bei bereits aktivem Abo laeuft deshalb ueber
 * die Billing-Portal-Flow "subscription_update", nicht ueber Checkout.
 */

async function getSessionUserName() {
  const session = await auth.api.getSession({ headers: await headers() });

  return session?.user?.name || session?.user?.email || "System";
}

export async function createBillingCheckoutSession(input: {
  tenantSlug: string;
  plan: TenantPlan;
  billingCycle: BillingCycle;
  successUrl: string;
  cancelUrl: string;
}) {
  if (!isStripeConfigured()) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }

  const access = await requireSettingsManager(input.tenantSlug);
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: access.tenantId },
    select: {
      id: true,
      name: true,
      contactEmail: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripeSubscriptionStatus: true,
    },
  });

  if (
    tenant.stripeSubscriptionId &&
    isHealthySubscriptionStatus(tenant.stripeSubscriptionStatus)
  ) {
    throw new Error(
      "Es besteht bereits ein aktives Abonnement. Bitte den Plan über die Zahlungsverwaltung wechseln.",
    );
  }

  const priceId = getPlanPriceId(input.plan, input.billingCycle);

  if (!priceId) {
    throw new Error(
      `Für den Plan "${input.plan}" (${input.billingCycle}) ist noch keine Stripe-Price-ID hinterlegt.`,
    );
  }

  const stripe = getStripeClient();
  const customerId =
    tenant.stripeCustomerId ??
    (
      await stripe.customers.create(
        {
          name: tenant.name,
          email: tenant.contactEmail ?? undefined,
          metadata: { tenantId: tenant.id },
        },
        { idempotencyKey: `stripe-customer-create-${tenant.id}` },
      )
    ).id;

  if (!tenant.stripeCustomerId) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: tenant.id,
    metadata: { tenantId: tenant.id },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new Error("Stripe hat keine Checkout-URL zurückgegeben.");
  }

  await recordTenantAudit({
    tenantId: tenant.id,
    actorId: access.userId,
    actorName: await getSessionUserName(),
    action: "Checkout gestartet",
    source: "Abrechnung",
    entityType: "billing",
    entityId: tenant.id,
    detail: `${input.plan} / ${input.billingCycle}`,
  });

  return session.url;
}

export async function createBillingPortalSession(input: {
  tenantSlug: string;
  returnUrl: string;
  intent?: "switch-plan";
}) {
  if (!isStripeConfigured()) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }

  const access = await requireSettingsManager(input.tenantSlug);
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: access.tenantId },
    select: { id: true, stripeCustomerId: true, stripeSubscriptionId: true },
  });

  if (!tenant.stripeCustomerId) {
    throw new Error("Für diesen Mandanten besteht noch kein Stripe-Kunde.");
  }

  if (input.intent === "switch-plan" && !tenant.stripeSubscriptionId) {
    throw new Error("Es besteht noch kein Abonnement, das gewechselt werden könnte.");
  }

  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: input.returnUrl,
    ...(input.intent === "switch-plan"
      ? {
          flow_data: {
            type: "subscription_update" as const,
            subscription_update: { subscription: tenant.stripeSubscriptionId! },
          },
        }
      : {}),
  });

  await recordTenantAudit({
    tenantId: tenant.id,
    actorId: access.userId,
    actorName: await getSessionUserName(),
    action:
      input.intent === "switch-plan" ? "Plan-Wechsel gestartet" : "Zahlungsverwaltung geöffnet",
    source: "Abrechnung",
    entityType: "billing",
    entityId: tenant.id,
    detail: "",
  });

  return session.url;
}
