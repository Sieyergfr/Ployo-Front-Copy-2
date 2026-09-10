import { auth } from "@/lib/auth";
import { MAX_AVATAR_BYTES, uploadOwnAvatar } from "@/lib/avatar-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Avatar hochladen. `multipart/form-data`, Feld `avatar` Pflicht — max. 2 MB,
 * nur JPEG/PNG/WebP (andere Grenzen als die 15-MB-HR-Dateien). Antwort
 * enthält die neue `/api/avatar/[userId]`-URL (bereits vorhandene
 * GET-Route zum Ausliefern des Bildes).
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-avatar:${session.user.id}`,
    limit: 10,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("avatar");

  if (!formData || !(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Bitte ein Bild auswählen." }, { status: 400 });
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return Response.json({ error: "Das Bild darf höchstens 2 MB groß sein." }, { status: 400 });
  }

  try {
    const image = await uploadOwnAvatar(file);

    return Response.json({ image });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
