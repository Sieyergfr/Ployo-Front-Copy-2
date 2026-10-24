"use client";

import {
  dropUploadFilesAction,
  unlockOwnerFolderAction,
} from "@/app/(dashboard)/u/[tenant]/dateien/actions";
import EmployeeVisibilityToggle from "@/components/EmployeeVisibilityToggle";
import { CreateFolderButton, UploadFileButton } from "@/components/FileActionButtons";
import { DeleteFileButton, DeleteFolderButton, RecentlyDeletedPanel } from "@/components/FileTrash";
import { FormErrorBanner } from "@/components/FormFeedback";
import FormSubmitButton from "@/components/FormSubmitButton";
import { OwnerFileActions } from "@/components/OwnerFileActions";
import { useUniversalPopup } from "@/components/UniversalPopup";
import type { ActionState } from "@/lib/action-state";
import type { FileFolder, FileUploadOptions } from "@/lib/files";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  Folder,
  Lock,
  UploadCloud,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

/**
 * Bewusst lokal statt aus `lib/action-state` importiert: das Modul ist
 * `server-only`, ein Wertimport von dort würde diese Client-Komponente beim
 * Bauen scheitern lassen (der Typ oben ist zur Laufzeit weg).
 */
const initialActionState: ActionState = {};

type T = ReturnType<typeof useTranslations>;

export type OwnerFilesFolder = {
  name: string;
  fileCount: number;
  locked?: boolean;
  /** Vollständiger Pfad, z. B. "vertraege/2026". Ohne Pfad ist der Ordner nicht navigierbar. */
  path?: string;
  /** Nur in der Personalakte: vor dem Mitarbeiter selbst verborgen. */
  hiddenFromEmployee?: boolean;
};

export type OwnerFilesFile = {
  name: string;
  folder: string;
  folderSlug: string;
  updatedAt: string;
  size: string;
  type: string;
  storageFileId?: string;
  /** Nur in der Personalakte: vor dem Mitarbeiter selbst verborgen. */
  hiddenFromEmployee?: boolean;
};

export type OwnerFilesOwnerType = "employee" | "location" | "team";

/**
 * Datei-Tab für Mitarbeiter-, Standort- und Team-Detailseiten.
 *
 * Ersetzt die drei früher kopierten Abschnitte, die alle Ordner flach
 * nebeneinander zeigten und beim Öffnen eines Ordners lediglich die Dateiliste
 * gefiltert haben (per `?folder=`-Link, was zusätzlich an den Seitenanfang
 * sprang). Hier wird stattdessen echt *in* den Ordner navigiert: nur die
 * direkten Unterordner und die Dateien der aktuellen Ebene, darüber
 * Breadcrumb + Zurück.
 *
 * Der Ordnerstand liegt bewusst im Client-State (nicht als Server-Navigation):
 * alle Ordner/Dateien der Ablage stecken ohnehin schon in den Props, ein
 * Ordnerwechsel braucht also keinen Server-Roundtrip — und genau der war die
 * Ursache des Sprungs an den Seitenanfang. Für Reload/Deep-Link wird der Pfad
 * per `history.replaceState` in die URL geschrieben.
 */
