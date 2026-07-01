import FilesBrowser from "@/components/FilesBrowser";
import AuditLogPanel from "@/components/AuditLogPanel";
import PageHeader from "@/components/PageHeader";
import { makeFileAuditLogs } from "@/lib/audit";
import {
  fileFolders,
  fileMetrics,
  files,
  getFileByPath,
  getFileFolderByPath,
  getFileVersions,
  getFilesByFolderSlug,
  type FileItem,
} from "@/lib/files";
import { Archive, ArrowLeft, FileText, Lock, Upload } from "lucide-react";
import Link from "next/link";
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

function FileInfoCard({ file }: { file: FileItem }) {
  const versions = getFileVersions(file);

  return (
    <section className="rounded-card border border-border bg-white px-6 py-[22px]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-border-soft text-muted-2">
            <FileText size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-display text-[22px] font-semibold tracking-[-0.4px] text-ink">
              {file.name}
            </h2>
            <div className="mt-1 font-mono text-[10.5px] text-muted">
              {file.folder} · {file.type} · {file.size} · v{file.version}
            </div>
          </div>
        </div>
        <button type="button" className="btn btn-primary btn-sm">
          <Upload size={14} />
          Neue Version hochladen
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Verantwortlich", file.owner],
          ["Aktualisiert", file.updatedAt],
          ["Ablaufdatum", file.expiresAt ?? "Kein Ablaufdatum"],
          ["Erinnerung", file.reminder ?? "Keine Erinnerung"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border-soft bg-bg p-3">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
              {label}
            </div>
            <div className="mt-1.5 text-[12.5px] font-semibold text-ink">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-bg p-4">
          <div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
            <Lock size={14} />
            Zugriffsberechtigung
          </div>
          <div className="flex flex-wrap gap-2">
            {file.accessRoles.map((role) => (
              <span key={role} className="rounded-[7px] border border-border-light bg-white px-2 py-[5px] text-[11.5px] text-ink">
                {role}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-bg p-4">
          <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
            Mitarbeiter-Override
          </div>
          {file.employeeOverrides.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {file.employeeOverrides.map((employee) => (
                <span key={employee} className="rounded-[7px] border border-success/25 bg-success/10 px-2 py-[5px] text-[11.5px] text-success">
                  {employee}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[12.5px] text-muted">Keine individuellen Freigaben.</div>
          )}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
          Versionen
        </div>
        {versions.map((version) => (
          <div key={version.version} className="grid gap-3 border-t border-border-soft py-3 sm:grid-cols-[80px_1fr_160px]">
            <div className="font-mono text-[12px] font-semibold text-ink">
              v{version.version}
            </div>
            <div className="text-[12.5px] text-muted-2">{version.note}</div>
            <div className="font-mono text-[10.5px] text-muted">
              {version.uploadedBy} · {version.uploadedAt}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function FilesPageContent({
  tenant,
  path = [],
}: {
  tenant: string;
  path?: string[];
}) {
  const activeFile = getFileByPath(path);
  const activeFolder = getFileFolderByPath(path);

  if (path.length === 2 && !activeFile) {
    notFound();
  }

  if (path.length > 0 && path.length !== 2 && !activeFolder) {
    notFound();
  }

  const visibleFiles = getFilesByFolderSlug(activeFolder?.slug);
  const baseHref = `/u/${tenant}/dateien`;

  if (activeFile) {
    return (
      <>
        <div className="mb-[18px]">
          <Link href={`${baseHref}/${activeFile.folderSlug}`} className="btn btn-secondary btn-sm">
            <ArrowLeft size={14} />
            Zurück zum Ordner
          </Link>
        </div>
        <FileInfoCard file={activeFile} />
        <div className="mt-4">
          <AuditLogPanel entries={makeFileAuditLogs(activeFile.name)} title="Datei Audit Log" />
        </div>
      </>
    );
  }

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
