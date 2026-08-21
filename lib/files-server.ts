import "server-only";

import { canAccessFileAcl } from "@/lib/file-access";
import {
  formatUpdatedAt,
  mapTenantFileToFileItem,
  type FileFolder,
  type FileUploadOptions,
  type ReminderFileBrowserData,
  type ReminderFileBrowserSource,
} from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { requireTenantAccess, resolveScopeFilter } from "@/lib/tenant-access";

type TenantFileFolderRecord = {
  id: string;
  name: string;
  slug: string;
  path: string;
  parentId: string | null;
  ownerName: string;
  locked: boolean;
  updatedAt: Date;
  createdAt: Date;
};

/** Zuletzt aktualisierte Unternehmensdateien (ACL-gefiltert) fürs Dashboard. */
export async function getRecentTenantFiles(tenantSlug: string, limit = 4) {
  const tenant = await requireTenantAccess(tenantSlug, "files", "read");
  const records = await prisma.tenantFile.findMany({
    where: {
      tenantId: tenant.tenantId,
      employeeId: null,
      locationId: null,
      status: "active",
    },
    orderBy: { updatedAt: "desc" },
    // Puffer, weil die ACL-Filterung Einträge entfernen kann.
    take: limit * 3,
    include: {
      parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } },
    },
  });

  return records
    .filter((file) => canAccessFileAcl(file.parent ?? file, tenant))
    .slice(0, limit)
    .map(mapTenantFileToFileItem);
}

