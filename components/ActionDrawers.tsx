"use client";

import {
  approveVacationRequestAction,
  deleteVacationRequestAction,
  rejectVacationRequestAction,
  updateVacationRequestAction,
} from "@/app/(dashboard)/u/[tenant]/urlaub/actions";
import {
  closeSicknessReportAction,
  updateSicknessReportAction,
} from "@/app/(dashboard)/u/[tenant]/krankheit/actions";
import { updateShiftSettingsAction } from "@/app/(dashboard)/u/[tenant]/schichtplanung/actions";
import { OpeningHoursEditor } from "@/components/OpeningHoursEditor";
import type { OpeningHoursDay } from "@/lib/opening-hours";
import type { ShiftPreset } from "@/lib/shift-presets";
import {
  createReminderAction,
  updateReminderAction,
} from "@/app/(dashboard)/u/[tenant]/erinnerungen/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import DatePickerField from "@/components/DatePickerField";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useUniversalPopup } from "@/components/UniversalPopup";
import type {
  ReminderFileBrowserData,
  ReminderFileBrowserSource,
} from "@/lib/files";
import type { Reminder } from "@/lib/reminders";
import type { CurrentSickness, SicknessHistoryItem } from "@/lib/sickness";
import type { VacationRequest } from "@/lib/vacations";
import {
  BellPlus,
  Check,
  FileText,
  Folder,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export type ShiftPlanningSettings = {
  weekStart: string;
  minStaffing: number;
  breakRule: string;
  presets: ShiftPreset[];
  defaultOpeningHours: OpeningHoursDay[];
};

const sourceLabels = {
  central: "Zentral",
  employee: "Mitarbeiter",
  location: "Standort",
} satisfies Record<ReminderFileBrowserSource, string>;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function RightDrawer({
  title,
  eyebrow,
  children,
  onClose,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  // Über ein Portal nach `document.body` rendern: einige Aufrufer sitzen
  // innerhalb von Zeilen/Karten mit einer (z. B. nur bei Hover aktiven)
  // `transform`-Utility-Klasse. Ein Vorfahre mit `transform` erzeugt einen
  // neuen Containing Block für `position: fixed` — die Sidebar würde dann
  // innerhalb dieser Zeile statt am rechten Fensterrand aufgehen. Erst nach
  // dem Client-Mount rendern, da `document.body` serverseitig nicht existiert.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      className="action-drawer-backdrop fixed inset-0 z-[1000] flex justify-end bg-black/35 backdrop-blur-[4px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="action-drawer-panel h-full w-full max-w-[560px] overflow-y-auto border-l border-border bg-white p-6 shadow-[-20px_0_70px_rgba(0,0,0,0.18)]"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            {eyebrow && (
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                {eyebrow}
              </div>
            )}
            <h2 className="mt-1 font-display text-[24px] font-semibold leading-tight text-ink">
              {title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Sidebar schließen"
            title="Schließen"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
        {children}
      </aside>
    </div>,
    document.body,
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function getOwnerOptions(data: ReminderFileBrowserData, source: ReminderFileBrowserSource) {
  const options = new Map<string, string>();

  for (const file of data.files) {
    if (file.source === source) {
      options.set(file.ownerId, file.ownerName);
    }
  }

  for (const folder of data.folders) {
    if (folder.source === source) {
      options.set(folder.ownerId, folder.ownerName);
    }
  }

  if (source === "central" && options.size === 0) {
    options.set("central", "Zentral");
  }

  return Array.from(options, ([id, name]) => ({ id, name }));
}

function isDirectChild(path: string, currentPath: string) {
  if (!currentPath) {
    return !path.includes("/");
  }

  const prefix = `${currentPath}/`;

  return path.startsWith(prefix) && path.slice(prefix.length).split("/").length === 1;
}

export function LinkedFileBrowser({
  selectedIds,
  setSelectedIds,
  fileBrowserData = { files: [], folders: [] },
}: {
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  fileBrowserData?: ReminderFileBrowserData;
}) {
  const [source, setSource] = useState<ReminderFileBrowserSource>("central");
  const [ownerId, setOwnerId] = useState("central");
  const [currentPath, setCurrentPath] = useState("");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const owners = useMemo(
    () => getOwnerOptions(fileBrowserData, source),
    [fileBrowserData, source],
  );
  const selectedOwnerId = owners.some((owner) => owner.id === ownerId)
    ? ownerId
    : owners[0]?.id || (source === "central" ? "central" : "");
  // Bei aktiver Suche wird der gesamte Quelle-/Besitzer-Bereich durchsucht statt
  // nur der aktuell geöffnete Ordner — sonst liefert die Suche nichts, sobald
  // die gesuchte Datei in einem anderen Ordner liegt.
  const visibleFolders = fileBrowserData.folders.filter(
    (folder) =>
      folder.source === source &&
      folder.ownerId === selectedOwnerId &&
      (normalizedQuery.length > 0
        ? `${folder.name} ${folder.ownerName}`.toLowerCase().includes(normalizedQuery)
        : isDirectChild(folder.path, currentPath)),
  );
  const visibleFiles = fileBrowserData.files.filter(
    (file) =>
      file.source === source &&
      file.ownerId === selectedOwnerId &&
      (normalizedQuery.length > 0
        ? `${file.name} ${file.folderName} ${file.ownerName}`
            .toLowerCase()
            .includes(normalizedQuery)
        : file.folderSlug === currentPath),
  );
  const selectedFiles = fileBrowserData.files.filter((file) =>
    selectedIds.includes(file.id),
  );

  function toggleFile(fileId: string) {
    setSelectedIds(
      selectedIds.includes(fileId)
        ? selectedIds.filter((id) => id !== fileId)
        : [...selectedIds, fileId],
    );
  }

  function selectSource(nextSource: ReminderFileBrowserSource) {
    const nextOwners = getOwnerOptions(fileBrowserData, nextSource);

    setSource(nextSource);
    setOwnerId(nextOwners[0]?.id || (nextSource === "central" ? "central" : ""));
    setCurrentPath("");
  }

  return (
    <section className="rounded-xl border border-border bg-bg p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Paperclip size={15} className="text-muted" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            Dateien verlinken
          </span>
        </div>
        <span className="rounded-[7px] border border-border bg-white px-2 py-[3px] font-mono text-[10px] text-muted">
          {selectedIds.length} gewählt
        </span>
      </div>

      <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-border-soft p-1">
        {(Object.keys(sourceLabels) as ReminderFileBrowserSource[]).map((item) => (
          <button
            key={item}
            type="button"
            className={cx(
              "shrink-0 cursor-pointer rounded-[9px] px-3 py-2 text-[12px] transition-colors",
              source === item
                ? "bg-white font-semibold text-ink shadow-sm"
                : "text-muted hover:text-ink",
            )}
            onClick={() => selectSource(item)}
          >
            {sourceLabels[item]}
          </button>
        ))}
      </div>

      {source !== "central" && (
        <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
          {owners.map((owner) => (
            <button
              key={owner.id}
              type="button"
              className={cx(
                "shrink-0 cursor-pointer rounded-[9px] border px-3 py-2 text-[12px] transition-colors",
                selectedOwnerId === owner.id
                  ? "border-ink bg-white font-semibold text-ink"
                  : "border-border bg-white text-muted hover:border-muted hover:text-ink",
              )}
              onClick={() => {
                setOwnerId(owner.id);
                setCurrentPath("");
              }}
            >
              {owner.name}
            </button>
          ))}
        </div>
      )}

      <input
        type="search"
        className="input mb-3 bg-white"
        placeholder="Datei oder Ordner suchen"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="mb-3 flex items-center gap-2 text-[11px] text-muted">
        <button
          type="button"
          className="cursor-pointer font-semibold text-ink hover:text-muted"
          onClick={() => setCurrentPath("")}
        >
          Home
        </button>
        {currentPath && <span>/</span>}
        {currentPath && <span className="truncate">{currentPath}</span>}
      </div>

      <div className="grid max-h-[280px] gap-2 overflow-y-auto pr-1">
        {currentPath && (
          <button
            type="button"
            className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-border bg-white p-3 text-left transition-colors hover:border-muted"
            onClick={() => setCurrentPath(currentPath.split("/").slice(0, -1).join("/"))}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-bg text-muted">
              <Folder size={14} />
            </span>
            <span className="text-[13px] font-semibold text-ink">Zurück</span>
          </button>
        )}

        {visibleFolders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-border bg-white p-3 text-left transition-colors hover:border-muted"
            onClick={() => setCurrentPath(folder.path)}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-bg text-muted">
              <Folder size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink">
                {folder.name}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-muted">
                {folder.fileCount} Dateien {"\u00b7"} {folder.ownerName}
              </span>
            </span>
          </button>
        ))}

        {visibleFiles.map((file) => {
          const isSelected = selectedIds.includes(file.id);

          return (
            <button
              key={file.id}
              type="button"
              className={cx(
                "flex cursor-pointer items-center gap-3 rounded-[10px] border bg-white p-3 text-left transition-colors",
                isSelected ? "border-ink" : "border-border hover:border-muted",
              )}
              onClick={() => toggleFile(file.id)}
            >
              <span
                className={cx(
                  "flex size-5 shrink-0 items-center justify-center rounded-[6px] border",
                  isSelected
                    ? "border-ink bg-ink text-white"
                    : "border-border text-transparent",
                )}
              >
                <Check size={13} />
              </span>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-bg text-muted">
                <FileText size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">
                  {file.name}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted">
                  {file.folderName || "Home"} {"\u00b7"} {file.ownerName} {"\u00b7"} {file.updatedAt}
                </span>
              </span>
              <span className="rounded-[7px] border border-border-light px-2 py-[3px] font-mono text-[10px] text-muted-2">
                {file.type}
              </span>
            </button>
          );
        })}

        {visibleFolders.length === 0 && visibleFiles.length === 0 && (
          <div className="rounded-[10px] border border-dashed border-border bg-white px-4 py-6 text-center text-[12px] text-muted">
            Keine Dateien gefunden.
          </div>
        )}
      </div>

      {selectedFiles.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {selectedFiles.map((file) => (
            <button
              key={file.id}
              type="button"
              className="cursor-pointer rounded-[8px] border border-border bg-white px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:border-danger/30 hover:text-danger"
              onClick={() => toggleFile(file.id)}
            >
              {file.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ReminderFields({
  tenant,
  returnPath,
  reminderId,
  defaultTitle,
  defaultContext,
  defaultDueDate = "",
  defaultPriority = "normal",
  defaultCategory = "Allgemein",
  defaultNotes = "",
  defaultLinkedFiles = [],
  fileBrowserData,
  onCancel,
  canManage = true,
}: {
  tenant: string;
  returnPath: string;
  reminderId?: string;
  defaultTitle: string;
  defaultContext: string;
  defaultDueDate?: string;
  defaultPriority?: Reminder["priority"];
  defaultCategory?: string;
  defaultNotes?: string;
  defaultLinkedFiles?: string[];
  fileBrowserData?: ReminderFileBrowserData;
  onCancel: () => void;
  canManage?: boolean;
}) {
  const [linkedFiles, setLinkedFiles] = useState<string[]>(defaultLinkedFiles);

  return (
    <form
      className="flex flex-col gap-4"
      action={reminderId ? updateReminderAction : createReminderAction}
    >
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <input type="hidden" name="reminderId" value={reminderId ?? ""} />
      {linkedFiles.map((fileId) => (
        <input key={fileId} type="hidden" name="linkedFiles" value={fileId} />
      ))}
      <fieldset disabled={!canManage} className="flex flex-col gap-4 border-0 p-0">
        <Field label="Titel">
          <input name="title" className="input" defaultValue={defaultTitle} required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ablaufdatum">
            <DatePickerField
              name="dueDate"
              defaultValue={defaultDueDate}
              placeholder="Datum auswählen"
            />
          </Field>
          <Field label="Priorität">
            <select
              name="priority"
              className="input cursor-pointer bg-bg"
              defaultValue={defaultPriority}
            >
              <option value="urgent">Dringend</option>
              <option value="important">Wichtig</option>
              <option value="normal">Normal</option>
            </select>
          </Field>
        </div>
        <Field label="Bezug">
          <input name="subject" className="input" defaultValue={defaultContext} />
        </Field>
        <Field label="Kategorie">
          <input name="category" className="input" defaultValue={defaultCategory} />
        </Field>
        <Field label="Hinweise">
          <textarea
            name="notes"
            className="input min-h-28 resize-none"
            placeholder="Interne Hinweise, nächste Schritte oder Kontext ergänzen"
            defaultValue={defaultNotes}
          />
        </Field>
        <LinkedFileBrowser
          selectedIds={linkedFiles}
          setSelectedIds={setLinkedFiles}
          fileBrowserData={fileBrowserData}
        />
      </fieldset>
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {canManage ? "Abbrechen" : "Schließen"}
        </button>
        {canManage && (
          <button type="submit" className="btn btn-primary">
            <Save size={15} />
            Speichern
          </button>
        )}
      </div>
    </form>
  );
}

export function ReminderDrawerButton({
  reminder,
  tenant,
  returnPath,
  fileBrowserData,
  canManage = true,
}: {
  reminder: Reminder;
  tenant: string;
  returnPath: string;
  fileBrowserData?: ReminderFileBrowserData;
  canManage?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setIsOpen(true)}
      >
        Details
      </button>
      {isOpen && (
        <RightDrawer
          eyebrow="Erinnerung"
          title={reminder.title}
          onClose={() => setIsOpen(false)}
        >
          <ReminderFields
            tenant={tenant}
            returnPath={returnPath}
            reminderId={reminder.id}
            defaultTitle={reminder.title}
            defaultContext={reminder.subject}
            defaultDueDate={reminder.dueDate}
            defaultPriority={reminder.priority}
            defaultCategory={reminder.category}
            defaultNotes={reminder.notes}
            defaultLinkedFiles={reminder.linkedFiles}
            fileBrowserData={fileBrowserData}
            onCancel={() => setIsOpen(false)}
            canManage={canManage}
          />
        </RightDrawer>
      )}
    </>
  );
}

export function ReminderRowButton({
  reminder,
  tenant,
  returnPath,
  fileBrowserData,
  className,
  children,
  canManage = true,
}: {
  reminder: Reminder;
  tenant: string;
  returnPath: string;
  fileBrowserData?: ReminderFileBrowserData;
  className: string;
  children: ReactNode;
  canManage?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setIsOpen(true)}>
        {children}
      </button>
      {isOpen && (
        <RightDrawer
          eyebrow="Erinnerung"
          title={reminder.title}
          onClose={() => setIsOpen(false)}
        >
          <ReminderFields
            tenant={tenant}
            returnPath={returnPath}
            reminderId={reminder.id}
            defaultTitle={reminder.title}
            defaultContext={reminder.subject}
            defaultDueDate={reminder.dueDate}
            defaultPriority={reminder.priority}
            defaultCategory={reminder.category}
            defaultNotes={reminder.notes}
            defaultLinkedFiles={reminder.linkedFiles}
            fileBrowserData={fileBrowserData}
            onCancel={() => setIsOpen(false)}
            canManage={canManage}
          />
        </RightDrawer>
      )}
    </>
  );
}

export function FileReminderButton({
  tenant,
  returnPath,
  name,
  context,
  compact = false,
  canManage = true,
}: {
  tenant: string;
  returnPath: string;
  name: string;
  context: string;
  compact?: boolean;
  canManage?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!canManage) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className={
          compact
            ? "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
            : "btn btn-secondary btn-sm"
        }
        title="Erinnerung erstellen"
        aria-label={`Erinnerung für ${name} erstellen`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(true);
        }}
      >
        <BellPlus size={compact ? 14 : 15} />
        {!compact && "Erinnerung"}
      </button>
      {isOpen && (
        <RightDrawer
          eyebrow="Datei-Erinnerung"
          title="Erinnerung erstellen"
          onClose={() => setIsOpen(false)}
        >
          <ReminderFields
            tenant={tenant}
            returnPath={returnPath}
            defaultTitle={`Nachfassen: ${name}`}
            defaultContext={context}
            onCancel={() => setIsOpen(false)}
          />
        </RightDrawer>
      )}
    </>
  );
}

export function SicknessDrawerButton({
  tenant,
  item,
  canManage = true,
  canDelete = canManage,
}: {
  tenant: string;
  item: CurrentSickness | SicknessHistoryItem;
  canManage?: boolean;
  canDelete?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isCurrent = "since" in item;

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setIsOpen(true)}
      >
        Details
      </button>
      {isOpen && (
        <RightDrawer
          eyebrow="Krankmeldung"
          title={item.name}
          onClose={() => setIsOpen(false)}
        >
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-bg p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                Status
              </div>
              <div className="mt-2 text-[14px] font-semibold text-ink">
                {isCurrent ? "Laufende Krankmeldung" : "Abgeschlossen"}
              </div>
              <div className="mt-1 text-[12px] text-muted">
                {item.location} · {isCurrent ? `seit ${item.since}` : `${item.startDate}-${item.endDate}`}
              </div>
            </div>
            {isCurrent && canManage ? (
              <form action={updateSicknessReportAction} className="flex flex-col gap-4">
                <input type="hidden" name="tenant" value={tenant} />
                <input type="hidden" name="reportId" value={item.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Arbeitsunfähig seit">
                    <input
                      type="date"
                      name="startDate"
                      className="input"
                      defaultValue={item.startDateIso}
                      required
                    />
                  </Field>
                  <Field label="Voraussichtlich bis">
                    <input
                      type="date"
                      name="endDate"
                      className="input"
                      defaultValue={item.endDateIso}
                    />
                  </Field>
                </div>
                <Field label="Bescheinigung">
                  <select
                    name="certificateStatus"
                    className="input cursor-pointer bg-white"
                    defaultValue={item.certificateStatus}
                  >
                    <option value="pending">Wird nachgereicht</option>
                    <option value="received">Liegt vor</option>
                    <option value="not-required">Nicht erforderlich</option>
                  </select>
                </Field>
                <Field label="Hinweise">
                  <textarea
                    name="note"
                    className="input min-h-24 resize-none"
                    defaultValue={item.note}
                  />
                </Field>
                <div className="mt-1 flex flex-wrap justify-end gap-2.5 border-t border-border-soft pt-4">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsOpen(false)}
                  >
                    Abbrechen
                  </button>
                  {canDelete && (
                    <FormSubmitButton
                      formAction={closeSicknessReportAction}
                      Icon={Check}
                      className="btn btn-secondary"
                      pendingLabel="Wird gespeichert..."
                    >
                      Krankheit beenden
                    </FormSubmitButton>
                  )}
                  <FormSubmitButton Icon={Save} pendingLabel="Wird gespeichert...">
                    Speichern
                  </FormSubmitButton>
                </div>
              </form>
            ) : (
              <div className="rounded-xl border border-border bg-bg p-4 text-[13px] leading-[1.55] text-muted-2">
                {isCurrent
                  ? "Sie haben keine Berechtigung, diese Krankmeldung zu bearbeiten."
                  : "Diese Krankmeldung ist abgeschlossen und kann nicht mehr bearbeitet werden. Neue Dokumente oder Korrekturen müssen als neuer Vorgang erfasst werden."}
              </div>
            )}
          </div>
        </RightDrawer>
      )}
    </>
  );
}

export function VacationDrawerButton({
  tenant,
  request,
  canManage = true,
  canDelete = canManage,
}: {
  tenant: string;
  request: VacationRequest;
  canManage?: boolean;
  canDelete?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const deleteFormId = `vacation-delete-${request.dbId ?? request.id}`;

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setIsOpen(true)}
      >
        Details
      </button>
      {isOpen && (
        <RightDrawer
          eyebrow="Urlaubsantrag"
          title={request.name}
          onClose={() => setIsOpen(false)}
        >
          {!canManage && (
            <div className="mb-4 rounded-xl border border-border bg-bg p-4 text-[13px] leading-[1.55] text-muted-2">
              Sie haben keine Berechtigung, diesen Urlaubsantrag zu bearbeiten.
            </div>
          )}
          <form action={updateVacationRequestAction} className="flex flex-col gap-4">
            <input type="hidden" name="tenant" value={tenant} />
            <input type="hidden" name="requestId" value={request.dbId ?? ""} />
            <fieldset disabled={!canManage} className="flex flex-col gap-4 border-0 p-0">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Von">
                  <DatePickerField
                    name="startDate"
                    defaultValue={request.startDateIso ?? request.startDate}
                  />
                </Field>
                <Field label="Bis">
                  <DatePickerField
                    name="endDate"
                    defaultValue={request.endDateIso ?? request.endDate}
                  />
                </Field>
              </div>
              <div className="rounded-xl border border-border bg-bg p-3 text-[12.5px] text-muted-2">
                Aktuell erfasst: <span className="font-semibold text-ink">{request.days}</span>.
                Die Dauer wird beim Speichern aus dem Zeitraum neu berechnet.
              </div>
              <Field label="Hinweise">
                <textarea
                  name="note"
                  className="input min-h-24 resize-none"
                  defaultValue={request.note ?? ""}
                  placeholder="Vertretung, Übergaben oder Entscheidung dokumentieren"
                />
              </Field>
            </fieldset>
            {canManage && (
              <div className="flex flex-wrap gap-2 border-t border-border-soft pt-4">
                <FormSubmitButton
                  formAction={approveVacationRequestAction}
                  Icon={Check}
                  className="btn btn-primary btn-sm"
                  pendingLabel="Läuft..."
                >
                  Genehmigen
                </FormSubmitButton>
                <FormSubmitButton
                  formAction={rejectVacationRequestAction}
                  className="btn btn-secondary btn-sm border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
                  pendingLabel="Läuft..."
                >
                  Ablehnen
                </FormSubmitButton>
                {canDelete && (
                  <ConfirmSubmitButton
                    form={deleteFormId}
                    className="btn btn-secondary btn-sm"
                    description={`Der Urlaubsantrag von ${request.name} wird gelöscht.`}
                  >
                    Löschen
                  </ConfirmSubmitButton>
                )}
              </div>
            )}
            <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsOpen(false)}
              >
                {canManage ? "Abbrechen" : "Schließen"}
              </button>
              {canManage && (
                <FormSubmitButton Icon={Save} pendingLabel="Wird gespeichert...">
                  Zeitraum speichern
                </FormSubmitButton>
              )}
            </div>
          </form>
          {canDelete && (
            <form id={deleteFormId} action={deleteVacationRequestAction}>
              <input type="hidden" name="tenant" value={tenant} />
              <input type="hidden" name="requestId" value={request.dbId ?? ""} />
            </form>
          )}
        </RightDrawer>
      )}
    </>
  );
}

