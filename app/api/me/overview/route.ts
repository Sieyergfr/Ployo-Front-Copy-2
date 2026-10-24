import { auth } from "@/lib/auth";
import { getMySelfServiceOverview } from "@/lib/self-service";
import { getMyShiftsForCurrentWeek } from "@/lib/shift-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { subscriptionRequiredResponse } from "@/lib/api/self-service-errors";

/**
 * Gebündelter Einstiegspunkt für den Dashboard-Screen der Mitarbeiter-App:
 * eigene Personalakte-Übersicht (Urlaubskonto, Anträge, Dokumente,
 * Profilfelder) + Schichten der aktuellen Woche in einem Aufruf.
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
    key: `me-overview:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const [overview, currentWeek] = await Promise.all([
      getMySelfServiceOverview(tenant),
      getMyShiftsForCurrentWeek(tenant),
    ]);

    return Response.json({ ...overview, currentWeek });
  } catch (error) {
    if (error instanceof Error && (error.message === "FORBIDDEN" || error.message === "TWO_FACTOR_REQUIRED")) {
      return Response.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof Error && error.message === "SUBSCRIPTION_REQUIRED") {
      return subscriptionRequiredResponse();
    }

    throw error;
  }
}
