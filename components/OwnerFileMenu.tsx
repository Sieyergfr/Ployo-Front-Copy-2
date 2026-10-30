"use client";

import { getHrFileDetailsAction } from "@/app/(dashboard)/u/[tenant]/dateien/actions";
import { FileDownloadButton, FileViewButton, VersionUploadButton } from "@/components/FileActionButtons";
import { FileReminderButton } from "@/components/ActionDrawers";
import { DeleteFileButton } from "@/components/FileTrash";
import { useToast } from "@/components/Toasts";
import { DbMenu, dbMenuItemClass } from "@/components/dashboard/DbMenu";
import { DbModal } from "@/components/dashboard/DbDrawer";
import { MoveFileModal, RenameFileModal } from "@/components/dashboard/files/FileDialogs";
import type { OwnerFilesFile } from "@/components/OwnerFilesTab";
import type { FileFolder } from "@/lib/files";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

/** Dieselben Dateiaktionen für Personalakten, Standorte und Teams. */
export function OwnerFileMenu({ tenant, file, folders, returnPath, canManage, canDelete, canManageReminders }: {
  tenant: string;
  file: OwnerFilesFile & { storageFileId: string };
  folders: FileFolder[];
  returnPath: string;
  canManage: boolean;
  canDelete: boolean;
  canManageReminders: boolean;
}) {
  const t = useTranslations("FilesUi");
  const detailT = useTranslations("FilesPageContent");
  const { toast } = useToast();
  const [rename, setRename] = useState(false);
  const [move, setMove] = useState(false);
  const [details, setDetails] = useState<Awaited<ReturnType<typeof getHrFileDetailsAction>> | null>(null);
  const [loading, startTransition] = useTransition();
  const versionFile = { name: file.name, slug: file.storageFileId, storageFileId: file.storageFileId, version: file.version ?? 1 };

  return <>
    {canManageReminders && <FileReminderButton tenant={tenant} returnPath={returnPath} compact name={file.name} context={file.folder} canManage />}
    <DbMenu label={t("fileMenu", { name: file.name })}>
      <button type="button" disabled={loading} className={dbMenuItemClass} onClick={() => startTransition(async () => {
        try {
          setDetails(await getHrFileDetailsAction({ tenant, fileId: file.storageFileId }));
        } catch (error) {
          toast({ tone: "error", title: error instanceof Error ? error.message : t("details") });
        }
      })}>{t("details")}</button>
      {canManage && <>
        <button type="button" className={dbMenuItemClass} onClick={() => setRename(true)}>{t("rename")}</button>
        <button type="button" className={dbMenuItemClass} onClick={() => setMove(true)}>{t("moveEllipsis")}</button>
        <VersionUploadButton file={versionFile} tenant={tenant} returnPath={returnPath} className={dbMenuItemClass} label={t("newVersion")} />
      </>}
      {canDelete && <DeleteFileButton tenant={tenant} fileId={file.storageFileId} name={file.name} className={`${dbMenuItemClass} text-danger`} label={t("delete")} />}
    </DbMenu>
    {rename && <RenameFileModal tenant={tenant} fileId={file.storageFileId} name={file.name} returnPath={returnPath} onClose={() => setRename(false)} />}
    {move && <MoveFileModal tenant={tenant} fileId={file.storageFileId} name={file.name} currentPath={file.folderSlug} folders={folders} returnPath={returnPath} onClose={() => setMove(false)} />}
    {details && <DbModal title={t("details")} subtitle={details.file.name} onClose={() => setDetails(null)}>
      <dl className="m-0 grid grid-cols-2 gap-3 text-[13px]">
        {[
          [t("fileName"), details.file.name],
          [t("folderName"), details.file.folder],
          [detailT("documentTypeLabel"), details.file.documentType],
          [detailT("uploadedByLabel"), details.file.uploadedByName],
          [detailT("updatedLabel"), details.file.updatedAt],
          [detailT("expiresAtLabel"), details.file.expiresAt ?? detailT("noExpiry")],
        ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-bg p-3"><dt className="text-[11px] text-muted-2">{label}</dt><dd className="m-0 mt-1 break-words font-medium">{value || "–"}</dd></div>)}
      </dl>
      <div className="mt-4 flex flex-col gap-2">
        {details.versions.map((version) => <div key={version.storageFileId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
          <span className="text-[13px] font-medium">v{version.version} <span className="font-normal text-muted-2">· {version.uploadedAt} · {version.size}</span></span>
          <span className="flex gap-2"><FileViewButton file={version} tenant={tenant} compact /><FileDownloadButton file={version} tenant={tenant} compact /></span>
        </div>)}
      </div>
    </DbModal>}
  </>;
}
