import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getTenantAppTimeCorrectionRequests } from "@/lib/time-correction-app";
import { headers } from "next/headers";

/**
 * Korrektur-Anfragen im eigenen Ausschnitt (`timeTracking:read`). Optional
 * `status=open|approved|rejected`. Antwort enthält `canDecide`.
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
  const limit = await checkRateLimit({ key: `tenant-time-corrections:${session.user.id}`, limit: 60, windowSeconds: 60 });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const status = new URL(request.url).searchParams.get("status") ?? undefined;
    return Response.json(await getTenantAppTimeCorrectionRequests({ tenantSlug: tenant, status }));
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
