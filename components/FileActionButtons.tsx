"use client";

import { useUniversalPopup } from "@/components/UniversalPopup";
import {
  Download,
  Eye,
  FileUp,
  FolderPlus,
  Upload,
  UploadCloud,
} from "lucide-react";
import {
  getFileDownloadHref,
  getFileDownloadName,
  type FileItem,
  type FileVersion,
} from "@/lib/files";

const previewableFileTypes = new Set(["PDF", "PNG", "JPG", "JPEG"]);

function isPreviewableFile(file: FileItem) {
  return previewableFileTypes.has(file.type.toUpperCase());
}

function CreateFolderForm({ onDone }: { onDone: () => void }) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onDone();
      }}
    >
      <div className="field">
        <label htmlFor="folder-name" className="label">
          Ordnername
        </label>
        <input
          id="folder-name"
          name="name"
          className="input"
          placeholder="z. B. Verträge 2026"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="folder-owner" className="label">
          Verantwortlich
        </label>
        <input
          id="folder-owner"
          name="owner"
          className="input"
          placeholder="HR-Team"
        />
      </div>

      <label className="checkbox-row">
        <input type="checkbox" name="locked" className="peer sr-only" />
        <span className="checkbox" />
        <span className="checkbox-label">Ordner schützen</span>
      </label>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary">
          <FolderPlus size={15} />
          Ordner erstellen
        </button>
      </div>
    </form>
  );
}

function UploadFileForm({ onDone }: { onDone: () => void }) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onDone();
      }}
    >
      <label
        htmlFor="file-upload"
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg px-4 py-8 text-center transition-colors hover:border-muted"
      >
        <FileUp size={24} className="mb-3 text-muted-2" />
        <span className="text-[13.5px] font-semibold text-ink">
          Datei auswählen
        </span>
        <span className="mt-1 text-[12px] text-muted">
          PDF, DOCX, PNG oder JPG
        </span>
      </label>
      <input id="file-upload" name="file" type="file" className="sr-only" />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="file-folder" className="label">
            Zielordner
          </label>
          <input
            id="file-folder"
            name="folder"
            className="input"
            placeholder="Aktueller Ordner"
          />
        </div>

        <div className="field">
          <label htmlFor="file-owner" className="label">
            Verantwortlich
          </label>
          <input
            id="file-owner"
            name="owner"
            className="input"
            placeholder="HR-Team"
          />
        </div>
      </div>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary">
          <Upload size={15} />
          Hochladen
        </button>
      </div>
    </form>
  );
}

function UploadVersionForm({
  file,
  onDone,
}: {
  file: FileItem;
  onDone: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onDone();
      }}
    >
      <p className="max-w-[420px] text-[13px] leading-5 text-muted">
        Lade eine neue Datei fÃ¼r {file.name} hoch. Die aktuelle Version bleibt
        in der Historie verfÃ¼gbar.
      </p>

      <label
        htmlFor={`version-upload-${file.slug}`}
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg px-4 py-8 text-center transition-colors hover:border-muted"
      >
        <UploadCloud size={25} className="mb-3 text-muted-2" />
        <span className="text-[13.5px] font-semibold text-ink">
          Versionsdatei auswÃ¤hlen
        </span>
        <span className="mt-1 text-[12px] text-muted">
          Ersetzt die aktuelle Datei als v{file.version + 1}
        </span>
      </label>
      <input
        id={`version-upload-${file.slug}`}
        name="file"
        type="file"
        className="sr-only"
      />

      <div className="field">
        <label htmlFor={`version-title-${file.slug}`} className="label">
          Titel
        </label>
        <input
          id={`version-title-${file.slug}`}
          name="title"
          className="input"
          defaultValue={`Neue Version von ${file.name}`}
          required
        />
      </div>

      <div className="field">
        <label htmlFor={`version-description-${file.slug}`} className="label">
          Beschreibung
        </label>
        <textarea
          id={`version-description-${file.slug}`}
          name="description"
          className="input min-h-24 resize-y py-3"
          placeholder="Was wurde geÃ¤ndert?"
        />
      </div>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary">
          <Upload size={15} />
          Version hochladen
        </button>
      </div>
    </form>
  );
}