export default function OwnerFilesTab({
  tenant,
  ownerType,
  ownerId,
  basePath,
  folders,
  files,
  uploadOptions,
  canManageFiles,
  canDeleteFiles = false,
  initialFolderPath = "",
  emptyLabel,
  employeeHandle,
}: {
  tenant: string;
  ownerType: OwnerFilesOwnerType;
  ownerId: string;
  /** Detailseiten-URL ohne Query, z. B. "/u/acme/standorte/berlin". */
  basePath: string;
  folders: OwnerFilesFolder[];
  files: OwnerFilesFile[];
  uploadOptions: FileUploadOptions;
  canManageFiles: boolean;
  /** Löschen von Dateien/Ordnern (mit 24-h-Rückgängig) — "files" + canDelete und Schreibrecht auf die Ablage. */
  canDeleteFiles?: boolean;
  initialFolderPath?: string;
  emptyLabel: string;
  /**
   * Handle des Mitarbeiters (nur `ownerType: "employee"`). Erst damit gibt es
   * jemanden, vor dem sich etwas verbergen ließe — ohne bleibt die Ablage
   * unverändert.
   */
  employeeHandle?: string;
}) {
  const t = useTranslations("OwnerFilesTab");
  const router = useRouter();
  const canHideFromEmployee =
    ownerType === "employee" && canManageFiles && Boolean(employeeHandle);
  const [selectedPath, setSelectedPath] = useState(initialFolderPath);
  const [unlockedPaths, setUnlockedPaths] = useState<string[]>([]);

  const navigableFolders = useMemo(
    () => folders.filter((folder): folder is OwnerFilesFolder & { path: string } => Boolean(folder.path)),
    [folders],
  );

  const folderByPath = useMemo(
    () => new Map(navigableFolders.map((folder) => [folder.path, folder])),
    [navigableFolders],
  );

  // Ein zwischenzeitlich gelöschter Ordner (oder ein Pfad aus einer alten URL)
  // darf nicht in einer leeren Ansicht ohne Ausweg enden — direkt beim Rendern
  // auflösen statt per Effekt nachzukorrigieren.
  const currentPath = selectedPath && folderByPath.has(selectedPath) ? selectedPath : "";

  const navigate = useCallback(
    (nextPath: string) => {
      setSelectedPath(nextPath);

      const url = nextPath
        ? `${basePath}?tab=files&folder=${encodeURIComponent(nextPath)}`
        : `${basePath}?tab=files`;

      window.history.replaceState(window.history.state, "", url);
    },
    [basePath],
  );

  const currentFolder = currentPath ? folderByPath.get(currentPath) : undefined;

  /**
   * Ein gesperrter Ordner sperrt auch alles darunter — sonst käme man über
   * einen Unterordner an demselben Inhalt vorbei.
   */
  const lockedAncestor = useMemo(() => {
    if (!currentPath) {
      return undefined;
    }

    const segments = currentPath.split("/");

    for (let index = 1; index <= segments.length; index += 1) {
      const path = segments.slice(0, index).join("/");
      const folder = folderByPath.get(path);

      if (folder?.locked && !unlockedPaths.includes(path)) {
        return folder;
      }
    }

    return undefined;
  }, [currentPath, folderByPath, unlockedPaths]);

  const childFolders = useMemo(() => {
    const prefix = currentPath ? `${currentPath}/` : "";

    return navigableFolders
      .filter((folder) => {
        if (currentPath) {
          return (
            folder.path.startsWith(prefix) &&
            !folder.path.slice(prefix.length).includes("/")
          );
        }

        return !folder.path.includes("/");
      })
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [currentPath, navigableFolders]);

  const currentFiles = useMemo(
    () => files.filter((file) => (file.folderSlug ?? "") === currentPath),
    [currentPath, files],
  );

  const breadcrumbs = useMemo(() => {
    if (!currentPath) {
      return [];
    }

    const segments = currentPath.split("/");

    return segments.map((_, index) => {
      const path = segments.slice(0, index + 1).join("/");

      return { path, name: folderByPath.get(path)?.name ?? path };
    });
  }, [currentPath, folderByPath]);

  const parentPath = currentPath.includes("/")
    ? currentPath.slice(0, currentPath.lastIndexOf("/"))
    : "";

  const returnPath = currentPath
    ? `${basePath}?tab=files&folder=${encodeURIComponent(currentPath)}`
    : `${basePath}?tab=files`;

  const deleteContext = canDeleteFiles ? { tenant, ownerType, ownerId } : undefined;

  return (
    <>
      <section className="overflow-hidden rounded-card border border-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 pt-5 pb-3.5">
          <div className="flex min-w-0 items-center gap-3">
            {currentPath && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(parentPath)}
              >
                <ArrowLeft size={14} />
                {t("back")}
              </button>
            )}
            <div className="min-w-0">
              <h2 className="m-0 truncate font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
                {currentFolder?.name ?? t("title")}
              </h2>
              <FolderBreadcrumbs
                breadcrumbs={breadcrumbs}
                folderCount={childFolders.length}
                fileCount={currentFiles.length}
                onNavigate={navigate}
                t={t}
              />
            </div>
          </div>

          {(canManageFiles || canDeleteFiles) && !lockedAncestor && (
            <div className="flex flex-wrap gap-2">
              {currentFolder && canDeleteFiles && (
                <DeleteFolderButton
                  tenant={tenant}
                  ownerType={ownerType}
                  ownerId={ownerId}
                  path={currentFolder.path}
                  name={currentFolder.name}
                  afterDelete={() => navigate(parentPath)}
                />
              )}
              {canManageFiles && (
                <>
                  <CreateFolderButton
                    tenant={tenant}
                    returnPath={returnPath}
                    ownerType={ownerType}
                    ownerId={ownerId}
                    parentPath={currentPath}
                    label={currentPath ? t("subfolder") : t("createFolder")}
                  />
                  <UploadFileButton
                    tenant={tenant}
                    returnPath={returnPath}
                    ownerType={ownerType}
                    ownerId={ownerId}
                    folderSlug={currentPath || undefined}
                    folderName={currentFolder?.name}
                    folderOptions={navigableFolders.map(toFileFolderOption)}
                    uploadOptions={uploadOptions}
                  />
                </>
              )}
            </div>
          )}
        </div>

        {lockedAncestor ? (
          <FolderPinPanel
            tenant={tenant}
            ownerType={ownerType}
            ownerId={ownerId}
            folderName={lockedAncestor.name}
            folderPath={lockedAncestor.path}
            onUnlocked={(path) => setUnlockedPaths((current) => [...current, path])}
            onBack={() => navigate(parentPath)}
          />
        ) : (
          <FilesDropZone
            tenant={tenant}
            ownerType={ownerType}
            ownerId={ownerId}
            folderSlug={currentPath}
            folderName={currentFolder?.name ?? ""}
            returnPath={returnPath}
            canUpload={canManageFiles}
            onUploaded={() => router.refresh()}
          >
            {childFolders.length > 0 && (
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
                {childFolders.map((folder) => (
                  <FolderCard
                    key={folder.path}
                    folder={folder}
                    onOpen={() => navigate(folder.path)}
                    visibility={
                      canHideFromEmployee
                        ? { tenant, employeeHandle: employeeHandle!, employeeId: ownerId }
                        : undefined
                    }
                    deleteContext={deleteContext}
                    t={t}
                  />
                ))}
              </div>
            )}

            <div className={childFolders.length > 0 ? "mt-5" : ""}>
              <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
                {currentPath ? t("filesInFolder") : t("files")}
              </div>
              {currentFiles.length > 0 ? (
                currentFiles.map((file) => (
                  <FileRow
                    key={file.storageFileId ?? `${file.folderSlug}-${file.name}`}
                    file={file}
                    tenant={tenant}
                    visibility={
                      canHideFromEmployee
                        ? { tenant, employeeHandle: employeeHandle!, employeeId: ownerId }
                        : undefined
                    }
                    canDelete={canDeleteFiles}
                    t={t}
                  />
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-bg px-4 py-6 text-center text-[12.5px] text-muted">
                  {childFolders.length > 0
                    ? t("noFilesDirectlyInFolder")
                    : emptyLabel}
                </p>
              )}
            </div>
          </FilesDropZone>
        )}
      </section>
      {canDeleteFiles && (
        <RecentlyDeletedPanel tenant={tenant} ownerType={ownerType} ownerId={ownerId} className="mt-4" />
      )}
    </>
  );
}

function toFileFolderOption(folder: OwnerFilesFolder & { path: string }): FileFolder {
  return {
    slug: folder.path,
    path: folder.path,
    name: folder.name,
    fileCount: folder.fileCount,
    owner: "HR",
    updatedAt: "",
    locked: folder.locked,
  };
}

function FolderBreadcrumbs({
  breadcrumbs,
  folderCount,
  fileCount,
  onNavigate,
  t,
}: {
  breadcrumbs: { path: string; name: string }[];
  folderCount: number;
  fileCount: number;
  onNavigate: (path: string) => void;
  t: T;
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 font-mono text-[10.5px] text-muted">
      <button
        type="button"
        className="cursor-pointer text-muted transition-colors hover:text-ink"
        onClick={() => onNavigate("")}
      >
        {t("start")}
      </button>
      {breadcrumbs.map((crumb, index) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight size={11} className="shrink-0" />
          {index === breadcrumbs.length - 1 ? (
            <span className="text-ink">{crumb.name}</span>
          ) : (
            <button
              type="button"
              className="cursor-pointer text-muted transition-colors hover:text-ink"
              onClick={() => onNavigate(crumb.path)}
            >
              {crumb.name}
            </button>
          )}
        </span>
      ))}
      <span className="ml-1">
        {t("breadcrumbSummary", { folders: folderCount, files: fileCount })}
      </span>
    </div>
  );
}

