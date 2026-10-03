import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { recordTenantAudit } from "@/lib/audit";
import { fileFolders } from "@/lib/files";
import { hashFolderPin, isFolderUnlocked, markFolderUnlocked, verifyFolderPin } from "@/lib/folder-pin";
import { getStorageBucket, type StorageBucketId } from "@/lib/storage/buckets";
import { buildStorageKey, getFileExtension } from "@/lib/storage/key-builder";
import { markObjectDeleted } from "@/lib/storage/delete";
import { createReadSignedUrl } from "@/lib/storage/signed-url";
import { uploadObject } from "@/lib/storage/upload";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import {
  assertEmployeeInScope,
  assertLocationInScope,
  assertTeamInScope,
  requireTenantAccess,
  type TenantPermissionArea,
} from "@/lib/tenant-access";
import { requireFileAcl, requireTenantFileAreaAccess } from "@/lib/file-access";
import { assertFileDeletionAllowed } from "@/lib/retention-service";

export type FileOwnerType = "tenant" | "employee" | "location" | "team";

export type UploadTenantFileInput = {
  tenantSlug: string;
  file: File;
  bucketId?: StorageBucketId;
  ownerType?: FileOwnerType;
  /** Ersetzt die aus `ownerType` abgeleitete Berechtigungsprüfung — siehe `requireTenantFileAccess`. */
  permissionArea?: TenantPermissionArea;
  ownerId?: string;
  folderSlug?: string;
  folderName?: string;
  ownerName?: string;
  documentType?: string;
  validFrom?: string;
  expiresAt?: string;
  reminderAt?: string;
  description?: string;
  tags?: string[];
  assignedEmployeeId?: string;
  assignedLocationId?: string;
  accessRoleIds?: string[];
  accessUserIds?: string[];
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeFolderPath(value: string) {
  return value
    .split("/")
    .map((part) => slugify(part))
    .filter(Boolean)
    .join("/");
}

export function folderScope(ownerType: FileOwnerType, ownerId?: string) {
  return ownerType === "tenant" ? "tenant" : `${ownerType}:${ownerId ?? "unknown"}`;
}

function fileFolderScope(file: {
  employeeId?: string | null;
  locationId?: string | null;
  teamId?: string | null;
}) {
  return file.employeeId
    ? folderScope("employee", file.employeeId)
    : file.locationId
      ? folderScope("location", file.locationId)
      : file.teamId
        ? folderScope("team", file.teamId)
        : "tenant";
}

/**
 * Dieselbe Ordner-PIN-Sperre wie beim Lesen (`assertFolderPinAccess`,
 * `GET /files`, `GET /files/[fileId]/signed-url`) — bislang ließen sich
 * Version-Upload, Löschung und Sichtbarkeitswechsel ohne PIN durchführen,
 * auch wenn der Ordner für den Aufrufer gesperrt war (Audit-Finding H06).
 */
async function assertFileFolderPinAccess(
  tenantSlug: string,
  file: {
    folderSlug?: string | null;
    employeeId?: string | null;
    locationId?: string | null;
    teamId?: string | null;
  },
  pin?: string | null,
) {
  await assertFolderPinAccess({
    tenantSlug,
    folderPath: file.folderSlug ?? "",
    pin: pin ?? null,
    scope: fileFolderScope(file),
  });
}

function formatFileName(value: string) {
  return value.trim().replace(/[\\/]+/g, "-").slice(0, 240) || "Datei";
}

function cleanStringList(values: string[] = []) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

async function findNamesById(input: {
  tenantId: string;
  employeeId?: string;
  locationId?: string;
  roleIds?: string[];
  userIds?: string[];
}) {
  const roleIds = cleanStringList(input.roleIds);
  const userIds = cleanStringList(input.userIds);
  const [employee, location, roles, users] = await Promise.all([
    input.employeeId
      ? prisma.tenantEmployee.findFirst({
          where: { id: input.employeeId, tenantId: input.tenantId },
          select: { id: true, name: true },
        })
      : null,
    input.locationId
      ? prisma.tenantLocation.findFirst({
          where: { id: input.locationId, tenantId: input.tenantId },
          select: { id: true, name: true },
        })
      : null,
    roleIds.length
      ? prisma.tenantRole.findMany({
          where: { id: { in: roleIds }, tenantId: input.tenantId },
          select: { id: true, name: true },
        })
      : [],
    userIds.length
      ? prisma.tenantMembership.findMany({
          where: { tenantId: input.tenantId, userId: { in: userIds } },
          include: { user: { select: { id: true, name: true, email: true } } },
        })
      : [],
  ]);

  return {
    employee,
    location,
    roles,
    users: users.map((membership) => membership.user),
  };
}

/**
 * Für Uploads/Ordner, die an einen Fachbereich hängen (Personalakte-/
 * Standort-Dokumente), zusätzlich zum bestehenden "files:write" die
 * Hochlade-Fähigkeit des jeweiligen Bereichs prüfen — sonst würde ein Konto
 * ohne diese Fähigkeit weiterhin über die Server Action hochladen können,
 * auch wenn der Button in der UI ausgeblendet ist. Generische Uploads ins
 * eigenständige Dateien-Modul (ownerType "tenant") bleiben unverändert nur
 * an "files:write" gebunden.
 *
 * `permissionArea` überschreibt den aus `ownerType` abgeleiteten Standard —
 * für Verträge/Lohnabrechnungen (siehe contract-service.ts/payroll-service.ts),
 * die bereits vor dem Upload ihre eigene, speziellere Berechtigung
 * ("contracts"/"payroll") geprüft haben und keine zusätzliche, generische
 * "employeeFiles"-Prüfung mehr brauchen (die beiden Bereiche sind bewusst
 * unabhängig voneinander konfigurierbar).
 */
async function requireTenantFileAccess(
  tenantSlug: string,
  ownerType: FileOwnerType = "tenant",
  permissionArea?: TenantPermissionArea,
) {
  await requireTenantAccess(tenantSlug, "files", "write");

  if (permissionArea) {
    // Bereits eigenständig geprüfte Bereiche (Verträge/Lohnabrechnungen) —
    // deren `level` selbst ist die Hochlade-Fähigkeit, kein separates Flag.
    await requireTenantAccess(tenantSlug, permissionArea, "write");
  } else if (ownerType === "employee" || ownerType === "location" || ownerType === "team") {
    if (ownerType === "employee") {
      // "employeeFiles" hat kein eigenes fileRelevant-Flag-Set (wie das
      // eigenständige "files"-Modul) — `requireTenantAccess` mit
      // required "write" prüft die Hochlade-Fähigkeit hier bereits selbst
      // (wirft FORBIDDEN, wenn das Level nicht reicht).
      await requireTenantAccess(tenantSlug, "employeeFiles", "write");
    } else {
      const area = ownerType === "location" ? "locations" : "teams";
      const areaAccess = await requireTenantAccess(tenantSlug, area, "read");

      if (!areaAccess.canUploadFiles) {
        throw new Error("FORBIDDEN");
      }
    }
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId: session.user.id,
      tenant: { slug: tenantSlug },
    },
    include: {
      tenant: { select: { id: true, slug: true } },
      roleRef: { include: { permissions: true } },
    },
  });

  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  const role = membership.role;
  const filesPermission = membership.roleRef?.permissions.find(
    (permission) => permission.area === "files",
  );
  const canWrite =
    ["OWNER", "ADMIN", "HR"].includes(role) ||
    filesPermission?.level === "write" ||
    filesPermission?.level === "admin";

  if (!canWrite) {
    throw new Error("FORBIDDEN");
  }

  return {
    tenantId: membership.tenant.id,
    tenantSlug: membership.tenant.slug,
    userId: session.user.id,
    userName: session.user.name ?? "HR",
  };
}

