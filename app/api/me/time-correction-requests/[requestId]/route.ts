import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { withdrawMyAppTimeCorrectionRequest } from "@/lib/time-correction-app";
import { headers } from "next/headers";

/** Eigene, noch offene Korrektur-Anfrage zurückziehen. Query: `tenant`. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { requestId } = await params;
  const tenant = new URL(request.url).searchParams.get("tenant")?.trim();

  if (!tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  const limit = await checkRateLimit({ key: `me-time-correction-delete:${session.user.id}`, limit: 30, windowSeconds: 3600 });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    await withdrawMyAppTimeCorrectionRequest(tenant, requestId);
    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
