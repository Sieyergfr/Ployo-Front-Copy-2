"use client";

import {
  deleteEmployeeDocumentSlotFileAction,
  uploadEmployeeDocumentSlotAction,
} from "@/app/(dashboard)/u/[tenant]/employees/actions";
import EmployeeVisibilityToggle from "@/components/EmployeeVisibilityToggle";
import { FormErrorBanner } from "@/components/FormFeedback";
import { OwnerFileActions } from "@/components/OwnerFileActions";
import { useUniversalPopup } from "@/components/UniversalPopup";
import {
  EMPLOYEE_DOCUMENT_SLOTS,
  employeeDocumentSlotFolders,
  type EmployeeFile,
} from "@/lib/employees";
import { uploadAcceptAttribute } from "@/lib/upload-constraints";
import { IdCard, Plus, Trash2, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

type T = ReturnType<typeof useTranslations>;

/**
 * Strukturierte "Felder" für Ausweisdokumente/Zertifikate (siehe
 * `EMPLOYEE_DOCUMENT_SLOTS`) — im Unterschied zur freien Ordner-/Dateiliste
 * hält jedes Feld hier ausschließlich die Datei(en) der einen Kategorie, für
 * die es gedacht ist.
 *
 * Wichtig: Hier stehen bewusst KEINE `<form>`-Elemente mehr. Die
 * Mitarbeiter-Detailseite umschließt ihren gesamten Inhalt (inkl. dieses
 * Abschnitts) mit dem Bearbeiten-Formular; ein `<form>` in einem `<form>` wird
 * vom HTML-Parser beim Server-Rendering verworfen, wodurch der Upload hier
 * ohne sichtbaren Fehler wirkungslos blieb. Stattdessen werden die Server
 * Actions direkt mit einer selbst gebauten `FormData` aufgerufen.
 */
export default function EmployeeDocumentSlots({
  tenant,
  employeeId,
  employeeHandle,
  files,
  canManage,
}: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  files: EmployeeFile[];
  canManage: boolean;
}) {
  const t = useTranslations("EmployeeDocumentSlots");

  return (
    <section className="mb-3.5 overflow-hidden rounded-card border border-border bg-white">
      <div className="border-b border-border px-6 pt-5 pb-3.5">
        <h2 className="m-0 font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
          {t("sectionTitle")}
        </h2>
        {canManage && (
          <p className="mt-1 mb-0 text-[11.5px] text-muted">
            {t("dragDropHint")}
          </p>
        )}
      </div>
      <div className="grid gap-3 px-6 py-5 sm:grid-cols-2 lg:grid-cols-3">
        {EMPLOYEE_DOCUMENT_SLOTS.map((slot) => (
          <DocumentSlotCard
            key={slot.key}
            tenant={tenant}
            employeeId={employeeId}
            employeeHandle={employeeHandle}
            slot={slot}
            files={files.filter((file) =>
              employeeDocumentSlotFolders(slot).includes(file.folder),
            )}
            canManage={canManage}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}

function DocumentSlotCard({
  tenant,
  employeeId,
  employeeHandle,
  slot,
  files,
  canManage,
  t,
}: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  slot: (typeof EMPLOYEE_DOCUMENT_SLOTS)[number];
  files: EmployeeFile[];
  canManage: boolean;
  t: T;
}) {
  const router = useRouter();
  const { openPopup, closePopup } = useUniversalPopup();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  const canAddMore = slot.multiple || files.length === 0;
  const replaceFileIds = slot.multiple
    ? []
    : files.map((file) => file.storageFileId).filter((id): id is string => Boolean(id));

  const upload = (selected: FileList | null) => {
    const file = selected?.[0];

    if (!file) {
      return;
    }

    const formData = new FormData();

    formData.set("tenant", tenant);
    formData.set("employeeId", employeeId);
    formData.set("employeeHandle", employeeHandle);
    formData.set("folderSlug", slot.key);
    formData.set("folderName", slot.label);
    formData.set("documentType", slot.label);
    formData.set("file", file);
    replaceFileIds.forEach((id) => formData.append("replaceFileIds", id));

    setError(undefined);
    startTransition(async () => {
      try {
        await uploadEmployeeDocumentSlotAction(formData);
        router.refresh();
      } catch (uploadError) {
        // Server Actions, die per `redirect` enden, werfen einen internen
        // Navigationsfehler — der ist hier der Erfolgsfall, kein Problem.
        if (isRedirectError(uploadError)) {
          router.refresh();
          return;
        }

        setError(
          uploadError instanceof Error
            ? uploadError.message
            : t("uploadFailedDefault"),
        );
      }
    });
  };

  const remove = (fileId: string, name: string) => {
    openPopup({
      title: t("removeFileTitle"),
      content: (
        <div>
          <p className="m-0 text-[13px] leading-[1.55] text-muted-2">
            {t("removeFileDescription", { name })}
          </p>
          <div className="mt-5 flex justify-end gap-2.5 border-t border-border-soft pt-4">
            <button type="button" className="btn btn-secondary" onClick={closePopup}>
              {t("cancel")}
            </button>
            <button
              type="button"
              className="btn btn-secondary border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
              onClick={() => {
                closePopup();
                const formData = new FormData();

                formData.set("tenant", tenant);
                formData.set("employeeHandle", employeeHandle);
                formData.set("fileId", fileId);

                startTransition(async () => {
                  try {
                    await deleteEmployeeDocumentSlotFileAction(formData);
                  } catch (deleteError) {
                    if (!isRedirectError(deleteError)) {
                      setError(
                        deleteError instanceof Error
                          ? deleteError.message
                          : t("removeFailedDefault"),
                      );
                      return;
                    }
                  }
                  router.refresh();
                });
              }}
            >
              <Trash2 size={15} />
              {t("remove")}
            </button>
          </div>
        </div>
      ),
    });
  };

  return (
    <div
      className={`relative rounded-xl border p-4 transition-colors ${
        isDragging ? "border-ink bg-white" : "border-border-soft bg-bg"
      }`}
      onDragEnter={(event) => {
        if (!canManage || !canAddMore || !event.dataTransfer.types.includes("Files")) return;
        dragDepth.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        if (!canManage || !canAddMore || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDragging(false);
      }}
      onDrop={(event) => {
        if (!canManage || !canAddMore || !event.dataTransfer.files?.length) return;
        event.preventDefault();
        dragDepth.current = 0;
        setIsDragging(false);
        upload(event.dataTransfer.files);
      }}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-border-soft text-muted-2">
          <IdCard size={14} />
        </span>
        <span className="text-[13px] font-semibold text-ink">{slot.label}</span>
      </div>

      {files.length === 0 ? (
        <p className="text-[11.5px] text-muted">{t("noFileYet")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {files.map((file) => (
            <div
              key={file.storageFileId ?? file.name}
              className="flex items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-ink">{file.name}</div>
                <div className="font-mono text-[10px] text-muted">
                  {file.updatedAt}
                  {file.hiddenFromEmployee && (
                    <span className="text-danger"> {"·"} {t("hiddenSuffix")}</span>
                  )}
                </div>
              </div>
              <OwnerFileActions
                tenant={tenant}
                storageFileId={file.storageFileId}
                name={file.name}
              />
              {canManage && file.storageFileId && (
                <EmployeeVisibilityToggle
                  tenant={tenant}
                  employeeHandle={employeeHandle}
                  target={{ kind: "file", fileId: file.storageFileId }}
                  hidden={Boolean(file.hiddenFromEmployee)}
                  name={file.name}
                />
              )}
              {canManage && file.storageFileId && (
                <button
                  type="button"
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-border bg-white text-muted transition-colors hover:border-danger hover:text-danger"
                  title={t("remove")}
                  aria-label={t("removeAria", { name: file.name })}
                  onClick={() => remove(file.storageFileId!, file.name)}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && canAddMore && (
        <div className="mt-2.5">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={uploadAcceptAttribute}
            onChange={(event) => {
              upload(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1.5 text-[11.5px] font-medium text-ink hover:text-muted disabled:cursor-wait disabled:opacity-60"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
          >
            <Plus size={12} />
            {isPending
              ? t("uploading")
              : files.length > 0
                ? slot.multiple
                  ? t("addAnotherFile")
                  : t("replaceFile")
                : t("uploadFile")}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-2">
          <FormErrorBanner message={error} />
        </div>
      )}

      {isDragging && (
        <div className="pointer-events-none absolute inset-1 z-10 flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-ink/40 bg-white/90 text-[12px] font-medium text-ink">
          <UploadCloud size={18} />
          {t("dropHere")}
        </div>
      )}
    </div>
  );
}

/**
 * Server Actions, die mit `redirect()` enden, werfen eine spezielle
 * Next-Fehlerform. Direkt aufgerufen (statt über `<form action>`) landet die
 * beim Aufrufer — sie bedeutet Erfolg, nicht Fehlschlag.
 */
function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
