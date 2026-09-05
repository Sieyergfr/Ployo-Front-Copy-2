import { auth } from "@/lib/auth";
import { createBillingPortalSession } from "@/lib/billing-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

function appBaseUrl() {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function defaultTenantUrl(tenant: string) {
  return `${appBaseUrl()}/u/${tenant}`;
}

// `returnUrl` steuert, wohin Stripe nach dem Billing-Portal zurückleitet —
// ohne Origin-Prüfung ließe sich darüber eine beliebige externe Adresse
// einschleusen. Nur ein Ziel auf der eigenen Origin wird akzeptiert, sonst
// greift der Tenant-Default.
function sameOriginReturnUrl(candidate: string | undefined, tenant: string) {
  if (!candidate) {
    return defaultTenantUrl(tenant);
  }

  try {
    const resolved = new URL(candidate, appBaseUrl());

    return resolved.origin === new URL(appBaseUrl()).origin
      ? resolved.toString()
      : defaultTenantUrl(tenant);
  } catch {
    return defaultTenantUrl(tenant);
  }
}

/** Stripe-Billing-Portal-Session — gibt die Portal-URL als JSON zurück. Body optional: `{ returnUrl, intent: "switch-plan" }`. */
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
    key: `tenant-billing-portal:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    returnUrl?: string;
    intent?: "switch-plan";
  } | null;

  try {
    const url = await createBillingPortalSession({
      tenantSlug: tenant,
      returnUrl: sameOriginReturnUrl(body?.returnUrl, tenant),
      intent: body?.intent === "switch-plan" ? "switch-plan" : undefined,
    });

    return Response.json({ url });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
