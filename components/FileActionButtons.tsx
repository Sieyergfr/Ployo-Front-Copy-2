"use client";

import {
  createHrFolderAction,
  getHrFileSignedUrlAction,
  softDeleteHrFileAction,
  uploadHrFileAction,
  uploadHrFileVersionAction,
} from "@/app/(dashboard)/u/[tenant]/dateien/actions";
import DatePickerField from "@/components/DatePickerField";
import { useUniversalPopup } from "@/components/UniversalPopup";
import {
  getFileDownloadHref,
  getFileDownloadName,
  type FileFolder,
  type FileItem,
  type FileUploadOption,
  type FileUploadOptions,
  type FileVersion,
} from "@/lib/files";
import {
  isAllowedUploadFile,
  MAX_UPLOAD_BYTES,
  uploadAcceptAttribute,
} from "@/lib/upload-constraints";
import {
  Check,
  ChevronDown,
  Download,
  Eye,
  FileUp,
  FolderPlus,
  Trash2,
  Upload,
  UploadCloud,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState, useTransition } from "react";

type T = ReturnType<typeof useTranslations>;

const previewableFileTypes = new Set(["PDF", "PNG", "JPG", "JPEG"]);
const documentTypes = [
  "Arbeitsvertrag",
  "Zusatzvereinbarung",
  "Krankmeldung",
  "Zeugnis",
  "Abmahnung",
  "Fortbildungsnachweis",
  "Fuehrerschein",
  "Aufenthaltstitel",
  "Lohnunterlage",
  "Bescheinigung",
  "Richtlinie",
  "Sonstiges",
];

function validateUploadFileClientSide(file: File, t: T) {
  if (!isAllowedUploadFile(file)) {
    return t("unsupportedFileType");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return t("fileTooLarge");
  }

  return null;
}

const emptyUploadOptions: FileUploadOptions = {
  employees: [],
  locations: [],
  roles: [],
  users: [],
};