/** Mandant + Mitarbeiter, an denen der Sichtbarkeits-Umschalter hängt. */
type VisibilityContext = { tenant: string; employeeHandle: string; employeeId: string };

/**
 * Der Umschalter liegt bewusst NEBEN dem Öffnen-Knopf (nicht darin): ein
 * Button in einem Button ist kein gültiges HTML, und ein Klick auf das Auge
 * soll den Ordner nicht mit aufmachen.
 */
function FolderCard({
  folder,
  onOpen,
  visibility,
  deleteContext,
  t,
}: {
  folder: OwnerFilesFolder & { path: string };
  onOpen: () => void;
  visibility?: VisibilityContext;
  deleteContext?: { tenant: string; ownerType: OwnerFilesOwnerType; ownerId: string };
  t: T;
}) {
  return (
    <div className="flex w-full items-center rounded-xl border border-border bg-white pr-[15px] transition-colors hover:bg-bg">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-[13px] p-[15px] text-left font-sans"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-border-soft text-muted-2">
          <Folder size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-ink">
            {folder.name}
          </span>
          <span className="mt-[3px] block font-mono text-[10.5px] text-muted">
            {t("fileCount", { count: folder.fileCount })}
            {folder.hiddenFromEmployee && (
              <span className="text-danger">{t("hiddenSuffix")}</span>
            )}
          </span>
        </span>
        {folder.locked && <Lock size={13} className="shrink-0 text-muted" />}
      </button>
      {visibility && (
        <EmployeeVisibilityToggle
          tenant={visibility.tenant}
          employeeHandle={visibility.employeeHandle}
          target={{ kind: "folder", employeeId: visibility.employeeId, path: folder.path }}
          hidden={Boolean(folder.hiddenFromEmployee)}
          name={folder.name}
        />
      )}
      {deleteContext && (
        <span className="ml-1.5">
          <DeleteFolderButton
            tenant={deleteContext.tenant}
            ownerType={deleteContext.ownerType}
            ownerId={deleteContext.ownerId}
            path={folder.path}
            name={folder.name}
            compact
          />
        </span>
      )}
    </div>
  );
}

