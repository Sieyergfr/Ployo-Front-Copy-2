"use client";

import { useMemo, useState } from "react";
import FilesBrowser from "@/components/FilesBrowser";
import { ListSearchBox } from "@/components/ListSearchBox";
import PaginationControls from "@/components/PaginationControls";
import type { FileFolder, FileItem, FileUploadOptions } from "@/lib/files";
import { useTranslations } from "next-intl";

export function FilesListClient({
  folders,
  visibleFiles,
  filePageItems,
  pageInfo,
  activeFolder,
  baseHref,
  tenant,
  currentFolderPath,
  folderOptions,
  uploadOptions,
  canManageFiles,
  canDeleteFiles,
  canManageReminders,
}: {
  /** Alle Ordner der aktuellen Ansicht (Root-Ebene) — leer, solange ein Ordner geöffnet ist. */
  folders: FileFolder[];
  /** Alle Dateien des aktuellen Ordners/Bereichs, unpaginiert — Grundlage für die Suche. */
  visibleFiles: FileItem[];
  /** Serverseitig bereits paginierte aktuelle Seite — Standardanzeige ohne aktive Suche. */
  filePageItems: FileItem[];
  pageInfo: { page: number; pageCount: number; total: number; pageSize: number };
  activeFolder?: FileFolder;
  baseHref: string;
  tenant: string;
  currentFolderPath?: string;
  folderOptions?: FileFolder[];
  uploadOptions?: FileUploadOptions;
  canManageFiles?: boolean;
  canDeleteFiles?: boolean;
  canManageReminders?: boolean;
}) {
  const t = useTranslations("FilesListClient");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const isFiltering = normalizedQuery !== "";

  const filteredFolders = useMemo(() => {
    if (!isFiltering) {
      return folders;
    }

    return folders.filter((folder) =>
      [folder.name, folder.owner].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery),
    );
  }, [folders, isFiltering, normalizedQuery]);

  const filteredFiles = useMemo(() => {
    if (!isFiltering) {
      return filePageItems;
    }

    return visibleFiles.filter((file) =>
      [file.name, file.folder, file.type, file.documentType, file.owner, file.assignedEmployee, file.assignedLocation]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [visibleFiles, filePageItems, isFiltering, normalizedQuery]);

  return (
    <>
      <ListSearchBox
        value={query}
        onChange={setQuery}
        placeholder={activeFolder ? t("searchPlaceholderInFolder") : t("searchPlaceholderRoot")}
        className="mb-4 max-w-[360px]"
      />

      <FilesBrowser
        folders={filteredFolders}
        files={filteredFiles}
        activeFolder={activeFolder}
        baseHref={baseHref}
        tenant={tenant}
        currentFolderPath={currentFolderPath}
        folderOptions={folderOptions}
        uploadOptions={uploadOptions}
        canManageFiles={canManageFiles}
        canDeleteFiles={canDeleteFiles}
        canManageReminders={canManageReminders}
        emptyFilesLabel={isFiltering ? t("noSearchResults") : undefined}
      />

      {!isFiltering && (
        <PaginationControls
          page={pageInfo.page}
          pageCount={pageInfo.pageCount}
          total={pageInfo.total}
          pageSize={pageInfo.pageSize}
          basePath={activeFolder ? `${baseHref}/${activeFolder.path ?? activeFolder.slug}` : baseHref}
        />
      )}
    </>
  );
}
