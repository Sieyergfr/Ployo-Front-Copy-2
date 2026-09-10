import "server-only";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadObject } from "@/lib/storage/upload";
import { headers } from "next/headers";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
// Avatare werden an vielen Stellen gleichzeitig angezeigt (Navigation,
// Mitarbeiterlisten, Quick-View) — eine feste Kantenlänge + WebP hält jeden
// Upload klein und einheitlich, unabhängig von der Originalgröße/-format.
const AVATAR_EDGE_PX = 256;

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    throw new Error("Nicht angemeldet.");
  }

  return session;
}

/** Fester S3-Key je Nutzer — ein Re-Upload überschreibt das alte Bild statt neue Objekte anzuhäufen. */
export function avatarStorageKey(userId: string) {
  return `avatars/${userId}`;
}

/**
 * Feste Kantenlänge + WebP, unabhängig vom hochgeladenen Format/Größe —
 * Avatare werden an vielen Stellen gleichzeitig angezeigt (Navigation,
 * Mitarbeiterlisten, Quick-View). Wirft bei einer Datei, die trotz
 * passendem MIME-Type keine echten Bilddaten enthält.
 */
export async function compressAvatarImage(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .rotate() // EXIF-Orientierung anwenden, bevor sie beim Umkodieren verloren geht.
      .resize(AVATAR_EDGE_PX, AVATAR_EDGE_PX, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new Error("Die Datei ist kein gültiges Bild.");
  }
}

export async function uploadOwnAvatar(file: File) {
  const session = await requireSession();

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Bitte ein JPEG-, PNG- oder WebP-Bild hochladen.");
  }

  if (file.size === 0 || file.size > MAX_AVATAR_BYTES) {
    throw new Error("Das Bild darf höchstens 2 MB groß sein.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Validiert nebenbei die echten Bilddaten statt nur den (vom Client frei
  // wählbaren) `file.type`-Header — ein umbenanntes Nicht-Bild scheitert hier.
  const compressed = await compressAvatarImage(buffer);

  await uploadObject({
    key: avatarStorageKey(session.user.id),
    body: compressed,
    contentType: "image/webp",
  });

  // Versions-Query zum Cache-Busting, da der S3-Key pro Nutzer fest bleibt.
  const image = `/api/avatar/${session.user.id}?v=${Date.now()}`;

  await prisma.user.update({
    where: { id: session.user.id },
    data: { image },
  });

  return image;
}
