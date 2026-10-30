import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { InfoRequestReminderError, remindEmployeeOfInfoRequest } from "@/lib/info-request-reminders";

export async function POST(_request: Request, { params }: { params: Promise<{ tenant: string; requestId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  const limit = await checkRateLimit({ key: `info-request-reminder-actor:${session.user.id}`, limit: 30, windowSeconds: 3600 });
  if (!limit.allowed) return Response.json({ error: "Sie haben zu viele Erinnerungen angefordert. Bitte versuchen Sie es später erneut." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const { tenant, requestId } = await params;
  try {
    return Response.json(await remindEmployeeOfInfoRequest(tenant, requestId));
  } catch (error) {
    if (error instanceof InfoRequestReminderError) return Response.json({ error: error.message }, {
      status: error.status, headers: error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : undefined,
    });
    return mapSelfServiceError(error);
  }
}
