import { recordTenantAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe/client";
import { resolvePlanFromPriceId } from "@/lib/stripe/plans";
import { logger, runWithRequestId } from "@/lib/logger";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { isStaleEvent } from "@/lib/stripe/webhook-idempotency";
import { checkRateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
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

  const limit = await checkRateLimit({
    key: `webhook-stripe:${await getClientIp(request.headers)}`,
    limit: 10,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
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

  // Stripe kann dasselbe Event mehrfach zustellen (Retry ohne rechtzeitige
  // 2xx-Antwort) — ohne diese Sperre würde ein zweiter Zustellversuch dieselbe
  // Zustandsänderung erneut anwenden (Audit-Finding M14).
  //
  // Zwei Phasen statt eines einzelnen Inserts (Audit-Finding R06): die Zeile
  // beansprucht die Event-ID VOR der Verarbeitung (status=processing) und
  // wird erst NACH erfolgreichem Durchlauf des switch unten auf
  // status=completed gesetzt. Schlug die Verarbeitung zuvor mit demselben
  // Event bereits einmal fehl (Zeile existiert noch mit status=processing),
  // wird sie hier erneut versucht statt fälschlich als erledigt zu gelten —
  // vorher wurde die Zeile schon VOR dem eigentlichen Handler endgültig
  // angelegt, sodass ein Zwischenfehler (z. B. kurzzeitige DB-Störung beim
  // Tenant-Update) den nächsten Stripe-Retry auf den Unique-Constraint
  // treffen und die eigentlich fehlgeschlagene Änderung endgültig verlieren
  // ließ.
  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { id: event.id },
    select: { status: true },
  });

  if (existing?.status === "completed") {
    logger.info("Stripe-Webhook: Event bereits vollständig verarbeitet, übersprungen.", {
      eventType: event.type,
      eventId: event.id,
    });

    return Response.json({ status: "ok", deduplicated: true }, { headers: { "x-request-id": requestId } });
  }

  if (!existing) {
    try {
      await prisma.stripeWebhookEvent.create({ data: { id: event.id, status: "processing" } });
    } catch (error) {
      if (!isUniqueConstraintError(error, "id")) {
        throw error;
      }

      // Race: ein gleichzeitiger zweiter Zustellversuch hat die Zeile
      // zwischen unserem Lesen und Schreiben angelegt. Erneut lesen statt
      // blind weiterzumachen — ist der andere Versuch inzwischen fertig
      // (completed), ist das hier tatsächlich ein Duplikat.
      const raced = await prisma.stripeWebhookEvent.findUnique({
        where: { id: event.id },
        select: { status: true },
      });

      if (raced?.status === "completed") {
        return Response.json({ status: "ok", deduplicated: true }, { headers: { "x-request-id": requestId } });
      }
    }
  }

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
      await syncSubscriptionState(event.data.object, event.created);
      break;
    }

    case "customer.subscription.deleted": {
      await clearSubscriptionState(event.data.object, event.created);
      break;
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      await syncInvoicePaymentState(event.data.object);
      break;
    }

    default:
      break;
  }

  // Erst JETZT, nach vollständig durchlaufenem Handler, als erledigt
  // markieren — ein Fehler oben (throw) erreicht diese Zeile nie, die
  // Event-Zeile bleibt dann auf "processing" für den nächsten Retry stehen.
  await prisma.stripeWebhookEvent.update({
    where: { id: event.id },
    data: { status: "completed", processedAt: new Date() },
  });

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
      stripeLastEventCreatedAt: true,
    },
  });

  if (!tenant) {
    logger.error("Stripe-Webhook: kein Mandant für Stripe-Customer gefunden.", { customerId });
  }

  return tenant;
}

