import { auth } from "@/lib/auth";
import { submitInfoRequestResponse } from "@/lib/self-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

export const runtime = "nodejs";

/**
 * Eigene Info-Anfrage beantworten (`multipart/form-data`, da optional eine
 * Datei angehängt wird — Pflicht, sobald die Anfrage `fileRequested` gesetzt
 * hat, sonst reicht eine reine Textantwort).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { requestId } = await params;

  const limit = await checkRateLimit({
    key: `me-info-request-respond:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const form = await request.formData().catch(() => null);
  const tenant = form?.get("tenant");
  const message = form?.get("message");
  const file = form?.get("file");

  if (typeof tenant !== "string" || !tenant.trim()) {
    return Response.json({ error: "'tenant' ist erforderlich." }, { status: 400 });
  }

  try {
    const infoRequest = await submitInfoRequestResponse({
      tenantSlug: tenant,
      requestId,
      message: typeof message === "string" ? message : undefined,
      file: file instanceof File ? file : undefined,
    });

    return Response.json({ infoRequest });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
