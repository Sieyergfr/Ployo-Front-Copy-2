import { auth } from "@/lib/auth";
import { markMyNotificationRead } from "@/lib/notifications/inbox";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Einzelne Benachrichtigung als gelesen markieren (Tap in der Liste). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const tenant = new URL(request.url).searchParams.get("tenant")?.trim();

  if (!tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `me-notifications-read:${session.user.id}`,
    limit: 120,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const { id } = await params;

  try {
    await markMyNotificationRead(tenant, id);

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
