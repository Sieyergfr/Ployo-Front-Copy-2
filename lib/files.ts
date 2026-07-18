export type FileFolder = {
  slug: string;
  path?: string;
  name: string;
  fileCount: number;
  owner: string;
  updatedAt: string;
  locked?: boolean;
};

export type FileItem = {
  slug: string;
  name: string;
  folder: string;
  folderSlug: string;
  owner: string;
  updatedAt: string;
  size: string;
  type: string;
  locked?: boolean;
  version: number;
  expiresAt?: string;
  accessRoles: string[];
  employeeOverrides: string[];
  reminder?: string;
  storageFileId?: string;
  uploadedByName: string;
  uploadedAt: string;
  documentType: string;
  validFrom?: string;
  description?: string;
  tags: string[];
  assignedEmployee?: string;
  assignedLocation?: string;
  accessUsers: string[];
};

export type FileUploadOption = {
  id: string;
  name: string;
};

export type FileUploadOptions = {
  employees: FileUploadOption[];
  locations: FileUploadOption[];
  roles: FileUploadOption[];
  users: FileUploadOption[];
};

export type ReminderFileBrowserSource = "central" | "employee" | "location";

export type ReminderFileBrowserFile = {
  id: string;
  name: string;
  type: string;
  source: ReminderFileBrowserSource;
  ownerId: string;
  ownerName: string;
  folderSlug: string;
  folderName: string;
  updatedAt: string;
  size: string;
};

export type ReminderFileBrowserFolder = {
  id: string;
  name: string;
  path: string;
  source: ReminderFileBrowserSource;
  ownerId: string;
  ownerName: string;
  fileCount: number;
};

export type ReminderFileBrowserData = {
  files: ReminderFileBrowserFile[];
  folders: ReminderFileBrowserFolder[];
};

export type FileVersion = {
  version: number;
  uploadedAt: string;
  uploadedBy: string;
  note: string;
  downloadName: string;
  downloadHref: string;
};

export const fileFolders: FileFolder[] = [];

export const files: FileItem[] = [];

export const fileMetrics = [
  {
    label: "Ordner",
    value: "0",
    caption: "strukturierte Ablage",
  },
  {
    label: "Dateien",
    value: "0",
    caption: "aktive Dateien",
  },
  {
    label: "Geschuetzt",
    value: "0",
    caption: "eingeschraenkte Zugriffe",
  },
  {
    label: "Uploads",
    value: "0",
    caption: "aus Storage",
  },
];

export function getFileFolderByPath() {
  return undefined;
}

export function getFilesByFolderSlug() {
  return files;
}

export function getFileByPath() {
  return undefined;
}

export function getFileDownloadName(file: FileItem, version = file.version) {
  const extensionIndex = file.name.lastIndexOf(".");

  if (extensionIndex === -1) {
    return `${file.name}-v${version}`;
  }

  const baseName = file.name.slice(0, extensionIndex);
  const extension = file.name.slice(extensionIndex);

  return `${baseName}-v${version}${extension}`;
}

export function getFileDownloadHref(file: FileItem, version = file.version) {
  const content = [
    `Ployo Download: ${file.name}`,
    `Version: ${version}`,
    `Ordner: ${file.folder}`,
    `Verantwortlich: ${file.owner}`,
    `Stand: ${version === file.version ? file.updatedAt : "Archivierte Version"}`,
  ].join("\n");

  return `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
}

export function getFileVersions(file: FileItem): FileVersion[] {
  return Array.from({ length: file.version }, (_, index) => {
    const version = file.version - index;

    return {
      version,
      uploadedAt:
        version === file.version
          ? file.updatedAt
          : `${Math.max(10, 28 - version)}.06. - 14:${10 + version}`,
      uploadedBy: version === 1 ? "System Import" : file.owner,
      note: version === file.version ? "Aktuelle Version" : "Vorherige Version",
      downloadName: getFileDownloadName(file, version),
      downloadHref: getFileDownloadHref(file, version),
    };
  });
}

type TenantFileRecord = {
  id: string;
  displayName: string;
  originalName: string;
  folderName: string;
  folderSlug: string;
  ownerName: string;
  updatedAt: Date;
  createdAt: Date;
  sizeBytes: number;
  mimeType: string;
  extension: string;
  version: number;
  uploadedByName?: string;
  documentType?: string;
  validFrom?: string;
  expiresAt?: string;
  reminderAt?: string;
  description?: string;
  tagsJson?: string;
  assignedEmployeeName?: string;
  assignedLocationName?: string;
  accessRoleNamesJson?: string;
  accessUserNamesJson?: string;
};

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

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 102.4) / 10} KB`;
  }

  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}

