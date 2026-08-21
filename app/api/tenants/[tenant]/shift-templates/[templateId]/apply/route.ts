import { auth } from "@/lib/auth";
import { applyShiftTemplateToWeek } from "@/lib/shift-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Legt für jeden Eintrag der Vorlage eine neue, unbesetzte Schicht in der Zielwoche an. Body: `{ year, week }`. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string; templateId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, templateId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-shift-template-apply:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as { year?: number; week?: number } | null;

  if (!body?.year || !body.week) {
    return Response.json({ error: "'year' und 'week' sind erforderlich." }, { status: 400 });
  }

  try {
    const result = await applyShiftTemplateToWeek({
      tenantSlug: tenant,
      templateId,
      year: body.year,
      week: body.week,
    });

    return Response.json(result);
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
