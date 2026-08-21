import { auth } from "@/lib/auth";
import { createTenantWishFreeRequest, getWishFreeRequestsForTenant } from "@/lib/wish-free-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Wunschfrei-Anfragen. `dates` (Query, kommagetrennt `YYYY-MM-DD`) filtert
 * optional. Keine own/team-Scope-Filterung — Liste ist immer mandantenweit
 * (bestehendes Verhalten der Service-Funktion, nicht API-spezifisch).
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
  const datesParam = new URL(request.url).searchParams.get("dates");
  const dates = datesParam
    ? datesParam.split(",").map((value) => value.trim()).filter(Boolean)
    : undefined;

  const limit = await checkRateLimit({
    key: `tenant-wish-free:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const requests = await getWishFreeRequestsForTenant({ tenantSlug: tenant, dates });

    return Response.json({ requests });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Wunschfrei für einen Mitarbeiter anlegen — wird sofort als genehmigt erfasst (kein Pending-Zustand auf diesem Pfad). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-wish-free-create:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    employeeId?: string;
    date?: string;
    reason?: string;
  } | null;

  if (!body?.employeeId || !body.date) {
    return Response.json({ error: "'employeeId' und 'date' sind erforderlich." }, { status: 400 });
  }

  try {
    const wishFreeRequest = await createTenantWishFreeRequest({
      tenantSlug: tenant,
      employeeId: body.employeeId,
      date: body.date,
      reason: body.reason ?? "",
    });

    return Response.json({ request: wishFreeRequest }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
