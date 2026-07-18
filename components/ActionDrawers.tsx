"use client";

import {
  approveVacationRequestAction,
  deleteVacationRequestAction,
  rejectVacationRequestAction,
} from "@/app/(dashboard)/u/[tenant]/urlaub/actions";
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
  CalendarClock,
  Check,
  FileText,
  Folder,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Settings2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

type ShiftPreset = {
  id: string;
  label: string;
  start: string;
  end: string;
  pause: string;
};

type ShiftTemplate = {
  id: string;
  name: string;
  description: string;
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
  return (
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
    </div>
  );
}

function DrawerFooter({ onClose }: { onClose: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="mt-5 flex justify-end gap-2.5 border-t border-border-soft pt-4">
      <button type="button" className="btn btn-secondary" onClick={onClose}>
        Abbrechen
      </button>
      <button
        type="button"
        className="btn btn-primary"
        disabled={isSubmitting}
        onClick={() => {
          setIsSubmitting(true);
          window.setTimeout(() => {
            setIsSubmitting(false);
            onClose();
          }, 350);
        }}
      >
        {isSubmitting ? (
          "Wird gespeichert..."
        ) : (
          <>
            <Save size={15} />
            Speichern
          </>
        )}
      </button>
    </div>
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
  const visibleFolders = fileBrowserData.folders.filter(
    (folder) =>
      folder.source === source &&
      folder.ownerId === selectedOwnerId &&
      isDirectChild(folder.path, currentPath) &&
      (normalizedQuery.length === 0 ||
        `${folder.name} ${folder.ownerName}`.toLowerCase().includes(normalizedQuery)),
  );
  const visibleFiles = fileBrowserData.files.filter(
    (file) =>
      file.source === source &&
      file.ownerId === selectedOwnerId &&
      file.folderSlug === currentPath &&
      (normalizedQuery.length === 0 ||
        `${file.name} ${file.folderName} ${file.ownerName}`
          .toLowerCase()
          .includes(normalizedQuery)),
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
          {selectedIds.length} gewaehlt
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
            <span className="text-[13px] font-semibold text-ink">Zurueck</span>
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
      <Field label="Titel">
        <input name="title" className="input" defaultValue={defaultTitle} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ablaufdatum">
          <DatePickerField
            name="dueDate"
            defaultValue={defaultDueDate}
            placeholder="Datum auswaehlen"
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
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary">
          <Save size={15} />
          Speichern
        </button>
      </div>
    </form>
  );
}

export function ReminderDrawerButton({
  reminder,
  tenant,
  returnPath,
  fileBrowserData,
}: {
  reminder: Reminder;
  tenant: string;
  returnPath: string;
  fileBrowserData?: ReminderFileBrowserData;
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
}: {
  reminder: Reminder;
  tenant: string;
  returnPath: string;
  fileBrowserData?: ReminderFileBrowserData;
  className: string;
  children: ReactNode;
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
}: {
  tenant: string;
  returnPath: string;
  name: string;
  context: string;
  compact?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

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
  item,
}: {
  item: CurrentSickness | SicknessHistoryItem;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [linkedFiles, setLinkedFiles] = useState<string[]>([]);
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
            {isCurrent ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Voraussichtlich bis">
                    <input type="date" className="input" defaultValue="2026-06-30" />
                  </Field>
                  <Field label="Arbeitsunfähig seit">
                    <input type="date" className="input" defaultValue="2026-06-24" />
                  </Field>
                </div>
                <Field label="Hinweise">
                  <textarea className="input min-h-24 resize-none" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-secondary btn-sm">
                    <CalendarClock size={15} />
                    Verlängern
                  </button>
                  <button type="button" className="btn btn-primary btn-sm">
                    <Check size={15} />
                    Krankheit beenden
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm">
                    <Upload size={15} />
                    Attest hochladen
                  </button>
                </div>
                <LinkedFileBrowser
                  selectedIds={linkedFiles}
                  setSelectedIds={setLinkedFiles}
                />
              </>
            ) : (
              <div className="rounded-xl border border-border bg-bg p-4 text-[13px] leading-[1.55] text-muted-2">
                Diese Krankmeldung ist abgeschlossen und kann nicht mehr bearbeitet
                werden. Neue Dokumente oder Korrekturen müssen als neuer Vorgang
                erfasst werden.
              </div>
            )}
          </div>
          {isCurrent && <DrawerFooter onClose={() => setIsOpen(false)} />}
        </RightDrawer>
      )}
    </>
  );
}

