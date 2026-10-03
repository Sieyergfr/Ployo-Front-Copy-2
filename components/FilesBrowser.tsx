"use client";

import type { FileFolder, FileItem, FileUploadOptions } from "@/lib/files";
import { FileReminderButton } from "@/components/ActionDrawers";
import { FilesDropZone } from "@/components/OwnerFilesTab";
import { useRouter } from "next/navigation";
import {
  CreateFolderButton,
  FileDownloadButton,
  FileSoftDeleteButton,
  FileViewButton,
  UploadFileButton,
  VersionUploadButton,
} from "@/components/FileActionButtons";
import { ArrowLeft, FileText, Folder, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

type T = ReturnType<typeof useTranslations>;

function FolderCard({
  folder,
  baseHref,
  t,
}: {
  folder: FileFolder;
  baseHref: string;
  t: T;
}) {
  const folderHref = `${baseHref}/${folder.slug}`;

  return (
    <div className="flex w-full items-center gap-[13px] rounded-xl border border-border bg-white p-[15px] transition-colors hover:bg-bg">
      <Link
        href={folderHref}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-[13px] text-left font-sans no-underline"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-border-soft text-muted-2">
          <Folder size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold leading-snug text-ink">
            {folder.name}
          </span>
          <span className="mt-[3px] block truncate font-mono text-[10.5px] text-muted">
            {t("fileCountByOwner", { count: folder.fileCount, owner: folder.owner })}
          </span>
        </span>
      </Link>
      {folder.locked && <Lock size={13} className="shrink-0 text-muted" />}
    </div>
  );
}

function FileRow({
  file,
  baseHref,
  tenant,
  canManageFiles,
  canManageReminders,
  t,
}: {
  file: FileItem;
  baseHref: string;
  tenant: string;
  canManageFiles: boolean;
  canManageReminders: boolean;
  t: T;
}) {
  const isHomeFile = file.folderSlug === "";
  const returnPath = isHomeFile ? baseHref : `${baseHref}/${file.folderSlug}`;
  const fileHref = isHomeFile
    ? `${baseHref}/${file.slug}`
    : `${baseHref}/${file.folderSlug}/${file.slug}`;

  return (
    <div className="flex w-full items-center gap-3.5 border-t border-border-soft py-3 text-left font-sans transition-colors hover:bg-bg">
      <Link
        href={fileHref}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5"
      >
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-border-soft text-muted-2">
          <FileText size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-ink">
            {file.name}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted">
            {isHomeFile ? t("home") : file.folder} {"\u00b7"} {file.owner}{" "}
            {"\u00b7"} {file.updatedAt}
          </span>
        </span>
      </Link>
      <span className="hidden font-mono text-[10.5px] text-muted md:block">
        {file.size}
      </span>
      <span className="rounded-[7px] border border-border-light px-2 py-[3px] font-mono text-[10px] text-muted-2">
        v{file.version}
      </span>
      <FileViewButton file={file} tenant={tenant} compact />
      <FileDownloadButton file={file} tenant={tenant} compact />
      {canManageFiles && (
        <>
          <VersionUploadButton
            file={file}
            tenant={tenant}
            returnPath={returnPath}
            compact
          />
          <FileSoftDeleteButton
            file={file}
            tenant={tenant}
            returnPath={returnPath}
            compact
          />
        </>
      )}
      {file.locked && <Lock size={13} className="shrink-0 text-muted" />}
      <FileReminderButton
        tenant={tenant}
        returnPath={returnPath}
        compact
        name={file.name}
        context={`${file.folder} \u00b7 ${file.owner}`}
        canManage={canManageReminders}
      />
    </div>
  );
}

export default function FilesBrowser({
  folders,
  files,
  activeFolder,
  baseHref,
  tenant,
  currentFolderPath = "",
  folderOptions = [],
  uploadOptions,
  canManageFiles = true,
  canManageReminders = true,
  emptyFilesLabel,
}: {
  folders: FileFolder[];
  files: FileItem[];
  activeFolder?: FileFolder;
  baseHref: string;
  tenant: string;
  currentFolderPath?: string;
  folderOptions?: FileFolder[];
  uploadOptions?: FileUploadOptions;
  canManageFiles?: boolean;
  canManageReminders?: boolean;
  /** Überschreibt den Leer-Text, z. B. bei aktiver Suche ohne Treffer. */
  emptyFilesLabel?: string;
}) {
  const t = useTranslations("FilesBrowser");
  const router = useRouter();
  // "Keine Dateien in diesem Ordner" passt nicht auf der Wurzelebene, wo gar
  // kein bestimmter Ordner gemeint ist (QA-Bug BUG-025, zweiter Teil).
  const resolvedEmptyFilesLabel =
    emptyFilesLabel ?? (activeFolder ? t("emptyFiles") : t("emptyFilesRoot"));
  const currentReturnPath = activeFolder
    ? `${baseHref}/${activeFolder.path ?? activeFolder.slug}`
    : baseHref;

  return (
    <section className="rounded-card border border-border bg-white px-6 py-[22px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.3px] text-ink">
            {activeFolder ? activeFolder.name : t("title")}
          </h2>
          <div className="mt-[3px] font-mono text-[10.5px] text-muted">
            {activeFolder ? (
              <>
                {t("fileCountByOwner", { count: activeFolder.fileCount, owner: activeFolder.owner })}
                {activeFolder.locked && t("lockedSuffix")}
              </>
            ) : (
              t("subtitleRoot")
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeFolder && (
            <Link href={baseHref} className="btn btn-secondary btn-sm">
              <ArrowLeft size={14} />
              {t("allFolders")}
            </Link>
          )}
          {canManageFiles && (
            <>
              <CreateFolderButton
                tenant={tenant}
                returnPath={currentReturnPath}
                parentPath={currentFolderPath}
                label={currentFolderPath ? t("subfolder") : t("createFolder")}
              />
              <UploadFileButton
                tenant={tenant}
                returnPath={currentReturnPath}
                folderSlug={activeFolder?.path ?? activeFolder?.slug}
                folderName={activeFolder?.name}
                folderOptions={folderOptions}
                uploadOptions={uploadOptions}
              />
            </>
          )}
        </div>
      </div>

      <FilesDropZone
        tenant={tenant}
        ownerType="tenant"
        folderSlug={activeFolder?.path ?? activeFolder?.slug ?? ""}
        folderName={activeFolder?.name ?? ""}
        returnPath={currentReturnPath}
        canUpload={canManageFiles}
        onUploaded={() => router.refresh()}
        className="relative"
      >
        {/* Auch in einem geöffneten Ordner: die direkten Unterordner gehören
            in die Ansicht, sonst wären verschachtelte Ordner unerreichbar. */}
        {folders.length > 0 && (
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
            {folders.map((folder) => (
              <FolderCard key={folder.slug} folder={folder} baseHref={baseHref} t={t} />
            ))}
          </div>
        )}

        <div className={folders.length > 0 ? "mt-6" : ""}>
          <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
            {activeFolder ? t("filesInFolder") : t("recentlyChanged")}
          </div>
          {files.length > 0 ? (
            files.map((file) => (
              <FileRow
                key={`${file.folderSlug}-${file.name}`}
                file={file}
                baseHref={baseHref}
                tenant={tenant}
                canManageFiles={canManageFiles}
                canManageReminders={canManageReminders}
                t={t}
              />
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-bg px-4 py-8 text-center text-[13px] text-muted">
              {resolvedEmptyFilesLabel}
            </div>
          )}
        </div>
      </FilesDropZone>
    </section>
  );
}
