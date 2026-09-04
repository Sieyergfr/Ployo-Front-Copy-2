import { auth } from "@/lib/auth";
import {
  setTenantFileEmployeeVisibility,
  softDeleteTenantFile,
} from "@/lib/storage/storage.service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Datei einer Personalakte vor dem Mitarbeiter selbst verbergen bzw. wieder
 * freigeben (`{ hiddenFromEmployee: boolean }`). Nachträglich beliebig oft
 * umschaltbar; HR/Admin sehen die Datei durchgehend.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string; fileId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, fileId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-file-visibility:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    hiddenFromEmployee?: unknown;
  } | null;

  if (typeof body?.hiddenFromEmployee !== "boolean") {
    return Response.json(
      { error: "'hiddenFromEmployee' muss true oder false sein." },
      { status: 400 },
    );
  }

  try {
    const file = await setTenantFileEmployeeVisibility({
      tenantSlug: tenant,
      fileId,
      hidden: body.hiddenFromEmployee,
    });

    return Response.json({ file });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Datei löschen (Soft-Delete — Status wird auf "deleted" gesetzt, physisches Löschen läuft später per Cron). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenant: string; fileId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, fileId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-file-delete:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const file = await softDeleteTenantFile({ tenantSlug: tenant, fileId });

    return Response.json({ file });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