export function VacationDrawerButton({
  tenant,
  request,
}: {
  tenant: string;
  request: VacationRequest;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [linkedFiles, setLinkedFiles] = useState<string[]>([]);

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
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Von">
                <DatePickerField name="startDatePreview" defaultValue={request.startDate} />
              </Field>
              <Field label="Bis">
                <DatePickerField name="endDatePreview" defaultValue={request.endDate} />
              </Field>
            </div>
            <Field label="Dauer">
              <input className="input" defaultValue={request.days} />
            </Field>
            <Field label="Hinweise">
              <textarea
                className="input min-h-24 resize-none"
                placeholder="Vertretung, Übergaben oder Entscheidung dokumentieren"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <form action={approveVacationRequestAction}>
                <input type="hidden" name="tenant" value={tenant} />
                <input type="hidden" name="requestId" value={request.dbId ?? ""} />
                <FormSubmitButton
                  Icon={Check}
                  className="btn btn-primary btn-sm"
                  pendingLabel="Laeuft..."
                >
                  Genehmigen
                </FormSubmitButton>
              </form>
              <form action={rejectVacationRequestAction}>
                <input type="hidden" name="tenant" value={tenant} />
                <input type="hidden" name="requestId" value={request.dbId ?? ""} />
                <FormSubmitButton
                  className="btn btn-secondary btn-sm border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
                  pendingLabel="Laeuft..."
                >
                  Ablehnen
                </FormSubmitButton>
              </form>
              <form id={`vacation-delete-${request.dbId ?? request.id}`} action={deleteVacationRequestAction}>
                <input type="hidden" name="tenant" value={tenant} />
                <input type="hidden" name="requestId" value={request.dbId ?? ""} />
                <ConfirmSubmitButton
                  form={`vacation-delete-${request.dbId ?? request.id}`}
                  className="btn btn-secondary btn-sm"
                  description={`Der Urlaubsantrag von ${request.name} wird geloescht.`}
                >
                  Loeschen
                </ConfirmSubmitButton>
              </form>
              <button type="button" className="btn btn-secondary btn-sm">
                Zeitraum aendern
              </button>
            </div>
            <LinkedFileBrowser
              selectedIds={linkedFiles}
              setSelectedIds={setLinkedFiles}
            />
          </div>
          <DrawerFooter onClose={() => setIsOpen(false)} />
        </RightDrawer>
      )}
    </>
  );
}

