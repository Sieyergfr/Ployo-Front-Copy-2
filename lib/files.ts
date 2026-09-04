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

export type ReminderFileBrowserSource = "central" | "employee" | "location" | "team";

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
    label: "Geschützt",
    value: "0",
    caption: "eingeschränkte Zugriffe",
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
  tagsJson?: unknown;
  assignedEmployeeName?: string;
  assignedLocationName?: string;
  accessRoleNamesJson?: unknown;
  accessUserNamesJson?: unknown;
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

export function formatUpdatedAt(value: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function parseStringArray(value?: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
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