export function ShiftSettingsDrawerButton({
  tenant,
  year,
  week,
  settings,
  canManage = true,
}: {
  tenant: string;
  year: number;
  week: number;
  settings: ShiftPlanningSettings;
  canManage?: boolean;
}) {
  const { openPopup, closePopup } = useUniversalPopup();
  const [isOpen, setIsOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [shiftPresets, setShiftPresets] = useState<ShiftPreset[]>(settings.presets);

  if (!canManage) {
    return null;
  }

  function updateShiftPreset(
    id: string,
    field: keyof Omit<ShiftPreset, "id">,
    value: string,
  ) {
    setShiftPresets((items) =>
      items.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  }

  function addShiftPreset() {
    const id = `shift-${Date.now()}`;
    setShiftPresets((items) => [
      ...items,
      {
        id,
        label: "Neue Schicht",
        start: "10:00",
        end: "18:00",
        pause: "30m",
      },
    ]);
    setEditingShiftId(id);
  }

  function removeShiftPreset(id: string) {
    setShiftPresets((items) => items.filter((item) => item.id !== id));
    setEditingShiftId((currentId) => (currentId === id ? null : currentId));
  }

  function confirmRemoveShiftPreset(shift: ShiftPreset) {
    openPopup({
      title: "Schichtvorlage löschen",
      content: (
        <div>
          <p className="m-0 text-[13px] leading-[1.55] text-muted-2">
            {`Die Vorlage "${shift.label}" wird entfernt. Das Speichern übernimmt die Änderung.`}
          </p>
          <div className="mt-5 flex justify-end gap-2.5 border-t border-border-soft pt-4">
            <button type="button" className="btn btn-secondary" onClick={closePopup}>
              Abbrechen
            </button>
            <button
              type="button"
              className="btn btn-secondary border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
              onClick={() => {
                removeShiftPreset(shift.id);
                closePopup();
              }}
            >
              <Trash2 size={15} />
              Entfernen
            </button>
          </div>
        </div>
      ),
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        title="Schichtplanung Einstellungen"
        onClick={() => setIsOpen(true)}
      >
        <Settings2 size={15} />
        Einstellungen
      </button>
      {isOpen && (
        <RightDrawer
          eyebrow="Schichtplanung"
          title="Planungseinstellungen"
          onClose={() => setIsOpen(false)}
        >
          <form
            action={updateShiftSettingsAction}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="tenant" value={tenant} />
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="week" value={week} />
            <input
              type="hidden"
              name="presets"
              value={JSON.stringify(shiftPresets)}
            />
            <section className="rounded-xl border border-border bg-bg p-4">
              <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                Standardwerte
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Wochenstart">
                  <select
                    name="weekStart"
                    className="input cursor-pointer bg-white"
                    defaultValue={settings.weekStart}
                  >
                    <option value="monday">Montag</option>
                    <option value="sunday">Sonntag</option>
                  </select>
                </Field>
                <Field label="Mindestbesetzung">
                  <input
                    type="number"
                    name="minStaffing"
                    min="0"
                    className="input bg-white"
                    defaultValue={settings.minStaffing}
                  />
                </Field>
                <Field label="Pausenregel">
                  <select
                    name="breakRule"
                    className="input cursor-pointer bg-white"
                    defaultValue={settings.breakRule}
                  >
                    <option value="none">Keine automatische Pause</option>
                    <option value="15-4">15 Minuten ab 4h</option>
                    <option value="30-6">30 Minuten ab 6h</option>
                    <option value="45-9">45 Minuten ab 9h</option>
                  </select>
                </Field>
              </div>
              <p className="mt-3 text-[11.5px] leading-[1.5] text-muted">
                Wochenstart steuert die Kalenderansicht. Mindestbesetzung und
                Pausenregel werden gespeichert, aber noch nicht automatisch auf
                Schichten angewendet.
              </p>
            </section>
            <section className="rounded-xl border border-border bg-bg p-4">
              <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                Standard-Öffnungszeiten
              </div>
              <OpeningHoursEditor
                name="defaultOpeningHours"
                defaultValue={settings.defaultOpeningHours}
              />
              <p className="mt-3 text-[11.5px] leading-[1.5] text-muted">
                Gilt für alle Standorte ohne eigene Öffnungszeiten — steuert u. a.
                die &quot;Schichtlage&quot; auf der Übersicht.
              </p>
            </section>
            <section className="rounded-xl border border-border bg-bg p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Standardschichten
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={addShiftPreset}
                >
                  <Plus size={14} />
                  Hinzuf&uuml;gen
                </button>
              </div>
              {shiftPresets.length === 0 && (
                <p className="text-[12.5px] text-muted">
                  Noch keine Standardschichten hinterlegt.
                </p>
              )}
              <div className="grid gap-2">
                {shiftPresets.map((shift) => {
                  const isEditing = editingShiftId === shift.id;

                  return (
                    <div
                      key={shift.id}
                      className="rounded-[10px] border border-border bg-white p-3"
                    >
                      {isEditing ? (
                        <div className="grid gap-2">
                          <div className="grid gap-2 sm:grid-cols-3">
                            <input
                              className="input bg-bg"
                              value={shift.label}
                              onChange={(event) =>
                                updateShiftPreset(
                                  shift.id,
                                  "label",
                                  event.target.value,
                                )
                              }
                              aria-label="Schichtname"
                              maxLength={64}
                            />
                            <input
                              type="time"
                              className="input bg-bg"
                              value={shift.start}
                              onChange={(event) =>
                                updateShiftPreset(
                                  shift.id,
                                  "start",
                                  event.target.value,
                                )
                              }
                              aria-label="Startzeit"
                            />
                            <input
                              type="time"
                              className="input bg-bg"
                              value={shift.end}
                              onChange={(event) =>
                                updateShiftPreset(
                                  shift.id,
                                  "end",
                                  event.target.value,
                                )
                              }
                              aria-label="Endzeit"
                            />
                          </div>
                          <select
                            className="input cursor-pointer bg-bg"
                            value={shift.pause}
                            onChange={(event) =>
                              updateShiftPreset(
                                shift.id,
                                "pause",
                                event.target.value,
                              )
                            }
                            aria-label="Pausendauer"
                          >
                            <option value="0m">Keine Pause</option>
                            <option value="15m">15m Pause</option>
                            <option value="30m">30m Pause</option>
                            <option value="45m">45m Pause</option>
                            <option value="60m">60m Pause</option>
                          </select>
                        </div>
                      ) : (
                        <div>
                          <div className="text-[13px] font-semibold text-ink">
                            {shift.label}
                          </div>
                          <div className="mt-0.5 font-mono text-[10px] text-muted">
                            {shift.start}-{shift.end} {"·"} {shift.pause} Pause
                          </div>
                        </div>
                      )}
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          aria-label={`${shift.label} bearbeiten`}
                          title="Bearbeiten"
                          className="btn btn-secondary btn-sm px-3"
                          onClick={() =>
                            setEditingShiftId(isEditing ? null : shift.id)
                          }
                        >
                          {isEditing ? (
                            <>
                              <Check size={14} />
                              Fertig
                            </>
                          ) : (
                            <Pencil size={14} />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={`${shift.label} löschen`}
                          className="btn btn-secondary btn-sm px-3 text-danger hover:border-danger/30 hover:bg-danger/5"
                          onClick={() => confirmRemoveShiftPreset(shift)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsOpen(false)}
              >
                Abbrechen
              </button>
              <FormSubmitButton Icon={Save} pendingLabel="Wird gespeichert...">
                Speichern
              </FormSubmitButton>
            </div>
          </form>
        </RightDrawer>
      )}
    </>
  );
}
