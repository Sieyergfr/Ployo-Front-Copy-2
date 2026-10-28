import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { isReportFormat, parseReportFiltersFromQuery, sendHoursReport } from "@/lib/reports-service";
import { headers } from "next/headers";

/**
 * Stunden-Report per Mail versenden (`timeTracking:write`). Body: `{ query,
 * format, overrides?, recipients: string[], newEmail?, saveNewEmail? }`.
 * Antwort `{ sent }`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;
  const limit = await checkRateLimit({ key: `tenant-hours-send:${session.user.id}`, limit: 30, windowSeconds: 3600 });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  try {
    const result = await sendHoursReport({
      tenantSlug: tenant,
      filters: parseReportFiltersFromQuery(body?.query),
      overrides: body?.overrides ?? null,
      format: isReportFormat(body?.format) ? body.format : "xlsx",
      recipients: Array.isArray(body?.recipients) ? body.recipients.map(String).slice(0, 50) : [],
      newEmail: typeof body?.newEmail === "string" ? body.newEmail : "",
      saveNewEmail: body?.saveNewEmail === true,
    });

    return Response.json(result);
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
