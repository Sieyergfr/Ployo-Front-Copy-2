import "server-only";

import { recordTenantAudit } from "@/lib/audit";
import {
  canAccessFileAcl,
  isTenantFolderPathDenied,
  requireFileAcl,
  requireTenantFileAreaAccess,
} from "@/lib/file-access";
import {
  FILE_FOLDER_ERRORS,
  folderPathChain,
  isFolderManager,
  parseIdList,
  sharedFolderPaths,
  type EmployeeAudience,
} from "@/lib/file-folders";
import { prisma } from "@/lib/prisma";
import { createReadSignedUrl } from "@/lib/storage/signed-url";
import { assertFolderPinAccess } from "@/lib/storage/storage.service";
import { requireTenantAccess, requireTenantMembership, type TenantAccess } from "@/lib/tenant-access";

/**
 * Ordner-Einstellungen der zentralen Ablage (M1): umbenennen, anheften,
 * Rollen-Einschränkung und Freigabe für Mitarbeitende; dazu Dateien
 * umbenennen und verschieben. Ordner selbst werden nicht verschoben — ihr
 * Pfad ist zugleich die Adresse aller Dateien darin und Teil der URL.
 */

function normalizePath(value: string) {
  return value
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

async function loadTenantFolder(tenantId: string, path: string) {
  const folder = await prisma.tenantFileFolder.findFirst({
    where: { tenantId, scope: "tenant", status: "active", path },
  });

  if (!folder) {
    throw new Error(FILE_FOLDER_ERRORS.notFound);
  }

  return folder;
}

async function validIds(tenantId: string, kind: "role" | "team" | "location", ids: string[] | undefined) {
  const unique = Array.from(new Set((ids ?? []).filter(Boolean))).slice(0, 100);

  if (unique.length === 0) return [];

  const rows =
    kind === "role"
      ? await prisma.tenantRole.findMany({ where: { tenantId, id: { in: unique } }, select: { id: true } })
      : kind === "team"
        ? await prisma.tenantTeam.findMany({ where: { tenantId, id: { in: unique } }, select: { id: true } })
        : await prisma.tenantLocation.findMany({ where: { tenantId, id: { in: unique } }, select: { id: true } });

  return rows.map((row) => row.id);
}

/**
 * Ordner-Einstellungen ändern. Umbenennen/Anheften braucht Schreibrecht auf
 * Dateien; Rollen-Einschränkung und Freigabe nur Inhaber/Admin/HR bzw.
 * Datei-Admin — sonst könnte sich jemand selbst aussperren oder Inhalte
 * eigenmächtig für alle freigeben.
 */
export async function updateTenantFolderSettings(input: {
  tenantSlug: string;
  path: string;
  name?: string;
  pinned?: boolean;
  accessRoleIds?: string[];
  sharedWithEmployees?: boolean;
  visibleTeamIds?: string[];
  visibleLocationIds?: string[];
}) {
  const access = await requireTenantAccess(input.tenantSlug, "files", "write");
  const path = normalizePath(input.path);
  const folder = await loadTenantFolder(access.tenantId, path);

  if (await isTenantFolderPathDenied(access, path)) {
    throw new Error("FORBIDDEN");
  }

  const changesAccess =
    input.accessRoleIds !== undefined ||
    input.sharedWithEmployees !== undefined ||
    input.visibleTeamIds !== undefined ||
    input.visibleLocationIds !== undefined;

  if (changesAccess && !isFolderManager(access) && access.permissionLevel !== "admin") {
    throw new Error("FORBIDDEN");
  }

  const name = input.name?.trim();

  if (input.name !== undefined && !name) {
    throw new Error(FILE_FOLDER_ERRORS.nameRequired);
  }

  const accessRoleIds =
    input.accessRoleIds !== undefined
      ? await validIds(access.tenantId, "role", input.accessRoleIds)
      : parseIdList(folder.accessRoleIdsJson);
  const sharedWithEmployees = input.sharedWithEmployees ?? folder.sharedWithEmployees;

  if (sharedWithEmployees) {
    const chain = await prisma.tenantFileFolder.findMany({
      where: { tenantId: access.tenantId, scope: "tenant", status: "active", path: { in: folderPathChain(path) } },
      select: { path: true, locked: true, accessRoleIdsJson: true },
    });

    if (chain.some((entry) => entry.locked)) {
      throw new Error(FILE_FOLDER_ERRORS.lockedShare);
    }

    if (
      accessRoleIds.length > 0 ||
      chain.some((entry) => entry.path !== path && parseIdList(entry.accessRoleIdsJson).length > 0)
    ) {
      throw new Error(FILE_FOLDER_ERRORS.restrictedShare);
    }
  }

  const updated = await prisma.tenantFileFolder.update({
    where: { id: folder.id },
    data: {
      ...(name ? { name: name.slice(0, 120) } : {}),
      ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
      ...(input.accessRoleIds !== undefined ? { accessRoleIdsJson: accessRoleIds } : {}),
      ...(input.sharedWithEmployees !== undefined ? { sharedWithEmployees } : {}),
      ...(input.visibleTeamIds !== undefined
        ? { visibleTeamIdsJson: await validIds(access.tenantId, "team", input.visibleTeamIds) }
        : {}),
      ...(input.visibleLocationIds !== undefined
        ? { visibleLocationIdsJson: await validIds(access.tenantId, "location", input.visibleLocationIds) }
        : {}),
    },
  });

  if (name && name !== folder.name) {
    // Dateien führen den Ordnernamen als Anzeige-Kopie mit.
    await prisma.tenantFile.updateMany({
      where: { tenantId: access.tenantId, employeeId: null, locationId: null, teamId: null, folderSlug: path },
      data: { folderName: updated.name },
    });
  }

  const changes = [
    name && name !== folder.name ? `umbenannt in „${updated.name}“` : null,
    input.pinned !== undefined && input.pinned !== folder.pinned ? (input.pinned ? "angeheftet" : "gelöst") : null,
    changesAccess ? (updated.sharedWithEmployees ? "für Mitarbeitende freigegeben" : "nur Verwaltung") : null,
    input.accessRoleIds !== undefined ? `Rollen: ${accessRoleIds.length || "alle"}` : null,
  ].filter(Boolean);

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Ordner-Einstellungen geändert",
    source: "Dateien",
    entityType: "file-folder",
    entityId: folder.id,
    detail: `${folder.name}${changes.length ? ` · ${changes.join(", ")}` : ""}`,
  });

  return updated;
}

