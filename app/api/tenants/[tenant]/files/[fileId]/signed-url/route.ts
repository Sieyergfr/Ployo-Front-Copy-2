import { auth } from "@/lib/auth";
import { assertFolderPinAccess, getTenantFileSignedUrl, resolveTenantFileFolderPath } from "@/lib/storage/storage.service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

const PIN_ATTEMPT_KEY = (userId: string, tenant: string, folderPath: string) =>
  `folder-pin-attempt:${userId}:${tenant}:${folderPath}`;

/** Signierte, 5 Minuten gültige Download-URL. Query: `version?`, `disposition?` (`inline`|`attachment`). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; fileId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, fileId } = await params;
  const query = new URL(request.url).searchParams;
  const versionParam = query.get("version");
  const version = versionParam ? Number(versionParam) : undefined;
  const dispositionParam = query.get("disposition");
  const disposition = dispositionParam === "attachment" ? "attachment" : "inline";

  const limit = await checkRateLimit({
    key: `tenant-file-signed-url:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    // Gleicher PIN-Gate wie in files/route.ts (siehe assertFolderPinAccess) --
    // ohne diese Pruefung liefert getTenantFileSignedUrl eine gueltige
    // Download-URL fuer eine Datei in einem gesperrten Ordner, ohne je die
    // PIN zu verlangen.
    const folderPath = await resolveTenantFileFolderPath({ tenantSlug: tenant, fileId });

    if (folderPath) {
      const pin = request.headers.get("x-folder-pin")?.trim() || undefined;

      if (pin) {
        const pinLimit = await checkRateLimit({
          key: PIN_ATTEMPT_KEY(session.user.id, tenant, folderPath),
          limit: 8,
          windowSeconds: 900,
        });

        if (!pinLimit.allowed) {
          return tooManyRequests(pinLimit);
        }
      }

      await assertFolderPinAccess({ tenantSlug: tenant, folderPath, pin });
    }

    const url = await getTenantFileSignedUrl({
      tenantSlug: tenant,
      fileId,
      version: version && Number.isFinite(version) ? version : undefined,
      disposition,
    });

    return Response.json({ url });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
