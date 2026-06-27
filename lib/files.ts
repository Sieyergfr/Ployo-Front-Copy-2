export type FileFolder = {
  slug: string;
  name: string;
  fileCount: number;
  owner: string;
  updatedAt: string;
  locked?: boolean;
};

export type FileItem = {
  name: string;
  folder: string;
  folderSlug: string;
  owner: string;
  updatedAt: string;
  size: string;
  type: string;
  locked?: boolean;
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
    name: "Arbeitsvertrag Sophie Wagner.pdf",
    folder: "Arbeitsvertr\u00e4ge",
    folderSlug: "arbeitsvertraege",
    owner: "Carla Brandt",
    updatedAt: "heute \u00b7 10:22",
    size: "740 KB",
    type: "PDF",
    locked: true,
  },
  {
    name: "Schichtplan KW 27.pdf",
    folder: "Schichtpl\u00e4ne",
    folderSlug: "schichtplaene",
    owner: "Thomas Berger",
    updatedAt: "heute \u00b7 09:14",
    size: "428 KB",
    type: "PDF",
  },
  {
    name: "Onboarding Checkliste.docx",
    folder: "Vorlagen",
    folderSlug: "vorlagen",
    owner: "Carla Brandt",
    updatedAt: "gestern \u00b7 15:02",
    size: "62 KB",
    type: "DOCX",
  },
  {
    name: "Brandschutzordnung M\u00fcnchen.pdf",
    folder: "Standorte",
    folderSlug: "standorte",
    owner: "Thomas Berger",
    updatedAt: "gestern \u00b7 14:05",
    size: "1.2 MB",
    type: "PDF",
    locked: true,
  },
  {
    name: "Inventarliste Juni.xlsx",
    folder: "Standorte",
    folderSlug: "standorte",
    owner: "Operations",
    updatedAt: "24.06. \u00b7 16:20",
    size: "86 KB",
    type: "XLSX",
  },
  {
    name: "Urlaubsrichtlinie 2026.pdf",
    folder: "Richtlinien",
    folderSlug: "richtlinien",
    owner: "Compliance",
    updatedAt: "18.06. \u00b7 11:30",
    size: "510 KB",
    type: "PDF",
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
    label: "Gesch\u00fctzt",
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
