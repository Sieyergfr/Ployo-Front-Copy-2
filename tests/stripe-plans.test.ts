import { describe, expect, it } from "vitest";
import {
  checkEmployeeLimit,
  isHealthySubscriptionStatus,
  planEmployeeLimits,
  resolvePlanFromPriceId,
} from "@/lib/stripe/plans";

describe("resolvePlanFromPriceId", () => {
  const prices = {
    starter: { monthly: "price_starter_m", yearly: "price_starter_y" },
    professional: { monthly: "price_pro_m", yearly: undefined },
    business: { monthly: undefined, yearly: "price_biz_y" },
  };

  it("findet Plan und Abrechnungsintervall zu einer bekannten Price-ID", () => {
    expect(resolvePlanFromPriceId("price_pro_m", prices)).toEqual({
      plan: "professional",
      billingCycle: "monthly",
    });
    expect(resolvePlanFromPriceId("price_biz_y", prices)).toEqual({
      plan: "business",
      billingCycle: "yearly",
    });
  });

  it("liefert null bei unbekannter Price-ID", () => {
    expect(resolvePlanFromPriceId("price_unknown", prices)).toBeNull();
  });

  it("liefert null ohne Price-ID", () => {
    expect(resolvePlanFromPriceId(null, prices)).toBeNull();
    expect(resolvePlanFromPriceId(undefined, prices)).toBeNull();
  });

  it("ignoriert nicht konfigurierte (undefined) Preise", () => {
    expect(resolvePlanFromPriceId(undefined as unknown as string, prices)).toBeNull();
  });
});

describe("isHealthySubscriptionStatus", () => {
  it("erkennt active/trialing als gesund", () => {
    expect(isHealthySubscriptionStatus("active")).toBe(true);
    expect(isHealthySubscriptionStatus("trialing")).toBe(true);
  });

  it("erkennt past_due/unpaid/canceled/null als ungesund", () => {
    expect(isHealthySubscriptionStatus("past_due")).toBe(false);
    expect(isHealthySubscriptionStatus("unpaid")).toBe(false);
    expect(isHealthySubscriptionStatus("canceled")).toBe(false);
    expect(isHealthySubscriptionStatus(null)).toBe(false);
    expect(isHealthySubscriptionStatus(undefined)).toBe(false);
  });
});

describe("checkEmployeeLimit", () => {
  it("erlaubt Anlegen unterhalb des Plan-Limits ohne Stripe", () => {
    expect(
      checkEmployeeLimit({
        plan: "starter",
        activeEmployeeCount: 4,
        stripeConfigured: false,
        stripeSubscriptionStatus: null,
      }),
    ).toBeNull();
  });

  it("blockiert Anlegen am/über dem Plan-Limit", () => {
    const error = checkEmployeeLimit({
      plan: "starter",
      activeEmployeeCount: planEmployeeLimits.starter,
      stripeConfigured: false,
      stripeSubscriptionStatus: null,
    });

    expect(error).toContain(String(planEmployeeLimits.starter));
  });

  it("erlaubt Anlegen unterhalb des Limits bei aktivem Abo", () => {
    expect(
      checkEmployeeLimit({
        plan: "professional",
        activeEmployeeCount: 10,
        stripeConfigured: true,
        stripeSubscriptionStatus: "active",
      }),
    ).toBeNull();
  });

  it("blockiert Anlegen bei konfiguriertem Stripe ohne gesundes Abo, unabhängig vom Limit", () => {
    const error = checkEmployeeLimit({
      plan: "business",
      activeEmployeeCount: 0,
      stripeConfigured: true,
      stripeSubscriptionStatus: "past_due",
    });

    expect(error).not.toBeNull();
    expect(error).toContain("Abonnement");
  });

  it("blockiert NICHT, wenn Stripe konfiguriert ist, der Mandant aber noch nie ein Abo hatte (null-Status)", () => {
    expect(
      checkEmployeeLimit({
        plan: "starter",
        activeEmployeeCount: 0,
        stripeConfigured: true,
        stripeSubscriptionStatus: null,
      }),
    ).toBeNull();
  });

  it("ignoriert Abo-Status, wenn Stripe nicht konfiguriert ist", () => {
    expect(
      checkEmployeeLimit({
        plan: "business",
        activeEmployeeCount: 0,
        stripeConfigured: false,
        stripeSubscriptionStatus: "canceled",
      }),
    ).toBeNull();
  });
});
