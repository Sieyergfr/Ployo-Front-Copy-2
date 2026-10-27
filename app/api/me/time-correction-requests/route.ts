import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  createMyTimeCorrectionRequest,
  getMyTimeCorrectionRequests,
} from "@/lib/time-correction-service";
import { headers } from "next/headers";

/** Eigene Korrektur-Anfragen zu gestempelten Zeiten. Query: `tenant`. */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const tenant = new URL(request.url).searchParams.get("tenant")?.trim();

  if (!tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  const limit = await checkRateLimit({ key: `me-time-corrections:${session.user.id}`, limit: 60, windowSeconds: 60 });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    return Response.json({ requests: await getMyTimeCorrectionRequests(tenant) });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/**
 * Korrektur anfragen. Body: `{ tenant, timeEntryId?, date, startTime, endTime,
 * breakMinutes?, reason }` — ohne `timeEntryId` wird ein fehlender Eintrag
 * zum Nachtragen angefragt.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({ key: `me-time-correction-create:${session.user.id}`, limit: 20, windowSeconds: 3600 });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const tenant = typeof body?.tenant === "string" ? body.tenant.trim() : "";

  if (!tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  try {
    const created = await createMyTimeCorrectionRequest({
      tenantSlug: tenant,
      timeEntryId: typeof body?.timeEntryId === "string" ? body.timeEntryId : null,
      date: typeof body?.date === "string" ? body.date : "",
      startTime: typeof body?.startTime === "string" ? body.startTime : "",
      endTime: typeof body?.endTime === "string" ? body.endTime : "",
      breakMinutes: body?.breakMinutes,
      reason: typeof body?.reason === "string" ? body.reason : "",
    });

    return Response.json({ request: created }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
