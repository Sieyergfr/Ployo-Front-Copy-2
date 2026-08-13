import "server-only";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadObject } from "@/lib/storage/upload";
import { headers } from "next/headers";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

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

export async function uploadOwnAvatar(file: File) {
  const session = await requireSession();

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Bitte ein JPEG-, PNG- oder WebP-Bild hochladen.");
  }

  if (file.size === 0 || file.size > MAX_AVATAR_BYTES) {
    throw new Error("Das Bild darf höchstens 2 MB groß sein.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  await uploadObject({
    key: avatarStorageKey(session.user.id),
    body: buffer,
    contentType: file.type,
  });

  // Versions-Query zum Cache-Busting, da der S3-Key pro Nutzer fest bleibt.
  const image = `/api/avatar/${session.user.id}?v=${Date.now()}`;

  await prisma.user.update({
    where: { id: session.user.id },
    data: { image },
  });

  return image;
}
