"use client";

import {
  moveFileAction,
  renameFileAction,
  updateFolderSettingsAction,
} from "@/app/(dashboard)/u/[tenant]/dateien/actions";
import { DbDrawer, DbField, DbModal, dbInputClass } from "@/components/dashboard/DbDrawer";
import { ctaClass, secondaryClass } from "@/components/dashboard/ui";
import FormSubmitButton from "@/components/FormSubmitButton";
import { useActionStateWithToast } from "@/components/Toasts";
import type { ActionState } from "@/lib/action-state";
import type { FileFolder } from "@/lib/files";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type Option = { id: string; name: string };

/** Schließt den Dialog, sobald die Action erfolgreich war (Fehler zeigt der Toast). */
function useCloseOnSuccess(state: ActionState, onClose: () => void) {
  useEffect(() => {
    if (state.success) onClose();
  }, [state, onClose]);
}

function ChipCheckbox({ name, option, defaultChecked }: { name: string; option: Option; defaultChecked: boolean }) {
  return (
    <label className="relative inline-flex cursor-pointer">
      <input type="checkbox" name={name} value={option.id} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="inline-flex min-h-8 items-center rounded-[9px] border border-[#ecebe7] bg-white px-3 text-[13px] font-medium text-ink transition-colors peer-checked:border-[#8b6ed4] peer-checked:bg-[rgba(139,110,212,0.08)] peer-checked:text-[#5b3fb0] peer-focus-visible:ring-2 peer-focus-visible:ring-[#8b6ed4]/40">
        {option.name}
      </span>
    </label>
  );
}

/** Ordner-Einstellungen: Name, Rollen (Verwaltung) und Freigabe für Mitarbeitende. */
export function FolderSettingsDrawer({
  tenant,
  folder,
  roles,
  teams,
  locations,
  canManageAccess,
  onClose,
}: {
  tenant: string;
  folder: FileFolder;
  roles: Option[];
  teams: Option[];
  locations: Option[];
  canManageAccess: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("FilesUi");
  const [state, formAction] = useActionStateWithToast(updateFolderSettingsAction);
  const [shared, setShared] = useState(Boolean(folder.sharedWithEmployees));

  useCloseOnSuccess(state, onClose);

  return (
    <DbDrawer
      title={t("folderSettings")}
      subtitle={folder.name}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryClass} onClick={onClose}>
            {t("cancel")}
          </button>
          <FormSubmitButton form="folder-settings-form" className={ctaClass} pendingLabel={t("saving")}>
            {t("save")}
          </FormSubmitButton>
        </div>
      }
    >
      <form id="folder-settings-form" action={formAction} className="flex flex-col gap-[18px]">
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="path" value={folder.path ?? folder.slug} />
        {canManageAccess && <input type="hidden" name="settings" value="access" />}
        <DbField label={t("folderName")}>
          <input name="name" required defaultValue={folder.name} className={dbInputClass} />
        </DbField>

        {canManageAccess && (
          <>
            <span className="text-[14px] font-semibold">{t("whoMaySee")}</span>
            {folder.locked ? (
              <p className="m-0 rounded-[12px] border border-[#ecebe7] bg-[#fafaf8] px-3.5 py-3 text-[12.5px] text-[#6e6e6b]">
                {t("lockedNoShare")}
              </p>
            ) : (
              <label className="flex cursor-pointer items-center justify-between gap-3.5 rounded-[12px] border border-[#ecebe7] bg-[#fafaf8] px-3.5 py-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13.5px] font-semibold">{t("shareTitle")}</span>
                  <span className="text-[12.5px] text-[#6e6e6b]">{shared ? t("shareHintOn") : t("shareHintOff")}</span>
                </span>
                <input
                  type="checkbox"
                  name="sharedWithEmployees"
                  checked={shared}
                  onChange={(event) => setShared(event.target.checked)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className="relative h-[22px] w-[38px] shrink-0 rounded-full bg-[#d9d8d3] transition-colors peer-checked:bg-[#8b6ed4] peer-focus-visible:ring-2 peer-focus-visible:ring-[#8b6ed4]/40 after:absolute after:top-[2px] after:left-[2px] after:size-[18px] after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(0,0,0,0.25)] after:transition-all peer-checked:after:left-[18px]"
                />
              </label>
            )}

            {shared ? (
              <>
                {teams.length > 0 && (
                  <DbField label={t("limitTeams")} hint={t("limitHint")}>
                    <span className="flex flex-wrap gap-1.5">
                      {teams.map((team) => (
                        <ChipCheckbox key={team.id} name="teamId" option={team} defaultChecked={Boolean(folder.visibleTeamIds?.includes(team.id))} />
                      ))}
                    </span>
                  </DbField>
                )}
                {locations.length > 0 && (
                  <DbField label={t("limitLocations")}>
                    <span className="flex flex-wrap gap-1.5">
                      {locations.map((location) => (
                        <ChipCheckbox
                          key={location.id}
                          name="locationId"
                          option={location}
                          defaultChecked={Boolean(folder.visibleLocationIds?.includes(location.id))}
                        />
                      ))}
                    </span>
                  </DbField>
                )}
              </>
            ) : (
              roles.length > 0 && (
                <DbField label={t("limitRoles")} hint={t("limitRolesHint")}>
                  <span className="flex flex-wrap gap-1.5">
                    {roles.map((role) => (
                      <ChipCheckbox key={role.id} name="roleId" option={role} defaultChecked={Boolean(folder.accessRoleIds?.includes(role.id))} />
                    ))}
                  </span>
                </DbField>
              )
            )}
          </>
        )}
      </form>
    </DbDrawer>
  );
}

