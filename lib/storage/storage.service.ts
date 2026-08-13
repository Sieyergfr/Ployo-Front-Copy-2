import { auth } from "@/lib/auth";
import { recordTenantAudit } from "@/lib/audit";
import { fileFolders } from "@/lib/files";
import { getStorageBucket, type StorageBucketId } from "@/lib/storage/buckets";
import { buildStorageKey, getFileExtension } from "@/lib/storage/key-builder";
import { markObjectDeleted } from "@/lib/storage/delete";
import { createReadSignedUrl } from "@/lib/storage/signed-url";
import { uploadObject } from "@/lib/storage/upload";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { requireTenantAccess } from "@/lib/tenant-access";
import { requireFileAcl } from "@/lib/file-access";

export type FileOwnerType = "tenant" | "employee" | "location" | "team";

export type UploadTenantFileInput = {
  tenantSlug: string;
  file: File;
  bucketId?: StorageBucketId;
  ownerType?: FileOwnerType;
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

function folderScope(ownerType: FileOwnerType, ownerId?: string) {
  return ownerType === "tenant" ? "tenant" : `${ownerType}:${ownerId ?? "unknown"}`;
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
 * Standort-Dokumente), zusätzlich zum bestehenden "files:write" das
 * `canUploadFiles` des jeweiligen Bereichs prüfen — sonst würde ein Konto
 * ohne diese Fähigkeit weiterhin über die Server Action hochladen können,
 * auch wenn der Button in der UI ausgeblendet ist. Generische Uploads ins
 * eigenständige Dateien-Modul (ownerType "tenant") bleiben unverändert nur
 * an "files:write" gebunden.
 */
async function requireTenantFileAccess(
  tenantSlug: string,
  ownerType: FileOwnerType = "tenant",
) {
  await requireTenantAccess(tenantSlug, "files", "write");

  if (ownerType === "employee" || ownerType === "location" || ownerType === "team") {
    const area =
      ownerType === "employee" ? "employees" : ownerType === "location" ? "locations" : "teams";
    const areaAccess = await requireTenantAccess(tenantSlug, area, "read");

    if (!areaAccess.canUploadFiles) {
      throw new Error("FORBIDDEN");
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

function validateUploadFile(file: File) {
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

async function fileToBuffer(file: File) {
  validateUploadFile(file);

  return Buffer.from(await file.arrayBuffer());
}

export async function uploadTenantFile(input: UploadTenantFileInput) {
  const ownerType = input.ownerType ?? "tenant";
  const access = await requireTenantFileAccess(input.tenantSlug, ownerType);
  const owner = await validateOwner({
    tenantId: access.tenantId,
    ownerType,
    ownerId: input.ownerId,
  });
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
  const uploaded = await uploadObject({
    bucketId: input.bucketId,
    key: storageKey,
    body: await fileToBuffer(input.file),
    contentType: input.file.type || "application/octet-stream",
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
      mimeType: input.file.type || "application/octet-stream",
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

export async function createTenantFileFolder(input: {
  tenantSlug: string;
  name: string;
  ownerType?: FileOwnerType;
  ownerId?: string;
  parentPath?: string;
  ownerName?: string;
  locked?: boolean;
}) {
  const ownerType = input.ownerType ?? "tenant";
  const access = await requireTenantFileAccess(input.tenantSlug, ownerType);
  const name = input.name.trim();
  const owner = await validateOwner({
    tenantId: access.tenantId,
    ownerType,
    ownerId: input.ownerId,
  });
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

  if (parentPath && !parent && !staticParent) {
    throw new Error("Übergeordneter Ordner nicht gefunden.");
  }

  const path = parent
    ? `${parent.path}/${slug}`
    : parentPath
      ? `${parentPath}/${slug}`
      : slug;

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
      parentId: parent?.id,
      scope,
      name,
      slug,
      path,
      ownerName: input.ownerName?.trim() || access.userName || "HR",
      locked: input.locked === true,
    },
    update: {
      status: "active",
      name,
      ownerName: input.ownerName?.trim() || access.userName || "HR",
      locked: input.locked === true,
    },
  });
}

export async function uploadTenantFileVersion(input: {
  tenantSlug: string;
  fileId: string;
  file: File;
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
  const uploaded = await uploadObject({
    key: storageKey,
    body: await fileToBuffer(input.file),
    contentType: input.file.type || current.mimeType,
    metadata: {
      tenantId: access.tenantId,
      originalName,
      previousFileId: current.id,
    },
  });

  return prisma.$transaction(async (tx) => {
    await tx.tenantFile.update({
      where: { id: current.id },
      data: { status: "replaced" },
    });

    return tx.tenantFile.create({
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
        mimeType: input.file.type || current.mimeType,
        sizeBytes: input.file.size,
        extension: getFileExtension(originalName),
        folderSlug: current.folderSlug,
        folderName: current.folderName,
        ownerName: access.userName,
        status: "active",
        version: nextVersion,
        provider: uploaded.provider,
      },
    });
  });
}

export async function softDeleteTenantFile(input: {
  tenantSlug: string;
  fileId: string;
}) {
  const access = await requireTenantFileAccess(input.tenantSlug);

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
  const aclFile = baseFile.parentId
    ? await prisma.tenantFile.findFirst({
        where: { id: rootId, tenantId: access.tenantId, status: { not: "deleted" } },
        select: { accessRoleIdsJson: true, accessUserIdsJson: true },
      })
    : baseFile;

  if (!aclFile) throw new Error("Datei nicht gefunden.");
  requireFileAcl(aclFile, access);

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
