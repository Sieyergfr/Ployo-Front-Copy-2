import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { getMySharedFolders } from "@/lib/file-folder-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { headers } from "next/headers";

/**
 * Für mich freigegebene Ordner der zentralen Ablage (z. B. Handbuch,
 * Speisekarten). Neue Route — die App nutzt sie erst nach ihrem Update; das
 * Web zeigt dieselben Ordner unter "Mein Bereich".
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const tenant = new URL(request.url).searchParams.get("tenant")?.trim();

  if (!tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `me-shared-files:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    return Response.json({ folders: await getMySharedFolders(tenant) });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