function formatUpdatedAt(value: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function parseStringArray(value?: string) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function mapTenantFileToFileItem(record: TenantFileRecord): FileItem {
  const type =
    record.extension.toUpperCase() ||
    record.mimeType.split("/").pop()?.toUpperCase() ||
    "DATEI";

  return {
    slug: record.id,
    name: record.displayName || record.originalName,
    folder: record.folderName,
    folderSlug: record.folderSlug,
    owner: record.ownerName,
    updatedAt: formatUpdatedAt(record.updatedAt ?? record.createdAt),
    size: formatBytes(record.sizeBytes),
    type,
    version: record.version,
    expiresAt: record.expiresAt || undefined,
    accessRoles: parseStringArray(record.accessRoleNamesJson),
    employeeOverrides: [],
    reminder: record.reminderAt || undefined,
    storageFileId: record.id,
    uploadedByName: record.uploadedByName || record.ownerName,
    uploadedAt: formatUpdatedAt(record.createdAt),
    documentType: record.documentType || "Sonstiges",
    validFrom: record.validFrom || undefined,
    description: record.description || undefined,
    tags: parseStringArray(record.tagsJson),
    assignedEmployee: record.assignedEmployeeName || undefined,
    assignedLocation: record.assignedLocationName || undefined,
    accessUsers: parseStringArray(record.accessUserNamesJson),
  };
}

export async function getFileUploadOptions(
  tenantSlug: string,
): Promise<FileUploadOptions> {
  const { prisma } = await import("@/lib/prisma");
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });

  if (!tenant) {
    return { employees: [], locations: [], roles: [], users: [] };
  }

  const [employees, locations, roles, memberships] = await Promise.all([
    prisma.tenantEmployee.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tenantLocation.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tenantRole.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tenantMembership.findMany({
      where: { tenantId: tenant.id },
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
  const { prisma } = await import("@/lib/prisma");
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });

  if (!tenant) {
    return { files: [], folders: [] };
  }

  const [files, folders] = await Promise.all([
    prisma.tenantFile.findMany({
      where: { tenantId: tenant.id, status: "active" },
      orderBy: { updatedAt: "desc" },
      include: {
        employee: { select: { name: true } },
        location: { select: { name: true } },
      },
    }),
    prisma.tenantFileFolder.findMany({
      where: { tenantId: tenant.id, status: "active" },
      orderBy: { name: "asc" },
      include: {
        employee: { select: { name: true } },
        location: { select: { name: true } },
      },
    }),
  ]);

  const browserFiles = files.map((file) => {
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
  const { prisma } = await import("@/lib/prisma");
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });
  const tenantFiles = tenant
    ? await prisma.tenantFile.findMany({
        where: {
          tenantId: tenant.id,
          employeeId: null,
          locationId: null,
          status: "active",
        },
        orderBy: { updatedAt: "desc" },
      })
    : [];
  const tenantFolders: TenantFileFolderRecord[] = tenant
    ? await prisma.tenantFileFolder.findMany({
        where: {
          tenantId: tenant.id,
          employeeId: null,
          locationId: null,
          scope: "tenant",
          status: "active",
        },
        orderBy: { name: "asc" },
      })
    : [];
  const storedFiles = tenantFiles.map(mapTenantFileToFileItem);
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
