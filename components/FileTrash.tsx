"use client";

import {
  deleteFileWithUndoAction,
  deleteFolderWithUndoAction,
  listFileDeletionsAction,
  restoreFileDeletionAction,
  type FileTrashActionResult,
} from "@/app/(dashboard)/u/[tenant]/dateien/actions";
import { useToast } from "@/components/Toasts";
import { useUniversalPopup } from "@/components/UniversalPopup";
import { FILE_RESTORE_WINDOW_HOURS, type FileDeletionEntry } from "@/lib/file-trash";
import { ChevronDown, FileText, Folder, RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

type T = ReturnType<typeof useTranslations>;
type OwnerType = "tenant" | "employee" | "location" | "team";

/**
 * Löschen von Dateien und Ordnern mit 24-h-Rückgängig (lib/file-trash.ts):
 * Bestätigungsdialog → Löschen → Toast mit "Rückgängig"; dauerhaft
 * erreichbar bleibt die Löschung bis zum Fristende im Bereich
 * "Kürzlich gelöscht" (`RecentlyDeletedPanel`) derselben Ablage.
 */

/** Signalisiert allen "Kürzlich gelöscht"-Bereichen der Seite, neu zu laden. */
const TRASH_CHANGED_EVENT = "ployo:file-trash-changed";

function notifyTrashChanged() {
  window.dispatchEvent(new Event(TRASH_CHANGED_EVENT));
}

function errorText(result: FileTrashActionResult, t: T) {
  if (result.error === "FORBIDDEN") return t("errorForbidden");
  if (result.error === "FOLDER_LOCKED") return t("errorFolderLocked");
  return result.error ?? t("errorGeneric");
}

/** Löschen ausführen + Toast mit "Rückgängig" — geteilt von Datei- und Ordner-Button. */
function useDeleteWithUndo(tenant: string) {
  const t = useTranslations("FileTrash");
  const { toast } = useToast();
  const router = useRouter();

  const restore = useCallback(
    async (batchId: string) => {
      const result = await restoreFileDeletionAction({ tenant, batchId });

      if (result.error) {
        toast({ tone: "error", title: t("restoreFailed"), subtitle: errorText(result, t) });
        return;
      }

      toast({ tone: "success", title: t("restored", { name: result.restored?.name ?? "" }) });
      notifyTrashChanged();
      router.refresh();
    },
    [router, t, tenant, toast],
  );

  const run = useCallback(
    async (perform: () => Promise<FileTrashActionResult>, afterDelete?: () => void) => {
      const result = await perform();

      if (result.error || !result.deletion) {
        toast({ tone: "error", title: t("deleteFailed"), subtitle: errorText(result, t) });
        return false;
      }

      const { deletion } = result;

      toast({
        tone: "success",
        title: t("deleted", { name: deletion.name }),
        subtitle: t("undoHint", { hours: FILE_RESTORE_WINDOW_HOURS }),
        duration: 10_000,
        action: deletion.batchId
          ? { label: t("undo"), onClick: () => void restore(deletion.batchId) }
          : undefined,
      });
      notifyTrashChanged();
      afterDelete?.();
      router.refresh();
      return true;
    },
    [restore, router, t, toast],
  );

  return { run, restore };
}

function ConfirmDeleteDialog({
  kind,
  name,
  onConfirm,
  onCancel,
  t,
}: {
  kind: "file" | "folder";
  name: string;
  onConfirm: () => Promise<boolean>;
  onCancel: () => void;
  t: T;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
          {kind === "folder" ? <Folder size={15} /> : <FileText size={15} />}
          <span className="min-w-0 truncate">{name}</span>
        </div>
        <p className="mt-1 text-[12.5px] leading-5 text-muted">
          {kind === "folder" ? t("confirmFolderBody") : t("confirmFileBody")}
        </p>
        <p className="mt-2 text-[12.5px] leading-5 text-muted">
          {t("confirmUndoHint", { hours: FILE_RESTORE_WINDOW_HOURS })}
        </p>
      </div>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isPending}>
          {t("cancel")}
        </button>
        <button
          type="button"
          className="btn btn-secondary border-danger/25 text-danger hover:bg-danger/5"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              if (await onConfirm()) {
                onCancel();
              }
            })
          }
        >
          <Trash2 size={15} />
          {isPending ? t("deleting") : t("delete")}
        </button>
      </div>
    </div>
  );
}

const compactButtonClass =
  "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-danger/25 bg-white text-danger transition-colors hover:bg-danger/5";
const regularButtonClass = "btn btn-secondary btn-sm border-danger/25 text-danger hover:bg-danger/5";

