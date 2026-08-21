import { auth } from "@/lib/auth";
import { getShiftTemplatesForTenant, saveShiftTemplateFromWeek } from "@/lib/shift-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-shift-templates:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const templates = await getShiftTemplatesForTenant(tenant);

    return Response.json({ templates: templates ?? [] });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Aktuell angezeigte Woche als Vorlage speichern. Body: `{ year, week, name }`. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-shift-templates-create:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    year?: number;
    week?: number;
    name?: string;
  } | null;

  if (!body?.year || !body.week || !body.name?.trim()) {
    return Response.json(
      { error: "'year', 'week' und 'name' sind erforderlich." },
      { status: 400 },
    );
  }

  try {
    const template = await saveShiftTemplateFromWeek({
      tenantSlug: tenant,
      year: body.year,
      week: body.week,
      name: body.name,
    });

    return Response.json({ template }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
