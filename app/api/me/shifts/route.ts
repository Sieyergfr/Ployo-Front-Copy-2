import { auth } from "@/lib/auth";
import { getMyShiftsForCurrentWeek } from "@/lib/shift-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { headers } from "next/headers";

/** Eigene Schichten (Schichtplan-Screen, "Meine Schichten"). Ohne year/week: laufende Woche. */
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

  const yearParam = params.get("year");
  const weekParam = params.get("week");
  const year = yearParam ? Number(yearParam) : undefined;
  const week = weekParam ? Number(weekParam) : undefined;

  if ((year !== undefined && !Number.isInteger(year)) || (week !== undefined && !Number.isInteger(week))) {
    return Response.json({ error: "'year'/'week' müssen ganze Zahlen sein." }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `me-shifts:${session.user.id}`,
    limit: 120,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const plan = await getMyShiftsForCurrentWeek(
      tenant,
      year && week ? { year, week } : undefined,
    );

    return Response.json({ plan });
  } catch (error) {
    if (error instanceof Error && (error.message === "FORBIDDEN" || error.message === "TWO_FACTOR_REQUIRED")) {
      return Response.json({ error: error.message }, { status: 403 });
    }

    throw error;
  }
}
