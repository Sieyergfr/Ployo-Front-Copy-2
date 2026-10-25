"use client";

import { useMemo, useState } from "react";
import FilesBrowser from "@/components/FilesBrowser";
import PaginationControls from "@/components/PaginationControls";
import type { FileFolder, FileItem, FileUploadOptions } from "@/lib/files";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

const RECENT_COUNT = 8;

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
  canManageAccess,
}: {
  /** Direkte Unterordner der aktuellen Ansicht. */
  folders: FileFolder[];
  /** Alle Dateien des aktuellen Ordners/Bereichs, unpaginiert — Grundlage für die Suche. */
  visibleFiles: FileItem[];
  /** Serverseitig bereits paginierte aktuelle Seite — Standardanzeige im geöffneten Ordner. */
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
  canManageAccess?: boolean;
}) {
  const t = useTranslations("FilesUi");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const isFiltering = normalizedQuery !== "";
  const breadcrumb = useMemo(() => {
    if (!activeFolder) return [];

    const parts = (activeFolder.path ?? activeFolder.slug).split("/");

    return parts.map((_part, index) => {
      const path = parts.slice(0, index + 1).join("/");

      return { path, name: folderOptions?.find((folder) => (folder.path ?? folder.slug) === path)?.name ?? parts[index] };
    });
  }, [activeFolder, folderOptions]);

  const filteredFolders = useMemo(
    () =>
      isFiltering
        ? folders.filter((folder) => [folder.name, folder.owner].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery))
        : folders,
    [folders, isFiltering, normalizedQuery],
  );

  const filteredFiles = useMemo(() => {
    if (isFiltering) {
      return visibleFiles.filter((file) =>
        [file.name, file.folder, file.type, file.documentType, file.owner, file.assignedEmployee, file.assignedLocation]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      );
    }

    // Wurzel: "Zuletzt hinzugefügt" über alle Ordner; im Ordner die aktuelle Seite.
    return activeFolder ? filePageItems : visibleFiles.slice(0, RECENT_COUNT);
  }, [visibleFiles, filePageItems, isFiltering, normalizedQuery, activeFolder]);

  const rootFiles = !activeFolder && !isFiltering ? visibleFiles.filter((file) => file.folderSlug === "") : undefined;

  return (
    <>
      <FilesBrowser
        folders={filteredFolders}
        files={filteredFiles}
        rootFiles={rootFiles}
        activeFolder={activeFolder}
        breadcrumb={breadcrumb}
        baseHref={baseHref}
        tenant={tenant}
        currentFolderPath={currentFolderPath}
        folderOptions={folderOptions}
        uploadOptions={uploadOptions}
        canManageFiles={canManageFiles}
        canDeleteFiles={canDeleteFiles}
        canManageReminders={canManageReminders}
        canManageAccess={canManageAccess}
        emptyFilesLabel={isFiltering ? t("noSearchResults") : undefined}
        toolbar={
          <label className="relative block w-full max-w-[300px]">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#9a9a96]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={activeFolder ? t("searchInFolder") : t("searchAll")}
              aria-label={activeFolder ? t("searchInFolder") : t("searchAll")}
              className="db-input box-border h-10 w-full rounded-[10px] border border-[#e4e3df] bg-white pr-3 pl-9 text-[13.5px]"
            />
          </label>
        }
      />

      {!isFiltering && activeFolder && (
        <PaginationControls
          page={pageInfo.page}
          pageCount={pageInfo.pageCount}
          total={pageInfo.total}
          pageSize={pageInfo.pageSize}
          basePath={`${baseHref}/${activeFolder.path ?? activeFolder.slug}`}
        />
      )}
    </>
  );
}
