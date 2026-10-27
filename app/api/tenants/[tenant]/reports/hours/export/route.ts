import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { exportHoursReport, isReportFormat, parseReportFiltersFromQuery } from "@/lib/reports-service";
import { headers } from "next/headers";

/**
 * Stunden-Report als Datei (`timeTracking:read`). Body: `{ query, format:
 * "xlsx"|"pdf", overrides? }` — `query` ist der Query-String wie bei
 * `GET …/reports/hours`. Antwort `{ filename, contentType, base64 }`.
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
  const limit = await checkRateLimit({ key: `tenant-hours-export:${session.user.id}`, limit: 30, windowSeconds: 3600 });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  try {
    const file = await exportHoursReport({
      tenantSlug: tenant,
      filters: parseReportFiltersFromQuery(body?.query),
      overrides: body?.overrides ?? null,
      format: isReportFormat(body?.format) ? body.format : "xlsx",
    });

    return Response.json(file);
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
