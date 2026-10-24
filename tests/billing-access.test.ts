import { describe, expect, it } from "vitest";
import { getBillingBlockReason, type TenantBillingFields } from "@/lib/billing-access";

function tenant(overrides: Partial<TenantBillingFields> = {}): TenantBillingFields {
  return {
    billingRequired: false,
    stripeSubscriptionStatus: null,
    stripeHasPaid: false,
    stripeFailedPaymentAttempts: 0,
    ...overrides,
  };
}

describe("getBillingBlockReason", () => {
  it("sperrt nie, solange Stripe nicht konfiguriert ist", () => {
    expect(getBillingBlockReason(tenant({ billingRequired: true }), false)).toBeNull();
    expect(getBillingBlockReason(tenant({ stripeSubscriptionStatus: "unpaid" }), false)).toBeNull();
  });

  it("sperrt neue Mandanten ohne abgeschlossenen Checkout", () => {
    expect(getBillingBlockReason(tenant({ billingRequired: true }), true)).toBe("setup_required");
  });

  it("lässt ältere Mandanten ohne Abo unverändert offen", () => {
    expect(getBillingBlockReason(tenant(), true)).toBeNull();
  });

  it("lässt aktive Abos und Testphasen offen", () => {
    expect(getBillingBlockReason(tenant({ billingRequired: true, stripeSubscriptionStatus: "trialing" }), true)).toBeNull();
    expect(getBillingBlockReason(tenant({ stripeSubscriptionStatus: "active" }), true)).toBeNull();
  });

  it("sperrt sofort, wenn die erste Zahlung nach der Testphase fehlschlägt", () => {
    expect(
      getBillingBlockReason(
        tenant({ stripeSubscriptionStatus: "past_due", stripeFailedPaymentAttempts: 1 }),
        true,
      ),
    ).toBe("payment_failed");
  });

  it("gibt zahlenden Kunden Kulanz bis zur letzten Wiederholung (Tag 9)", () => {
    const paying = { stripeSubscriptionStatus: "past_due", stripeHasPaid: true };

    expect(getBillingBlockReason(tenant({ ...paying, stripeFailedPaymentAttempts: 1 }), true)).toBeNull();
    expect(getBillingBlockReason(tenant({ ...paying, stripeFailedPaymentAttempts: 2 }), true)).toBeNull();
    expect(getBillingBlockReason(tenant({ ...paying, stripeFailedPaymentAttempts: 3 }), true)).toBeNull();
    expect(getBillingBlockReason(tenant({ ...paying, stripeFailedPaymentAttempts: 4 }), true)).toBe(
      "payment_failed",
    );
  });

  it("sperrt bei unbezahltem oder beendetem Abo", () => {
    expect(getBillingBlockReason(tenant({ stripeSubscriptionStatus: "unpaid", stripeHasPaid: true }), true)).toBe(
      "payment_failed",
    );
    expect(getBillingBlockReason(tenant({ stripeSubscriptionStatus: "canceled" }), true)).toBe(
      "subscription_inactive",
    );
    expect(getBillingBlockReason(tenant({ stripeSubscriptionStatus: "incomplete_expired" }), true)).toBe(
      "subscription_inactive",
    );
  });
});
