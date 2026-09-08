import { auth } from "@/lib/auth";
import { getAuditLogsForEntity } from "@/lib/audit";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Audit-Log für EINE Entität (nicht mandantenweit durchsuchbar — es gibt
 * keine solche Funktion in `lib/audit.ts`). Query: `entityType`, `entityId`
 * Pflicht, `take` optional (Default 25). Der geprüfte Fachbereich wird
 * ausschließlich serverseitig aus `entityType` abgeleitet (früher ein
 * eigener `area`-Query-Parameter — der erlaubte, einen beliebigen lesbaren
 * Bereich unabhängig vom tatsächlich abgefragten `entityType` anzugeben,
 * Audit-Finding M13). Liefert `[]` statt `403`, wenn der Bereich zwar
 * lesbar ist, aber `canViewAudit` fehlt.
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
  const entityType = query.get("entityType") ?? "";
  const entityId = query.get("entityId") ?? "";
  const takeParam = query.get("take");
  const take = takeParam ? Number(takeParam) : undefined;

  if (!entityType || !entityId) {
    return Response.json({ error: "'entityType' und 'entityId' sind erforderlich." }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `tenant-audit:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const entries = await getAuditLogsForEntity({
      tenantSlug: tenant,
      entityType,
      entityId,
      take: take && Number.isFinite(take) ? take : undefined,
    });

    return Response.json({ entries });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
