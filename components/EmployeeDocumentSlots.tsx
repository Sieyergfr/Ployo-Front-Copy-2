"use client";

import {
  deleteEmployeeDocumentSlotFileAction,
  uploadEmployeeDocumentSlotAction,
} from "@/app/(dashboard)/u/[tenant]/employees/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { OwnerFileActions } from "@/components/OwnerFileActions";
import { EMPLOYEE_DOCUMENT_SLOTS, type EmployeeFile } from "@/lib/employees";
import { IdCard, Plus, Trash2 } from "lucide-react";
import { useRef } from "react";

/**
 * Strukturierte "Felder" für Ausweisdokumente/Zertifikate (siehe
 * `EMPLOYEE_DOCUMENT_SLOTS`) — im Unterschied zur freien Ordner-/Dateiliste
 * hält jedes Feld hier ausschließlich die Datei(en) der einen Kategorie, für
 * die es gedacht ist.
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
  return (
    <section className="mb-3.5 overflow-hidden rounded-card border border-border bg-white">
      <div className="border-b border-border px-6 pt-5 pb-3.5">
        <h2 className="m-0 font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
          Ausweisdokumente & Zertifikate
        </h2>
      </div>
      <div className="grid gap-3 px-6 py-5 sm:grid-cols-2 lg:grid-cols-3">
        {EMPLOYEE_DOCUMENT_SLOTS.map((slot) => (
          <DocumentSlotCard
            key={slot.key}
            tenant={tenant}
            employeeId={employeeId}
            employeeHandle={employeeHandle}
            slot={slot}
            files={files.filter((file) => file.folder === slot.label)}
            canManage={canManage}
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
}: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  slot: (typeof EMPLOYEE_DOCUMENT_SLOTS)[number];
  files: EmployeeFile[];
  canManage: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const canAddMore = slot.multiple || files.length === 0;
  const replaceFileIds = slot.multiple
    ? []
    : files.map((file) => file.storageFileId).filter((id): id is string => Boolean(id));

  return (
    <div className="rounded-xl border border-border-soft bg-bg p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-border-soft text-muted-2">
          <IdCard size={14} />
        </span>
        <span className="text-[13px] font-semibold text-ink">{slot.label}</span>
      </div>

      {files.length === 0 ? (
        <p className="text-[11.5px] text-muted">Keine Datei hinterlegt.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {files.map((file) => (
            <div
              key={file.storageFileId ?? file.name}
              className="flex items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-ink">{file.name}</div>
                <div className="font-mono text-[10px] text-muted">{file.updatedAt}</div>
              </div>
              <OwnerFileActions tenant={tenant} storageFileId={file.storageFileId} name={file.name} />
              {canManage && file.storageFileId && (
                <>
                  <form id={`delete-doc-${file.storageFileId}`} action={deleteEmployeeDocumentSlotFileAction}>
                    <input type="hidden" name="tenant" value={tenant} />
                    <input type="hidden" name="employeeHandle" value={employeeHandle} />
                    <input type="hidden" name="fileId" value={file.storageFileId} />
                  </form>
                  <ConfirmSubmitButton
                    form={`delete-doc-${file.storageFileId}`}
                    className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-border bg-white text-muted transition-colors hover:border-danger hover:text-danger"
                    title="Entfernen"
                    confirmLabel="Entfernen"
                    description={`"${file.name}" wird entfernt.`}
                  >
                    <Trash2 size={13} />
                  </ConfirmSubmitButton>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && canAddMore && (
        <form ref={formRef} action={uploadEmployeeDocumentSlotAction} className="mt-2.5">
          <input type="hidden" name="tenant" value={tenant} />
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="employeeHandle" value={employeeHandle} />
          <input type="hidden" name="folderSlug" value={slot.key} />
          <input type="hidden" name="folderName" value={slot.label} />
          <input type="hidden" name="documentType" value={slot.label} />
          {replaceFileIds.map((id) => (
            <input key={id} type="hidden" name="replaceFileIds" value={id} />
          ))}
          <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] font-medium text-ink hover:text-muted">
            <input
              type="file"
              name="file"
              className="hidden"
              onChange={() => formRef.current?.requestSubmit()}
            />
            <Plus size={12} />
            {files.length > 0
              ? slot.multiple
                ? "Weitere Datei hinzufügen"
                : "Datei ersetzen"
              : "Datei hochladen"}
          </label>
        </form>
      )}
    </div>
  );
}
