import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getMyTimeEntries } from "@/lib/time-tracking-service";
import { headers } from "next/headers";

/**
 * Eigene gestempelte Zeiten ("Meine Zeiten"), tageweise mit Soll (veröffentlichte
 * Schichten) und Ist. Entweder `from`/`to` als YYYY-MM-DD (Ortszeit des
 * Betriebs, max. 93 Tage) oder `period=week|month` + `date` (Antwort enthält
 * dann `previous`/`next` zum Blättern); ohne alles: laufende Woche.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const tenant = params.get("tenant")?.trim();

  if (!tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `me-time-entries:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const entries = await getMyTimeEntries({
      tenantSlug: tenant,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      period: params.get("period") ?? undefined,
      date: params.get("date") ?? undefined,
    });

    return Response.json({ entries });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