export function ShiftSettingsDrawerButton() {
  const { openPopup, closePopup } = useUniversalPopup();
  const [isOpen, setIsOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [shiftPresets, setShiftPresets] = useState<ShiftPreset[]>([
    {
      id: "early",
      label: "Früh",
      start: "06:00",
      end: "14:00",
      pause: "30m",
    },
    {
      id: "day",
      label: "Tag",
      start: "09:00",
      end: "17:00",
      pause: "30m",
    },
    {
      id: "late",
      label: "Sp\u00e4t",
      start: "14:00",
      end: "22:00",
      pause: "45m",
    },
  ]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([
    {
      id: "store-week",
      name: "Wochenplan Filiale",
      description: "Mo-Sa mit Früh-, Tag- und Sp\u00e4tschicht",
    },
    {
      id: "holiday",
      name: "Ferienbesetzung",
      description: "Reduzierte Besetzung mit Springer-Puffer",
    },
    {
      id: "inventory",
      name: "Inventurwoche",
      description: "Zusatzschichten für Abend- und Lagerteam",
    },
  ]);

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
      title: "Schichtvorlage loeschen",
      content: (
        <div>
          <p className="m-0 text-[13px] leading-[1.55] text-muted-2">
            {`Die Vorlage "${shift.label}" wird aus den Einstellungen entfernt.`}
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
              Loeschen
            </button>
          </div>
        </div>
      ),
    });
  }

  function updateTemplate(
    id: string,
    field: keyof Omit<ShiftTemplate, "id">,
    value: string,
  ) {
    setTemplates((items) =>
      items.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  }

  function addTemplate() {
    const id = `template-${Date.now()}`;
    setTemplates((items) => [
      ...items,
      {
        id,
        name: "Neues Template",
        description: "Beschreibung erg\u00e4nzen",
      },
    ]);
    setEditingTemplateId(id);
  }

  function removeTemplate(id: string) {
    setTemplates((items) => items.filter((item) => item.id !== id));
    setEditingTemplateId((currentId) => (currentId === id ? null : currentId));
  }

  function confirmRemoveTemplate(template: ShiftTemplate) {
    openPopup({
      title: "Schichtvorlage loeschen",
      content: (
        <div>
          <p className="m-0 text-[13px] leading-[1.55] text-muted-2">
            {`Die Vorlage "${template.name}" wird aus den Einstellungen entfernt.`}
          </p>
          <div className="mt-5 flex justify-end gap-2.5 border-t border-border-soft pt-4">
            <button type="button" className="btn btn-secondary" onClick={closePopup}>
              Abbrechen
            </button>
            <button
              type="button"
              className="btn btn-secondary border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
              onClick={() => {
                removeTemplate(template.id);
                closePopup();
              }}
            >
              <Trash2 size={15} />
              Loeschen
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
          <div className="flex flex-col gap-4">
            <section className="rounded-xl border border-border bg-bg p-4">
              <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                Standardwerte
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Wochenstart">
                  <select className="input cursor-pointer bg-white" defaultValue="monday">
                    <option value="monday">Montag</option>
                    <option value="sunday">Sonntag</option>
                  </select>
                </Field>
                <Field label="Mindestbesetzung">
                  <input type="number" className="input bg-white" defaultValue="3" />
                </Field>
                <Field label="Pausenregel">
                  <select className="input cursor-pointer bg-white" defaultValue="30-6">
                    <option value="none">Keine automatische Pause</option>
                    <option value="15-4">15 Minuten ab 4h</option>
                    <option value="30-6">30 Minuten ab 6h</option>
                    <option value="45-9">45 Minuten ab 9h</option>
                  </select>
                </Field>
              </div>
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
                            {shift.start}-{shift.end} {"\u00b7"} {shift.pause} Pause
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
                          aria-label={`${shift.label} l\u00f6schen`}
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
            <section className="rounded-xl border border-border bg-bg p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Templates
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={addTemplate}
                >
                  <Plus size={14} />
                  Hinzuf&uuml;gen
                </button>
              </div>
              <div className="grid gap-2">
                {templates.map((template) => {
                  const isEditing = editingTemplateId === template.id;

                  return (
                    <div
                      key={template.id}
                      className="rounded-[10px] border border-border bg-white p-3"
                    >
                      <div className="flex items-start gap-3">
                        <Folder size={16} className="mt-0.5 shrink-0 text-muted" />
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="grid gap-2">
                              <input
                                className="input bg-bg"
                                value={template.name}
                                onChange={(event) =>
                                  updateTemplate(
                                    template.id,
                                    "name",
                                    event.target.value,
                                  )
                                }
                                aria-label="Templatename"
                              />
                              <textarea
                                className="input min-h-20 resize-none bg-bg"
                                value={template.description}
                                onChange={(event) =>
                                  updateTemplate(
                                    template.id,
                                    "description",
                                    event.target.value,
                                  )
                                }
                                aria-label="Templatebeschreibung"
                              />
                            </div>
                          ) : (
                            <>
                              <div className="truncate text-[13px] font-semibold text-ink">
                                {template.name}
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted">
                                {template.description}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          aria-label={`${template.name} bearbeiten`}
                          title="Bearbeiten"
                          className="btn btn-secondary btn-sm px-3"
                          onClick={() =>
                            setEditingTemplateId(isEditing ? null : template.id)
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
                          aria-label={`${template.name} l\u00f6schen`}
                          className="btn btn-secondary btn-sm px-3 text-danger hover:border-danger/30 hover:bg-danger/5"
                          onClick={() => confirmRemoveTemplate(template)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="hidden rounded-xl border border-border bg-bg p-4">
              <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                Standardschichten
              </div>
              {[
                ["Früh", "06:00-14:00", "30m Pause"],
                ["Tag", "09:00-17:00", "30m Pause"],
                ["Spät", "14:00-22:00", "45m Pause"],
              ].map(([label, time, pause]) => (
                <div
                  key={label}
                  className="mb-2 flex items-center justify-between gap-3 rounded-[10px] border border-border bg-white p-3"
                >
                  <div>
                    <div className="text-[13px] font-semibold text-ink">{label}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted">
                      {time} · {pause}
                    </div>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm px-3">
                    Bearbeiten
                  </button>
                </div>
              ))}
            </section>
            <section className="hidden rounded-xl border border-border bg-bg p-4">
              <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                Templates
              </div>
              <div className="grid gap-2">
                {["Wochenplan Filiale", "Ferienbesetzung", "Inventurwoche"].map(
                  (template) => (
                    <button
                      key={template}
                      type="button"
                      className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-border bg-white p-3 text-left hover:border-muted"
                    >
                      <Folder size={16} className="text-muted" />
                      <span className="text-[13px] font-semibold text-ink">
                        {template}
                      </span>
                    </button>
                  ),
                )}
              </div>
            </section>
          </div>
          <DrawerFooter onClose={() => setIsOpen(false)} />
        </RightDrawer>
      )}
    </>
  );
}
