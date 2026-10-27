import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { getTenantAuditLog } from "@/lib/audit";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { headers } from "next/headers";

/**
 * Mandantenweites Änderungsprotokoll (`audit:read`, siehe
 * `getTenantAuditLog`). Query: `area` (Bereich filtern), `q` (Suche in
 * Aktion/Person/Detail), `before` (Blättern, `nextBefore` der Antwort).
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
  const limit = await checkRateLimit({ key: `tenant-audit-log:${session.user.id}`, limit: 60, windowSeconds: 60 });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    return Response.json(
      await getTenantAuditLog({
        tenantSlug: tenant,
        area: query.get("area") ?? undefined,
        query: query.get("q") ?? undefined,
        before: query.get("before") ?? undefined,
      }),
    );
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
