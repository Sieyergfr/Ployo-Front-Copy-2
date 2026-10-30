import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getMyShiftOffers } from "@/lib/shift-offer-service";
import { headers } from "next/headers";

/**
 * Eigene offene Schichtangebote (Vertretung / offene Schicht) für die App.
 * Das Web verwendet dieselben Service-Funktionen unter "Mein Bereich".
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
    key: `me-shift-offers:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    return Response.json({ offers: await getMyShiftOffers(tenant) });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
