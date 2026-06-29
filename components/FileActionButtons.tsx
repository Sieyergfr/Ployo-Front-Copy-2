"use client";

import { useUniversalPopup } from "@/components/UniversalPopup";
import { FileUp, FolderPlus, Upload } from "lucide-react";

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
