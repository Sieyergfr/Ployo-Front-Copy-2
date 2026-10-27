import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { correctTimeEntry } from "@/lib/time-tracking-service";
import { headers } from "next/headers";

/**
 * Zeiteintrag korrigieren (`timeTracking:write`, Mitarbeiter im Scope) —
 * Gegenstück zu `correctTimeEntryAction` im Dashboard. Body:
 * `{ date, startTime, endTime | null, breakMinutes | null, note }`; `note`
 * ist Pflicht (landet im Audit-Log).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string; entryId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, entryId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-time-entry-correct:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    date?: unknown;
    startTime?: unknown;
    endTime?: unknown;
    breakMinutes?: unknown;
    note?: unknown;
  } | null;

  const breakMinutes =
    typeof body?.breakMinutes === "number" && Number.isFinite(body.breakMinutes)
      ? Math.round(body.breakMinutes)
      : null;

  try {
    await correctTimeEntry({
      tenantSlug: tenant,
      entryId,
      date: typeof body?.date === "string" ? body.date : "",
      startTime: typeof body?.startTime === "string" ? body.startTime : "",
      endTime: typeof body?.endTime === "string" && body.endTime ? body.endTime : null,
      breakMinutes,
      note: typeof body?.note === "string" ? body.note : "",
    });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
