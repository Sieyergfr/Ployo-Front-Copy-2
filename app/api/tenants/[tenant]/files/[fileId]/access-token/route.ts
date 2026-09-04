import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createFileAccessToken } from "@/lib/storage/file-access-token";
import { getTenantFileContentForUser } from "@/lib/storage/file-stream";
import { headers } from "next/headers";

export const runtime = "nodejs";

/** Vorschau: lange genug zum Lesen, kurz genug, dass ein geteilter Link nichts nützt. */
const PREVIEW_TOKEN_TTL_SECONDS = 600;

/** Download: ein einziger Abruf, gleich nach dem Antippen. */
const DOWNLOAD_TOKEN_TTL_SECONDS = 120;

/**
 * Gibt eine kurzlebige, an Datei + Konto gebundene URL auf
 * `.../files/[fileId]/content` zurück.
 *
 * Für die Mobile-App: deren PDF-Vorschau öffnet die URL im System-Browser,
 * der den Session-Cookie der App nicht kennt. Statt einer vorsignierten
 * S3-URL (für jeden aufrufbar, der sie hat) gibt es hier ein Token, das nur
 * für diese eine Datei und dieses eine Konto gilt und nach wenigen Minuten
 * verfällt — die Rechteprüfung passiert beim Abruf trotzdem vollständig.
 *
 * Die Berechtigung wird bereits hier geprüft, damit ein "kein Zugriff" als
 * sauberer 403 in der App ankommt und nicht erst als kaputte Vorschau.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; fileId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, fileId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-file-access-token:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const query = new URL(request.url).searchParams;
  const disposition = query.get("disposition") === "attachment" ? "attachment" : "inline";
  const pin = request.headers.get("x-folder-pin")?.trim() || undefined;

  try {
    const content = await getTenantFileContentForUser({
      tenantSlug: tenant,
      fileId,
      userId: session.user.id,
      pin,
    });

    // Der Stream wurde nur zur Rechteprüfung geöffnet und wird hier nicht
    // gelesen — ohne Abbruch bliebe die Verbindung zum Speicher offen.
    await content.body.cancel().catch(() => {});

    // Die Vorschau bleibt offen, solange der Nutzer liest — und der
    // System-Browser stellt die Anfrage bei Reload/Drehen erneut. Mit zwei
    // Minuten lief das Token mitten im Lesen ab und die Seite zeigte plötzlich
    // "Link ist abgelaufen". Der Download braucht dagegen nur den einen Abruf.
    const ttlSeconds = disposition === "inline" ? PREVIEW_TOKEN_TTL_SECONDS : DOWNLOAD_TOKEN_TTL_SECONDS;
    const token = createFileAccessToken({
      fileId,
      userId: session.user.id,
      tenantSlug: tenant,
      ttlSeconds,
    });
    const url = `/api/tenants/${encodeURIComponent(tenant)}/files/${encodeURIComponent(fileId)}/content?disposition=${disposition}&token=${encodeURIComponent(token)}`;

    return Response.json({
      url,
      fileName: content.fileName,
      contentType: content.contentType,
      expiresInSeconds: ttlSeconds,
    });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
