import type { FileFolder, FileItem, FileUploadOptions } from "@/lib/files";
import { FileReminderButton } from "@/components/ActionDrawers";
import {
  CreateFolderButton,
  FileDownloadButton,
  FileSoftDeleteButton,
  FileViewButton,
  UploadFileButton,
  VersionUploadButton,
} from "@/components/FileActionButtons";
import { ArrowLeft, FileText, Folder, Lock } from "lucide-react";
import Link from "next/link";

function FolderCard({
  folder,
  baseHref,
  tenant,
}: {
  folder: FileFolder;
  baseHref: string;
  tenant: string;
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
            {folder.fileCount} Dateien {"\u00b7"} {folder.owner}
          </span>
        </span>
      </Link>
      {folder.locked && <Lock size={13} className="shrink-0 text-muted" />}
      <FileReminderButton
        tenant={tenant}
        returnPath={folderHref}
        compact
        name={folder.name}
        context={`Ordner \u00b7 ${folder.owner}`}
      />
    </div>
  );
}

function FileRow({
  file,
  baseHref,
  tenant,
}: {
  file: FileItem;
  baseHref: string;
  tenant: string;
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
            {isHomeFile ? "Home" : file.folder} {"\u00b7"} {file.owner}{" "}
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
      {file.locked && <Lock size={13} className="shrink-0 text-muted" />}
      <FileReminderButton
        tenant={tenant}
        returnPath={returnPath}
        compact
        name={file.name}
        context={`${file.folder} \u00b7 ${file.owner}`}
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
}: {
  folders: FileFolder[];
  files: FileItem[];
  activeFolder?: FileFolder;
  baseHref: string;
  tenant: string;
  currentFolderPath?: string;
  folderOptions?: FileFolder[];
  uploadOptions?: FileUploadOptions;
}) {
  const currentReturnPath = activeFolder
    ? `${baseHref}/${activeFolder.path ?? activeFolder.slug}`
    : baseHref;

  return (
    <section className="rounded-card border border-border bg-white px-6 py-[22px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.3px] text-ink">
            {activeFolder ? activeFolder.name : "Dateiablage"}
          </h2>
          <div className="mt-[3px] font-mono text-[10.5px] text-muted">
            {activeFolder ? (
              <>
                {activeFolder.fileCount} Dateien {"\u00b7"} {activeFolder.owner}
                {activeFolder.locked && " / geschützt"}
              </>
            ) : (
              "Ordner und Dateien"
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeFolder && (
            <Link href={baseHref} className="btn btn-secondary btn-sm">
              <ArrowLeft size={14} />
              Alle Ordner
            </Link>
          )}
          <CreateFolderButton
            tenant={tenant}
            returnPath={currentReturnPath}
            parentPath={currentFolderPath}
          />
          <UploadFileButton
            tenant={tenant}
            returnPath={currentReturnPath}
            folderSlug={activeFolder?.path ?? activeFolder?.slug}
            folderName={activeFolder?.name}
            folderOptions={folderOptions}
            uploadOptions={uploadOptions}
          />
        </div>
      </div>

      {!activeFolder && (
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
          {folders.map((folder) => (
            <FolderCard
              key={folder.slug}
              folder={folder}
              baseHref={baseHref}
              tenant={tenant}
            />
          ))}
        </div>
      )}

      <div className={activeFolder ? "" : "mt-6"}>
        <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
          {activeFolder ? "Dateien in diesem Ordner" : "Zuletzt ge\u00e4ndert"}
        </div>
        {files.length > 0 ? (
          files.map((file) => (
            <FileRow
              key={`${file.folderSlug}-${file.name}`}
              file={file}
              baseHref={baseHref}
              tenant={tenant}
            />
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-bg px-4 py-8 text-center text-[13px] text-muted">
            Keine Dateien in diesem Ordner.
          </div>
        )}
      </div>
    </section>
  );
}
