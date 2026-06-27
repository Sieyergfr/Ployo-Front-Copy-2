import FilesBrowser from "@/components/FilesBrowser";
import PageHeader from "@/components/PageHeader";
import {
  fileFolders,
  fileMetrics,
  files,
  getFileFolderByPath,
  getFilesByFolderSlug,
} from "@/lib/files";
import { Archive } from "lucide-react";
import { notFound } from "next/navigation";

function FileMetricCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-[14px] border border-border bg-white px-5 pt-5 pb-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-muted">
        {label}
      </div>
      <div className="my-[14px] mb-[9px] font-display text-[38px] font-semibold leading-none tracking-[-1.2px] text-ink">
        {value}
      </div>
      <div className="text-[12px] text-muted">{caption}</div>
    </div>
  );
}

export default function FilesPageContent({
  tenant,
  path = [],
}: {
  tenant: string;
  path?: string[];
}) {
  const activeFolder = getFileFolderByPath(path);

  if (path.length > 0 && !activeFolder) {
    notFound();
  }

  const visibleFiles = getFilesByFolderSlug(activeFolder?.slug);
  const baseHref = `/u/${tenant}/dateien`;

  return (
    <>
      <PageHeader
        eyebrow="Dokumentenablage"
        title="Dateien"
        subtitle={`${fileFolders.length} Ordner \u00b7 ${files.length} Dateien`}
      >
        <button type="button" className="btn btn-primary">
          <Archive size={15} />
          ZIP importieren
        </button>
      </PageHeader>

      <section className="mb-7 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        {fileMetrics.map((metric) => (
          <FileMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <FilesBrowser
        folders={fileFolders}
        files={visibleFiles}
        activeFolder={activeFolder}
        baseHref={baseHref}
      />

      <div className="mt-8 text-center font-mono text-[10px] tracking-[0.4px] text-[#B0B0AB]">
        Ployo {"\u00b7"} Personalakte-System {"\u00b7"} Alle Zugriffe
        protokolliert {"\u00b7"} Server in Frankfurt
      </div>
    </>
  );
}
