import { auth } from "@/lib/auth";
import { deleteShiftTemplate, updateShiftTemplate } from "@/lib/shift-service";
import { parseShiftTemplateEntries, type ShiftTemplateEntry } from "@/lib/shift-templates";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Vorlage direkt bearbeiten (Name + Einträge, voller Ersatz — kein Partial-Patch der Einträge). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string; templateId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, templateId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-shift-template-update:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    entries?: unknown;
  } | null;

  if (!body?.name?.trim()) {
    return Response.json({ error: "Bitte einen Namen für die Vorlage angeben." }, { status: 400 });
  }

  const entries: ShiftTemplateEntry[] = parseShiftTemplateEntries(body.entries ?? []);

  try {
    const template = await updateShiftTemplate({
      tenantSlug: tenant,
      templateId,
      name: body.name,
      entries,
    });

    return Response.json({ template });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenant: string; templateId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, templateId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-shift-template-delete:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    await deleteShiftTemplate({ tenantSlug: tenant, templateId });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