async function validateOwner(input: {
  tenantId: string;
  ownerType: FileOwnerType;
  ownerId?: string;
}) {
  if (input.ownerType === "employee" && input.ownerId) {
    const employee = await prisma.tenantEmployee.findFirst({
      where: { id: input.ownerId, tenantId: input.tenantId },
      select: { id: true, name: true },
    });

    if (!employee) {
      throw new Error("Mitarbeiter nicht gefunden.");
    }

    return { ownerId: employee.id, ownerName: employee.name };
  }

  if (input.ownerType === "location" && input.ownerId) {
    const location = await prisma.tenantLocation.findFirst({
      where: { id: input.ownerId, tenantId: input.tenantId },
      select: { id: true, name: true },
    });

    if (!location) {
      throw new Error("Standort nicht gefunden.");
    }

    return { ownerId: location.id, ownerName: location.name };
  }

  if (input.ownerType === "team" && input.ownerId) {
    const team = await prisma.tenantTeam.findFirst({
      where: { id: input.ownerId, tenantId: input.tenantId },
      select: { id: true, name: true },
    });

    if (!team) {
      throw new Error("Team nicht gefunden.");
    }

    return { ownerId: team.id, ownerName: team.name };
  }

  return { ownerId: undefined, ownerName: "HR" };
}

/**
 * `validateOwner` prüfte bisher nur, ob Mitarbeiter/Standort/Team im Tenant
 * existiert — nicht, ob er im Scope des Aufrufers liegt. Ein team-gescopter
 * Uploader konnte damit Dateien für beliebige Mitarbeiter/Standorte/Teams
 * des Mandanten hochladen (Audit-Finding H06).
 */
async function assertOwnerInScope(
  tenantSlug: string,
  ownerType: FileOwnerType,
  ownerId: string | undefined,
  permissionArea?: TenantPermissionArea,
) {
  if (!ownerId) return;

  if (ownerType === "employee") {
    const areaAccess = await requireTenantAccess(tenantSlug, permissionArea ?? "employeeFiles", "write");
    await assertEmployeeInScope(areaAccess, ownerId);
  } else if (ownerType === "location") {
    const areaAccess = await requireTenantAccess(tenantSlug, "locations", "read");
    await assertLocationInScope(areaAccess, ownerId);
  } else if (ownerType === "team") {
    const areaAccess = await requireTenantAccess(tenantSlug, "teams", "read");
    await assertTeamInScope(areaAccess, ownerId);
  }
}

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const allowedUploadExtensions = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "heic",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "zip",
]);

export function validateUploadFile(file: File) {
  if (!file || file.size <= 0) {
    throw new Error("Bitte eine Datei auswählen.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Die Datei ist zu groß (maximal 15 MB).");
  }

  const extension = getFileExtension(file.name);

  if (!extension || !allowedUploadExtensions.has(extension)) {
    throw new Error(
      "Dieser Dateityp wird nicht unterstützt (erlaubt: PDF, Bilder, Office-Dokumente, TXT, CSV, ZIP).",
    );
  }
}

/**
 * Serverseitig ermittelter, sicherer MIME-Typ je erlaubter Erweiterung —
 * wird jetzt IMMER statt des vom Client mitgeschickten `file.type`
 * gespeichert/an S3 übergeben. Ein Client konnte bisher einer .pdf-Datei
 * `Content-Type: text/html` mitgeben; das wurde unverändert übernommen und
 * beim späteren Abruf ausgeliefert (Audit-Finding H08).
 */
const SAFE_MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  gif: "image/gif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
};

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

/**
 * Magic-Bytes je Erweiterung, wo der Binärstandard das hergibt — reine
 * Textformate (txt/csv) haben keine verlässliche Signatur und werden nur
 * über `containsActiveContentMarkers` geprüft.
 */
