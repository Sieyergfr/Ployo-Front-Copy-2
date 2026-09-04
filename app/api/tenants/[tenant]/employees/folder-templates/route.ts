import { auth } from "@/lib/auth";
import {
  createEmployeeFolderTemplate,
  getEmployeeFolderTemplates,
} from "@/lib/employee-folder-templates";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Ordnervorlagen dieses Mandanten (App-Pendant zu `components/FolderTemplateButton.tsx` im Web). */
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
    key: `tenant-employee-folder-templates:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const templates = await getEmployeeFolderTemplates(tenant);

    return Response.json({ templates });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/**
 * Neue Ordnervorlage anlegen — wird sofort für alle bestehenden Mitarbeiter
 * angelegt (siehe `createEmployeeFolderTemplate`), neue Mitarbeiter bekommen
 * sie automatisch beim Anlegen mit.
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

  const limit = await checkRateLimit({
    key: `tenant-employee-folder-templates-create:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as { name?: string } | null;

  if (!body?.name?.trim()) {
    return Response.json({ error: "Ordnername ist erforderlich." }, { status: 400 });
  }

  try {
    const template = await createEmployeeFolderTemplate({ tenantSlug: tenant, name: body.name });

    return Response.json({ template }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
