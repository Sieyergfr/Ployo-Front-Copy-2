import { GetObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/lib/auth";
import { avatarStorageKey } from "@/lib/avatar-service";
import { getStorageBucket } from "@/lib/storage/buckets";
import { getStorageClient } from "@/lib/storage/client";
import { headers } from "next/headers";

export const runtime = "nodejs";

/**
 * Streamt das Profilbild eines Nutzers aus S3. Profilbilder gelten als
 * nicht sensibel (im Gegensatz zu HR-Dokumenten) — jeder angemeldete
 * Nutzer darf sie sehen, ohne mandanten-spezifische Berechtigungsprüfung.
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
