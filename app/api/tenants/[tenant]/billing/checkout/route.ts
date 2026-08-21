import { auth } from "@/lib/auth";
import { createBillingCheckoutSession } from "@/lib/billing-service";
import { normalizeBillingCycle, normalizePlan } from "@/lib/tenants";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

function defaultTenantUrl(tenant: string) {
  const baseUrl = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return `${baseUrl}/u/${tenant}`;
}

/**
 * Startet eine Stripe-Checkout-Session für den ersten Vertragsabschluss —
 * gibt die Checkout-URL als JSON zurück (statt wie im Dashboard direkt zu
 * redirecten), damit ein API-Client selbst navigiert/öffnet.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-billing-checkout:${session.user.id}`,
    limit: 10,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    plan?: string;
    billingCycle?: string;
    successUrl?: string;
    cancelUrl?: string;
  } | null;

  try {
    const url = await createBillingCheckoutSession({
      tenantSlug: tenant,
      plan: normalizePlan(body?.plan),
      billingCycle: normalizeBillingCycle(body?.billingCycle),
      successUrl: body?.successUrl || defaultTenantUrl(tenant),
      cancelUrl: body?.cancelUrl || defaultTenantUrl(tenant),
    });

    return Response.json({ url });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
