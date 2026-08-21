import { auth } from "@/lib/auth";
import { getMyNotifications } from "@/lib/notifications/inbox";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Benachrichtigungen-Screen der Mitarbeiter-App — persistierter,
 * eigener In-App-Posteingang (TenantEmployeeNotification), NICHT
 * derselbe wie der live berechnete, admin-seitige
 * `GET /api/me/notifications`-Feed (keine Überschneidung: dort keine
 * Persistenz/kein Read-Status, hier schon).
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const tenant = params.get("tenant")?.trim();

  if (!tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `me-notifications-feed:${session.user.id}`,
    limit: 120,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const notifications = await getMyNotifications(tenant, {
      unreadOnly: params.get("unreadOnly") === "true",
    });

    return Response.json({ notifications });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
