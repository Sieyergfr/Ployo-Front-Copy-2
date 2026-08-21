import { auth } from "@/lib/auth";
import { createTenantFileFolder, type FileOwnerType } from "@/lib/storage/storage.service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Neuen Ordner anlegen (bzw. reaktivieren, falls Pfad schon existierte aber inaktiv war). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-file-folders-create:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    ownerType?: FileOwnerType;
    ownerId?: string;
    parentPath?: string;
    ownerName?: string;
    locked?: boolean;
    pin?: string;
  } | null;

  if (!body?.name?.trim()) {
    return Response.json({ error: "Ordnername ist erforderlich." }, { status: 400 });
  }

  try {
    const folder = await createTenantFileFolder({
      tenantSlug: tenant,
      name: body.name,
      ownerType: body.ownerType,
      ownerId: body.ownerId,
      parentPath: body.parentPath,
      ownerName: body.ownerName,
      locked: body.locked,
      // War hier bislang nicht ausgelesen -- ein gesperrter Ordner ueber
      // die JSON-API anzulegen scheiterte deshalb immer an
      // createTenantFileFolder()s eigener PIN-Pflichtpruefung.
      pin: body.pin,
    });

    return Response.json({ folder }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
