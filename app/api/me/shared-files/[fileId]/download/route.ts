import { auth } from "@/lib/auth";
import { getMySharedFileDownloadUrl } from "@/lib/file-folder-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

export const runtime = "nodejs";

/** Signierte Download-URL für eine Datei aus einem für mich freigegebenen Ordner. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const tenant = new URL(request.url).searchParams.get("tenant")?.trim();

  if (!tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `me-shared-file-download:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const { fileId } = await params;

  try {
    const url = await getMySharedFileDownloadUrl({ tenantSlug: tenant, fileId });

    return Response.json({ url });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
