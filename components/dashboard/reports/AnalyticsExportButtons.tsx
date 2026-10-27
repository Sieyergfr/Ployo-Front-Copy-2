"use client";

import { exportReportAnalyticsAction } from "@/app/(dashboard)/u/[tenant]/reports/actions";
import { secondaryClass } from "@/components/dashboard/ui";
import { useToast } from "@/components/Toasts";
import { Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

function download(file: { filename: string; contentType: string; base64: string }) {
  const binary = atob(file.base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType }));
  const link = document.createElement("a");

  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** PDF-/Excel-Export der Analyse-Tabs (Überstunden, Abwesenheiten, ArbZG, Personal). */
export default function AnalyticsExportButtons({ tenant, tab }: { tenant: string; tab: string }) {
  const t = useTranslations("ReportsPage");
  const { toast } = useToast();
  const [pending, setPending] = useState<"pdf" | "xlsx" | null>(null);

  async function run(format: "pdf" | "xlsx") {
    setPending(format);
    const result = await exportReportAnalyticsAction({ tenant, tab, format });
    setPending(null);

    if (result.error || !result.file) {
      toast({ tone: "error", title: result.error ?? t("exportFailed") });
      return;
    }

    download(result.file);
  }

  return (
    <>
      {(["pdf", "xlsx"] as const).map((format) => (
        <button key={format} type="button" className={secondaryClass} onClick={() => run(format)} disabled={pending !== null}>
          {pending === format ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          {format === "pdf" ? t("exportPdf") : t("exportExcel")}
        </button>
      ))}
    </>
  );
}
