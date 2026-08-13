import { recordTenantAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe/client";
import { resolvePlanFromPriceId } from "@/lib/stripe/plans";
import { logger, runWithRequestId } from "@/lib/logger";
import type Stripe from "stripe";

export const runtime = "nodejs";

/**
 * Stripe-Webhook. Quelle der Wahrheit fuer den Abo-Status ist
 * customer.subscription.created/updated/deleted, nicht
 * checkout.session.completed — die Subscription-Events enthalten das
 * vollstaendige Subscription-Objekt (Status, Preis, Laufzeitende).
 * checkout.session.completed wird nur defensiv behandelt, um die
 * stripeSubscriptionId etwas frueher zu setzen.
 */
export async function POST(request: Request) {
  return runWithRequestId((requestId) => handleStripeWebhook(request, requestId));
}

async function handleStripeWebhook(request: Request, requestId: string) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!isStripeConfigured() || !webhookSecret) {
    return Response.json({ error: "Stripe ist nicht konfiguriert." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Fehlende Stripe-Signatur." }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripeClient();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    logger.error("Stripe-Webhook: Signaturprüfung fehlgeschlagen.", {
      error: error instanceof Error ? error.message : String(error),
    });

    return Response.json(
      { error: "Ungültige Signatur." },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  logger.info("Stripe-Webhook empfangen.", { eventType: event.type, eventId: event.id });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;

      if (typeof session.customer === "string" && typeof session.subscription === "string") {
        await prisma.tenant.updateMany({
          where: { stripeCustomerId: session.customer, stripeSubscriptionId: null },
          data: { stripeSubscriptionId: session.subscription },
        });
      }

      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await syncSubscriptionState(event.data.object);
      break;
    }

    case "customer.subscription.deleted": {
      await clearSubscriptionState(event.data.object);
      break;
    }

    default:
      break;
  }

  return Response.json({ status: "ok" }, { headers: { "x-request-id": requestId } });
}

function resolveCustomerId(customer: Stripe.Subscription["customer"]) {
  return typeof customer === "string" ? customer : customer.id;
}

async function findTenantByCustomerId(customerId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { stripeCustomerId: customerId },
    select: {
      id: true,
      plan: true,
      billingCycle: true,
      stripeSubscriptionId: true,
      stripeSubscriptionStatus: true,
      stripePriceId: true,
      stripeCurrentPeriodEnd: true,
      stripeCancelAtPeriodEnd: true,
    },
  });

  if (!tenant) {
    logger.error("Stripe-Webhook: kein Mandant für Stripe-Customer gefunden.", { customerId });
  }

  return tenant;
}

async function syncSubscriptionState(subscription: Stripe.Subscription) {
  const tenant = await findTenantByCustomerId(resolveCustomerId(subscription.customer));

  if (!tenant) {
    return;
  }

  const item = subscription.items.data[0];
  const priceId = item?.price.id ?? null;
  const resolvedPlan = resolvePlanFromPriceId(priceId);
  const periodEnd = item ? new Date(item.current_period_end * 1000) : null;

  const nextState = {
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: subscription.status,
    stripePriceId: priceId,
    stripeCurrentPeriodEnd: periodEnd,
    stripeCancelAtPeriodEnd: subscription.cancel_at_period_end,
    plan: resolvedPlan?.plan ?? tenant.plan,
    billingCycle: resolvedPlan?.billingCycle ?? tenant.billingCycle,
  };

  const changed =
    nextState.stripeSubscriptionId !== tenant.stripeSubscriptionId ||
    nextState.stripeSubscriptionStatus !== tenant.stripeSubscriptionStatus ||
    nextState.stripePriceId !== tenant.stripePriceId ||
    nextState.stripeCurrentPeriodEnd?.getTime() !== tenant.stripeCurrentPeriodEnd?.getTime() ||
    nextState.stripeCancelAtPeriodEnd !== tenant.stripeCancelAtPeriodEnd ||
    nextState.plan !== tenant.plan ||
    nextState.billingCycle !== tenant.billingCycle;

  if (!changed) {
    return;
  }

  await prisma.tenant.update({ where: { id: tenant.id }, data: nextState });

  await recordTenantAudit({
    tenantId: tenant.id,
    actorId: "stripe-webhook",
    actorName: "Stripe",
    action: "Abo-Status aktualisiert",
    source: "Abrechnung",
    entityType: "billing",
    entityId: tenant.id,
    detail: `${nextState.plan} / ${nextState.billingCycle} — ${nextState.stripeSubscriptionStatus}`,
  });
}

async function clearSubscriptionState(subscription: Stripe.Subscription) {
  const tenant = await findTenantByCustomerId(resolveCustomerId(subscription.customer));

  if (!tenant || tenant.stripeSubscriptionId !== subscription.id) {
    return;
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeSubscriptionStatus: "canceled",
      stripeCancelAtPeriodEnd: false,
    },
  });

  await recordTenantAudit({
    tenantId: tenant.id,
    actorId: "stripe-webhook",
    actorName: "Stripe",
    action: "Abo beendet",
    source: "Abrechnung",
    entityType: "billing",
    entityId: tenant.id,
    detail: "",
  });
}
