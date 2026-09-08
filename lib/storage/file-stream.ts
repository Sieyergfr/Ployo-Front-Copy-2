import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { recordTenantAudit } from "@/lib/audit";
import { requireFileAcl, requireTenantFileAreaAccess } from "@/lib/file-access";
import { getStorageClient } from "@/lib/storage/client";
import { assertFolderPinAccess, resolveTenantFileFolderPath } from "@/lib/storage/storage.service";
import { resolveTenantAccessForUser, type TenantAccess } from "@/lib/tenant-access";

/**
 * Datei-Inhalt über den eigenen Server ausliefern, statt eine vorsignierte
 * Speicher-URL herauszugeben.
 *
 * Für alles Sensible (Gehaltsabrechnungen, Personalakte-Dokumente) ist das
 * der einzige Weg, bei dem der Link nicht ohne Anmeldung funktioniert: eine
 * vorsignierte S3-URL ist, solange sie gültig ist, für jeden aufrufbar, der
 * sie hat — und verrät zusätzlich Bucket und Objektschlüssel.
 */
export type TenantFileContent = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  fileName: string;
  sizeBytes: number;
};

async function loadAuthorizedFile(input: {
  access: TenantAccess;
  fileId: string;
  version?: number;
  /** PIN für einen geschützten Ordner — nur nötig, wenn kein Freischalt-Cookie vorliegt. */
  pin?: string;
}) {
  const baseFile = await prisma.tenantFile.findFirst({
    where: {
      tenantId: input.access.tenantId,
      status: { not: "deleted" },
      id: input.fileId,
    },
  });

  if (!baseFile) {
    throw new Error("Datei nicht gefunden.");
  }

  const rootId = baseFile.parentId ?? baseFile.id;
  // Fällt auf die Datei selbst zurück, falls das Wurzeldokument bereits
  // bereinigt wurde — ein vorzeitig gepurgtes Elternteil darf eine sonst
  // aktive Version nicht unlesbar machen (Audit-Finding H07).
  const aclFile =
    (baseFile.parentId
      ? await prisma.tenantFile.findFirst({
          where: {
            id: rootId,
            tenantId: input.access.tenantId,
            status: { not: "deleted" },
          },
          select: { accessRoleIdsJson: true, accessUserIdsJson: true },
        })
      : baseFile) ?? baseFile;

  requireFileAcl(aclFile, input.access);
  await requireTenantFileAreaAccess(input.access, baseFile);

  const folderContext = await resolveTenantFileFolderPath({
    tenantSlug: input.access.tenantSlug,
    fileId: rootId,
  });

  await assertFolderPinAccess({
    tenantSlug: input.access.tenantSlug,
    folderPath: folderContext.folderPath,
    pin: input.pin,
    scope: folderContext.scope,
  });

  const file = input.version
    ? await prisma.tenantFile.findFirst({
        where: {
          tenantId: input.access.tenantId,
          status: { not: "deleted" },
          version: input.version,
          OR: [{ id: rootId }, { parentId: rootId }],
        },
      })
    : baseFile;

  if (!file) {
    throw new Error("Datei nicht gefunden.");
  }

  return file;
}

/**
 * `userId` statt Session: die Route akzeptiert neben dem Session-Cookie auch
 * ein kurzlebiges Zugriffstoken (lib/storage/file-access-token.ts), das nur
 * sagt, FÜR WEN es ausgestellt wurde — die Rechteprüfung läuft danach ganz
 * normal über die Mitgliedschaft dieses Nutzers.
 */
export async function getTenantFileContentForUser(input: {
  tenantSlug: string;
  fileId: string;
  userId: string;
  version?: number;
  pin?: string;
}): Promise<TenantFileContent> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, name: true, email: true, twoFactorEnabled: true },
  });

  if (!user) {
    throw new Error("FORBIDDEN");
  }

  const access = await resolveTenantAccessForUser(user, input.tenantSlug, "files", "read");
  const file = await loadAuthorizedFile({
    access,
    fileId: input.fileId,
    version: input.version,
    pin: input.pin,
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Datei abgerufen",
    source: "Dateien",
    entityType: "file",
    entityId: file.id,
    detail: file.displayName,
  });

  const object = await getStorageClient().send(
    new GetObjectCommand({ Bucket: file.bucket, Key: file.storageKey }),
  );

  if (!object.Body) {
    throw new Error("Datei nicht gefunden.");
  }

  return {
    body: object.Body.transformToWebStream(),
    contentType: resolveContentType(file.displayName || file.originalName, file.mimeType),
    fileName: file.displayName || file.originalName,
    sizeBytes: file.sizeBytes,
  };
}

/**
 * MIME-Typ, notfalls aus der Dateiendung.
 *
 * Nicht jeder Upload bringt einen brauchbaren `mimeType` mit (manche Clients
 * schicken gar keinen, manche pauschal `application/octet-stream`). Zusammen
 * mit `X-Content-Type-Options: nosniff` heißt das für den Browser: nicht
 * anzeigen, sondern herunterladen — die PDF-Vorschau der App bekam so nie ein
 * PDF zu sehen. Die Endung ist hier die verlässlichere Quelle.
 */
const CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  gif: "image/gif",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
};

/**
 * Content-Types, die ein Browser selbst ausführen/rendern kann, wenn er sie
 * "inline" (statt als Download) bekommt — HTML/SVG-Skript vor allem
 * (Audit-Finding H08/R04). Neue Uploads können das nicht mehr erreichen
 * (`fileToBuffer`/`validateUploadFileContent` in storage.service.ts lehnen
 * solche Bytes unabhängig vom Dateinamen ab), aber ein bereits vor diesem Fix
 * gespeicherter Datensatz mit vergiftetem `mimeType` darf trotzdem niemals
 * inline im Origin dieser App landen — als zweite, unabhängige Schutzschicht.
 */
const BROWSER_EXECUTABLE_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/xml",
  "text/xml",
];

export function isBrowserExecutableContentType(contentType: string) {
  const normalized = contentType.split(";")[0]!.trim().toLowerCase();
  return BROWSER_EXECUTABLE_CONTENT_TYPES.includes(normalized);
}

export function resolveContentType(fileName: string, storedMimeType?: string | null) {
  const stored = storedMimeType?.trim().toLowerCase() ?? "";
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const byExtension = CONTENT_TYPES_BY_EXTENSION[extension];

  if (stored && stored !== "application/octet-stream" && stored !== "binary/octet-stream") {
    return storedMimeType!.trim();
  }

  return byExtension ?? "application/octet-stream";
}

/** `Content-Disposition`-Header mit korrekt kodiertem Dateinamen. */
export function contentDispositionHeader(
  fileName: string,
  disposition: "inline" | "attachment",
) {
  const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");

  return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
