import { auth } from "@/lib/auth";
import { markAllMyNotificationsRead } from "@/lib/notifications/inbox";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Alle eigenen Benachrichtigungen auf einmal als gelesen markieren. */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { tenant?: string } | null;

  if (!body?.tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `me-notifications-read:${session.user.id}`,
    limit: 30,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    await markAllMyNotificationsRead(body.tenant);

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