/** Zentrale Datei laden und dieselben Prüfungen wie beim Abruf anwenden (ACL, Fachbereich, Ordnerrechte, PIN). */
async function loadWritableCentralFile(access: TenantAccess, tenantSlug: string, fileId: string, pin?: string) {
  const file = await prisma.tenantFile.findFirst({
    where: {
      id: fileId,
      tenantId: access.tenantId,
      status: "active",
      employeeId: null,
      locationId: null,
      teamId: null,
    },
    include: { parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } } },
  });

  if (!file) {
    throw new Error("Datei nicht gefunden.");
  }

  requireFileAcl(file.parent ?? file, access);
  await requireTenantFileAreaAccess(access, file);
  await assertFolderPinAccess({ tenantSlug, folderPath: file.folderSlug, pin: pin ?? null });

  return file;
}

export async function renameTenantFile(input: { tenantSlug: string; fileId: string; name: string; pin?: string }) {
  const access = await requireTenantAccess(input.tenantSlug, "files", "write");
  const file = await loadWritableCentralFile(access, input.tenantSlug, input.fileId, input.pin);
  const name = input.name.trim().replace(/[\\/]+/g, "-").slice(0, 240);

  if (!name) {
    throw new Error("Dateiname ist erforderlich.");
  }

  const rootId = file.parentId ?? file.id;

  await prisma.tenantFile.updateMany({
    where: { tenantId: access.tenantId, OR: [{ id: rootId }, { parentId: rootId }] },
    data: { displayName: name },
  });
  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Datei umbenannt",
    source: "Dateien",
    entityType: "file",
    entityId: rootId,
    detail: `${file.displayName} → ${name}`,
  });

  return { id: rootId, name };
}

export async function moveTenantFile(input: {
  tenantSlug: string;
  fileId: string;
  targetPath: string;
  pin?: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "files", "write");
  const file = await loadWritableCentralFile(access, input.tenantSlug, input.fileId, input.pin);
  const targetPath = normalizePath(input.targetPath);

  if (targetPath === file.folderSlug) {
    throw new Error(FILE_FOLDER_ERRORS.sameFolder);
  }

  const target = targetPath ? await loadTenantFolder(access.tenantId, targetPath) : null;

  if (targetPath && (await isTenantFolderPathDenied(access, targetPath))) {
    throw new Error("FORBIDDEN");
  }

  if (targetPath) {
    await assertFolderPinAccess({ tenantSlug: input.tenantSlug, folderPath: targetPath, pin: null });
  }

  const rootId = file.parentId ?? file.id;
  const folderName = target?.name ?? "Home";

  await prisma.tenantFile.updateMany({
    where: { tenantId: access.tenantId, OR: [{ id: rootId }, { parentId: rootId }] },
    data: { folderSlug: targetPath, folderName },
  });
  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Datei verschoben",
    source: "Dateien",
    entityType: "file",
    entityId: rootId,
    detail: `${file.displayName}: ${file.folderName || "Home"} → ${folderName}`,
  });

  return { id: rootId, folderSlug: targetPath, folderName };
}

