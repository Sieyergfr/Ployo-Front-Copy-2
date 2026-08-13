"use client";

import { useTransition } from "react";
import { getHrFileSignedUrlAction } from "@/app/(dashboard)/u/[tenant]/dateien/actions";
import { Download } from "lucide-react";

export default function PayrollDownloadButton({
  tenant,
  fileId,
}: {
  tenant: string;
  fileId: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink disabled:cursor-wait disabled:opacity-60"
      title="Herunterladen"
      aria-label="Gehaltsabrechnung herunterladen"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const url = await getHrFileSignedUrlAction({
            tenant,
            fileId,
            disposition: "attachment",
          });
          window.open(url, "_blank", "noopener,noreferrer");
        })
      }
    >
      <Download size={14} />
    </button>
  );
}
