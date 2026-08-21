import { auth } from "@/lib/auth";
import { updateTenantSicknessReport } from "@/lib/sickness";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Datum/Attest-Status/Notiz korrigieren — ändert NICHT den offen/geschlossen-Status (dafür: /close). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string; reportId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, reportId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-sickness-report-update:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    startDate?: string;
    endDate?: string;
    certificateStatus?: string;
    note?: string;
  } | null;

  if (!body?.startDate) {
    return Response.json({ error: "'startDate' ist erforderlich." }, { status: 400 });
  }

  try {
    const report = await updateTenantSicknessReport({
      tenantSlug: tenant,
      reportId,
      startDate: body.startDate,
      endDate: body.endDate,
      certificateStatus: body.certificateStatus,
      note: body.note,
    });

    return Response.json({ report });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
