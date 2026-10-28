import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { decideAppTimeCorrectionRequest } from "@/lib/time-correction-app";
import { headers } from "next/headers";

/**
 * Korrektur-Anfrage freigeben — übernimmt die beantragten Zeiten.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string; requestId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, requestId } = await params;
  const limit = await checkRateLimit({ key: `tenant-time-correction-decide:${session.user.id}`, limit: 120, windowSeconds: 3600 });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const result = await decideAppTimeCorrectionRequest({
      tenantSlug: tenant,
      requestId,
      decision: "approve",
    });

    return Response.json({ request: result });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
