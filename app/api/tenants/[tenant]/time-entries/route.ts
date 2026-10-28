import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getTenantTimeEntries } from "@/lib/time-tracking-service";
import { headers } from "next/headers";

/**
 * Gestempelte Zeiten aller Mitarbeiter im eigenen Scope (`timeTracking:read`)
 * — dieselbe Abfrage wie die Dashboard-Seite "Zeiterfassung", für die App
 * ("Zeiten & Reports"). Query wie bei `/api/me/time-entries`: `from`/`to`
 * oder `period=week|month` + `date`; optional `employeeId` grenzt `days`
 * auf eine Person ein (`employees` enthält immer alle im Scope).
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

  const limit = await checkRateLimit({
    key: `tenant-time-entries:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const entries = await getTenantTimeEntries({
      tenantSlug: tenant,
      employeeId: query.get("employeeId") ?? undefined,
      from: query.get("from") ?? undefined,
      to: query.get("to") ?? undefined,
      period: query.get("period") ?? undefined,
      date: query.get("date") ?? undefined,
    });

    return Response.json({ entries });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