const MAGIC_BYTE_CHECKS: Record<string, (buffer: Buffer) => boolean> = {
  pdf: (buffer) => buffer.subarray(0, 5).toString("latin1") === "%PDF-",
  png: (buffer) =>
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (buffer) => buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  jpeg: (buffer) => buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  gif: (buffer) => ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("latin1")),
  webp: (buffer) =>
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP",
  heic: (buffer) => buffer.subarray(4, 8).toString("latin1") === "ftyp",
  zip: (buffer) => buffer.subarray(0, 4).equals(ZIP_MAGIC),
  docx: (buffer) => buffer.subarray(0, 4).equals(ZIP_MAGIC),
  xlsx: (buffer) => buffer.subarray(0, 4).equals(ZIP_MAGIC),
  pptx: (buffer) => buffer.subarray(0, 4).equals(ZIP_MAGIC),
  doc: (buffer) => buffer.subarray(0, 4).equals(OLE2_MAGIC) || buffer.subarray(0, 4).equals(ZIP_MAGIC),
  xls: (buffer) => buffer.subarray(0, 4).equals(OLE2_MAGIC) || buffer.subarray(0, 4).equals(ZIP_MAGIC),
  ppt: (buffer) => buffer.subarray(0, 4).equals(OLE2_MAGIC) || buffer.subarray(0, 4).equals(ZIP_MAGIC),
};

const ACTIVE_CONTENT_MARKERS = [
  /<!doctype\s+html/i,
  /<html[\s>]/i,
  /<script[\s>]/i,
  /<svg[\s>]/i,
  /<\?php/i,
];

function containsActiveContentMarkers(buffer: Buffer) {
  const head = buffer.subarray(0, 2048).toString("utf8");

  return ACTIVE_CONTENT_MARKERS.some((marker) => marker.test(head));
}

/**
 * Erkennt eine .pdf/.png/... benannte Datei, deren tatsächlicher Inhalt
 * HTML/SVG/Skript ist (oder deren Bytes schlicht nicht zum erlaubten
 * Binärformat passen) — Erweiterung und vom Client mitgeschickter MIME-Typ
 * allein sagen nichts über den echten Inhalt aus (Audit-Finding H08).
 */
function validateUploadFileContent(buffer: Buffer, extension: string) {
  if (containsActiveContentMarkers(buffer)) {
    throw new Error(
      "Diese Datei enthält aktive Inhalte (HTML/Skript) und kann nicht hochgeladen werden.",
    );
  }

  const magicCheck = MAGIC_BYTE_CHECKS[extension];

  if (magicCheck && !magicCheck(buffer)) {
    throw new Error(
      `Der Dateiinhalt entspricht nicht der Dateiendung ".${extension}".`,
    );
  }
}

/**
 * Bewusst der EINZIGE Weg, aus einem Client-`File` Bytes + MIME-Typ für die
 * Ablage zu gewinnen — jeder Upload-/Versions-Pfad (generisch, Self-Service,
 * Info-Anfragen) muss ihn verwenden, sonst bleibt der clientseitige
 * `file.type`/eine unbestätigte Endung wirksam (Audit-Finding H08/R04: der
 * Self-Service-Upload rief bisher nur `validateUploadFile`, nicht diese
 * Inhaltsprüfung, auf).
 */
export async function fileToBuffer(file: File) {
  validateUploadFile(file);

  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = getFileExtension(file.name);

  validateUploadFileContent(buffer, extension);

  return { buffer, mimeType: SAFE_MIME_TYPES_BY_EXTENSION[extension] ?? "application/octet-stream" };
}

export async function uploadTenantFile(input: UploadTenantFileInput) {
  const ownerType = input.ownerType ?? "tenant";
  const access = await requireTenantFileAccess(input.tenantSlug, ownerType, input.permissionArea);
  const owner = await validateOwner({
    tenantId: access.tenantId,
    ownerType,
    ownerId: input.ownerId,
  });
  await assertOwnerInScope(input.tenantSlug, ownerType, owner.ownerId, input.permissionArea);
  const scope = folderScope(ownerType, owner.ownerId);
  const bucketConfig = getStorageBucket(input.bucketId);
  const originalName = formatFileName(input.file.name);
  const requestedFolderSlug = normalizeFolderPath(input.folderSlug ?? "");
  const storedFolder = requestedFolderSlug
    ? await prisma.tenantFileFolder.findFirst({
        where: {
          tenantId: access.tenantId,
          scope,
          path: requestedFolderSlug,
          status: "active",
        },
        select: { name: true },
      })
    : null;
  const staticFolder = requestedFolderSlug
    ? fileFolders.find((folder) => folder.slug === requestedFolderSlug)
    : undefined;
  const folderName = requestedFolderSlug
    ? input.folderName?.trim() ||
      storedFolder?.name ||
      staticFolder?.name ||
      "Allgemein"
    : input.folderName?.trim() || "Home";
  const folderSlug = requestedFolderSlug;
  const tags = cleanStringList(input.tags);
  const accessRoleIds = cleanStringList(input.accessRoleIds);
  const accessUserIds = cleanStringList(input.accessUserIds);
  const linked = await findNamesById({
    tenantId: access.tenantId,
    employeeId: input.assignedEmployeeId,
    locationId: input.assignedLocationId,
    roleIds: accessRoleIds,
    userIds: accessUserIds,
  });
  const storageKey = buildStorageKey(bucketConfig, {
    tenantId: access.tenantId,
    fileName: originalName,
    ownerType,
    ownerId: owner.ownerId,
  });
  const { buffer, mimeType } = await fileToBuffer(input.file);
  const uploaded = await uploadObject({
    bucketId: input.bucketId,
    key: storageKey,
    body: buffer,
    contentType: mimeType,
    metadata: {
      tenantId: access.tenantId,
      originalName,
    },
  });

  const created = await prisma.tenantFile.create({
    data: {
      tenantId: access.tenantId,
      employeeId: ownerType === "employee" ? owner.ownerId : undefined,
      locationId: ownerType === "location" ? owner.ownerId : undefined,
      teamId: ownerType === "team" ? owner.ownerId : undefined,
      bucket: uploaded.bucket,
      storageKey: uploaded.key,
      originalName,
      displayName: originalName,
      mimeType,
      sizeBytes: input.file.size,
      extension: getFileExtension(originalName),
      folderSlug,
      folderName,
      ownerName: input.ownerName?.trim() || owner.ownerName || access.userName,
      uploadedById: access.userId,
      uploadedByName: access.userName,
      documentType: input.documentType?.trim() || "Sonstiges",
      validFrom: input.validFrom?.trim() ?? "",
      expiresAt: input.expiresAt?.trim() ?? "",
      reminderAt: input.reminderAt?.trim() ?? "",
      description: input.description?.trim() ?? "",
      tagsJson: tags,
      assignedEmployeeId: linked.employee?.id ?? "",
      assignedEmployeeName: linked.employee?.name ?? "",
      assignedLocationId: linked.location?.id ?? "",
      assignedLocationName: linked.location?.name ?? "",
      accessRoleIdsJson: linked.roles.map((role) => role.id),
      accessRoleNamesJson: linked.roles.map((role) => role.name),
      accessUserIdsJson: linked.users.map((user) => user.id),
      accessUserNamesJson: linked.users.map((user) => user.name || user.email),
      provider: uploaded.provider,
    },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Datei hochgeladen",
    source: "Dateien",
    entityType: "file",
    entityId: created.id,
    detail: originalName,
  });

  return created;
}

