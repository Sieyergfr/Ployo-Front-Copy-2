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
import { requireTenantAccess } from "@/lib/tenant-access";

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

export async function getFilesPageData(tenantSlug: string, path: string[] = []) {
  const tenant = await requireTenantAccess(tenantSlug, "files", "read");
  const tenantFileRecords = await prisma.tenantFile.findMany({
        where: {
          tenantId: tenant.tenantId,
          employeeId: null,
          locationId: null,
          status: "active",
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
      label: "Geschuetzt",
      value: storedFiles.filter((file) => file.locked || file.storageFileId).length.toString(),
      caption: "eingeschraenkte Zugriffe",
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
    currentFolderPath,
    folderOptions,
    folders,
    files: storedFiles,
    metrics,
    uploadOptions,
    visibleFiles,
  };
}
