import "server-only";
import { auth } from "@/lib/auth";
import { recordTenantAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireSettingsManager } from "@/lib/settings-service";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe/client";
import { getPlanPriceId, isHealthySubscriptionStatus, TRIAL_PERIOD_DAYS } from "@/lib/stripe/plans";
import {
  getBillingBlockReason,
  tenantBillingSelect,
  type BillingBlockReason,
} from "@/lib/billing-access";
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

  const access = await requireSettingsManager(input.tenantSlug, { allowBillingBlocked: true });
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

  // Idempotenzschlüssel gebunden an Mandant+Plan+Zyklus und ein grobes
  // 5-Minuten-Zeitfenster: zwei parallele/kurz aufeinanderfolgende Klicks
  // (Doppelklick, Netzwerk-Retry) bekommen dieselbe, bereits erzeugte
  // Checkout-Session zurück statt einer zweiten — anders als bei
  // `customers.create` fehlte das hier bisher (Audit-Finding M14). Ein
  // echter neuer Versuch nach Ablauf des Zeitfensters bekommt weiterhin
  // eine frische Session.
  const checkoutIdempotencyWindow = Math.floor(Date.now() / (5 * 60 * 1000));
  // Testphase nur beim allerersten Abo: Nach einer Kündigung bleibt der
  // Status auf "canceled" stehen (siehe clearSubscriptionState im Webhook),
  // ein erneuter Checkout bekommt also keine zweite Testphase.
  const trialEligible = !tenant.stripeSubscriptionId && tenant.stripeSubscriptionStatus === null;
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      ...(trialEligible ? { subscription_data: { trial_period_days: TRIAL_PERIOD_DAYS } } : {}),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: tenant.id,
      metadata: { tenantId: tenant.id },
      allow_promotion_codes: true,
    },
    {
      idempotencyKey: `stripe-checkout-${tenant.id}-${input.plan}-${input.billingCycle}-${checkoutIdempotencyWindow}`,
    },
  );

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

  const access = await requireSettingsManager(input.tenantSlug, { allowBillingBlocked: true });
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

export type BillingInvoice = {
  id: string;
  number: string | null;
  status: string | null;
  amountDue: number;
  currency: string;
  createdAt: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
};

/**
 * Rechnungshistorie aus Stripe (nur lesend, keine eigene Persistenz) — für
 * den "Abrechnung"-Tab, der bisher nur Checkout/Portal-Links anbot, ohne
 * die tatsächlichen Rechnungen selbst zu zeigen.
 */
export async function getBillingInvoices(tenantSlug: string): Promise<BillingInvoice[]> {
  if (!isStripeConfigured()) {
    return [];
  }

  const access = await requireSettingsManager(tenantSlug, { allowBillingBlocked: true });
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: access.tenantId },
    select: { stripeCustomerId: true },
  });

  if (!tenant.stripeCustomerId) {
    return [];
  }

  const stripe = getStripeClient();
  const invoices = await stripe.invoices.list({
    customer: tenant.stripeCustomerId,
    limit: 24,
  });

  return invoices.data.map((invoice) => ({
    id: invoice.id ?? "",
    number: invoice.number,
    status: invoice.status,
    amountDue: invoice.amount_due,
    currency: invoice.currency,
    createdAt: new Date(invoice.created * 1000).toISOString(),
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdf: invoice.invoice_pdf ?? null,
  }));
}

export type TenantBillingGate = {
  reason: BillingBlockReason | null;
  /** Darf Checkout/Zahlung selbst auslösen (wie requireSettingsManager). */
  canManage: boolean;
  tenantName: string;
};

/**
 * Sperrstatus für die Seite /u/[tenant]/abo-erforderlich — bewusst ohne
 * requireTenantAccess (das würde bei Sperre selbst werfen). `null`, wenn der
 * angemeldete Nutzer kein Mitglied ist.
 */
export async function getTenantBillingGate(tenantSlug: string): Promise<TenantBillingGate | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: { userId, tenant: { slug: tenantSlug } },
    select: {
      role: true,
      roleRef: {
        select: { permissions: { where: { area: "settings" }, select: { level: true } } },
      },
      tenant: { select: { name: true, ...tenantBillingSelect } },
    },
  });

  if (!membership) {
    return null;
  }

  const settingsLevel = membership.roleRef?.permissions[0]?.level ?? "none";

  return {
    reason: getBillingBlockReason(membership.tenant, isStripeConfigured()),
    canManage:
      membership.role === "OWNER" ||
      membership.role === "ADMIN" ||
      settingsLevel === "write" ||
      settingsLevel === "admin",
    tenantName: membership.tenant.name,
  };
}

/**
 * Link zur gehosteten Stripe-Seite der offenen Abo-Rechnung — dort lässt
 * sich die fehlgeschlagene Zahlung direkt mit einer anderen Karte begleichen.
 * `null`, wenn keine offene Rechnung existiert.
 */
export async function getOpenInvoicePaymentUrl(tenantSlug: string): Promise<string | null> {
  if (!isStripeConfigured()) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }

  const access = await requireSettingsManager(tenantSlug, { allowBillingBlocked: true });
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: access.tenantId },
    select: { stripeCustomerId: true },
  });

  if (!tenant.stripeCustomerId) {
    return null;
  }

  const invoices = await getStripeClient().invoices.list({
    customer: tenant.stripeCustomerId,
    status: "open",
    limit: 1,
  });

  return invoices.data[0]?.hosted_invoice_url ?? null;
}

/** Plan/Zyklus, die der Mandant zuletzt gewählt hat — für den Checkout aus der Sperrseite. */
export async function getTenantPlanSelection(tenantSlug: string) {
  const access = await requireSettingsManager(tenantSlug, { allowBillingBlocked: true });

  return prisma.tenant.findUniqueOrThrow({
    where: { id: access.tenantId },
    select: { plan: true, billingCycle: true },
  });
}