/**
 * Trägt Ordner, die bisher nur über die `folderSlug` ihrer Dateien existieren,
 * als echten Datensatz nach — und liefert den Datensatz der untersten Ebene.
 *
 * Die Mitarbeiter-, Standort- und Team-Ansichten leiten ihre Ordnerliste auch
 * aus den Dateien ab (`mergeEmployeeFileFolders` & Co.): die strukturierten
 * Ausweis-/Zertifikatsfelder etwa legen beim Hochladen nur eine Datei mit
 * `folderSlug` an, nie einen Ordner. Solche Ordner sind sichtbar und
 * navigierbar, hatten aber keinen Datensatz, an den sich ein Unterordner
 * hängen ließe — das Anlegen scheiterte mit "Übergeordneter Ordner nicht
 * gefunden".
 *
 * `null`, wenn der Pfad auch durch keine Datei belegt ist: dann existiert der
 * Ordner wirklich nicht und der Aufrufer soll den Fehler werfen.
 */
async function materializeFileBackedFolder(input: {
  tenantId: string;
  scope: string;
  ownerType: FileOwnerType;
  ownerId?: string;
  path: string;
  ownerName: string;
}) {
  const ownerFilter = {
    employeeId: input.ownerType === "employee" ? input.ownerId : null,
    locationId: input.ownerType === "location" ? input.ownerId : null,
    teamId: input.ownerType === "team" ? input.ownerId : null,
  };

  // Eine Datei genau in diesem Ordner (oder darunter) belegt, dass es ihn gibt.
  const backingFiles = await prisma.tenantFile.findMany({
    where: {
      tenantId: input.tenantId,
      ...ownerFilter,
      status: "active",
      OR: [{ folderSlug: input.path }, { folderSlug: { startsWith: `${input.path}/` } }],
    },
    select: { folderSlug: true, folderName: true },
  });

  if (backingFiles.length === 0) {
    return null;
  }

  const segments = input.path.split("/").filter(Boolean);
  let parentId: string | undefined;
  let current: { id: string; path: string } | null = null;

  for (let index = 0; index < segments.length; index += 1) {
    const path = segments.slice(0, index + 1).join("/");
    const existing = await prisma.tenantFileFolder.findFirst({
      where: { tenantId: input.tenantId, scope: input.scope, path, status: "active" },
      select: { id: true, path: true },
    });

    if (existing) {
      parentId = existing.id;
      current = existing;
      continue;
    }

    // Anzeigename aus der Datei übernehmen, die in genau diesem Ordner liegt —
    // sonst bliebe nur der Slug ("erste-hilfe-nachweis" statt "Erste-Hilfe-Nachweis").
    const named = backingFiles.find((entry) => entry.folderSlug === path)?.folderName;
    const created = await prisma.tenantFileFolder.upsert({
      where: { tenantId_scope_path: { tenantId: input.tenantId, scope: input.scope, path } },
      create: {
        tenantId: input.tenantId,
        employeeId: ownerFilter.employeeId ?? undefined,
        locationId: ownerFilter.locationId ?? undefined,
        teamId: ownerFilter.teamId ?? undefined,
        parentId,
        scope: input.scope,
        name: named?.trim() || segments[index],
        slug: segments[index],
        path,
        ownerName: input.ownerName,
      },
      update: { status: "active" },
      select: { id: true, path: true },
    });

    parentId = created.id;
    current = created;
  }

  return current;
}

