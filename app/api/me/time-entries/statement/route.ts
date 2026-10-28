import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createMyTimeStatement } from "@/lib/time-statement";
import { headers } from "next/headers";

/**
 * Zeitnachweis (PDF) der eigenen Zeiten eines Monats. Query: `tenant`,
 * `month=YYYY-MM`. Antwort `{ filename, contentType, base64 }` — wie der
 * Report-Export, damit die App die Datei ohne Cookie-Download speichern kann.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const tenant = params.get("tenant")?.trim();
  const month = params.get("month")?.trim();

  if (!tenant || !month) {
    return Response.json({ error: "Parameter 'tenant' oder 'month' fehlt." }, { status: 400 });
  }

  const limit = await checkRateLimit({ key: `me-time-statement:${session.user.id}`, limit: 20, windowSeconds: 3600 });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    return Response.json(await createMyTimeStatement({ tenantSlug: tenant, month }));
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
