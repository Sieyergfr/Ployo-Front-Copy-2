import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * Regressionstest für R06 (Nachprüfung des Audit-Behebungsstands,
 * 06.09.2026): die Event-ID wurde bisher VOR dem eigentlichen Handler
 * endgültig als verarbeitet markiert. Schlug die Verarbeitung danach fehl
 * (z. B. ein kurzzeitiger DB-Fehler beim Tenant-Update), blieb der Eintrag
 * bestehen — ein Stripe-Retry traf auf den Unique-Constraint und erhielt
 * `{deduplicated:true}`, ohne die fehlgeschlagene Änderung nachzuholen.
 *
 * `stripe.webhooks.constructEvent` (Signaturprüfung) wird hier bewusst
 * gemockt — es geht ausschließlich um das Verhalten NACH erfolgreicher
 * Signaturprüfung, nicht um die Prüfung selbst.
 */

let parsedEvent: unknown = null;

vi.mock("@/lib/stripe/client", () => ({
  isStripeConfigured: () => true,
  getStripeClient: () => ({
    webhooks: {
      constructEvent: () => parsedEvent,
    },
  }),
}));

const RUN_ID = Math.random().toString(36).slice(2);
const tenantIds: string[] = [];

afterAll(async () => {
  if (tenantIds.length > 0) {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  }
  await prisma.stripeWebhookEvent.deleteMany({ where: { id: { startsWith: `evt-r06-${RUN_ID}` } } });
});

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

function buildRequest() {
  return new Request("https://ployo.invalid/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "test-signature" },
    body: "irrelevant-raw-body-since-constructEvent-is-mocked",
  });
}

describe("R06 — Stripe-Webhook verliert keine fehlgeschlagene Verarbeitung an die Dedup-Sperre", () => {
  it("ein zwischenzeitlicher Fehler lässt das Event auf 'processing' stehen; der Retry holt die Änderung nach, statt sie als erledigt zu verwerfen", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");

    const tenant = await prisma.tenant.create({
      data: {
        slug: `r06-tenant-${RUN_ID}`,
        name: `R06 Tenant ${RUN_ID}`,
        stripeCustomerId: `cus_r06_${RUN_ID}`,
      },
    });
    tenantIds.push(tenant.id);

    const eventId = `evt-r06-${RUN_ID}`;
    const eventCreated = Math.floor(Date.now() / 1000);
    parsedEvent = {
      id: eventId,
      type: "customer.subscription.updated",
      created: eventCreated,
      data: {
        object: {
          id: `sub_r06_${RUN_ID}`,
          customer: tenant.stripeCustomerId,
          status: "active",
          cancel_at_period_end: false,
          items: {
            data: [
              {
                price: { id: "price_does_not_matter" },
                current_period_end: eventCreated + 30 * 24 * 60 * 60,
              },
            ],
          },
        },
      },
    };

    // Simuliert einen kurzzeitigen DB-Fehler MITTEN in der Verarbeitung —
    // die Event-Zeile wurde da bereits (mit status=processing) angelegt.
    const updateManySpy = vi
      .spyOn(prisma.tenant, "updateMany")
      .mockRejectedValueOnce(new Error("simulierter transienter DB-Fehler"));

    try {
      await expect(POST(buildRequest())).rejects.toThrow(/simulierter transienter DB-Fehler/);
    } finally {
      updateManySpy.mockRestore();
    }

    const afterFailure = await prisma.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: eventId },
    });
    expect(afterFailure.status).toBe("processing");
    expect(afterFailure.processedAt).toBeNull();

    // Der Tenant wurde durch den fehlgeschlagenen Versuch NICHT verändert.
    const tenantAfterFailure = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    expect(tenantAfterFailure.stripeSubscriptionId).toBeNull();

    // Stripe-Retry: identisches Event, echter (nicht gemockter) DB-Zugriff.
    const retryResponse = await POST(buildRequest());
    expect(retryResponse.status).toBe(200);
    const retryBody = (await retryResponse.json()) as { status: string; deduplicated?: boolean };
    expect(retryBody.deduplicated).toBeUndefined();

    const afterRetry = await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(afterRetry.status).toBe("completed");
    expect(afterRetry.processedAt).not.toBeNull();

    const tenantAfterRetry = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    expect(tenantAfterRetry.stripeSubscriptionId).toBe(`sub_r06_${RUN_ID}`);
    expect(tenantAfterRetry.stripeSubscriptionStatus).toBe("active");

    // Ein DRITTER, jetzt tatsächlich doppelter Zustellversuch wird korrekt
    // als Duplikat erkannt, ohne die Verarbeitung erneut auszuführen.
    const duplicateResponse = await POST(buildRequest());
    const duplicateBody = (await duplicateResponse.json()) as { deduplicated?: boolean };
    expect(duplicateBody.deduplicated).toBe(true);
  });
});