function CreateFolderForm({
  tenant,
  returnPath,
  ownerType = "tenant",
  ownerId,
  parentPath,
  onDone,
  t,
}: {
  tenant: string;
  returnPath: string;
  ownerType?: "tenant" | "employee" | "location" | "team";
  ownerId?: string;
  parentPath?: string;
  onDone: () => void;
  t: T;
}) {
  const [isLocked, setIsLocked] = useState(false);

  return (
    <form className="flex flex-col gap-4" action={createHrFolderAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <input type="hidden" name="ownerType" value={ownerType} />
      <input type="hidden" name="ownerId" value={ownerId ?? ""} />
      <input type="hidden" name="parentPath" value={parentPath ?? ""} />

      <div className="field">
        <label htmlFor="folder-name" className="label">
          {t("folderNameLabel")}
        </label>
        <input
          id="folder-name"
          name="name"
          className="input"
          placeholder={t("folderNamePlaceholder")}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="folder-owner" className="label">
          {t("responsibleLabel")}
        </label>
        <input
          id="folder-owner"
          name="ownerName"
          className="input"
          placeholder={t("responsiblePlaceholder")}
        />
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          name="locked"
          className="peer sr-only"
          checked={isLocked}
          onChange={(event) => setIsLocked(event.target.checked)}
        />
        <span className="checkbox" />
        <span className="checkbox-label">{t("protectFolderLabel")}</span>
      </label>

      {isLocked && (
        <div className="field">
          <label htmlFor="folder-pin" className="label">
            {t("pinLabel")}
          </label>
          <input
            id="folder-pin"
            name="pin"
            className="input input-mono"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder={t("pinPlaceholder")}
            required={isLocked}
          />
          <p className="m-0 text-[11px] text-muted">
            {t("pinHint")}
          </p>
        </div>
      )}

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <button type="submit" className="btn btn-primary" disabled={!tenant}>
          <FolderPlus size={15} />
          {t("createFolder")}
        </button>
      </div>
    </form>
  );
}

function UploadSettingsGroup({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className={`rounded-xl border border-border bg-white ${className}`}>
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-[13px] font-semibold text-ink"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{title}</span>
        <span
          className={`font-mono text-[13px] text-muted transition-transform duration-300 ${
            isOpen ? "rotate-45" : "rotate-0"
          }`}
        >
          +
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div
          className={`border-t border-border-soft ${
            isOpen ? "overflow-visible" : "overflow-hidden"
          }`}
        >
          {children}
        </div>
      </div>
    </section>
  );
}

function AccessMultiSelect({
  id,
  name,
  options,
  placeholder,
  t,
}: {
  id: string;
  name: string;
  options: FileUploadOption[];
  placeholder: string;
  t: T;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedOptions = options.filter((option) =>
    selectedIds.includes(option.id),
  );
  const label =
    selectedOptions.length === 0
      ? placeholder
      : selectedOptions.length === 1
        ? selectedOptions[0].name
        : t("selectedCount", { count: selectedOptions.length });

  function toggleOption(optionId: string) {
    setSelectedIds((current) =>
      current.includes(optionId)
        ? current.filter((idValue) => idValue !== optionId)
        : [...current, optionId],
    );
  }

  return (
    <div className="relative">
      {selectedIds.map((selectedId) => (
        <input key={selectedId} type="hidden" name={name} value={selectedId} />
      ))}

      <button
        id={id}
        type="button"
        className={`input flex cursor-pointer items-center justify-between gap-3 text-left ${
          isOpen ? "border-ink bg-white" : "bg-bg"
        }`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span
          className={`min-w-0 truncate text-[13px] ${
            selectedOptions.length > 0
              ? "font-semibold text-ink"
              : "text-muted"
          }`}
        >
          {label}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted transition-transform duration-200 ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-border bg-white p-1.5 shadow-[0_12px_34px_rgba(0,0,0,0.10)]">
            {options.length > 0 ? (
              options.map((option) => {
                const isSelected = selectedIds.includes(option.id);

                return (
                  <button
                    key={option.id}
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-3 rounded-[9px] px-2.5 py-2 text-left text-[12.5px] text-ink transition-colors hover:bg-bg"
                    onClick={() => toggleOption(option.id)}
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                        isSelected
                          ? "border-ink bg-ink text-white"
                          : "border-border bg-white text-transparent"
                      }`}
                    >
                      <Check size={12} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  </button>
                );
              })
            ) : (
              <div className="px-2.5 py-2 text-[12.5px] text-muted">
                {t("optionsUnavailable")}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedOptions.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedOptions.slice(0, 3).map((option) => (
            <span
              key={option.id}
              className="rounded-[7px] border border-border-light bg-bg px-2 py-1 text-[11px] text-muted"
            >
              {option.name}
            </span>
          ))}
          {selectedOptions.length > 3 && (
            <span className="rounded-[7px] border border-border-light bg-bg px-2 py-1 text-[11px] text-muted">
              +{selectedOptions.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function UploadFileForm({
  tenant,
  returnPath,
  ownerType = "tenant",
  ownerId,
  folderSlug,
  folderName,
  folderOptions = [],
  uploadOptions = emptyUploadOptions,
  onDone,
  t,
}: {
  tenant: string;
  returnPath: string;
  ownerType?: "tenant" | "employee" | "location" | "team";
  ownerId?: string;
  folderSlug?: string;
  folderName?: string;
  folderOptions?: FileFolder[];
  uploadOptions?: FileUploadOptions;
  onDone: () => void;
  t: T;
}) {
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFolderName, setSelectedFolderName] = useState("");
  const [hasExpiry, setHasExpiry] = useState(false);
  const [hasReminder, setHasReminder] = useState(false);
  const [fileError, setFileError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const needsFolderSelection = !folderSlug;

  /** Gemeinsam für Dateiauswahl und Drop — dieselbe Prüfung, dieselbe Anzeige. */
  const acceptFile = (file: File | undefined) => {
    const validationError = file ? validateUploadFileClientSide(file, t) : null;

    if (!file || validationError) {
      setFileError(validationError ?? "");
      setSelectedFileName("");

      return false;
    }

    setFileError("");
    setSelectedFileName(file.name);

    return true;
  };

  return (
    <form className="flex flex-col gap-4" action={uploadHrFileAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <input type="hidden" name="ownerType" value={ownerType} />
      <input type="hidden" name="ownerId" value={ownerId ?? ""} />
      {folderSlug ? (
        <>
          <input type="hidden" name="folderSlug" value={folderSlug} />
          <input type="hidden" name="folderName" value={folderName ?? folderSlug} />
        </>
      ) : null}

      <label
        htmlFor="file-upload"
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition-colors ${
          isDragging ? "border-ink bg-white" : "border-border bg-bg hover:border-muted"
        }`}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          if (!event.dataTransfer.files?.length) return;
          event.preventDefault();
          setIsDragging(false);

          // Die Datei muss im echten <input type="file"> landen, sonst geht
          // sie beim Absenden des Formulars nicht mit.
          if (acceptFile(event.dataTransfer.files[0]) && fileInputRef.current) {
            const transfer = new DataTransfer();

            transfer.items.add(event.dataTransfer.files[0]);
            fileInputRef.current.files = transfer.files;
          }
        }}
      >
        <FileUp size={24} className="mb-3 text-muted-2" />
        <span className="text-[13.5px] font-semibold text-ink">
          {isDragging ? t("dropHere") : t("chooseOrDropFile")}
        </span>
        <span className="mt-1 max-w-full truncate text-[12px] text-muted">
          {selectedFileName || t("allowedTypesHint")}
        </span>
      </label>
      {fileError && (
        <p className="-mt-2 text-[12px] text-danger">{fileError}</p>
      )}
      <input
        ref={fileInputRef}
        id="file-upload"
        name="file"
        type="file"
        className="sr-only"
        accept={uploadAcceptAttribute}
        required
        onChange={(event) => {
          if (!acceptFile(event.currentTarget.files?.[0])) {
            event.currentTarget.value = "";
          }
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {needsFolderSelection ? (
          <div className="field">
            <input type="hidden" name="folderName" value={selectedFolderName} />
            <label htmlFor="file-folder-slug" className="label">
              {t("targetFolderLabel")}
            </label>
            <select
              id="file-folder-slug"
              name="folderSlug"
              className="input cursor-pointer"
              defaultValue=""
              onChange={(event) => {
                const selected = folderOptions.find(
                  (folder) =>
                    (folder.path ?? folder.slug) === event.currentTarget.value,
                );

                setSelectedFolderName(selected?.name ?? "");
              }}
            >
              <option value="">
                {t("homeOption")}
              </option>
              {folderOptions.map((folder) => (
                <option key={folder.slug} value={folder.path ?? folder.slug}>
                  {(folder.path ?? folder.slug).replaceAll("/", " / ")}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="file-owner" className="label">
            {t("responsibleLabel")}
          </label>
          <input
            id="file-owner"
            name="ownerName"
            className="input"
            placeholder={t("responsiblePlaceholder")}
          />
        </div>
      </div>

      <div className="pt-1">
        <div className="mb-3 flex items-center gap-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
            {t("settingsLabel")}
          </span>
          <span className="h-px flex-1 bg-border-soft" />
        </div>

        <UploadSettingsGroup title={t("groupDocumentValidity")}>
          <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="file-document-type" className="label">
              {t("documentTypeLabel")}
            </label>
            <select
              id="file-document-type"
              name="documentType"
              className="input cursor-pointer"
              defaultValue="Sonstiges"
            >
              {documentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="file-valid-from" className="label">
              {t("validFromLabel")}
            </label>
            <DatePickerField
              id="file-valid-from"
              name="validFrom"
              placeholder={t("optionalPlaceholder")}
            />
          </div>
          </div>
        </UploadSettingsGroup>

        <UploadSettingsGroup title={t("groupAssignment")} className="mt-2">
          <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="file-assigned-employee" className="label">
              {t("assignEmployeeLabel")}
            </label>
            <select
              id="file-assigned-employee"
              name="assignedEmployeeId"
              className="input cursor-pointer"
              defaultValue=""
            >
              <option value="">{t("doNotAssign")}</option>
              {uploadOptions.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="file-assigned-location" className="label">
              {t("assignLocationLabel")}
            </label>
            <select
              id="file-assigned-location"
              name="assignedLocationId"
              className="input cursor-pointer"
              defaultValue=""
            >
              <option value="">{t("doNotAssign")}</option>
              {uploadOptions.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
          </div>
        </UploadSettingsGroup>

        <UploadSettingsGroup title={t("groupDeadlinesReminder")} className="mt-2">
          <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
          <label className="checkbox-row">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={hasExpiry}
              onChange={(event) => setHasExpiry(event.currentTarget.checked)}
            />
            <span className="checkbox" />
            <span className="checkbox-label">{t("setExpiryLabel")}</span>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={hasReminder}
              disabled={!hasExpiry}
              onChange={(event) => setHasReminder(event.currentTarget.checked)}
            />
            <span className="checkbox" />
            <span className="checkbox-label">{t("setReminderLabel")}</span>
          </label>
          </div>

        <div
          className={`grid overflow-visible px-4 transition-all duration-200 ${
            hasExpiry
              ? "pb-4 max-h-[180px] opacity-100"
              : "max-h-0 opacity-0"
          }`}
          aria-hidden={!hasExpiry}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="file-expires-at" className="label">
                {t("expiryDateLabel")}
              </label>
              <DatePickerField
                id="file-expires-at"
                name="expiresAt"
                placeholder={t("pickDatePlaceholder")}
              />
            </div>

            <div
              className={`field transition-all duration-200 ${
                hasReminder ? "opacity-100" : "pointer-events-none opacity-40"
              }`}
            >
              <label htmlFor="file-reminder-at" className="label">
                {t("reminderLabel")}
              </label>
              {hasReminder ? (
                <DatePickerField
                  id="file-reminder-at"
                  name="reminderAt"
                  placeholder={t("pickDatePlaceholder")}
                />
              ) : (
                <input className="input" value="" readOnly placeholder={t("optionalPlaceholder")} />
              )}
            </div>
          </div>
        </div>
        </UploadSettingsGroup>

        <UploadSettingsGroup title={t("groupDescriptionTags")} className="mt-2">
          <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
          <div className="field sm:col-span-2">
            <label htmlFor="file-description" className="label">
              {t("descriptionLabel")}
            </label>
            <textarea
              id="file-description"
              name="description"
              className="input min-h-20 resize-y py-3"
              placeholder={t("descriptionPlaceholder")}
            />
          </div>

          <div className="field sm:col-span-2">
            <label htmlFor="file-tags" className="label">
              {t("tagsLabel")}
            </label>
            <input
              id="file-tags"
              name="tags"
              className="input"
              placeholder={t("tagsPlaceholder")}
            />
          </div>
          </div>
        </UploadSettingsGroup>

        <UploadSettingsGroup title={t("groupAccessControl")} className="mt-2">
          <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="file-access-roles" className="label">
              {t("accessRolesLabel")}
            </label>
            <AccessMultiSelect
              id="file-access-roles"
              name="accessRoleIds"
              options={uploadOptions.roles}
              placeholder={t("selectRolesPlaceholder")}
              t={t}
            />
          </div>

          <div className="field">
            <label htmlFor="file-access-users" className="label">
              {t("accessUsersLabel")}
            </label>
            <AccessMultiSelect
              id="file-access-users"
              name="accessUserIds"
              options={uploadOptions.users}
              placeholder={t("selectUsersPlaceholder")}
              t={t}
            />
          </div>
          </div>
        </UploadSettingsGroup>
      </div>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <button type="submit" className="btn btn-primary" disabled={!tenant}>
          <Upload size={15} />
          {t("upload")}
        </button>
      </div>
    </form>
  );
}

function UploadVersionForm({
  file,
  tenant,
  returnPath,
  onDone,
  t,
}: {
  file: FileItem;
  tenant: string;
  returnPath: string;
  onDone: () => void;
  t: T;
}) {
  const [fileError, setFileError] = useState("");

  return (
    <form className="flex flex-col gap-4" action={uploadHrFileVersionAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <input type="hidden" name="fileId" value={file.storageFileId ?? ""} />

      <p className="max-w-[420px] text-[13px] leading-5 text-muted">
        {t("uploadNewFileFor", { name: file.name })}
      </p>

      <label
        htmlFor={`version-upload-${file.slug}`}
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg px-4 py-8 text-center transition-colors hover:border-muted"
      >
        <UploadCloud size={25} className="mb-3 text-muted-2" />
        <span className="text-[13.5px] font-semibold text-ink">
          {t("selectVersionFile")}
        </span>
        <span className="mt-1 text-[12px] text-muted">
          {t("replacesCurrentAs", { version: file.version + 1 })}
        </span>
      </label>
      {fileError && (
        <p className="-mt-2 text-[12px] text-danger">{fileError}</p>
      )}
      <input
        id={`version-upload-${file.slug}`}
        name="file"
        type="file"
        className="sr-only"
        accept={uploadAcceptAttribute}
        required
        onChange={(event) => {
          const selected = event.currentTarget.files?.[0];
          const validationError = selected
            ? validateUploadFileClientSide(selected, t)
            : null;

          if (validationError) {
            setFileError(validationError);
            event.currentTarget.value = "";
            return;
          }

          setFileError("");
        }}
      />

      <div className="field">
        <label htmlFor={`version-title-${file.slug}`} className="label">
          {t("titleLabel")}
        </label>
        <input
          id={`version-title-${file.slug}`}
          name="title"
          className="input"
          defaultValue={t("newVersionOfDefault", { name: file.name })}
          required
        />
      </div>

      <div className="field">
        <label htmlFor={`version-description-${file.slug}`} className="label">
          {t("descriptionLabel")}
        </label>
        <textarea
          id={`version-description-${file.slug}`}
          name="description"
          className="input min-h-24 resize-y py-3"
          placeholder={t("changeDescriptionPlaceholder")}
        />
      </div>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!tenant || !file.storageFileId}
        >
          <Upload size={15} />
          {t("uploadVersion")}
        </button>
      </div>
    </form>
  );
}

function FilePreviewContent({
  file,
  versionNumber,
  t,
}: {
  file: FileItem;
  versionNumber: number;
  t: T;
}) {
  const isPreviewable = previewableFileTypes.has(file.type.toUpperCase());

  if (!isPreviewable) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg px-6 py-10 text-center">
        <FileUp size={28} className="mb-3 text-muted-2" />
        <div className="font-display text-[18px] font-semibold text-ink">
          {t("previewUnavailableTitle")}
        </div>
        <p className="mt-2 max-w-[420px] text-[13px] leading-5 text-muted">
          {t("previewUnavailableBody", { type: file.type })}
        </p>
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
              {file.folder} · {t("versionLabel", { version: versionNumber })}
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
  tenant,
  version,
  label,
  compact = false,
}: {
  file: FileItem;
  tenant?: string;
  version?: FileVersion;
  label?: string;
  compact?: boolean;
}) {
  const t = useTranslations("FileActionButtons");
  const { openPopup } = useUniversalPopup();
  const [isPending, startTransition] = useTransition();
  const versionNumber = version?.version ?? file.version;
  const openPreview = () => {
    if (tenant && file.storageFileId) {
      startTransition(async () => {
        const url = await getHrFileSignedUrlAction({
          tenant,
          fileId: file.storageFileId!,
          version: versionNumber,
          disposition: "inline",
        });
        window.open(url, "_blank", "noopener,noreferrer");
      });
      return;
    }

    openPopup({
      title: `${file.name} · v${versionNumber}`,
      className: "max-w-[900px]",
      content: <FilePreviewContent file={file} versionNumber={versionNumber} t={t} />,
    });
  };

  if (compact) {
    return (
      <button
        type="button"
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink disabled:cursor-wait disabled:opacity-60"
        title={t("viewVersionTitle", { version: versionNumber })}
        aria-label={t("viewFileVersionAria", { name: file.name, version: versionNumber })}
        disabled={isPending}
        onClick={openPreview}
      >
        <Eye size={14} />
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      disabled={isPending}
      onClick={openPreview}
    >
      <Eye size={14} />
      {isPending ? t("opening") : (label ?? t("view"))}
    </button>
  );
}

export function FileDownloadButton({
  file,
  tenant,
  version,
  label,
  compact = false,
}: {
  file: FileItem;
  tenant?: string;
  version?: FileVersion;
  label?: string;
  compact?: boolean;
}) {
  const t = useTranslations("FileActionButtons");
  const [isPending, startTransition] = useTransition();
  const versionNumber = version?.version ?? file.version;
  const downloadName = version?.downloadName ?? getFileDownloadName(file);
  const downloadHref = version?.downloadHref ?? getFileDownloadHref(file);

  if (tenant && file.storageFileId) {
    const openSignedUrl = () =>
      startTransition(async () => {
        const url = await getHrFileSignedUrlAction({
          tenant,
          fileId: file.storageFileId!,
          version: versionNumber,
          disposition: "attachment",
        });
        window.open(url, "_blank", "noopener,noreferrer");
      });

    if (compact) {
      return (
        <button
          type="button"
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink disabled:cursor-wait disabled:opacity-60"
          title={t("downloadVersionTitle", { version: versionNumber })}
          aria-label={t("downloadFileVersionAria", { name: file.name, version: versionNumber })}
          disabled={isPending}
          onClick={openSignedUrl}
        >
          <Download size={14} />
        </button>
      );
    }

    return (
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={isPending}
        onClick={openSignedUrl}
      >
        <Download size={14} />
        {isPending ? t("signing") : (label ?? t("download"))}
      </button>
    );
  }

  if (compact) {
    return (
      <a
        href={downloadHref}
        download={downloadName}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
        title={t("downloadVersionTitle", { version: versionNumber })}
        aria-label={t("downloadFileVersionAria", { name: file.name, version: versionNumber })}
      >
        <Download size={14} />
      </a>
    );
  }

  return (
    <a href={downloadHref} download={downloadName} className="btn btn-secondary btn-sm">
      <Download size={14} />
      {label ?? t("download")}
    </a>
  );
}

export function VersionUploadButton({
  file,
  tenant,
  returnPath,
  compact = false,
}: {
  file: FileItem;
  tenant?: string;
  returnPath?: string;
  compact?: boolean;
}) {
  const t = useTranslations("FileActionButtons");
  const { openPopup, closePopup } = useUniversalPopup();
  const canVersion = Boolean(tenant && returnPath && file.storageFileId);

  const openVersionPopup = () =>
    openPopup({
      title: t("uploadNewVersionTitle"),
      content: (
        <UploadVersionForm
          file={file}
          tenant={tenant ?? ""}
          returnPath={returnPath ?? ""}
          onDone={closePopup}
          t={t}
        />
      ),
    });

  return (
    <button
      type="button"
      className={
        compact
          ? "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
          : "btn btn-primary btn-sm"
      }
      title={t("uploadNewVersionTitle")}
      aria-label={t("uploadNewVersionAria", { name: file.name })}
      disabled={!canVersion}
      onClick={openVersionPopup}
    >
      <Upload size={14} />
      {!compact && t("uploadNewVersionTitle")}
    </button>
  );
}

function DeleteFileConfirmForm({
  file,
  tenant,
  returnPath,
  onCancel,
  t,
}: {
  file: FileItem;
  tenant: string;
  returnPath: string;
  onCancel: () => void;
  t: T;
}) {
  return (
    <form className="flex flex-col gap-4" action={softDeleteHrFileAction}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <input type="hidden" name="fileId" value={file.storageFileId ?? ""} />

      <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3">
        <div className="text-[13.5px] font-semibold text-ink">
          {file.name}
        </div>
        <p className="mt-1 text-[12.5px] leading-5 text-muted">
          {t("removeFileFromViewHint")}
        </p>
      </div>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {t("cancel")}
        </button>
        <button type="submit" className="btn btn-secondary border-danger/25 text-danger hover:bg-danger/5">
          <Trash2 size={15} />
          {t("remove")}
        </button>
      </div>
    </form>
  );
}

export function FileSoftDeleteButton({
  file,
  tenant,
  returnPath,
  compact = false,
}: {
  file: FileItem;
  tenant?: string;
  returnPath?: string;
  compact?: boolean;
}) {
  const t = useTranslations("FileActionButtons");
  const { openPopup, closePopup } = useUniversalPopup();

  if (!tenant || !returnPath || !file.storageFileId) {
    return null;
  }

  return (
    <button
      type="button"
      className={
        compact
          ? "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-danger/25 bg-white text-danger transition-colors hover:bg-danger/5"
          : "btn btn-secondary btn-sm border-danger/25 text-danger hover:bg-danger/5"
      }
      title={t("hideFileTitle")}
      aria-label={t("hideFileAria", { name: file.name })}
      onClick={() =>
        openPopup({
          title: t("removeFileDialogTitle"),
          content: (
            <DeleteFileConfirmForm
              file={file}
              tenant={tenant}
              returnPath={returnPath}
              onCancel={closePopup}
              t={t}
            />
          ),
        })
      }
    >
      <Trash2 size={14} />
      {!compact && t("remove")}
    </button>
  );
}

export function CreateFolderButton({
  tenant,
  returnPath,
  ownerType = "tenant",
  ownerId,
  parentPath,
  label,
}: {
  tenant?: string;
  returnPath?: string;
  ownerType?: "tenant" | "employee" | "location" | "team";
  ownerId?: string;
  parentPath?: string;
  /** In einem geöffneten Ordner heißt der Button "Unterordner" — der Dialog bleibt derselbe. */
  label?: string;
}) {
  const t = useTranslations("FileActionButtons");
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      disabled={!tenant || !returnPath}
      onClick={() =>
        openPopup({
          title: parentPath ? t("createSubfolderTitle") : t("createFolder"),
          content: (
            <CreateFolderForm
              tenant={tenant ?? ""}
              returnPath={returnPath ?? ""}
              ownerType={ownerType}
              ownerId={ownerId}
              parentPath={parentPath}
              onDone={closePopup}
              t={t}
            />
          ),
        })
      }
    >
      <FolderPlus size={14} />
      {label ?? t("createFolder")}
    </button>
  );
}

export function UploadFileButton({
  tenant,
  returnPath,
  ownerType = "tenant",
  ownerId,
  folderSlug,
  folderName,
  folderOptions,
  uploadOptions,
}: {
  tenant?: string;
  returnPath?: string;
  ownerType?: "tenant" | "employee" | "location" | "team";
  ownerId?: string;
  folderSlug?: string;
  folderName?: string;
  folderOptions?: FileFolder[];
  uploadOptions?: FileUploadOptions;
}) {
  const t = useTranslations("FileActionButtons");
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      disabled={!tenant || !returnPath}
      onClick={() =>
        openPopup({
          title: t("uploadFile"),
          content: (
            <UploadFileForm
              tenant={tenant ?? ""}
              returnPath={returnPath ?? ""}
              ownerType={ownerType}
              ownerId={ownerId}
              folderSlug={folderSlug}
              folderName={folderName}
              folderOptions={folderOptions}
              uploadOptions={uploadOptions}
              onDone={closePopup}
              t={t}
            />
          ),
        })
      }
    >
      <Upload size={14} />
      {t("uploadFile")}
    </button>
  );
}