function FileRow({
  file,
  tenant,
  visibility,
  canDelete = false,
  t,
}: {
  file: OwnerFilesFile;
  tenant: string;
  visibility?: VisibilityContext;
  canDelete?: boolean;
  t: T;
}) {
  return (
    <div className="flex w-full items-center gap-3.5 border-t border-border-soft py-3 text-left font-sans transition-colors hover:bg-bg">
      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-border-soft text-muted-2">
        <FileText size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-ink">{file.name}</span>
        <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted">
          {file.folder || t("home")} {"·"} {file.updatedAt}
          {file.hiddenFromEmployee && (
            <span className="text-danger">{t("hiddenFromEmployeeSuffix")}</span>
          )}
        </span>
      </span>
      <span className="hidden font-mono text-[10.5px] text-muted md:block">{file.size}</span>
      <span className="rounded-[7px] border border-border-light px-2 py-[3px] font-mono text-[10px] text-muted-2">
        {file.type}
      </span>
      <OwnerFileActions tenant={tenant} storageFileId={file.storageFileId} name={file.name} />
      {visibility && file.storageFileId && (
        <EmployeeVisibilityToggle
          tenant={visibility.tenant}
          employeeHandle={visibility.employeeHandle}
          target={{ kind: "file", fileId: file.storageFileId }}
          hidden={Boolean(file.hiddenFromEmployee)}
          name={file.name}
        />
      )}
      {canDelete && file.storageFileId && (
        <DeleteFileButton tenant={tenant} fileId={file.storageFileId} name={file.name} compact />
      )}
    </div>
  );
}