async function syncSubscriptionState(subscription: Stripe.Subscription, eventCreated: number) {
  const tenant = await findTenantByCustomerId(resolveCustomerId(subscription.customer));

  if (!tenant) {
    return;
  }

  if (isStaleEvent(tenant, eventCreated)) {
    logger.warn("Stripe-Webhook: veraltetes Subscription-Event ignoriert.", {
      tenantId: tenant.id,
      eventCreated,
      lastAppliedAt: tenant.stripeLastEventCreatedAt?.toISOString(),
    });
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

  const eventCreatedAt = new Date(eventCreated * 1000);

  // Der obige `isStaleEvent`-Check ist ein reiner Vorab-Check auf einem
  // bereits gelesenen Snapshot — zwei Events desselben Tenants können ihn
  // beide bestehen und dann in falscher Reihenfolge schreiben (Audit-Finding
  // R06). Die eigentliche Schreibbedingung deshalb zusätzlich atomar in der
  // WHERE-Klausel erzwingen: nur anwenden, wenn seit dem Lesen oben kein
  // bereits neueres Event angewendet wurde. `updateMany` statt `update`, weil
  // die Bedingung über die reine ID hinausgeht.
  const result = await prisma.tenant.updateMany({
    where: {
      id: tenant.id,
      OR: [{ stripeLastEventCreatedAt: null }, { stripeLastEventCreatedAt: { lte: eventCreatedAt } }],
    },
    // Den Zeitstempel-Wasserstand auch bei inhaltlich unverändertem Zustand
    // fortschreiben — sonst könnte ein nachfolgendes, tatsächlich verspätetes
    // älteres Event später fälschlich als "nicht veraltet" durchgehen, weil
    // der Wasserstand mangels Änderung nie mit fortgeschrieben wurde.
    data: changed ? { ...nextState, stripeLastEventCreatedAt: eventCreatedAt } : { stripeLastEventCreatedAt: eventCreatedAt },
  });

  if (result.count === 0) {
    logger.warn("Stripe-Webhook: durch gleichzeitig bereits angewendetes neueres Event überholt.", {
      tenantId: tenant.id,
      eventCreated,
    });
    return;
  }

  if (!changed) {
    return;
  }

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

async function clearSubscriptionState(subscription: Stripe.Subscription, eventCreated: number) {
  const tenant = await findTenantByCustomerId(resolveCustomerId(subscription.customer));

  if (!tenant || tenant.stripeSubscriptionId !== subscription.id) {
    return;
  }

  if (isStaleEvent(tenant, eventCreated)) {
    logger.warn("Stripe-Webhook: veraltetes Subscription-Deleted-Event ignoriert.", {
      tenantId: tenant.id,
      eventCreated,
      lastAppliedAt: tenant.stripeLastEventCreatedAt?.toISOString(),
    });
    return;
  }

  // Wie in syncSubscriptionState: dieselbe Bedingung, unter der oben gelesen
  // wurde, zusätzlich atomar in der WHERE-Klausel erzwingen (Audit-Finding
  // R06) — ein zwischenzeitlich gleichzeitig verarbeitetes neueres Event
  // (oder ein zwischenzeitlicher Subscription-Wechsel) darf hier nicht
  // überschrieben werden.
  const result = await prisma.tenant.updateMany({
    where: {
      id: tenant.id,
      stripeSubscriptionId: subscription.id,
      OR: [{ stripeLastEventCreatedAt: null }, { stripeLastEventCreatedAt: { lte: new Date(eventCreated * 1000) } }],
    },
    data: {
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeSubscriptionStatus: "canceled",
      stripeCancelAtPeriodEnd: false,
      stripeLastEventCreatedAt: new Date(eventCreated * 1000),
    },
  });

  if (result.count === 0) {
    logger.warn("Stripe-Webhook: Subscription-Deleted durch gleichzeitige Änderung überholt.", {
      tenantId: tenant.id,
      eventCreated,
    });
    return;
  }

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

/**
 * Zahlungsstand für die Abo-Sperre (lib/billing-access.ts): bezahlt →
 * Fehlversuche zurücksetzen und ggf. "hat schon gezahlt" merken;
 * fehlgeschlagen → `attempt_count` übernehmen. Die Rechnung wird frisch bei
 * Stripe nachgeladen, damit ein verspätet zugestelltes "payment_failed" eine
 * inzwischen bezahlte Rechnung nicht wieder als offen zählt.
 */
async function syncInvoicePaymentState(eventInvoice: Stripe.Invoice) {
  if (!eventInvoice.id || !eventInvoice.billing_reason?.startsWith("subscription")) {
    return;
  }

  const invoice = await getStripeClient().invoices.retrieve(eventInvoice.id);
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

  if (!customerId) {
    return;
  }

  const tenant = await findTenantByCustomerId(customerId);

  if (!tenant) {
    return;
  }

  if (invoice.status === "paid") {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        stripeFailedPaymentAttempts: 0,
        ...(invoice.amount_paid > 0 ? { stripeHasPaid: true } : {}),
      },
    });
    return;
  }

  if (invoice.status !== "open") {
    return;
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { stripeFailedPaymentAttempts: invoice.attempt_count },
  });

  await recordTenantAudit({
    tenantId: tenant.id,
    actorId: "stripe-webhook",
    actorName: "Stripe",
    action: "Zahlung fehlgeschlagen",
    source: "Abrechnung",
    entityType: "billing",
    entityId: tenant.id,
    detail: `Versuch ${invoice.attempt_count}`,
  });
}