export async function getFileUploadOptions(
  tenantSlug: string,
): Promise<FileUploadOptions> {
  const tenant = await requireTenantAccess(tenantSlug, "files", "read");

  const [employees, locations, roles, memberships] = await Promise.all([
    prisma.tenantEmployee.findMany({
      where: { tenantId: tenant.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tenantLocation.findMany({
      where: { tenantId: tenant.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tenantRole.findMany({
      where: { tenantId: tenant.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tenantMembership.findMany({
      where: { tenantId: tenant.tenantId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  return {
    employees,
    locations,
    roles,
    users: memberships.map((membership) => ({
      id: membership.user.id,
      name: membership.user.name || membership.user.email,
    })),
  };
}

function getReminderFileSource(record: {
  employeeId: string | null;
  locationId: string | null;
}): ReminderFileBrowserSource {
  if (record.employeeId) {
    return "employee";
  }

  if (record.locationId) {
    return "location";
  }

  return "central";
}

function getReminderFileOwner(record: {
  employeeId: string | null;
  locationId: string | null;
  employee?: { name: string } | null;
  location?: { name: string } | null;
}) {
  if (record.employeeId) {
    return {
      ownerId: record.employeeId,
      ownerName: record.employee?.name ?? "Mitarbeiter",
    };
  }

  if (record.locationId) {
    return {
      ownerId: record.locationId,
      ownerName: record.location?.name ?? "Standort",
    };
  }

  return {
    ownerId: "central",
    ownerName: "Zentral",
  };
}

export async function getReminderFileBrowserData(
  tenantSlug: string,
): Promise<ReminderFileBrowserData> {
  const tenant = await requireTenantAccess(tenantSlug, "files", "read");

  const [files, folders] = await Promise.all([
    prisma.tenantFile.findMany({
      where: { tenantId: tenant.tenantId, status: "active" },
      orderBy: { updatedAt: "desc" },
      include: {
        employee: { select: { name: true } },
        location: { select: { name: true } },
        parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } },
      },
    }),
    prisma.tenantFileFolder.findMany({
      where: { tenantId: tenant.tenantId, status: "active" },
      orderBy: { name: "asc" },
      include: {
        employee: { select: { name: true } },
        location: { select: { name: true } },
      },
    }),
  ]);

  const browserFiles = files.filter((file) => canAccessFileAcl(file.parent ?? file, tenant)).map((file) => {
    const owner = getReminderFileOwner(file);
    const item = mapTenantFileToFileItem(file);

    return {
      id: file.id,
      name: item.name,
      type: item.type,
      source: getReminderFileSource(file),
      ownerId: owner.ownerId,
      ownerName: owner.ownerName,
      folderSlug: file.folderSlug,
      folderName: file.folderName,
      updatedAt: item.updatedAt,
      size: item.size,
    };
  });

  const browserFolders = folders.map((folder) => {
    const owner = getReminderFileOwner(folder);
    const source = getReminderFileSource(folder);

    return {
      id: folder.id,
      name: folder.name,
      path: folder.path,
      source,
      ownerId: owner.ownerId,
      ownerName: owner.ownerName,
      fileCount: browserFiles.filter(
        (file) =>
          file.source === source &&
          file.ownerId === owner.ownerId &&
          file.folderSlug === folder.path,
      ).length,
    };
  });

  return {
    files: browserFiles,
    folders: browserFolders,
  };
}

/**
 * Übersetzt den "files"-Scope (own/team/all) für das eigenständige
 * Dateien-Modul in einen zusätzlichen `where`-Filter auf `uploadedById`.
 * "own" zeigt nur selbst hochgeladene Dateien, "team" nur Dateien, die von
 * jemandem aus dem eigenen Team hochgeladen wurden (analog zum "team"-Scope
 * anderer Bereiche — Namensabgleich über die eigene Personalakte). Team-
 * *gebundene* Dateien (TenantFile.teamId, z. B. über die Team-Detailseite
 * hochgeladen) laufen separat über `team-service.ts` und werden hier
 * bewusst ausgeklammert (employeeId/locationId/teamId alle null), analog zum
 * bestehenden Verhalten für Personalakte-/Standort-Dateien.
 */
async function filesUploaderScopeWhere(tenant: Awaited<ReturnType<typeof requireTenantAccess>>) {
  const scopeFilter = await resolveScopeFilter(tenant);

  if (scopeFilter.type === "own") {
    return { uploadedById: tenant.userId };
  }

  if (scopeFilter.type === "team") {
    if (!scopeFilter.team) {
      return { uploadedById: "__none__" };
    }

    const teammates = await prisma.tenantEmployee.findMany({
      where: { tenantId: tenant.tenantId, team: scopeFilter.team, userId: { not: null } },
      select: { userId: true },
    });
    const teammateUserIds = teammates
      .map((employee) => employee.userId)
      .filter((id): id is string => Boolean(id));

    return { uploadedById: { in: teammateUserIds.length ? teammateUserIds : ["__none__"] } };
  }

  return {};
}

export type OwnerScopedFileOwnerType = "employee" | "location" | "team";

/**
 * Antwortform der owner-skopierten Dateiliste. Bewusst nicht `FileItem`:
 * dessen `updatedAt`/`size` sind bereits deutsch formatierte Anzeigetexte,
 * während ein API-Client ISO-Datum und Bytes braucht.
 */
export type OwnerFileItem = {
  id: string;
  name: string;
  documentType: string;
  description?: string;
  folder: string;
  sizeBytes: number;
  mimeType: string;
  /** ISO-8601 */
  updatedAt: string;
  version: number;
};

/**
 * Dateien, die an einem Mitarbeiter/Standort/Team hängen — die Gegenrichtung
 * zu `getFilesPageData`, das ausdrücklich **nur** die zentrale Ablage
 * (employeeId/locationId/teamId alle null) liefert. Ohne diese Funktion
 * bekäme ein Client, der `ownerType`/`ownerId` mitschickt, still die zentrale
 * Ablage zurück statt der Akte, die er angefragt hat.
 *
 * Rechte wie beim Upload derselben Dateien (storage.service.ts): `files:read`
 * **und** Leserecht im Fachbereich des Eigentümers, dazu Datei-ACL und der
 * `files`-Scope auf den Uploader.
 */
export async function getOwnerFiles(input: {
  tenantSlug: string;
  ownerType: OwnerScopedFileOwnerType;
  ownerId: string;
}): Promise<OwnerFileItem[]> {
  const tenant = await requireTenantAccess(input.tenantSlug, "files", "read");
  const area =
    input.ownerType === "employee"
      ? "employees"
      : input.ownerType === "location"
        ? "locations"
        : "teams";

  await requireTenantAccess(input.tenantSlug, area, "read");

  const uploaderScopeWhere = await filesUploaderScopeWhere(tenant);
  const records = await prisma.tenantFile.findMany({
    where: {
      tenantId: tenant.tenantId,
      employeeId: input.ownerType === "employee" ? input.ownerId : undefined,
      locationId: input.ownerType === "location" ? input.ownerId : undefined,
      teamId: input.ownerType === "team" ? input.ownerId : undefined,
      status: "active",
      ...uploaderScopeWhere,
    },
    orderBy: { updatedAt: "desc" },
    include: {
      parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } },
    },
  });

  return records
    .filter((file) => canAccessFileAcl(file.parent ?? file, tenant))
    .map((file) => ({
      id: file.id,
      name: file.displayName || file.originalName,
      documentType: file.documentType || "Sonstiges",
      description: file.description || undefined,
      folder: file.folderName,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
      updatedAt: (file.updatedAt ?? file.createdAt).toISOString(),
      version: file.version,
    }));
}

export async function getFilesPageData(tenantSlug: string, path: string[] = []) {
  const tenant = await requireTenantAccess(tenantSlug, "files", "read");
  const uploaderScopeWhere = await filesUploaderScopeWhere(tenant);
  const tenantFileRecords = await prisma.tenantFile.findMany({
        where: {
          tenantId: tenant.tenantId,
          employeeId: null,
          locationId: null,
          teamId: null,
          status: "active",
          ...uploaderScopeWhere,
        },
        orderBy: { updatedAt: "desc" },
        include: {
          parent: { select: { accessRoleIdsJson: true, accessUserIdsJson: true } },
        },
      });
  const tenantFolders: TenantFileFolderRecord[] = await prisma.tenantFileFolder.findMany({
        where: {
          tenantId: tenant.tenantId,
          employeeId: null,
          locationId: null,
          teamId: null,
          scope: "tenant",
          status: "active",
        },
        orderBy: { name: "asc" },
      });
  const storedFiles = tenantFileRecords
    .filter((file) => canAccessFileAcl(file.parent ?? file, tenant))
    .map(mapTenantFileToFileItem);
  const uploadOptions = await getFileUploadOptions(tenantSlug);
  const activeFile =
    path.length === 1
      ? storedFiles.find(
          (file) => file.folderSlug === "" && file.slug === path[0],
        )
      : path.length >= 2
        ? storedFiles.find(
            (file) =>
              file.folderSlug === path.slice(0, -1).join("/") &&
              file.slug === path.at(-1),
          )
        : undefined;
  const currentFolderPath =
    !activeFile && path.length > 0 && !path.at(-1)?.includes(".")
      ? path.join("/")
      : "";
  const activeFolderRecord = currentFolderPath
    ? tenantFolders.find((folder) => folder.path === currentFolderPath)
    : undefined;
  const folderOptions: FileFolder[] = tenantFolders.map((folder) => ({
    slug: folder.path,
    path: folder.path,
    name: folder.name,
    owner: folder.ownerName,
    updatedAt: formatUpdatedAt(folder.updatedAt ?? folder.createdAt),
    locked: folder.locked,
    fileCount: storedFiles.filter((file) => file.folderSlug === folder.path).length,
  }));
  const folderMap = new Map<string, FileFolder>();
  const childPrefix = currentFolderPath ? `${currentFolderPath}/` : "";

  for (const folder of tenantFolders) {
    const isDirectChild = currentFolderPath
      ? folder.path.startsWith(childPrefix) &&
        folder.path.slice(childPrefix.length).split("/").length === 1
      : !folder.path.includes("/");

    if (!isDirectChild) {
      continue;
    }

    folderMap.set(folder.path, {
      slug: folder.path,
      path: folder.path,
      name: folder.name,
      owner: folder.ownerName,
      updatedAt: formatUpdatedAt(folder.updatedAt ?? folder.createdAt),
      locked: folder.locked,
      fileCount: storedFiles.filter((file) => file.folderSlug === folder.path).length,
    });
  }

  const folders = Array.from(folderMap.values());
  const activeFolder = activeFolderRecord
    ? {
        slug: activeFolderRecord.path,
        path: activeFolderRecord.path,
        name: activeFolderRecord.name,
        owner: activeFolderRecord.ownerName,
        updatedAt: formatUpdatedAt(activeFolderRecord.updatedAt),
        locked: activeFolderRecord.locked,
        fileCount: storedFiles.filter(
          (file) => file.folderSlug === activeFolderRecord.path,
        ).length,
      }
    : undefined;
  const visibleFiles = activeFolder
    ? storedFiles.filter((file) => file.folderSlug === activeFolder.slug)
    : storedFiles.filter((file) => file.folderSlug === "");
  const activeFileParentFolder =
    activeFile && activeFile.folderSlug
      ? tenantFolders.find((folder) => folder.path === activeFile.folderSlug)
      : undefined;
  const metrics = [
    {
      label: "Ordner",
      value: folders.length.toString(),
      caption: "strukturierte Ablage",
    },
    {
      label: "Dateien",
      value: storedFiles.length.toString(),
      caption: "aktive Dateien",
    },
    {
      label: "Geschützt",
      value: storedFiles.filter((file) => file.locked || file.storageFileId).length.toString(),
      caption: "eingeschränkte Zugriffe",
    },
    {
      label: "Uploads",
      value: storedFiles.length.toString(),
      caption: "aus Storage",
    },
  ];

  return {
    activeFile,
    activeFolder,
    activeFileParentFolder: activeFileParentFolder
      ? {
          path: activeFileParentFolder.path,
          name: activeFileParentFolder.name,
          locked: activeFileParentFolder.locked,
        }
      : undefined,
    currentFolderPath,
    folderOptions,
    folders,
    files: storedFiles,
    metrics,
    uploadOptions,
    visibleFiles,
  };
}
