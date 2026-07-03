import type { FileFolder, FileItem } from "@/lib/files";
import { FileReminderButton } from "@/components/ActionDrawers";
import {
  CreateFolderButton,
  FileDownloadButton,
  FileViewButton,
  UploadFileButton,
  VersionUploadButton,
} from "@/components/FileActionButtons";
import { ArrowLeft, FileText, Folder, Lock } from "lucide-react";
import Link from "next/link";

function FolderCard({
  folder,
  baseHref,
}: {
  folder: FileFolder;
  baseHref: string;
}) {
  return (
    <div className="flex w-full items-center gap-[13px] rounded-xl border border-border bg-white p-[15px] transition-colors hover:bg-bg">
      <Link
        href={`${baseHref}/${folder.slug}`}
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
        compact
        name={folder.name}
        context={`Ordner \u00b7 ${folder.owner}`}
      />
    </div>
  );
}

function FileRow({ file, baseHref }: { file: FileItem; baseHref: string }) {
  return (
    <div className="flex w-full items-center gap-3.5 border-t border-border-soft py-3 text-left font-sans transition-colors hover:bg-bg">
      <Link
        href={`${baseHref}/${file.folderSlug}/${file.slug}`}
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
            {file.folder} {"\u00b7"} {file.owner} {"\u00b7"} {file.updatedAt}
          </span>
        </span>
      </Link>
      <span className="hidden font-mono text-[10.5px] text-muted md:block">
        {file.size}
      </span>
      <span className="rounded-[7px] border border-border-light px-2 py-[3px] font-mono text-[10px] text-muted-2">
        v{file.version}
      </span>
      <FileViewButton file={file} compact />
      <FileDownloadButton file={file} compact />
      <VersionUploadButton file={file} compact />
      {file.locked && <Lock size={13} className="shrink-0 text-muted" />}
      <FileReminderButton
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
}: {
  folders: FileFolder[];
  files: FileItem[];
  activeFolder?: FileFolder;
  baseHref: string;
}) {
  return (
    <section className="rounded-card border border-border bg-white px-6 py-[22px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.3px] text-ink">
            Dateiablage
          </h2>
          <div className="mt-[3px] font-mono text-[10.5px] text-muted">
            {activeFolder ? (
              <>
                Dateien / {activeFolder.name}
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
          <CreateFolderButton />
          <UploadFileButton />
        </div>
      </div>

      {!activeFolder && (
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
          {folders.map((folder) => (
            <FolderCard key={folder.slug} folder={folder} baseHref={baseHref} />
          ))}
        </div>
      )}

      {activeFolder && (
        <div className="mb-5 rounded-xl border border-border-soft bg-bg px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-muted-2">
              <Folder size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-ink">
                {activeFolder.name}
              </div>
              <div className="mt-[3px] font-mono text-[10.5px] text-muted">
                {activeFolder.fileCount} Dateien {"\u00b7"} {activeFolder.owner}
              </div>
            </div>
            {activeFolder.locked && (
              <Lock size={14} className="shrink-0 text-muted" />
            )}
            <FileReminderButton
              compact
              name={activeFolder.name}
              context={`Ordner \u00b7 ${activeFolder.owner}`}
            />
          </div>
        </div>
      )}

      <div className={activeFolder ? "" : "mt-6"}>
        <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
          {activeFolder ? "Dateien in diesem Ordner" : "Zuletzt ge\u00e4ndert"}
        </div>
        {files.length > 0 ? (
          files.map((file) => (
            <FileRow key={`${file.folderSlug}-${file.name}`} file={file} baseHref={baseHref} />
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
