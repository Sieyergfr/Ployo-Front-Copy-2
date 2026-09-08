import { GetObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/lib/auth";
import { avatarStorageKey } from "@/lib/avatar-service";
import { getStorageBucket } from "@/lib/storage/buckets";
import { getStorageClient } from "@/lib/storage/client";
import { sharesTenantWith } from "@/lib/tenant-access";
import { headers } from "next/headers";

export const runtime = "nodejs";

/**
 * Streamt das Profilbild eines Nutzers aus S3. Profilbilder gelten als
 * nicht sensibel (im Gegensatz zu HR-Dokumenten), sind aber an einen
 * konkreten User gebunden — Sichtbarkeit setzt daher mindestens eine
 * gemeinsame Tenant-Mitgliedschaft mit dem Zieluser voraus, nicht bloß eine
 * beliebige Anmeldung (Sicherheitsaudit L03).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return new Response(null, { status: 401 });
  }

  const { userId } = await params;

  if (!(await sharesTenantWith(session.user.id, userId))) {
    return new Response(null, { status: 404 });
  }

  const bucket = getStorageBucket();

  try {
    const object = await getStorageClient().send(
      new GetObjectCommand({ Bucket: bucket.bucket, Key: avatarStorageKey(userId) }),
    );

    if (!object.Body) {
      return new Response(null, { status: 404 });
    }

    return new Response(object.Body.transformToWebStream(), {
      headers: {
        "content-type": object.ContentType ?? "image/jpeg",
        "cache-control": "private, max-age=86400",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
