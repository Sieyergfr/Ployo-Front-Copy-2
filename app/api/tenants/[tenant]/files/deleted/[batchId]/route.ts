import { auth } from "@/lib/auth";
import { restoreTenantFileDeletion } from "@/lib/storage/storage.service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Löschung (Datei bzw. Ordner samt Inhalt) innerhalb von 24 h rückgängig machen. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ tenant: string; batchId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, batchId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-file-restore:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const restored = await restoreTenantFileDeletion({ tenantSlug: tenant, batchId });

    return Response.json({ restored });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
