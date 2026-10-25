import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { searchTenant } from "@/lib/global-search";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { headers } from "next/headers";

/**
 * Globale Suche (⌘K im Dashboard): `?q=` (mind. 2 Zeichen) → Treffer aus
 * Mitarbeitern, Standorten, Teams und Dateien, je Bereich nach den Rechten
 * des Aufrufers gefiltert.
 */
export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `tenant-search:${session.user.id}`,
    limit: 120,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const { tenant } = await params;
    const query = new URL(request.url).searchParams.get("q") ?? "";

    return Response.json({ results: await searchTenant(tenant, query) });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