function FilePreviewContent({
  file,
  versionNumber,
}: {
  file: FileItem;
  versionNumber: number;
}) {
  const isPreviewable = isPreviewableFile(file);
  const isImage = ["PNG", "JPG", "JPEG"].includes(file.type.toUpperCase());

  if (!isPreviewable) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg px-6 py-10 text-center">
        <FileUp size={28} className="mb-3 text-muted-2" />
        <div className="font-display text-[18px] font-semibold text-ink">
          Vorschau nicht verfÃ¼gbar
        </div>
        <p className="mt-2 max-w-[420px] text-[13px] leading-5 text-muted">
          {file.type}-Dateien kÃ¶nnen aktuell nicht direkt im Browser angezeigt
          werden. Lade die Version herunter, um sie lokal zu Ã¶ffnen.
        </p>
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-bg">
        <div className="flex aspect-[16/10] items-center justify-center bg-[linear-gradient(135deg,#f7f7f4_0%,#ecece7_100%)]">
          <div className="rounded-[14px] border border-border bg-white px-6 py-5 text-center shadow-sm">
            <FileUp size={32} className="mx-auto mb-3 text-muted-2" />
            <div className="font-display text-[18px] font-semibold text-ink">
              Bildvorschau
            </div>
            <div className="mt-1 font-mono text-[10.5px] text-muted">
              {file.name} Â· v{versionNumber}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#EFEFEA] p-4">
      <div className="mx-auto min-h-[440px] max-w-[520px] rounded-[10px] border border-border bg-white px-8 py-7 shadow-sm">
        <div className="mb-6 flex items-start justify-between gap-4 border-b border-border-soft pb-4">
          <div>
            <div className="font-display text-[20px] font-semibold text-ink">
              {file.name}
            </div>
            <div className="mt-1 font-mono text-[10.5px] text-muted">
              {file.folder} Â· Version {versionNumber}
            </div>
          </div>
          <span className="rounded-[7px] border border-border-light px-2 py-1 font-mono text-[10px] text-muted-2">
            {file.type}
          </span>
        </div>
        <div className="space-y-3">
          <div className="h-3 w-11/12 rounded-full bg-border-soft" />
          <div className="h-3 w-full rounded-full bg-border-soft" />
          <div className="h-3 w-9/12 rounded-full bg-border-soft" />
          <div className="pt-3" />
          <div className="h-28 rounded-[10px] border border-border-soft bg-bg" />
          <div className="pt-3" />
          <div className="h-3 w-full rounded-full bg-border-soft" />
          <div className="h-3 w-10/12 rounded-full bg-border-soft" />
          <div className="h-3 w-8/12 rounded-full bg-border-soft" />
        </div>
      </div>
    </div>
  );
}

export function FileViewButton({
  file,
  version,
  label = "Ansehen",
  compact = false,
}: {
  file: FileItem;
  version?: FileVersion;
  label?: string;
  compact?: boolean;
}) {
  const { openPopup } = useUniversalPopup();
  const versionNumber = version?.version ?? file.version;
  const openPreview = () =>
    openPopup({
      title: `${file.name} Â· v${versionNumber}`,
      className: "max-w-[900px]",
      content: <FilePreviewContent file={file} versionNumber={versionNumber} />,
    });

  if (compact) {
    return (
      <button
        type="button"
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
        title={`Version ${versionNumber} ansehen`}
        aria-label={`${file.name} Version ${versionNumber} ansehen`}
        onClick={openPreview}
      >
        <Eye size={14} />
      </button>
    );
  }

  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={openPreview}>
      <Eye size={14} />
      {label}
    </button>
  );
}

export function FileDownloadButton({
  file,
  version,
  label = "Download",
  compact = false,
}: {
  file: FileItem;
  version?: FileVersion;
  label?: string;
  compact?: boolean;
}) {
  const versionNumber = version?.version ?? file.version;
  const downloadName = version?.downloadName ?? getFileDownloadName(file);
  const downloadHref = version?.downloadHref ?? getFileDownloadHref(file);

  if (compact) {
    return (
      <a
        href={downloadHref}
        download={downloadName}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
        title={`Version ${versionNumber} herunterladen`}
        aria-label={`${file.name} Version ${versionNumber} herunterladen`}
      >
        <Download size={14} />
      </a>
    );
  }

  return (
    <a href={downloadHref} download={downloadName} className="btn btn-secondary btn-sm">
      <Download size={14} />
      {label}
    </a>
  );
}

export function VersionUploadButton({
  file,
  compact = false,
}: {
  file: FileItem;
  compact?: boolean;
}) {
  const { openPopup, closePopup } = useUniversalPopup();
  const openVersionPopup = () =>
    openPopup({
      title: "Neue Version hochladen",
      content: <UploadVersionForm file={file} onDone={closePopup} />,
    });

  if (compact) {
    return (
      <button
        type="button"
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
        title="Neue Version hochladen"
        aria-label={`Neue Version fÃ¼r ${file.name} hochladen`}
        onClick={openVersionPopup}
      >
        <Upload size={14} />
      </button>
    );
  }

  return (
    <button type="button" className="btn btn-primary btn-sm" onClick={openVersionPopup}>
      <Upload size={14} />
      Neue Version hochladen
    </button>
  );
}

export function CreateFolderButton() {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={() =>
        openPopup({
          title: "Ordner erstellen",
          content: <CreateFolderForm onDone={closePopup} />,
        })
      }
    >
      <FolderPlus size={14} />
      Ordner erstellen
    </button>
  );
}

export function UploadFileButton() {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      onClick={() =>
        openPopup({
          title: "Datei hochladen",
          content: <UploadFileForm onDone={closePopup} />,
        })
      }
    >
      <Upload size={14} />
      Datei hochladen
    </button>
  );
}
