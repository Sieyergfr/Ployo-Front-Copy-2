import { auth } from "@/lib/auth";
import { publishShiftWeek } from "@/lib/shift-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Veröffentlicht den Schichtplan einer Woche (Gegenstück zum "Veröffentlichen"-
 * Button im Web-Dashboard). Bis dahin gilt jede Bearbeitung als Entwurf ohne
 * Einzel-Mail pro Schicht — beim Veröffentlichen geht pro Mitarbeiter genau
 * eine Sammel-Mail raus (siehe `publishShiftWeek`).
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-team-shifts-publish:${session.user.id}`,
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
    const result = await publishShiftWeek({
      tenantSlug: body.tenant,
      year: body.year!,
      week: body.week!,
    });

    return Response.json(result);
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
