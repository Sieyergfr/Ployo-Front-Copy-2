import { auth } from "@/lib/auth";
import { unpublishShiftWeek } from "@/lib/shift-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Setzt eine veröffentlichte Woche zurück auf Entwurf (Gegenstück zum
 * "Zurück auf Entwurf"-Button im Web-Dashboard). Verschickt keine Mail —
 * das ist eine interne Planungsaktion, kein für Mitarbeiter sichtbares
 * Ereignis (siehe `unpublishShiftWeek`).
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-team-shifts-unpublish:${session.user.id}`,
    limit: 30,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    tenant?: string;
    year?: number;
    week?: number;
  } | null;

  if (!body?.tenant || !Number.isInteger(body.year) || !Number.isInteger(body.week)) {
    return Response.json(
      { error: "'tenant', 'year' und 'week' sind erforderlich." },
      { status: 400 },
    );
  }

  try {
    const result = await unpublishShiftWeek({
      tenantSlug: body.tenant,
      year: body.year!,
      week: body.week!,
    });

    return Response.json(result);
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
