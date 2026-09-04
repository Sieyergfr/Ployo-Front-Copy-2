"use client";

import { Download, Eye } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Ansehen/Herunterladen einer Gehaltsabrechnung.
 *
 * Bewusst NICHT über eine vorsignierte S3-URL wie die übrigen Dateien: die
 * ist, solange sie gültig ist, für jeden aufrufbar, der den Link hat. Der
 * Stream-Endpunkt darunter verlangt bei jedem Aufruf eine gültige Anmeldung
 * und gibt die Speicher-URL nie heraus (siehe lib/storage/file-stream.ts).
 */
export default function PayrollDownloadButton({
  tenant,
  fileId,
}: {
  tenant: string;
  fileId: string;
}) {
  const t = useTranslations("PayrollDownloadButton");
  const href = (disposition: "inline" | "attachment") =>
    `/api/tenants/${encodeURIComponent(tenant)}/files/${encodeURIComponent(fileId)}/content?disposition=${disposition}`;

  return (
    <div className="flex shrink-0 gap-1.5">
      <a
        href={href("inline")}
        target="_blank"
        rel="noopener noreferrer"
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
        title={t("view")}
        aria-label={t("viewAria")}
      >
        <Eye size={14} />
      </a>
      <a
        href={href("attachment")}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
        title={t("download")}
        aria-label={t("downloadAria")}
      >
        <Download size={14} />
      </a>
    </div>
  );
}
