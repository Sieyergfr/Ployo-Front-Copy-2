import { auth } from "@/lib/auth";
import { selfServiceDocumentTypes, uploadMyDocument, type SelfServiceDocumentType } from "@/lib/self-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

export const runtime = "nodejs";

/** Quick Action "Datei hochladen" / Personalakte-Upload (multipart/form-data). */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-document-upload:${session.user.id}`,
    limit: 10,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const form = await request.formData().catch(() => null);
  const tenant = form?.get("tenant");
  const file = form?.get("file");
  const documentType = form?.get("documentType");
  const description = form?.get("description");

  if (typeof tenant !== "string" || !tenant.trim() || !(file instanceof File)) {
    return Response.json({ error: "'tenant' und 'file' sind erforderlich." }, { status: 400 });
  }

  if (
    typeof documentType !== "string" ||
    !selfServiceDocumentTypes.includes(documentType as SelfServiceDocumentType)
  ) {
    return Response.json(
      { error: `'documentType' muss einer von ${selfServiceDocumentTypes.join(", ")} sein.` },
      { status: 400 },
    );
  }

  try {
    const document = await uploadMyDocument({
      tenantSlug: tenant,
      file,
      documentType: documentType as SelfServiceDocumentType,
      description: typeof description === "string" ? description : undefined,
    });

    return Response.json({ document }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