export async function createTenantFileFolder(input: {
  tenantSlug: string;
  name: string;
  ownerType?: FileOwnerType;
  ownerId?: string;
  parentPath?: string;
  ownerName?: string;
  locked?: boolean;
  pin?: string;
}) {
  const ownerType = input.ownerType ?? "tenant";
  const locked = input.locked === true;
  const pin = input.pin?.trim() ?? "";

  if (locked && !/^\d{6}$/.test(pin)) {
    throw new Error("Bitte eine 6-stellige PIN für den geschützten Ordner angeben.");
  }

  const pinHash = locked ? hashFolderPin(pin) : null;
  const access = await requireTenantFileAccess(input.tenantSlug, ownerType);
  const name = input.name.trim();
  const owner = await validateOwner({
    tenantId: access.tenantId,
    ownerType,
    ownerId: input.ownerId,
  });
  await assertOwnerInScope(input.tenantSlug, ownerType, owner.ownerId);
  const scope = folderScope(ownerType, owner.ownerId);

  if (!name) {
    throw new Error("Ordnername ist erforderlich.");
  }

  const slug = slugify(name);
  const parentPath = normalizeFolderPath(input.parentPath ?? "");
  const parent = parentPath
    ? await prisma.tenantFileFolder.findFirst({
        where: {
          tenantId: access.tenantId,
          scope,
          path: parentPath,
          status: "active",
        },
        select: { id: true, path: true },
      })
    : null;
  const staticParent = parentPath
    ? fileFolders.some((folder) => folder.slug === parentPath)
    : false;
  // Nur über Dateien existierende Ordner vorher nachtragen, statt das Anlegen
  // eines Unterordners daran scheitern zu lassen (s. materializeFileBackedFolder).
  const resolvedParent =
    parent ??
    (parentPath && !staticParent
      ? await materializeFileBackedFolder({
          tenantId: access.tenantId,
          scope,
          ownerType,
          ownerId: owner.ownerId,
          path: parentPath,
          ownerName: input.ownerName?.trim() || access.userName || "HR",
        })
      : null);

  if (parentPath && !resolvedParent && !staticParent) {
    throw new Error("Übergeordneter Ordner nicht gefunden.");
  }

  const path = resolvedParent
    ? `${resolvedParent.path}/${slug}`
    : parentPath
      ? `${parentPath}/${slug}`
      : slug;

  // Der `upsert` unten dient eigentlich dazu, einen zuvor gelöschten
  // (soft-deleted) Ordner beim erneuten Anlegen unter demselben Namen
  // wiederzubeleben — ein bereits AKTIVER Ordner an diesem Pfad ist dagegen
  // ein echtes Namenskollisions und wurde bisher klaglos (ohne neuen Ordner,
  // ohne Meldung) verworfen (QA-Bug BUG-024).
  const existingActive = await prisma.tenantFileFolder.findFirst({
    where: { tenantId: access.tenantId, scope, path, status: "active" },
    select: { id: true },
  });

  if (existingActive) {
    throw new Error(`Ein Ordner mit dem Namen "${name}" existiert bereits.`);
  }

  return prisma.tenantFileFolder.upsert({
    where: {
      tenantId_scope_path: {
        tenantId: access.tenantId,
        scope,
        path,
      },
    },
    create: {
      tenantId: access.tenantId,
      employeeId: ownerType === "employee" ? owner.ownerId : undefined,
      locationId: ownerType === "location" ? owner.ownerId : undefined,
      teamId: ownerType === "team" ? owner.ownerId : undefined,
      parentId: resolvedParent?.id,
      scope,
      name,
      slug,
      path,
      ownerName: input.ownerName?.trim() || access.userName || "HR",
      locked,
      pinHash,
    },
    update: {
      status: "active",
      name,
      ownerName: input.ownerName?.trim() || access.userName || "HR",
      locked,
      pinHash,
    },
  });
}

/**
 * Legt einen (unversperrten, Top-Level-) Mitarbeiter-Ordner direkt aus einer
 * Ordnervorlage an (`TenantEmployeeFolderTemplate`, s.
 * lib/employee-folder-templates.ts) — anders als `createTenantFileFolder`
 * ohne eigene Session-/Berechtigungsprüfung, weil der Aufrufer (Anlegen einer
 * Vorlage bzw. eines neuen Mitarbeiters) die Berechtigung dafür bereits an
 * anderer Stelle geprüft hat und hier nur intern für ggf. sehr viele
 * Mitarbeiter auf einmal aufgerufen wird. Idempotent (Upsert über den
 * eindeutigen Ordnerpfad), wie `createTenantFileFolder`.
 */
export async function ensureEmployeeTemplateFolder(input: {
  tenantId: string;
  employeeId: string;
  name: string;
  ownerName?: string;
}) {
  const name = input.name.trim();

  if (!name) {
    return;
  }

  const slug = slugify(name);
  const scope = folderScope("employee", input.employeeId);

  await prisma.tenantFileFolder.upsert({
    where: {
      tenantId_scope_path: {
        tenantId: input.tenantId,
        scope,
        path: slug,
      },
    },
    create: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      scope,
      name,
      slug,
      path: slug,
      ownerName: input.ownerName?.trim() || "HR",
    },
    update: {
      status: "active",
    },
  });
}

/**
 * Prüft die PIN eines geschützten Ordners. `scope` unterscheidet die
 * mandantenweite zentrale Ablage (`"tenant"`, Default) von
 * eigentümer-skopierten Ordnern (`"employee:<id>"`/`"location:<id>"`/
 * `"team:<id>"`, s. `folderScope()`) — ein Mitarbeiter-/Standort-/Team-Ordner
 * mit demselben `path` wie ein zentraler Ordner darf nicht dieselbe PIN
 * teilen bzw. fälschlich ungeprüft durchgehen.
 */
export async function verifyTenantFileFolderPin(input: {
  tenantSlug: string;
  folderPath: string;
  pin: string;
  scope?: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "files", "read");
  const folder = await prisma.tenantFileFolder.findFirst({
    where: {
      tenantId: access.tenantId,
      scope: input.scope ?? "tenant",
      path: input.folderPath,
      status: "active",
    },
    select: { pinHash: true, locked: true },
  });

  if (!folder?.locked || !folder.pinHash) {
    return true;
  }

  return verifyFolderPin(input.pin, folder.pinHash);
}

/**
 * Ordnerpfad (+ Scope) einer Datei — für Routen, die vor der Auslieferung
 * prüfen müssen, ob der Ordner PIN-geschützt ist (`GET .../signed-url` kennt
 * sonst nur die `fileId`, nicht den Ordner). `folderPath` ist ein leerer
 * String, wenn die Datei nicht in einem Ordner liegt oder nicht gefunden
 * wurde (dann greift ohnehin die übliche 404-Behandlung beim eigentlichen
 * Abruf).
 */
