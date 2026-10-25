import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  createMyTimeCorrectionRequest,
  getMyTimeCorrectionRequests,
} from "@/lib/time-correction-service";
import { headers } from "next/headers";

/**
 * Eigene Korrekturanträge ("Zeit korrigieren"). Neue Route — die App nutzt
 * sie erst nach ihrem Update; das Web verwendet dieselben Funktionen.
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
    key: `me-time-corrections:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    return Response.json({ requests: await getMyTimeCorrectionRequests(tenant) });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-time-corrections-create:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    tenant?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    breakMinutes?: number | null;
    reason?: string;
  } | null;

  if (!body?.tenant || !body.date || !body.startTime || !body.endTime) {
    return Response.json(
      { error: "'tenant', 'date', 'startTime' und 'endTime' sind erforderlich." },
      { status: 400 },
    );
  }

  try {
    const correction = await createMyTimeCorrectionRequest({
      tenantSlug: body.tenant,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      breakMinutes: typeof body.breakMinutes === "number" ? body.breakMinutes : null,
      reason: body.reason,
    });

    return Response.json({ request: correction }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
