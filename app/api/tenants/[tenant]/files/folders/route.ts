import { auth } from "@/lib/auth";
import {
  createTenantFileFolder,
  setTenantFileFolderEmployeeVisibility,
  softDeleteTenantFileFolder,
  type FileOwnerType,
} from "@/lib/storage/storage.service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Ordner einer Personalakte vor dem Mitarbeiter selbst verbergen bzw. wieder
 * freigeben — samt Inhalt und Unterordnern. Adressiert über Mitarbeiter-ID
 * und Ordnerpfad (`path`), weil Ordner, die bisher nur über ihre Dateien
 * existieren, noch gar keine ID haben; sie werden dabei nachgetragen.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-file-folder-visibility:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    employeeId?: string;
    path?: string;
    ownerName?: string;
    hiddenFromEmployee?: unknown;
  } | null;

  if (!body?.employeeId?.trim() || !body?.path?.trim()) {
    return Response.json(
      { error: "'employeeId' und 'path' sind erforderlich." },
      { status: 400 },
    );
  }

  if (typeof body.hiddenFromEmployee !== "boolean") {
    return Response.json(
      { error: "'hiddenFromEmployee' muss true oder false sein." },
      { status: 400 },
    );
  }

  try {
    const folder = await setTenantFileFolderEmployeeVisibility({
      tenantSlug: tenant,
      employeeId: body.employeeId,
      path: body.path,
      ownerName: body.ownerName,
      hidden: body.hiddenFromEmployee,
    });

    return Response.json({ folder });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

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

/**
 * Ordner samt Unterordnern und Dateien löschen — 24 h lang über
 * `POST /files/deleted/[batchId]` rückgängig machbar. Adressiert per Query
 * (`path`, optional `ownerType` + `ownerId` für Mitarbeiter-/Standort-/
 * Team-Ablagen; ohne = zentrale Ablage), PIN eines geschützten Ordners per
 * `X-Folder-Pin`-Header.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-file-delete:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const query = new URL(request.url).searchParams;
  const path = query.get("path")?.trim() ?? "";
  const ownerType = query.get("ownerType")?.trim() || "tenant";
  const ownerId = query.get("ownerId")?.trim() || undefined;

  if (!path) {
    return Response.json({ error: "'path' ist erforderlich." }, { status: 400 });
  }

  if (!["tenant", "employee", "location", "team"].includes(ownerType)) {
    return Response.json({ error: "Ungültiger 'ownerType'." }, { status: 400 });
  }

  try {
    const deletion = await softDeleteTenantFileFolder({
      tenantSlug: tenant,
      ownerType: ownerType as FileOwnerType,
      ownerId,
      path,
      pin: request.headers.get("x-folder-pin")?.trim() || undefined,
    });

    return Response.json({ deletion });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
