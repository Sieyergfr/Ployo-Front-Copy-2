import { auth } from "@/lib/auth";
import { updateTenantSecurity } from "@/lib/settings-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Sicherheitseinstellungen (2FA-Pflicht, Audit-Aufbewahrung). Partial-Update — nicht gesendete Felder bleiben unverändert. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-settings-security:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    twoFactorRequired?: boolean;
    sessionTimeout?: boolean;
    auditRetentionMonths?: string;
  } | null;

  if (!body) {
    return Response.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  try {
    const settings = await updateTenantSecurity({ tenantSlug: tenant, ...body });

    return Response.json({ settings });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
