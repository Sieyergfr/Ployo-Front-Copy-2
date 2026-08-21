import { auth } from "@/lib/auth";
import { getTenantSettings } from "@/lib/settings-service";
import { isHealthySubscriptionStatus, planEmployeeLimits } from "@/lib/stripe/plans";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Plan/Abo-Status — reine Lesesicht auf die Tenant-Felder aus `GET /settings`, hier fokussiert. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-billing:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const data = await getTenantSettings(tenant);

    if (!data) {
      return Response.json({ error: "Mandant nicht gefunden." }, { status: 404 });
    }

    const { tenant: tenantRecord } = data;

    return Response.json({
      plan: tenantRecord.plan,
      billingCycle: tenantRecord.billingCycle,
      employeeLimit: planEmployeeLimits[tenantRecord.plan],
      hasStripeCustomer: Boolean(tenantRecord.stripeCustomerId),
      hasSubscription: Boolean(tenantRecord.stripeSubscriptionId),
      subscriptionStatus: tenantRecord.stripeSubscriptionStatus,
      subscriptionHealthy: isHealthySubscriptionStatus(tenantRecord.stripeSubscriptionStatus),
      currentPeriodEnd: tenantRecord.stripeCurrentPeriodEnd,
      cancelAtPeriodEnd: tenantRecord.stripeCancelAtPeriodEnd,
    });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
