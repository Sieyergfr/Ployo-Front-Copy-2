import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { readFileAccessToken } from "@/lib/storage/file-access-token";
import {
  contentDispositionHeader,
  getTenantFileContentForUser,
  isBrowserExecutableContentType,
} from "@/lib/storage/file-stream";
import { headers } from "next/headers";

export const runtime = "nodejs";

/**
 * Liefert den Datei-Inhalt über den eigenen Server aus, statt auf eine
 * vorsignierte Speicher-URL weiterzuleiten.
 *
 * Für sensible Dokumente (Gehaltsabrechnungen) ist das der Unterschied
 * zwischen "Link ist einige Minuten lang für jeden aufrufbar" und "Aufruf
 * erfordert eine gültige Anmeldung". Erlaubt sind zwei Nachweise:
 * der Session-Cookie (Web) oder ein kurzlebiges, an Datei + Nutzer gebundenes
 * Token (Mobile-App, deren System-Browser den Cookie nicht mitschickt).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; fileId: string }> },
) {
  const { tenant, fileId } = await params;
  const query = new URL(request.url).searchParams;
  const token = query.get("token")?.trim();

  let userId: string | null = null;

  if (token) {
    userId = readFileAccessToken({ token, fileId, tenantSlug: tenant })?.userId ?? null;

    if (!userId) {
      return Response.json({ error: "Link ist abgelaufen." }, { status: 401 });
    }
  } else {
    const session = await auth.api.getSession({ headers: await headers() });

    userId = session?.user?.id ?? null;

    if (!userId) {
      return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
    }
  }

  const limit = await checkRateLimit({
    key: `tenant-file-content:${userId}`,
    limit: 120,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const versionParam = query.get("version");
  const version = versionParam ? Number(versionParam) : undefined;
  const disposition = query.get("disposition") === "attachment" ? "attachment" : "inline";

  try {
    const content = await getTenantFileContentForUser({
      tenantSlug: tenant,
      fileId,
      userId,
      version: version && Number.isFinite(version) ? version : undefined,
      pin: request.headers.get("x-folder-pin")?.trim() || query.get("pin")?.trim() || undefined,
    });

    // Zweite, vom Upload-Pfad unabhängige Schutzschicht (Audit-Finding
    // H08/R04): ein HTML-/SVG-artiger Content-Type wird NIE inline
    // ausgeliefert, egal was der Client per `disposition`-Query anfragt oder
    // was historisch als `mimeType` gespeichert wurde — sonst würde er im
    // Origin dieser App ausgeführt statt heruntergeladen.
    const safeDisposition = isBrowserExecutableContentType(content.contentType)
      ? "attachment"
      : disposition;

    return new Response(content.body, {
      headers: {
        "Content-Type": content.contentType,
        ...(content.contentLength != null
          ? { "Content-Length": String(content.contentLength) }
          : {}),
        "Content-Disposition": contentDispositionHeader(content.fileName, safeDisposition),
        // Sensible Inhalte gehören weder in einen Proxy- noch in den
        // Browser-Cache: der Link ist bewusst kurzlebig.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
