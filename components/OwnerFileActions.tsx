"use client";

import { getHrFileSignedUrlAction } from "@/app/(dashboard)/u/[tenant]/dateien/actions";
import { Download, Eye } from "lucide-react";
import { useTransition } from "react";

/**
 * Ansehen/Herunterladen für an Mitarbeiter/Standorte/Teams gehängte Dateien
 * (`EmployeeFile`/`LocationFile`/`TeamFile` — identisches, reduziertes
 * Schema ohne die vollen `FileItem`-Felder der zentralen Dateien-Ablage).
 * Nutzt denselben Signed-URL-Weg wie `FileViewButton`/`FileDownloadButton`
 * dort, aber ohne deren Abhängigkeit vom vollen `FileItem`-Typ — diese
 * Dateien haben nur `storageFileId`/`name`, keine Version/Zugriffsrollen/etc.
 */
export function OwnerFileActions({
  tenant,
  storageFileId,
  name,
}: {
  tenant: string;
  storageFileId?: string;
  name: string;
}) {
  const [isPending, startTransition] = useTransition();

  if (!storageFileId) {
    return null;
  }

  const open = (disposition: "inline" | "attachment") =>
    startTransition(async () => {
      const url = await getHrFileSignedUrlAction({ tenant, fileId: storageFileId, disposition });
      window.open(url, "_blank", "noopener,noreferrer");
    });

  return (
    <div className="flex shrink-0 gap-1.5">
      <button
        type="button"
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink disabled:cursor-wait disabled:opacity-60"
        title="Ansehen"
        aria-label={`${name} ansehen`}
        disabled={isPending}
        onClick={() => open("inline")}
      >
        <Eye size={14} />
      </button>
      <button
        type="button"
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink disabled:cursor-wait disabled:opacity-60"
        title="Herunterladen"
        aria-label={`${name} herunterladen`}
        disabled={isPending}
        onClick={() => open("attachment")}
      >
        <Download size={14} />
      </button>
    </div>
  );
}
