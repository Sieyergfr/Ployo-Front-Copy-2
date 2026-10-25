"use client";

import { updateFolderSettingsAction } from "@/app/(dashboard)/u/[tenant]/dateien/actions";
import { FileReminderButton } from "@/components/ActionDrawers";
import { DbMenu, dbMenuItemClass } from "@/components/dashboard/DbMenu";
import {
  FolderSettingsDrawer,
  MoveFileModal,
  RenameFileModal,
  RenameFolderModal,
} from "@/components/dashboard/files/FileDialogs";
import { DbCard } from "@/components/dashboard/ui";
import {
  CreateFolderButton,
  FileDownloadButton,
  FileSoftDeleteButton,
  VersionUploadButton,
} from "@/components/FileActionButtons";
import { DeleteFolderButton } from "@/components/FileTrash";
import { FilesDropZone } from "@/components/OwnerFilesTab";
import { useActionStateWithToast } from "@/components/Toasts";
import type { FileFolder, FileItem, FileUploadOptions } from "@/lib/files";
import { ChevronRight, Eye, Folder, Lock, Pin, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type T = ReturnType<typeof useTranslations>;
type Option = { id: string; name: string };

const typeColors: Record<string, [string, string]> = {
  PDF: ["#b4332a", "rgba(180,51,42,0.08)"],
  XLSX: ["#1d8a65", "rgba(29,138,101,0.10)"],
  XLS: ["#1d8a65", "rgba(29,138,101,0.10)"],
  CSV: ["#1d8a65", "rgba(29,138,101,0.10)"],
  DOCX: ["#2a6fdb", "rgba(42,111,219,0.08)"],
  DOC: ["#2a6fdb", "rgba(42,111,219,0.08)"],
};

function TypeBadge({ type }: { type: string }) {
  const label = type.slice(0, 4).toUpperCase() || "DATEI";
  const [color, background] = typeColors[label] ?? ["#8b6ed4", "rgba(139,110,212,0.10)"];

  return (
    <span
      className="flex size-10 shrink-0 items-center justify-center rounded-[10px] font-mono text-[9.5px] font-semibold"
      style={{ color, background }}
    >
      {label}
    </span>
  );
}

function namesFor(ids: string[] | undefined, options: Option[]) {
  return (ids ?? []).map((id) => options.find((option) => option.id === id)?.name).filter(Boolean) as string[];
}

function VisibilityChip({ folder, options, t }: { folder: FileFolder; options: FileUploadOptions | undefined; t: T }) {
  if (folder.sharedWithEmployees) {
    const teams = namesFor(folder.visibleTeamIds, options?.teams ?? []);
    const locations = namesFor(folder.visibleLocationIds, options?.locations ?? []);
    const audience =
      teams.length || locations.length
        ? [teams.length ? t("teamsLabel", { names: teams.join(", ") }) : "", locations.join(", ")].filter(Boolean).join(" · ")
        : t("allEmployees");

    return (
      <span className="inline-flex max-w-full items-center gap-1 truncate rounded-[7px] bg-[rgba(53,122,82,0.10)] px-2 py-[3px] text-[11.5px] font-medium text-[#1f5d2c]">
        <Eye size={11} />
        <span className="truncate">{audience}</span>
      </span>
    );
  }

  const roles = namesFor(folder.accessRoleIds, options?.roles ?? []);

  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-[7px] bg-[#f2f1ed] px-2 py-[3px] text-[11.5px] font-medium text-[#3d3d3a]">
      <Lock size={11} />
      <span className="truncate">{roles.length ? t("onlyRoles", { names: roles.join(", ") }) : t("adminOnly")}</span>
    </span>
  );
}

function FolderCard({
  folder,
  baseHref,
  tenant,
  options,
  canManageFiles,
  canDeleteFiles,
  onSettings,
  onRename,
  t,
}: {
  folder: FileFolder;
  baseHref: string;
  tenant: string;
  options: FileUploadOptions | undefined;
  canManageFiles: boolean;
  canDeleteFiles: boolean;
  onSettings: () => void;
  onRename: () => void;
  t: T;
}) {
  const [, pinAction] = useActionStateWithToast(updateFolderSettingsAction);
  const path = folder.path ?? folder.slug;
  const iconColor = !folder.sharedWithEmployees ? "#6e6e6b" : folder.pinned ? "#8b6ed4" : "#b39cf0";
  const counts = [
    folder.subfolderCount ? t("folderCount", { count: folder.subfolderCount }) : null,
    t("fileCount", { count: folder.fileCount }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <DbCard className="db-insight relative flex min-h-[132px] flex-col gap-1 p-4">
      <div className="mb-1.5 flex items-center justify-between">
        <Folder size={20} fill={iconColor} color={iconColor} />
        <span className="relative z-10 flex items-center gap-1">
          {folder.pinned && <Pin size={13} className="text-[#8b6ed4]" fill="#8b6ed4" />}
          {canManageFiles && (
            <DbMenu label={t("folderMenu", { name: folder.name })}>
              <Link href={`${baseHref}/${path}`} className={`${dbMenuItemClass} no-underline`}>
                {t("open")}
              </Link>
              <CreateFolderButton tenant={tenant} returnPath={`${baseHref}/${path}`} parentPath={path} className={dbMenuItemClass}>
                {t("newSubfolder")}
              </CreateFolderButton>
              <button type="button" className={dbMenuItemClass} onClick={onRename}>
                {t("rename")}
              </button>
              <form action={pinAction}>
                <input type="hidden" name="tenant" value={tenant} />
                <input type="hidden" name="path" value={path} />
                <input type="hidden" name="pinned" value={folder.pinned ? "false" : "true"} />
                <button type="submit" className={dbMenuItemClass}>
                  {folder.pinned ? t("unpin") : t("pin")}
                </button>
              </form>
              <button type="button" className={dbMenuItemClass} onClick={onSettings}>
                {t("visibility")}
              </button>
              {canDeleteFiles && (
                <DeleteFolderButton tenant={tenant} path={path} name={folder.name} className={`${dbMenuItemClass} text-[#b4332a]`} label={t("delete")} />
              )}
            </DbMenu>
          )}
        </span>
      </div>
      <Link href={`${baseHref}/${path}`} className="line-clamp-2 text-[15px] font-semibold break-words text-ink no-underline after:absolute after:inset-0 after:content-['']">
        {folder.name}
      </Link>
      <span className="text-[12.5px] text-[#6e6e6b]">{folder.locked ? t("protectedContent") : counts}</span>
      <span className="mt-auto flex flex-wrap gap-1.5 pt-2">
        {folder.locked && (
          <span className="inline-flex items-center gap-1 rounded-[7px] bg-ink px-2 py-[3px] text-[11.5px] font-semibold text-white">
            <Lock size={11} />
            PIN
          </span>
        )}
        <VisibilityChip folder={folder} options={options} t={t} />
      </span>
    </DbCard>
  );
}

function FileRow({
  file,
  baseHref,
  tenant,
  canManageFiles,
  canDeleteFiles,
  canManageReminders,
  showFolder,
  onRename,
  onMove,
  t,
}: {
  file: FileItem;
  baseHref: string;
  tenant: string;
  canManageFiles: boolean;
  canDeleteFiles: boolean;
  canManageReminders: boolean;
  showFolder: boolean;
  onRename: () => void;
  onMove: () => void;
  t: T;
}) {
  const isHomeFile = file.folderSlug === "";
  const returnPath = isHomeFile ? baseHref : `${baseHref}/${file.folderSlug}`;
  const fileHref = isHomeFile ? `${baseHref}/${file.slug}` : `${baseHref}/${file.folderSlug}/${file.slug}`;

  return (
    <div className="flex items-center gap-3.5 border-t border-[#f0efeb] py-3 first:border-t-0">
      <Link href={fileHref} className="flex min-w-0 flex-1 items-center gap-3.5 no-underline">
        <TypeBadge type={file.type} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-semibold text-ink">{file.name}</span>
          <span className="truncate text-[12.5px] text-[#6e6e6b]">
            {[showFolder && !isHomeFile ? file.folder : null, file.size, file.uploadedByName || file.owner].filter(Boolean).join(" · ")}
          </span>
        </span>
      </Link>
      {file.locked && <Lock size={13} className="shrink-0 text-[#9a9a96]" />}
      <span className="hidden shrink-0 text-[13px] text-[#6e6e6b] tabular-nums sm:block">{file.uploadedAt || file.updatedAt}</span>
      <FileDownloadButton file={file} tenant={tenant} compact />
      {canManageReminders && (
        <FileReminderButton
          tenant={tenant}
          returnPath={returnPath}
          compact
          name={file.name}
          context={`${file.folder} · ${file.owner}`}
          canManage={canManageReminders}
        />
      )}
      {(canManageFiles || canDeleteFiles) && (
        <DbMenu label={t("fileMenu", { name: file.name })}>
          <Link href={fileHref} className={`${dbMenuItemClass} no-underline`}>
            {t("details")}
          </Link>
          {canManageFiles && file.storageFileId && (
            <>
              <button type="button" className={dbMenuItemClass} onClick={onRename}>
                {t("rename")}
              </button>
              <button type="button" className={dbMenuItemClass} onClick={onMove}>
                {t("moveEllipsis")}
              </button>
              <VersionUploadButton file={file} tenant={tenant} returnPath={returnPath} className={dbMenuItemClass} label={t("newVersion")} />
            </>
          )}
          {canDeleteFiles && (
            <FileSoftDeleteButton
              file={file}
              tenant={tenant}
              returnPath={returnPath}
              className={`${dbMenuItemClass} text-[#b4332a]`}
              label={t("delete")}
            />
          )}
        </DbMenu>
      )}
    </div>
  );
}

export default function FilesBrowser({
  folders,
  files,
  rootFiles,
  activeFolder,
  breadcrumb = [],
  baseHref,
  tenant,
  currentFolderPath = "",
  folderOptions = [],
  uploadOptions,
  canManageFiles = true,
  canDeleteFiles = false,
  canManageReminders = true,
  canManageAccess = false,
  emptyFilesLabel,
  toolbar,
}: {
  folders: FileFolder[];
  /** Ordner geöffnet: Dateien darin; Wurzel: zuletzt hinzugefügte Dateien. */
  files: FileItem[];
  /** Nur auf der Wurzelebene: Dateien ohne Ordner. */
  rootFiles?: FileItem[];
  activeFolder?: FileFolder;
  breadcrumb?: Array<{ name: string; path: string }>;
  baseHref: string;
  tenant: string;
  currentFolderPath?: string;
  folderOptions?: FileFolder[];
  uploadOptions?: FileUploadOptions;
  canManageFiles?: boolean;
  canDeleteFiles?: boolean;
  canManageReminders?: boolean;
  canManageAccess?: boolean;
  /** Überschreibt den Leer-Text, z. B. bei aktiver Suche ohne Treffer. */
  emptyFilesLabel?: string;
  /** Suche & Co. rechts in der Kopfzeile. */
  toolbar?: React.ReactNode;
}) {
  const t = useTranslations("FilesUi");
  const router = useRouter();
  const [settingsFolder, setSettingsFolder] = useState<FileFolder | null>(null);
  const [renameFolder, setRenameFolder] = useState<FileFolder | null>(null);
  const [renameFile, setRenameFile] = useState<FileItem | null>(null);
  const [moveFile, setMoveFile] = useState<FileItem | null>(null);
  const activeFolderPath = activeFolder ? (activeFolder.path ?? activeFolder.slug) : "";
  const currentReturnPath = activeFolder ? `${baseHref}/${activeFolderPath}` : baseHref;
  const resolvedEmptyFilesLabel = emptyFilesLabel ?? (activeFolder ? t("emptyFolder") : t("emptyRoot"));
  const rowProps = (file: FileItem) => ({
    file,
    baseHref,
    tenant,
    canManageFiles,
    canDeleteFiles,
    canManageReminders,
    onRename: () => setRenameFile(file),
    onMove: () => setMoveFile(file),
    t,
  });

  return (
    <>
      <DbCard className="mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
        <nav aria-label={t("breadcrumb")} className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-[14px]">
          <Link
            href={baseHref}
            className={`inline-flex items-center gap-1.5 font-semibold no-underline ${activeFolder ? "text-[#6e6e6b]" : "text-ink"}`}
          >
            <Folder size={15} className="text-[#8b6ed4]" />
            {t("allFiles")}
          </Link>
          {breadcrumb.map((crumb, index) => (
            <span key={crumb.path} className="inline-flex items-center gap-1">
              <ChevronRight size={14} className="text-[#9a9a96]" />
              <Link
                href={`${baseHref}/${crumb.path}`}
                className={`font-semibold no-underline ${index === breadcrumb.length - 1 ? "text-ink" : "text-[#6e6e6b]"}`}
              >
                {crumb.name}
              </Link>
            </span>
          ))}
          {activeFolder && <span className="ml-1.5">{<VisibilityChip folder={activeFolder} options={uploadOptions} t={t} />}</span>}
        </nav>
        {toolbar}
      </DbCard>

      <FilesDropZone
        tenant={tenant}
        ownerType="tenant"
        folderSlug={activeFolderPath}
        folderName={activeFolder?.name ?? ""}
        returnPath={currentReturnPath}
        canUpload={canManageFiles}
        onUploaded={() => router.refresh()}
        className="relative"
      >
        {(folders.length > 0 || canManageFiles) && (
          <div className="mb-4 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
            {folders.map((folder) => (
              <FolderCard
                key={folder.slug}
                folder={folder}
                baseHref={baseHref}
                tenant={tenant}
                options={uploadOptions}
                canManageFiles={canManageFiles}
                canDeleteFiles={canDeleteFiles}
                onSettings={() => setSettingsFolder(folder)}
                onRename={() => setRenameFolder(folder)}
                t={t}
              />
            ))}
            {canManageFiles && (
              <CreateFolderButton
                tenant={tenant}
                returnPath={currentReturnPath}
                parentPath={currentFolderPath}
                className="db-focus flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[16px] border-[1.5px] border-dashed border-[#dedad4] bg-transparent text-[14px] font-semibold text-[#6e6e6b] transition-colors hover:border-[#9a9a96] hover:text-ink"
              >
                <Plus size={18} />
                {currentFolderPath ? t("newSubfolder") : t("newFolder")}
              </CreateFolderButton>
            )}
          </div>
        )}

        {rootFiles && rootFiles.length > 0 && (
          <DbCard className="mb-4 px-5 py-4">
            <span className="mb-1 block font-mono text-[10px] tracking-[0.12em] text-[#6e6e6b] uppercase">{t("filesWithoutFolder")}</span>
            {rootFiles.map((file) => (
              <FileRow key={file.slug} {...rowProps(file)} showFolder={false} />
            ))}
          </DbCard>
        )}

        <DbCard className="px-5 py-4">
          <span className="mb-1 block font-mono text-[10px] tracking-[0.12em] text-[#6e6e6b] uppercase">
            {activeFolder ? t("filesInFolder") : t("recentlyAdded")}
          </span>
          {files.length > 0 ? (
            files.map((file) => <FileRow key={file.slug} {...rowProps(file)} showFolder={!activeFolder} />)
          ) : (
            <p className="m-0 py-6 text-center text-[13px] text-[#6e6e6b]">{resolvedEmptyFilesLabel}</p>
          )}
        </DbCard>
      </FilesDropZone>

      {settingsFolder && (
        <FolderSettingsDrawer
          tenant={tenant}
          folder={settingsFolder}
          roles={uploadOptions?.roles ?? []}
          teams={uploadOptions?.teams ?? []}
          locations={uploadOptions?.locations ?? []}
          canManageAccess={canManageAccess}
          onClose={() => setSettingsFolder(null)}
        />
      )}
      {renameFolder && <RenameFolderModal tenant={tenant} folder={renameFolder} onClose={() => setRenameFolder(null)} />}
      {renameFile?.storageFileId && (
        <RenameFileModal tenant={tenant} fileId={renameFile.storageFileId} name={renameFile.name} onClose={() => setRenameFile(null)} />
      )}
      {moveFile?.storageFileId && (
        <MoveFileModal
          tenant={tenant}
          fileId={moveFile.storageFileId}
          name={moveFile.name}
          currentPath={moveFile.folderSlug}
          folders={folderOptions}
          onClose={() => setMoveFile(null)}
        />
      )}
    </>
  );
}