/**
 * Drag & Drop in den gerade geöffneten Ordner. Die Zone liegt über dem
 * gesamten Inhaltsbereich (nicht nur über einem kleinen Feld), damit ein Drop
 * überall im Ordner ankommt; sichtbar wird sie erst beim Ziehen.
 */
export function FilesDropZone({
  tenant,
  ownerType,
  ownerId,
  folderSlug,
  folderName,
  returnPath,
  canUpload,
  onUploaded,
  documentType,
  className = "relative px-6 py-5",
  children,
}: {
  tenant: string;
  ownerType: "tenant" | OwnerFilesOwnerType;
  ownerId?: string;
  folderSlug: string;
  folderName: string;
  returnPath: string;
  canUpload: boolean;
  onUploaded: () => void;
  documentType?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("OwnerFilesTab");
  const [state, formAction, isUploading] = useActionState(
    dropUploadFilesAction,
    initialActionState,
  );
  const [isDragging, setIsDragging] = useState(false);
  // Drag-Events feuern auch für Kindelemente; ohne Zähler flackert der
  // Hinweis bei jedem Überfahren eines Unterelements.
  const dragDepth = useRef(0);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) {
      onUploaded();
    }
  }, [state, onUploaded]);

  if (!canUpload) {
    return <div className={className}>{children}</div>;
  }

  const submitFiles = (fileList: FileList) => {
    const formData = new FormData();

    formData.set("tenant", tenant);
    formData.set("ownerType", ownerType);
    formData.set("ownerId", ownerId ?? "");
    formData.set("folderSlug", folderSlug);
    formData.set("folderName", folderName);
    formData.set("returnPath", returnPath);
    if (documentType) formData.set("documentType", documentType);
    Array.from(fileList).forEach((file) => formData.append("files", file));

    startTransition(() => formAction(formData));
  };

  return (
    <div
      className={className}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        dragDepth.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files?.length) return;
        event.preventDefault();
        dragDepth.current = 0;
        setIsDragging(false);
        submitFiles(event.dataTransfer.files);
      }}
    >
      {children}

      {state.error && (
        <div className="mt-3">
          <FormErrorBanner message={state.error} />
        </div>
      )}

      {(isDragging || isUploading) && (
        <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink/40 bg-white/90 text-[13px] font-medium text-ink">
          <UploadCloud size={22} />
          {isUploading
            ? t("uploading")
            : t("dropHint", { folder: folderName || t("home") })}
        </div>
      )}
    </div>
  );
}

