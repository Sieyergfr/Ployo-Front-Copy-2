import { auth } from "@/lib/auth";
import { softDeleteTenantFile } from "@/lib/storage/storage.service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

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