/** Datei löschen (mit Bestätigung). `afterDelete` z. B. zum Verlassen der Datei-Detailseite. */
export function DeleteFileButton({
  tenant,
  fileId,
  name,
  compact = false,
  afterDelete,
}: {
  tenant: string;
  fileId: string;
  name: string;
  compact?: boolean;
  afterDelete?: () => void;
}) {
  const t = useTranslations("FileTrash");
  const { openPopup, closePopup } = useUniversalPopup();
  const { run } = useDeleteWithUndo(tenant);

  return (
    <button
      type="button"
      className={compact ? compactButtonClass : regularButtonClass}
      title={t("deleteFile")}
      aria-label={t("deleteFileAria", { name })}
      onClick={() =>
        openPopup({
          title: t("confirmFileTitle"),
          content: (
            <ConfirmDeleteDialog
              kind="file"
              name={name}
              onCancel={closePopup}
              onConfirm={() => run(() => deleteFileWithUndoAction({ tenant, fileId }), afterDelete)}
              t={t}
            />
          ),
        })
      }
    >
      <Trash2 size={14} />
      {!compact && t("delete")}
    </button>
  );
}

/** Ordner samt Unterordnern und Dateien löschen (mit Bestätigung). */
export function DeleteFolderButton({
  tenant,
  ownerType = "tenant",
  ownerId,
  path,
  name,
  compact = false,
  afterDelete,
}: {
  tenant: string;
  ownerType?: OwnerType;
  ownerId?: string;
  path: string;
  name: string;
  compact?: boolean;
  afterDelete?: () => void;
}) {
  const t = useTranslations("FileTrash");
  const { openPopup, closePopup } = useUniversalPopup();
  const { run } = useDeleteWithUndo(tenant);

  return (
    <button
      type="button"
      className={compact ? compactButtonClass : regularButtonClass}
      title={t("deleteFolder")}
      aria-label={t("deleteFolderAria", { name })}
      onClick={() =>
        openPopup({
          title: t("confirmFolderTitle"),
          content: (
            <ConfirmDeleteDialog
              kind="folder"
              name={name}
              onCancel={closePopup}
              onConfirm={() =>
                run(
                  () =>
                    deleteFolderWithUndoAction({
                      tenant,
                      ownerType,
                      ownerId: ownerType === "tenant" ? undefined : ownerId,
                      path,
                    }),
                  afterDelete,
                )
              }
              t={t}
            />
          ),
        })
      }
    >
      <Trash2 size={14} />
      {!compact && t("deleteFolder")}
    </button>
  );
}

function hoursUntil(iso: string) {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 3_600_000));
}

/**
 * "Kürzlich gelöscht" einer Ablage — nur sichtbar, solange es etwas
 * Wiederherstellbares gibt (und nur für Nutzer mit Löschrecht; ohne Recht
 * liefert der Server einen Fehler und der Bereich bleibt einfach leer).
 */
export function RecentlyDeletedPanel({
  tenant,
  ownerType = "tenant",
  ownerId,
  className,
}: {
  tenant: string;
  ownerType?: OwnerType;
  ownerId?: string;
  className?: string;
}) {
  const t = useTranslations("FileTrash");
  const { restore } = useDeleteWithUndo(tenant);
  const [entries, setEntries] = useState<FileDeletionEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [busyBatch, setBusyBatch] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const result = await listFileDeletionsAction({
        tenant,
        ownerType,
        ownerId: ownerType === "tenant" ? undefined : ownerId,
      });

      if (active) {
        setEntries(result.deletions ?? []);
      }
    };

    void load();
    window.addEventListener(TRASH_CHANGED_EVENT, load);

    return () => {
      active = false;
      window.removeEventListener(TRASH_CHANGED_EVENT, load);
    };
  }, [ownerId, ownerType, tenant]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <section className={`rounded-card border border-border bg-white ${className ?? ""}`}>
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-6 py-4 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <span className="block font-display text-[15px] font-semibold tracking-[-0.2px] text-ink">
            {t("panelTitle", { count: entries.length })}
          </span>
          <span className="mt-[3px] block font-mono text-[10.5px] text-muted">
            {t("panelSubtitle", { hours: FILE_RESTORE_WINDOW_HOURS })}
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-border-soft px-6 pb-3">
          {entries.map((entry) => (
            <div
              key={entry.batchId}
              className="flex items-center gap-3.5 border-b border-border-soft py-3 last:border-b-0"
            >
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-border-soft text-muted-2">
                {entry.kind === "folder" ? <Folder size={14} /> : <FileText size={14} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">{entry.name}</span>
                <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted">
                  {entry.kind === "folder"
                    ? t("folderContents", { files: entry.fileCount, folders: Math.max(0, entry.folderCount - 1) })
                    : entry.path || t("topLevel")}
                  {" · "}
                  {t("deletedBy", { name: entry.deletedByName || "—" })}
                  {" · "}
                  {t("remaining", { hours: hoursUntil(entry.restorableUntil) })}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busyBatch === entry.batchId}
                onClick={async () => {
                  setBusyBatch(entry.batchId);
                  await restore(entry.batchId);
                  setBusyBatch(null);
                }}
              >
                <RotateCcw size={14} />
                {t("restore")}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