export async function resolveTenantFileFolderPath(input: {
  tenantSlug: string;
  fileId: string;
}): Promise<{ folderPath: string; scope: string }> {
  const access = await requireTenantAccess(input.tenantSlug, "files", "read");
  const file = await prisma.tenantFile.findFirst({
    where: { tenantId: access.tenantId, id: input.fileId, status: { not: "deleted" } },
    select: { folderSlug: true, employeeId: true, locationId: true, teamId: true },
  });

  if (!file) {
    return { folderPath: "", scope: "tenant" };
  }

  const scope = file.employeeId
    ? folderScope("employee", file.employeeId)
    : file.locationId
      ? folderScope("location", file.locationId)
      : file.teamId
        ? folderScope("team", file.teamId)
        : "tenant";

  return { folderPath: file.folderSlug ?? "", scope };
}

/**
 * Durchsetzt die PIN-Sperre eines Ordners — bislang lieferten `GET /files`
 * und `GET /files/[fileId]/signed-url` den Inhalt eines gesperrten Ordners
 * ungeprüft aus. Nur die Web-Seite (`FilesPageContent.tsx`) blendete ihn
 * clientseitig hinter `FolderPinGate` aus, ohne dass die API selbst je eine
 * PIN verlangt hätte — ein direkter Aufruf der Route mit gültigem
 * Session-Cookie kam ohne PIN an die Daten. Wirft `FOLDER_LOCKED` (von
 * `mapSelfServiceError` auf 403 gemappt), wenn weder das Freischalt-Cookie
 * (Web) noch eine passende, im `pin`-Feld übergebene PIN vorliegt — für
 * API-Clients ohne Cookie-Jar (z. B. die Mobile-App, deren Fetch-Schicht nur
 * den Auth-Cookie manuell mitschickt, s. `src/lib/api.ts` im App-Repo) ist
 * das der einzige Weg, den Gate zu passieren — die PIN wird dort pro Anfrage
 * im Header mitgeschickt, nicht per Set-Cookie gemerkt.
 */
export async function assertFolderPinAccess(input: {
  tenantSlug: string;
  folderPath: string;
  pin?: string | null;
  scope?: string;
}): Promise<void> {
  if (!input.folderPath) {
    return;
  }

  const scope = input.scope ?? "tenant";

  if (await isFolderUnlocked(input.tenantSlug, input.folderPath, scope)) {
    return;
  }

  const pinOk = await verifyTenantFileFolderPin({
    tenantSlug: input.tenantSlug,
    folderPath: input.folderPath,
    pin: input.pin ?? "",
    scope,
  });

  if (!pinOk) {
    throw new Error("FOLDER_LOCKED");
  }

  if (input.pin) {
    await markFolderUnlocked(input.tenantSlug, input.folderPath, scope);
  }
}

export async function uploadTenantFileVersion(input: {
  tenantSlug: string;
  fileId: string;
  file: File;
  pin?: string;
}) {
  const access = await requireTenantFileAccess(input.tenantSlug);
  const current = await prisma.tenantFile.findFirst({
    where: {
      id: input.fileId,
      tenantId: access.tenantId,
      status: { not: "deleted" },
    },
  });

  if (!current) {
    throw new Error("Datei nicht gefunden.");
  }

  const rootId = current.parentId ?? current.id;

  // "files:write" allein autorisiert nur den Datei-Bereich generell — wer
  // den Inhalt über ACL/Fachbereich/Eigentümer-Scope nicht lesen dürfte,
  // darf ihn auch nicht durch eine neue Version ersetzen (Audit-Finding
  // H06). Die Schutz-Metadaten (ACL, hiddenFromEmployee, documentType, ...)
  // hängen am Wurzeldokument, nicht notwendigerweise an der zuletzt aktiven
  // Version (Audit-Finding H07) — deshalb hier wie beim Lesepfad
  // (`getTenantFileSignedUrl`) explizit dort nachschlagen UND anschließend
  // vollständig auf die neue Version übertragen, statt sie auf die
  // Schema-Defaults zurückfallen zu lassen.
  // Fällt auf die aktuelle Version selbst zurück, falls das Wurzeldokument
  // bereits (nach 30 Tagen) bereinigt wurde — ein vorzeitig gepurgtes
  // Elternteil darf eine sonst aktive, weiterhin vollständig ausgestattete
  // Version nicht unbedienbar machen (Audit-Finding H07).
  const metadataSource =
    (current.parentId
      ? await prisma.tenantFile.findFirst({
          where: { id: rootId, tenantId: access.tenantId, status: { not: "deleted" } },
        })
      : current) ?? current;

  const fileAreaAccess = await requireTenantAccess(input.tenantSlug, "files", "read");
  requireFileAcl(metadataSource, fileAreaAccess);
  await requireTenantFileAreaAccess(fileAreaAccess, current);
  await assertFileFolderPinAccess(input.tenantSlug, current, input.pin);

  // Fachliche Vertrags-/Abrechnungs-/Krankheits-Verknüpfung: Ohne Umhängen
  // bliebe der Verweis nach dem Ersetzen auf der jetzt "replaced" alten
  // Version stehen — die neue Version wäre für requireTenantFileAreaAccess
  // nicht mehr als Vertrag/Abrechnung/Krankmeldung erkennbar und fiele auf
  // den allgemeineren "employeeFiles"-Bereich zurück (Audit-Finding H07).
  // (`requireTenantFileAreaAccess` prüft zusätzlich den ganzen
  // Versionenverbund, das hier ist trotzdem die maßgebliche, aktuelle
  // Verknüpfung für Folgeaktionen wie Löschung/Anzeige der Krankmeldung.)
  const [linkedContract, linkedPayroll, linkedSickness] = await Promise.all([
    prisma.tenantEmployeeContract.findUnique({
      where: { fileId: current.id },
      select: { id: true },
    }),
    prisma.tenantPayrollStatement.findUnique({
      where: { fileId: current.id },
      select: { id: true },
    }),
    prisma.tenantSicknessReport.findFirst({
      where: { attachmentFileId: current.id },
      select: { id: true },
    }),
  ]);

  const nextVersion = current.version + 1;
  const originalName = formatFileName(input.file.name || current.originalName);
  const bucketConfig = getStorageBucket("hrDocuments");
  const ownerType: FileOwnerType = current.employeeId
    ? "employee"
    : current.locationId
      ? "location"
      : current.teamId
        ? "team"
        : "tenant";
  const ownerId = current.employeeId ?? current.locationId ?? current.teamId ?? undefined;
  const storageKey = buildStorageKey(bucketConfig, {
    tenantId: access.tenantId,
    fileName: originalName,
    ownerType,
    ownerId,
    version: nextVersion,
  });
  const { buffer, mimeType } = await fileToBuffer(input.file);
  const uploaded = await uploadObject({
    key: storageKey,
    body: buffer,
    contentType: mimeType,
    metadata: {
      tenantId: access.tenantId,
      originalName,
      previousFileId: current.id,
    },
  });

  return prisma.$transaction(async (tx) => {
    await tx.tenantFile.update({
      where: { id: current.id },
      data: { status: "replaced", replacedAt: new Date() },
    });

    const created = await tx.tenantFile.create({
      data: {
        tenantId: access.tenantId,
        employeeId: current.employeeId,
        locationId: current.locationId,
        teamId: current.teamId,
        parentId: rootId,
        bucket: uploaded.bucket,
        storageKey: uploaded.key,
        originalName,
        displayName: current.displayName || originalName,
        mimeType,
        sizeBytes: input.file.size,
        extension: getFileExtension(originalName),
        folderSlug: current.folderSlug,
        folderName: current.folderName,
        ownerName: access.userName,
        status: "active",
        version: nextVersion,
        provider: uploaded.provider,
        // Schutz-/Lebenszyklus-Metadaten vollständig vom Wurzeldokument
        // übernehmen statt sie auf die Schema-Defaults zurückfallen zu
        // lassen (Audit-Finding H07).
        documentType: metadataSource.documentType,
        hiddenFromEmployee: metadataSource.hiddenFromEmployee,
        description: metadataSource.description,
        validFrom: metadataSource.validFrom,
        expiresAt: metadataSource.expiresAt,
        reminderAt: metadataSource.reminderAt,
        tagsJson: metadataSource.tagsJson as Prisma.InputJsonValue,
        assignedEmployeeId: metadataSource.assignedEmployeeId,
        assignedEmployeeName: metadataSource.assignedEmployeeName,
        assignedLocationId: metadataSource.assignedLocationId,
        assignedLocationName: metadataSource.assignedLocationName,
        accessRoleIdsJson: metadataSource.accessRoleIdsJson as Prisma.InputJsonValue,
        accessRoleNamesJson: metadataSource.accessRoleNamesJson as Prisma.InputJsonValue,
        accessUserIdsJson: metadataSource.accessUserIdsJson as Prisma.InputJsonValue,
        accessUserNamesJson: metadataSource.accessUserNamesJson as Prisma.InputJsonValue,
      },
    });

    // Siehe oben (Audit-Finding H07): Vertrags-/Abrechnungsverknüpfung auf
    // die neue Version umhängen, statt sie auf der jetzt "replaced" alten
    // Version stehen zu lassen.
    if (linkedContract) {
      await tx.tenantEmployeeContract.update({
        where: { id: linkedContract.id },
        data: { fileId: created.id },
      });
    }

    if (linkedPayroll) {
      await tx.tenantPayrollStatement.update({
        where: { id: linkedPayroll.id },
        data: { fileId: created.id },
      });
    }

    if (linkedSickness) {
      await tx.tenantSicknessReport.update({
        where: { id: linkedSickness.id },
        data: { attachmentFileId: created.id },
      });
    }

    return created;
  });
}

