import { auth } from "@/lib/auth";
import { getNotificationPreferences } from "@/lib/settings-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Nur die mandantenweiten Benachrichtigungs-Toggles (bewusst über
 * `employees:read` statt `settings:read` gegated — jedes Tenant-Mitglied
 * soll sehen können, ob z. B. Fristen-/Abwesenheits-Alerts aktiv sind).
 * Für den vollen Einstellungen-Datensatz: `GET /api/tenants/[tenant]/settings`.
 */
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
    key: `tenant-notification-settings:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const preferences = await getNotificationPreferences(tenant);

    return Response.json({ preferences });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