/**
 * PIN-Abfrage für einen geschützten Ordner. Im Web bislang gar nicht
 * durchgesetzt: die Ordner ließen sich in den Eigentümer-Ablagen einfach
 * öffnen. Nach erfolgreicher Eingabe merkt sich der Server die Freischaltung
 * per Cookie (lib/folder-pin.ts), der Client entsperrt zusätzlich sofort die
 * aktuelle Ansicht.
 */
export function FolderPinPanel({
  tenant,
  ownerType,
  ownerId,
  folderName,
  folderPath,
  onUnlocked,
  onBack,
}: {
  tenant: string;
  ownerType: "tenant" | OwnerFilesOwnerType;
  ownerId?: string;
  folderName: string;
  folderPath: string;
  /** Freischaltung zusätzlich clientseitig merken; der Server merkt sie per Cookie. */
  onUnlocked?: (path: string) => void;
  onBack?: () => void;
}) {
  const router = useRouter();
  const { openPopup, closePopup } = useUniversalPopup();
  const openedFor = useRef<string | null>(null);

  const handleUnlocked = useCallback(() => {
    onUnlocked?.(folderPath);
    closePopup();
    router.refresh();
  }, [closePopup, folderPath, onUnlocked, router]);

  const t = useTranslations("OwnerFilesTab");
  const openDialog = useCallback(() => {
    openPopup({
      title: t("folderProtectedTitle", { folder: folderName }),
      // Schmal: der Dialog enthält nur ein PIN-Feld und zwei Knöpfe.
      size: "narrow",
      content: (
        <FolderPinForm
          tenant={tenant}
          ownerType={ownerType}
          ownerId={ownerId}
          folderPath={folderPath}
          onUnlocked={handleUnlocked}
          onCancel={() => {
            closePopup();
            onBack?.();
          }}
          t={t}
        />
      ),
      onClose: () => {
        openedFor.current = null;
      },
    });
  }, [
    closePopup,
    folderName,
    folderPath,
    handleUnlocked,
    onBack,
    openPopup,
    ownerId,
    ownerType,
    t,
    tenant,
  ]);

  // Beim Öffnen eines geschützten Ordners soll die Abfrage sofort kommen —
  // aber nur einmal je Ordner, sonst poppt sie nach dem Abbrechen erneut auf.
  useEffect(() => {
    if (openedFor.current !== folderPath) {
      openedFor.current = folderPath;
      openDialog();
    }
  }, [folderPath, openDialog]);

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-bg text-muted">
        <Lock size={18} />
      </span>
      <p className="m-0 text-[13px] text-muted-2">
        {t("folderProtectedMessage", { folder: folderName })}
      </p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={openDialog}>
        {t("enterPin")}
      </button>
    </div>
  );
}

function FolderPinForm({
  tenant,
  ownerType,
  ownerId,
  folderPath,
  onUnlocked,
  onCancel,
  t,
}: {
  tenant: string;
  ownerType: "tenant" | OwnerFilesOwnerType;
  ownerId?: string;
  folderPath: string;
  onUnlocked: () => void;
  onCancel: () => void;
  t: T;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    unlockOwnerFolderAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.success) {
      onUnlocked();
    }
  }, [state, onUnlocked]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="ownerType" value={ownerType} />
      <input type="hidden" name="ownerId" value={ownerId ?? ""} />
      <input type="hidden" name="folderPath" value={folderPath} />

      <p className="m-0 text-[13px] text-muted-2">
        {t("pinPrompt")}
      </p>
      <input
        name="pin"
        className="input input-mono text-center text-[16px] tracking-[0.4em]"
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        placeholder="••••••"
        autoFocus
        required
      />
      <FormErrorBanner message={state.error} />

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {t("cancel")}
        </button>
        <FormSubmitButton className="btn btn-primary" pendingLabel={t("checking")}>
          {t("openFolder")}
        </FormSubmitButton>
      </div>
    </form>
  );
}
