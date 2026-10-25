import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { submitMyInfoRequestItem } from "@/lib/self-service";
import { headers } from "next/headers";

export const runtime = "nodejs";

/**
 * Einzelnes Element einer mehrteiligen Info-Anfrage beantworten (M7,
 * `multipart/form-data`): `value` bei einer Angabe, `file` bei einem
 * Dokument. Neue Route — die App nutzt sie erst nach ihrem Update.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string; itemId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-info-request-item:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const form = await request.formData().catch(() => null);
  const tenant = form?.get("tenant");
  const value = form?.get("value");
  const file = form?.get("file");

  if (typeof tenant !== "string" || !tenant.trim()) {
    return Response.json({ error: "'tenant' ist erforderlich." }, { status: 400 });
  }

  try {
    const { requestId, itemId } = await params;
    const infoRequest = await submitMyInfoRequestItem({
      tenantSlug: tenant,
      requestId,
      itemId,
      value: typeof value === "string" ? value : undefined,
      file: file instanceof File ? file : undefined,
    });

    return Response.json({ infoRequest });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
