import { auth } from "@/lib/auth";
import { uploadTenantFileVersion } from "@/lib/storage/storage.service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Neue Version einer bestehenden Datei hochladen. `multipart/form-data`, Feld `file` Pflicht. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string; fileId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, fileId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-file-versions:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!formData || !(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Bitte eine Datei auswählen." }, { status: 400 });
  }

  try {
    const version = await uploadTenantFileVersion({ tenantSlug: tenant, fileId, file });

    return Response.json({ file: version }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
