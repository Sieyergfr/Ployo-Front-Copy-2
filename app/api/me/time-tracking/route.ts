import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { isClockAction, TIME_TRACKING_ERRORS } from "@/lib/time-tracking";
import { getMyClockStatus, performMyClockAction } from "@/lib/time-tracking-service";
import { headers } from "next/headers";

/**
 * Stempeluhr (App). GET: aktueller Status inkl. ob die Uhr überhaupt
 * angezeigt werden soll (`showClock`). POST: `{ tenant, action }` mit
 * action = clockIn | clockOut | breakStart | breakEnd — den Zeitpunkt setzt
 * der Server, die Antwort ist der neue Status. Optional `qrCode`: der
 * gescannte Text des Standort-QR-Codes — Pflicht für clockIn/clockOut, wenn
 * der Betrieb "QR-Scan erforderlich" aktiviert hat (`status.settings.qrRequired`).
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
    key: `me-time-tracking:${session.user.id}`,
    limit: 120,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    return Response.json({ status: await getMyClockStatus(tenant) });
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
    key: `me-time-tracking-action:${session.user.id}`,
    limit: 30,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    tenant?: unknown;
    action?: unknown;
    qrCode?: unknown;
  } | null;

  if (typeof body?.tenant !== "string" || !body.tenant.trim()) {
    return Response.json({ error: "'tenant' ist erforderlich." }, { status: 400 });
  }

  if (!isClockAction(body.action)) {
    return Response.json({ error: TIME_TRACKING_ERRORS.invalidAction }, { status: 400 });
  }

  if (body.qrCode !== undefined && body.qrCode !== null && typeof body.qrCode !== "string") {
    return Response.json({ error: TIME_TRACKING_ERRORS.qrInvalid }, { status: 400 });
  }

  try {
    const status = await performMyClockAction({
      tenantSlug: body.tenant.trim(),
      action: body.action,
      source: "app",
      qrCode: body.qrCode ?? null,
    });

    return Response.json({ status });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
