import { auth } from "@/lib/auth";
import { createMyWishFreeRequest, getMyWishFreeRequests } from "@/lib/wish-free-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Eigene Wunschfrei-Anfragen (App). Gegenstück zu
 * `/api/tenants/[tenant]/wish-free-requests`, das die mandantenweite
 * Planungssicht liefert und Schichtplan-Rechte verlangt.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const tenant = new URL(request.url).searchParams.get("tenant")?.trim();

  if (!tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `me-wish-free:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const requests = await getMyWishFreeRequests(tenant);

    return Response.json({ requests });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/**
 * Quick Action "Wunschfrei beantragen". Legt die Anfrage im Status "open" an
 * — anders als der Planungspfad, der direkt genehmigt einträgt.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-wish-free-create:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    tenant?: string;
    date?: string;
    reason?: string;
  } | null;

  if (!body?.tenant || !body.date) {
    return Response.json({ error: "'tenant' und 'date' sind erforderlich." }, { status: 400 });
  }

  try {
    const wishFreeRequest = await createMyWishFreeRequest({
      tenantSlug: body.tenant,
      date: body.date,
      reason: body.reason?.trim() ?? "",
    });

    return Response.json({ request: wishFreeRequest }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
