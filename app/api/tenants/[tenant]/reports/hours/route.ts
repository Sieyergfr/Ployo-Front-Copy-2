import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getHoursReport } from "@/lib/reports-service";
import { headers } from "next/headers";

/**
 * Stunden-Report wie auf der Dashboard-Seite "Reports" (`timeTracking:read`).
 * Query wie die Seite: `mode`, `employee` (mehrfach), `team`, `location`,
 * `period`, `date`, `from`, `to`, `night`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;
  const query = new URL(request.url).searchParams;
  const record: Record<string, string | string[]> = {};

  for (const key of new Set(query.keys())) {
    const values = query.getAll(key);
    record[key] = values.length > 1 ? values : values[0];
  }

  const limit = await checkRateLimit({ key: `tenant-hours-report:${session.user.id}`, limit: 60, windowSeconds: 60 });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    return Response.json({ report: await getHoursReport(tenant, record) });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
