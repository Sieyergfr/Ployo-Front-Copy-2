import { auth } from "@/lib/auth";
import { listTenantFileDeletions, type FileOwnerType } from "@/lib/storage/storage.service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * "Kürzlich gelöscht": Löschungen der letzten 24 h, die sich noch
 * rückgängig machen lassen — je Eintrag eine Datei oder ein Ordner samt
 * Inhalt (`batchId` → `POST /files/deleted/[batchId]`). Ohne `ownerType`/
 * `ownerId` die zentrale Ablage, sonst die Mitarbeiter-/Standort-/Team-Ablage.
 */
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
    key: `tenant-files:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const query = new URL(request.url).searchParams;
  const ownerType = query.get("ownerType")?.trim() || "tenant";
  const ownerId = query.get("ownerId")?.trim() || undefined;

  if (!["tenant", "employee", "location", "team"].includes(ownerType)) {
    return Response.json({ error: "Ungültiger 'ownerType'." }, { status: 400 });
  }

  try {
    const deletions = await listTenantFileDeletions({
      tenantSlug: tenant,
      ownerType: ownerType as FileOwnerType,
      ownerId,
    });

    return Response.json({ deletions });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
