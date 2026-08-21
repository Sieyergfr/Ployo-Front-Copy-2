import { auth } from "@/lib/auth";
import { createMySicknessReport } from "@/lib/sickness";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Quick Action "Krankheit melden". `attachmentFileId` ist optional und
 * muss zuvor über `POST /api/me/documents` (documentType "Krankmeldung")
 * hochgeladen worden sein.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-sickness-report:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    tenant?: string;
    startDate?: string;
    endDate?: string;
    note?: string;
    attachmentFileId?: string;
  } | null;

  if (!body?.tenant || !body.startDate) {
    return Response.json({ error: "'tenant' und 'startDate' sind erforderlich." }, { status: 400 });
  }

  try {
    const report = await createMySicknessReport({
      tenantSlug: body.tenant,
      startDate: body.startDate,
      endDate: body.endDate,
      note: body.note,
      attachmentFileId: body.attachmentFileId,
    });

    return Response.json({ report }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
