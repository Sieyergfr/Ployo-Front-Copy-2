import { auth } from "@/lib/auth";
import { completeTenantReminder } from "@/lib/reminders";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Erinnerung als erledigt markieren. Kein `404` bei unbekannter
 * `reminderId` (Service nutzt `updateMany`, das still no-opt) — Antwort
 * bleibt trotzdem `200 { status: true }`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string; reminderId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, reminderId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-reminder-complete:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    await completeTenantReminder({ tenantSlug: tenant, reminderId });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