export async function softDeleteTenantFile(input: {
  tenantSlug: string;
  fileId: string;
  pin?: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "files", "read");

  if (!access.canDelete) {
    throw new Error("FORBIDDEN");
  }

  const target = await prisma.tenantFile.findFirst({
    where: { id: input.fileId, tenantId: access.tenantId, status: { not: "deleted" } },
  });

  if (!target) {
    throw new Error("Datei nicht gefunden.");
  }

  // Siehe uploadTenantFileVersion (Audit-Finding H06): "files:read" +
  // canDelete allein ist keine Freigabe für eine Datei, deren Inhalt der
  // Aufrufer über ACL/Fachbereich/Eigentümer-Scope gar nicht lesen dürfte.
  const rootId = target.parentId ?? target.id;
  // Fällt auf die Datei selbst zurück, falls das Wurzeldokument bereits
  // bereinigt wurde (Audit-Finding H07, siehe uploadTenantFileVersion).
  const aclFile =
    (target.parentId
      ? await prisma.tenantFile.findFirst({
          where: { id: rootId, tenantId: access.tenantId, status: { not: "deleted" } },
          select: { accessRoleIdsJson: true, accessUserIdsJson: true },
        })
      : target) ?? target;

  requireFileAcl(aclFile, access);
  await requireTenantFileAreaAccess(access, target);
  await assertFileFolderPinAccess(input.tenantSlug, target, input.pin);
  await assertFileDeletionAllowed(access.tenantId, target);

  const deleted = await markObjectDeleted({
    tenantId: access.tenantId,
    fileId: input.fileId,
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Datei gelöscht",
    source: "Dateien",
    entityType: "file",
    entityId: deleted.id,
    detail: deleted.displayName,
  });

  return deleted;
}

/**
 * Datei vor dem Mitarbeiter selbst verbergen (oder wieder freigeben).
 *
 * Kein Löschen und keine ACL: HR/Admin sehen die Datei unverändert, nur die
 * eigene Personalakte des Mitarbeiters ("Meine Personalakte" in der App,
 * "Mein Bereich" im Web) lässt sie aus. Gedacht für Unterlagen, die in der
 * Akte liegen müssen, den Mitarbeiter aber (noch) nicht erreichen sollen.
 *
 * Ältere Versionen derselben Datei werden mitgeschaltet — sonst bliebe der
 * Verlauf am selben Mitarbeiter weiter sichtbar.
 */
