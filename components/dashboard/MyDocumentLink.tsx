"use client";

import { useToast } from "@/components/Toasts";
import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/** Öffnet ein eigenes Dokument über dieselbe signierte URL wie die App (`/api/me/documents/[id]/download`). */
export default function MyDocumentLink({
  tenant,
  fileId,
  name,
  badge,
  source = "documents",
}: {
  tenant: string;
  fileId: string;
  name: string;
  badge?: ReactNode;
  /** "shared-files": Datei aus einem für mich freigegebenen Ordner (M1). */
  source?: "documents" | "shared-files";
}) {
  const t = useTranslations("MyArea");
  const { toast } = useToast();

  async function open() {
    // Fenster vorab öffnen, sonst blockieren Browser das spätere `window.open`.
    // (Mit "noopener" liefert window.open null — deshalb `opener` von Hand trennen.)
    const target = window.open("", "_blank");

    if (target) target.opener = null;

    const response = await fetch(
      `/api/me/${source}/${encodeURIComponent(fileId)}/download?tenant=${encodeURIComponent(tenant)}`,
    ).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { url?: string; error?: string } | null;

    if (!response?.ok || !data?.url) {
      target?.close();
      toast({ tone: "error", title: data?.error ?? t("documentOpenError") });
      return;
    }

    if (target) {
      target.location.href = data.url;
    } else {
      window.location.href = data.url;
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      className="db-focus flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-1 py-2.5 text-left hover:bg-[#fafaf8]"
    >
      <FileText size={17} className="shrink-0 text-[#8f8f8a]" />
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{name}</span>
      {badge}
    </button>
  );
}
