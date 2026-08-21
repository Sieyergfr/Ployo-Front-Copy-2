import { auth } from "@/lib/auth";
import { updateTenantNotifications } from "@/lib/settings-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Mandantenweite Benachrichtigungs-Toggles. **Kein Partial-Update** — nicht
 * mitgeschickte Booleans werden von der Service-Funktion als `false`
 * interpretiert (`Boolean(undefined)`), also immer den vollständigen
 * gewünschten Zustand mitschicken.
 */
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
    key: `tenant-settings-notifications:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    mailNotifications?: boolean;
    inAppNotifications?: boolean;
    mobilePush?: boolean;
    deadlineAlerts?: boolean;
    absenceAlerts?: boolean;
    shiftAlerts?: boolean;
    digestTime?: string;
  } | null;

  if (!body) {
    return Response.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  try {
    const settings = await updateTenantNotifications({ tenantSlug: tenant, ...body });

    return Response.json({ settings });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