export async function setTenantFileEmployeeVisibility(input: {
  tenantSlug: string;
  fileId: string;
  hidden: boolean;
  pin?: string;
}) {
  const access = await requireTenantFileAccess(input.tenantSlug, "employee");
  const file = await prisma.tenantFile.findFirst({
    where: {
      id: input.fileId,
      tenantId: access.tenantId,
      status: { not: "deleted" },
    },
    select: {
      id: true,
      parentId: true,
      displayName: true,
      employeeId: true,
      locationId: true,
      teamId: true,
      hiddenFromEmployee: true,
      accessRoleIdsJson: true,
      accessUserIdsJson: true,
      folderSlug: true,
    },
  });

  // Nur Dateien, die wirklich an einer Personalakte hängen — bei einer
  // Standort-/Team-/zentralen Datei gäbe es keinen Mitarbeiter, vor dem sich
  // etwas verbergen ließe.
  if (!file || !file.employeeId) {
    throw new Error("Datei nicht gefunden.");
  }

  const rootId = file.parentId ?? file.id;

  // Siehe uploadTenantFileVersion (Audit-Finding H06/H07): wer die Datei über
  // ACL/Fachbereich/Eigentümer-Scope nicht lesen dürfte, darf auch ihre
  // Sichtbarkeit für den Mitarbeiter nicht umschalten; fällt auf die Datei
  // selbst zurück, falls das Wurzeldokument bereits bereinigt wurde.
  const aclFile =
    (file.parentId
      ? await prisma.tenantFile.findFirst({
          where: { id: rootId, tenantId: access.tenantId, status: { not: "deleted" } },
          select: { accessRoleIdsJson: true, accessUserIdsJson: true },
        })
      : file) ?? file;

  const fileAreaAccess = await requireTenantAccess(input.tenantSlug, "files", "read");
  requireFileAcl(aclFile, fileAreaAccess);
  await requireTenantFileAreaAccess(fileAreaAccess, file);
  await assertFileFolderPinAccess(input.tenantSlug, file, input.pin);

  await prisma.tenantFile.updateMany({
    where: {
      tenantId: access.tenantId,
      OR: [{ id: rootId }, { parentId: rootId }],
    },
    data: { hiddenFromEmployee: input.hidden },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: input.hidden
      ? "Datei vor Mitarbeiter verborgen"
      : "Datei für Mitarbeiter freigegeben",
    source: "Dateien",
    entityType: "file",
    entityId: rootId,
    detail: file.displayName,
  });

  return { id: rootId, hiddenFromEmployee: input.hidden };
}

/**
 * Ganzen Ordner einer Personalakte vor dem Mitarbeiter verbergen — samt
 * Inhalt und Unterordnern. Gesetzt wird nur dieser eine Datensatz; die
 * Selbstauskunft filtert Dateien und Unterordner über den Pfad-Präfix.
 *
 * Ordner, die bisher nur über den Ordnerpfad ihrer Dateien existieren (die
 * Ausweis-/Zertifikatsfelder legen keinen Ordnerdatensatz an), werden dabei
 * nachgetragen — sonst ließe sich genau an ihnen nichts umschalten.
 */
export async function setTenantFileFolderEmployeeVisibility(input: {
  tenantSlug: string;
  employeeId: string;
  path: string;
  hidden: boolean;
  ownerName?: string;
}) {
  const access = await requireTenantFileAccess(input.tenantSlug, "employee");
  const owner = await validateOwner({
    tenantId: access.tenantId,
    ownerType: "employee",
    ownerId: input.employeeId,
  });
  await assertOwnerInScope(input.tenantSlug, "employee", owner.ownerId);
  const scope = folderScope("employee", owner.ownerId);
  const path = normalizeFolderPath(input.path);

  if (!path) {
    throw new Error("Ordner nicht gefunden.");
  }

  const existing = await prisma.tenantFileFolder.findFirst({
    where: { tenantId: access.tenantId, scope, path, status: "active" },
    select: { id: true },
  });
  const folder =
    existing ??
    (await materializeFileBackedFolder({
      tenantId: access.tenantId,
      scope,
      ownerType: "employee",
      ownerId: owner.ownerId,
      path,
      ownerName: input.ownerName?.trim() || owner.ownerName || access.userName || "HR",
    }));

  if (!folder) {
    throw new Error("Ordner nicht gefunden.");
  }

  const updated = await prisma.tenantFileFolder.update({
    where: { id: folder.id },
    data: { hiddenFromEmployee: input.hidden },
    select: { id: true, name: true, path: true, hiddenFromEmployee: true },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: input.hidden
      ? "Ordner vor Mitarbeiter verborgen"
      : "Ordner für Mitarbeiter freigegeben",
    source: "Dateien",
    entityType: "file-folder",
    entityId: updated.id,
    detail: updated.name,
  });

  return updated;
}

export async function getTenantFileSignedUrl(input: {
  tenantSlug: string;
  fileId: string;
  version?: number;
  disposition?: "inline" | "attachment";
}) {
  const access = await requireTenantAccess(input.tenantSlug, "files", "read");
  const baseFile = await prisma.tenantFile.findFirst({
    where: {
      tenantId: access.tenantId,
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
          where: { id: rootId, tenantId: access.tenantId, status: { not: "deleted" } },
          select: { accessRoleIdsJson: true, accessUserIdsJson: true },
        })
      : baseFile) ?? baseFile;

  requireFileAcl(aclFile, access);
  await requireTenantFileAreaAccess(access, baseFile);

  const file = input.version
    ? await prisma.tenantFile.findFirst({
        where: {
          tenantId: access.tenantId,
          status: { not: "deleted" },
          version: input.version,
          OR: [{ id: rootId }, { parentId: rootId }],
        },
      })
    : baseFile;

  if (!file) {
    throw new Error("Datei nicht gefunden.");
  }

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

  return createReadSignedUrl({
    bucket: file.bucket,
    key: file.storageKey,
    fileName: file.displayName,
    disposition: input.disposition,
    contentType: file.mimeType,
  });
}