/* ───────────── Freigabe an Mitarbeitende (lesen) ───────────── */

export type SharedFolderFile = {
  id: string;
  name: string;
  type: string;
  sizeBytes: number;
  updatedAt: string;
};

export type SharedFolder = {
  id: string;
  name: string;
  path: string;
  files: SharedFolderFile[];
};

async function resolveSharedAccess(tenantSlug: string) {
  const access = await requireTenantMembership(tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId, status: { not: "former" } },
    select: { id: true },
  });

  if (!employee) {
    return { access, audience: null };
  }

  const [teams, locations] = await Promise.all([
    prisma.tenantTeamMember.findMany({ where: { employeeId: employee.id }, select: { teamId: true } }),
    prisma.tenantLocationMember.findMany({ where: { employeeId: employee.id }, select: { locationId: true } }),
  ]);
  const audience: EmployeeAudience = {
    teamIds: teams.map((row) => row.teamId),
    locationIds: locations.map((row) => row.locationId),
  };

  return { access, audience };
}

async function loadShareableFolders(tenantId: string) {
  return prisma.tenantFileFolder.findMany({
    where: { tenantId, scope: "tenant", status: "active" },
    select: {
      id: true,
      name: true,
      path: true,
      locked: true,
      accessRoleIdsJson: true,
      sharedWithEmployees: true,
      visibleTeamIdsJson: true,
      visibleLocationIdsJson: true,
    },
    orderBy: [{ pinned: "desc" }, { name: "asc" }],
  });
}

/**
 * Für mich freigegebene Ordner der zentralen Ablage samt Dateien (nur die
 * aktuelle Version, Datei-Zugriffsliste beachtet). Ohne verknüpfte
 * Personalakte gibt es keine Freigaben.
 */
export async function getMySharedFolders(tenantSlug: string): Promise<SharedFolder[]> {
  const { access, audience } = await resolveSharedAccess(tenantSlug);

  if (!audience) {
    return [];
  }

  const folders = await loadShareableFolders(access.tenantId);
  const visible = sharedFolderPaths(folders, audience);

  if (visible.size === 0) {
    return [];
  }

  const files = await prisma.tenantFile.findMany({
    where: {
      tenantId: access.tenantId,
      status: "active",
      employeeId: null,
      locationId: null,
      teamId: null,
      folderSlug: { in: [...visible] },
    },
    include: { parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } } },
    orderBy: { displayName: "asc" },
  });
  const allowed = files.filter((file) => canAccessFileAcl(file.parent ?? file, access));

  return folders
    .filter((folder) => visible.has(folder.path))
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      path: folder.path,
      files: allowed
        .filter((file) => file.folderSlug === folder.path)
        .map((file) => ({
          id: file.id,
          name: file.displayName || file.originalName,
          type: (file.extension || file.mimeType.split("/").pop() || "").toUpperCase(),
          sizeBytes: file.sizeBytes,
          updatedAt: (file.updatedAt ?? file.createdAt).toISOString(),
        })),
    }));
}

/** Download einer freigegebenen Datei — dieselben Regeln wie die Liste oben. */
export async function getMySharedFileDownloadUrl(input: { tenantSlug: string; fileId: string }) {
  const { access, audience } = await resolveSharedAccess(input.tenantSlug);
  const file = audience
    ? await prisma.tenantFile.findFirst({
        where: {
          id: input.fileId,
          tenantId: access.tenantId,
          status: "active",
          employeeId: null,
          locationId: null,
          teamId: null,
        },
        include: { parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } } },
      })
    : null;

  if (!file || !audience) {
    throw new Error("Datei nicht gefunden.");
  }

  const folders = await loadShareableFolders(access.tenantId);

  if (!sharedFolderPaths(folders, audience).has(file.folderSlug) || !canAccessFileAcl(file.parent ?? file, access)) {
    throw new Error("Datei nicht gefunden.");
  }

  return createReadSignedUrl({
    bucket: file.bucket,
    key: file.storageKey,
    fileName: file.displayName,
    disposition: "attachment",
    contentType: file.mimeType,
  });
}
