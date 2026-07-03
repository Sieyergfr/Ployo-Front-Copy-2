export type FileFolder = {
  slug: string;
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
};

export type FileVersion = {
  version: number;
  uploadedAt: string;
  uploadedBy: string;
  note: string;
  downloadName: string;
  downloadHref: string;
};

export const fileFolders: FileFolder[] = [
  {
    slug: "personalakten",
    name: "Personalakten",
    fileCount: 42,
    owner: "HR",
    updatedAt: "heute \u00b7 10:22",
    locked: true,
  },
  {
    slug: "arbeitsvertraege",
    name: "Arbeitsvertr\u00e4ge",
    fileCount: 18,
    owner: "HR",
    updatedAt: "gestern \u00b7 16:40",
    locked: true,
  },
  {
    slug: "standorte",
    name: "Standorte",
    fileCount: 21,
    owner: "Operations",
    updatedAt: "24.06. \u00b7 09:15",
  },
  {
    slug: "schichtplaene",
    name: "Schichtpl\u00e4ne",
    fileCount: 12,
    owner: "Planung",
    updatedAt: "23.06. \u00b7 13:08",
  },
  {
    slug: "richtlinien",
    name: "Richtlinien",
    fileCount: 9,
    owner: "Compliance",
    updatedAt: "18.06. \u00b7 11:30",
  },
  {
    slug: "vorlagen",
    name: "Vorlagen",
    fileCount: 15,
    owner: "Backoffice",
    updatedAt: "12.06. \u00b7 08:50",
  },
];

export const files: FileItem[] = [
  {
    slug: "arbeitsvertrag-sophie-wagner",
    name: "Arbeitsvertrag Sophie Wagner.pdf",
    folder: "Arbeitsvertr\u00e4ge",
    folderSlug: "arbeitsvertraege",
    owner: "Carla Brandt",
    updatedAt: "heute \u00b7 10:22",
    size: "740 KB",
    type: "PDF",
    locked: true,
    version: 3,
    expiresAt: "01.03.2031",
    accessRoles: ["HR-Leitung", "Lohnbuchhaltung"],
    employeeOverrides: ["Sophie Wagner"],
    reminder: "Vertragsprüfung 01.02.2031",
  },
  {
    slug: "schichtplan-kw-27",
    name: "Schichtplan KW 27.pdf",
    folder: "Schichtpl\u00e4ne",
    folderSlug: "schichtplaene",
    owner: "Thomas Berger",
    updatedAt: "heute \u00b7 09:14",
    size: "428 KB",
    type: "PDF",
    version: 2,
    expiresAt: "07.07.2026",
    accessRoles: ["HR-Leitung", "Teamleitung"],
    employeeOverrides: [],
    reminder: "Plan archivieren nach KW 27",
  },
  {
    slug: "onboarding-checkliste",
    name: "Onboarding Checkliste.docx",
    folder: "Vorlagen",
    folderSlug: "vorlagen",
    owner: "Carla Brandt",
    updatedAt: "gestern \u00b7 15:02",
    size: "62 KB",
    type: "DOCX",
    version: 5,
    accessRoles: ["HR-Leitung", "Teamleitung"],
    employeeOverrides: [],
  },
  {
    name: "Brandschutzordnung München.pdf",
    slug: "brandschutzordnung-muenchen",
    folder: "Standorte",
    folderSlug: "standorte",
    owner: "Thomas Berger",
    updatedAt: "gestern \u00b7 14:05",
    size: "1.2 MB",
    type: "PDF",
    locked: true,
    version: 4,
    expiresAt: "31.12.2026",
    accessRoles: ["HR-Leitung", "Operations"],
    employeeOverrides: ["Thomas Berger"],
    reminder: "Brandschutzordnung erneuern",
  },
  {
    name: "Inventarliste Juni.xlsx",
    slug: "inventarliste-juni",
    folder: "Standorte",
    folderSlug: "standorte",
    owner: "Operations",
    updatedAt: "24.06. \u00b7 16:20",
    size: "86 KB",
    type: "XLSX",
    version: 1,
    accessRoles: ["Operations"],
    employeeOverrides: [],
  },
  {
    name: "Urlaubsrichtlinie 2026.pdf",
    slug: "urlaubsrichtlinie-2026",
    folder: "Richtlinien",
    folderSlug: "richtlinien",
    owner: "Compliance",
    updatedAt: "18.06. \u00b7 11:30",
    size: "510 KB",
    type: "PDF",
    version: 2,
    expiresAt: "31.12.2026",
    accessRoles: ["Alle Mitarbeiter"],
    employeeOverrides: [],
    reminder: "Richtlinie für 2027 vorbereiten",
  },
];

export const fileMetrics = [
  {
    label: "Ordner",
    value: fileFolders.length.toString(),
    caption: "strukturierte Ablage",
  },
  {
    label: "Dateien",
    value: files.length.toString(),
    caption: "zuletzt synchronisiert",
  },
  {
    label: "Geschützt",
    value: files.filter((file) => file.locked).length.toString(),
    caption: "eingeschr\u00e4nkte Zugriffe",
  },
  {
    label: "Uploads",
    value: "3",
    caption: "diese Woche",
  },
];

export function getFileFolderByPath(path: string[] = []) {
  if (path.length !== 1) {
    return undefined;
  }

  return fileFolders.find((folder) => folder.slug === path[0]);
}

export function getFilesByFolderSlug(folderSlug?: string) {
  if (!folderSlug) {
    return files;
  }

  return files.filter((file) => file.folderSlug === folderSlug);
}

export function getFileByPath(path: string[] = []) {
  if (path.length !== 2) {
    return undefined;
  }

  return files.find(
    (file) => file.folderSlug === path[0] && file.slug === path[1],
  );
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
          : `${Math.max(10, 28 - version)}.06. · 14:${10 + version}`,
      uploadedBy: version === 1 ? "System Import" : file.owner,
      note: version === file.version ? "Aktuelle Version" : "Vorherige Version",
      downloadName: getFileDownloadName(file, version),
      downloadHref: getFileDownloadHref(file, version),
    };
  });
}