export function RenameFileModal({
  tenant,
  fileId,
  name,
  onClose,
}: {
  tenant: string;
  fileId: string;
  name: string;
  onClose: () => void;
}) {
  const t = useTranslations("FilesUi");
  const [state, formAction] = useActionStateWithToast(renameFileAction);

  useCloseOnSuccess(state, onClose);

  return (
    <DbModal title={t("renameFile")} onClose={onClose}>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="fileId" value={fileId} />
        <DbField label={t("fileName")}>
          <input name="name" required defaultValue={name} className={dbInputClass} autoFocus />
        </DbField>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryClass} onClick={onClose}>
            {t("cancel")}
          </button>
          <FormSubmitButton className={ctaClass} pendingLabel={t("saving")}>
            {t("save")}
          </FormSubmitButton>
        </div>
      </form>
    </DbModal>
  );
}

export function RenameFolderModal({ tenant, folder, onClose }: { tenant: string; folder: FileFolder; onClose: () => void }) {
  const t = useTranslations("FilesUi");
  const [state, formAction] = useActionStateWithToast(updateFolderSettingsAction);

  useCloseOnSuccess(state, onClose);

  return (
    <DbModal title={t("renameFolder")} onClose={onClose}>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="path" value={folder.path ?? folder.slug} />
        <DbField label={t("folderName")}>
          <input name="name" required defaultValue={folder.name} className={dbInputClass} autoFocus />
        </DbField>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryClass} onClick={onClose}>
            {t("cancel")}
          </button>
          <FormSubmitButton className={ctaClass} pendingLabel={t("saving")}>
            {t("save")}
          </FormSubmitButton>
        </div>
      </form>
    </DbModal>
  );
}

export function MoveFileModal({
  tenant,
  fileId,
  name,
  currentPath,
  folders,
  onClose,
}: {
  tenant: string;
  fileId: string;
  name: string;
  currentPath: string;
  folders: FileFolder[];
  onClose: () => void;
}) {
  const t = useTranslations("FilesUi");
  const [state, formAction] = useActionStateWithToast(moveFileAction);
  const options = [{ path: "", label: t("noFolder") }, ...folders.map((folder) => ({ path: folder.path ?? folder.slug, label: (folder.path ?? folder.slug).split("/").length > 1 ? `${"· ".repeat((folder.path ?? folder.slug).split("/").length - 1)}${folder.name}` : folder.name }))]
    .filter((option) => option.path !== currentPath);

  useCloseOnSuccess(state, onClose);

  return (
    <DbModal title={t("moveFile")} subtitle={name} onClose={onClose}>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="fileId" value={fileId} />
        <DbField label={t("targetFolder")}>
          <select name="targetPath" className={dbInputClass} defaultValue={options[0]?.path ?? ""}>
            {options.map((option) => (
              <option key={option.path || "root"} value={option.path}>
                {option.label}
              </option>
            ))}
          </select>
        </DbField>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryClass} onClick={onClose}>
            {t("cancel")}
          </button>
          <FormSubmitButton className={ctaClass} pendingLabel={t("saving")}>
            {t("move")}
          </FormSubmitButton>
        </div>
      </form>
    </DbModal>
  );
}

