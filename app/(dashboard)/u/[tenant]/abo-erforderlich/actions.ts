"use server";

import type { ActionState } from "@/lib/action-state";
import { withActionErrorHandling } from "@/lib/action-state";
import {
  createBillingCheckoutSession,
  createBillingPortalSession,
  getOpenInvoicePaymentUrl,
  getTenantPlanSelection,
} from "@/lib/billing-service";
import { redirect } from "next/navigation";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function absoluteGateUrl(tenant: string, query = "") {
  const baseUrl = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return `${baseUrl}/u/${encodeURIComponent(tenant)}/abo-erforderlich${query}`;
}

/** Checkout für den zuletzt gewählten Plan (Einrichtung abschließen bzw. neues Abo). */
export async function startGateCheckoutAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");

    if (!tenant) {
      throw new Error("Checkout konnte nicht gestartet werden.");
    }

    const selection = await getTenantPlanSelection(tenant);
    const checkoutUrl = await createBillingCheckoutSession({
      tenantSlug: tenant,
      plan: selection.plan,
      billingCycle: selection.billingCycle,
      successUrl: absoluteGateUrl(tenant, "?checkout=success"),
      cancelUrl: absoluteGateUrl(tenant),
    });

    redirect(checkoutUrl);
  }, "Checkout starten");
}

/** Offene Rechnung direkt bezahlen, sonst Zahlungsverwaltung (Karte ändern). */
export async function payOpenInvoiceAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withActionErrorHandling(async () => {
    const tenant = formString(formData, "tenant");

    if (!tenant) {
      throw new Error("Checkout konnte nicht gestartet werden.");
    }

    const url =
      (await getOpenInvoicePaymentUrl(tenant)) ??
      (await createBillingPortalSession({ tenantSlug: tenant, returnUrl: absoluteGateUrl(tenant) }));

    redirect(url);
  }, "Zahlung öffnen");
}
