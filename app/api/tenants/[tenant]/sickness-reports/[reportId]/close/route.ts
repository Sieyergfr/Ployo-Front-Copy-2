import { auth } from "@/lib/auth";
import { closeTenantSicknessReport } from "@/lib/sickness";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Krankmeldung beenden. Body optional: `{ endDate }` (Default: heute). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string; reportId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, reportId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-sickness-report-close:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as { endDate?: string } | null;

  try {
    const report = await closeTenantSicknessReport({
      tenantSlug: tenant,
      reportId,
      endDate: body?.endDate,
    });

    return Response.json({ report });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
