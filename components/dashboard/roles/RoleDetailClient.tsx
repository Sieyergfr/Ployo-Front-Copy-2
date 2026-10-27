"use client";

import { deleteRoleAction, updateRoleAction } from "@/app/(dashboard)/u/[tenant]/rollen/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { DbField, DbModal, dbInputClass } from "@/components/dashboard/DbDrawer";
import { RoleEditorHiddenInputs, RolePermissionTable } from "@/components/dashboard/roles/RolePermissionTable";
import { levelColor, levelCounts, roleEditorFormEntries, roleEditorStateFromRole } from "@/components/dashboard/roles/role-editor-state";
import { DbCard, DbSwitch, avatarColor, ctaClass, secondaryClass } from "@/components/dashboard/ui";
import { UnsavedChangesGuard } from "@/components/EditSafety";
import { useActionStateWithToast } from "@/components/Toasts";
import type { RoleAssignee } from "@/lib/role-service";
import { groupPermissionAreas, type PermissionRole } from "@/lib/roles";
import { ChevronLeft, ChevronRight, PenLine, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function RoleDetailClient({
  tenant,
  role,
  assignees,
  createdAt,
  updatedAt,
  canDelete,
}: {
  tenant: string;
  role: PermissionRole;
  assignees: RoleAssignee[];
  createdAt: string;
  updatedAt: string;
  canDelete: boolean;
}) {
  const t = useTranslations("RoleDetail");
  const tEditor = useTranslations("RoleEditor");
  const initial = useMemo(() => roleEditorStateFromRole(role), [role]);
  const [state, setState] = useState(initial);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [appOverview, setAppOverview] = useState(role.appOverviewEnabled);
  const [editingHead, setEditingHead] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [, formAction, isPending] = useActionStateWithToast(updateRoleAction);
  const [, deleteAction] = useActionStateWithToast(deleteRoleAction);

  const dirty =
    name !== role.name ||
    description !== role.description ||
    appOverview !== role.appOverviewEnabled ||
    JSON.stringify(roleEditorFormEntries(state)) !== JSON.stringify(roleEditorFormEntries(initial));
  const counts = levelCounts(state.permissions);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const withAccess = total - counts.none;
  const accounts = assignees.filter((assignee) => assignee.hasAccount).length;
  const pending = assignees.length - accounts;

  function reset() {
    setState(initial);
    setName(role.name);
    setDescription(role.description);
    setAppOverview(role.appOverviewEnabled);
  }

  return (
    <>
      <UnsavedChangesGuard active={dirty} />
      <nav aria-label={t("breadcrumb")} className="mb-[18px] flex items-center gap-2 text-[14px]">
        <Link href={`/u/${tenant}/rollen`} className={`${secondaryClass} min-h-9 bg-white px-3 py-1.5 text-[13.5px]`}>
          <ChevronLeft size={15} />
          {t("backToRoles")}
        </Link>
        <span className="text-[#9a9a96]">/</span>
        <span className="truncate font-medium">{role.name}</span>
      </nav>

      <form ref={formRef} action={formAction}>
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="roleId" value={role.id} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="description" value={description} />
        {appOverview && <input type="hidden" name="appOverviewEnabled" value="on" />}
        <RoleEditorHiddenInputs state={state} />

        <DbCard className="db-hero mb-5 flex flex-wrap items-center gap-5 p-6">
          <span className="flex size-[60px] shrink-0 items-center justify-center rounded-[16px] bg-ink text-white shadow-[0_8px_24px_rgba(107,79,196,0.25)]">
            <ShieldCheck size={24} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.2em] text-[#6e6e6b] uppercase">{t("eyebrow")}</span>
            <h1 className="m-0 flex flex-wrap items-center gap-2.5 font-display text-[clamp(26px,3vw,34px)] leading-[1.1] font-semibold tracking-[-1px]">
              {name}
              {role.isSystem && (
                <span className="rounded-[6px] bg-[#f2f1ed] px-2 py-[3px] font-sans text-[12px] font-semibold tracking-normal text-[#3d3d3a]">
                  {t("systemRole")}
                </span>
              )}
            </h1>
            <span className="text-[14px] text-[#6e6e6b]">
              {t("assignedSummary", { accounts, pending })}
              {description ? ` · ${description}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={secondaryClass} onClick={() => setEditingHead(true)}>
              <PenLine size={15} />
              {t("edit")}
            </button>
            {canDelete ? (
              <ConfirmSubmitButton
                form="role-delete-form"
                className={`${secondaryClass} px-3 text-[#b4332a]`}
                description={t("deleteConfirm", { name: role.name })}
              >
                <Trash2 size={16} aria-label={t("delete")} />
              </ConfirmSubmitButton>
            ) : (
              <span title={role.isSystem ? t("deleteSystemHint") : t("deleteInUseHint")}>
                <button type="button" disabled aria-label={t("delete")} className={`${secondaryClass} px-3`}>
                  <Trash2 size={16} />
                </button>
              </span>
            )}
          </div>
        </DbCard>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <DbCard className="overflow-hidden p-0">
            <div className="px-[18px] pt-[18px] pb-3">
              <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.3px]">{tEditor("title")}</h2>
              <p className="m-0 mt-0.5 text-[13px] text-[#6e6e6b]">{tEditor("subtitle")}</p>
            </div>
            <RolePermissionTable state={state} setState={setState} />
          </DbCard>

          <div className="flex flex-col gap-4">
            <DbCard className="p-[18px]">
              <h2 className="m-0 mb-3 font-display text-[18px] font-semibold tracking-[-0.3px]">{t("summary")}</h2>
              <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-[#f0efeb]">
                {(["read", "write", "admin"] as const).map((level) => (
                  <span key={level} style={{ width: `${(counts[level] / total) * 100}%`, background: levelColor[level] }} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["read", "write", "admin", "none"] as const).map((level) => (
                  <span key={level} className="flex items-center gap-2 rounded-[9px] bg-[#fafaf8] px-2.5 py-2 text-[13px]">
                    <span className="size-2 rounded-[3px]" style={{ background: levelColor[level] }} />
                    <span className="flex-1">{tEditor(level === "none" ? "level.noneLong" : `level.${level}`)}</span>
                    <span className="font-semibold tabular-nums">{counts[level]}</span>
                  </span>
                ))}
              </div>
              <p className="m-0 mt-3 text-[12.5px] text-[#6e6e6b]">{t("areasWithAccess", { count: withAccess, total })}</p>
            </DbCard>

            <DbCard className="p-[18px]">
              <div className="flex items-start gap-3 rounded-[12px] border border-[#ecebe7] p-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[14px] font-semibold">{tEditor("appOverviewTitle")}</span>
                  <span className="text-[12.5px] leading-[1.4] text-[#6e6e6b]">{tEditor("appOverviewDescription")}</span>
                </div>
                <DbSwitch checked={appOverview} onClick={() => setAppOverview((value) => !value)} aria-label={tEditor("appOverviewTitle")} />
              </div>
            </DbCard>

            <DbCard className="p-[18px]">
              <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.3px]">{t("navigation")}</h2>
              <p className="m-0 mt-1 mb-3 text-[12.5px] text-[#6e6e6b]">{t("navigationHint")}</p>
              <div className="flex flex-wrap gap-1.5">
                {groupPermissionAreas().map(({ area }) => {
                  const visible = (state.permissions[area.id] ?? "none") !== "none";

                  return (
                    <span
                      key={area.id}
                      className={`rounded-[7px] border px-2 py-[3px] text-[12.5px] ${
                        visible ? "border-[#e4e3df] font-medium text-ink" : "border-[#f0efeb] text-[#b5b4af] line-through"
                      }`}
                    >
                      {area.label}
                    </span>
                  );
                })}
              </div>
            </DbCard>

            <DbCard className="p-[18px]">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.3px]">{t("members")}</h2>
                <span className="text-[12.5px] text-[#6e6e6b]">{t("membersCount", { accounts, pending })}</span>
              </div>
              {assignees.length === 0 ? (
                <p className="m-0 py-2 text-[13px] text-[#6e6e6b]">{t("noMembers")}</p>
              ) : (
                <ul className="m-0 flex max-h-[360px] list-none flex-col overflow-y-auto p-0">
                  {assignees.map((assignee) => {
                    const content = (
                      <>
                        <span
                          className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                          style={{ background: assignee.hasAccount ? avatarColor(assignee.id) : "#b5b4af" }}
                        >
                          {assignee.initials}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[14px] font-semibold">{assignee.name}</span>
                          <span className={`text-[12.5px] ${assignee.hasAccount ? "text-[#6e6e6b]" : "text-[#9a5b00]"}`}>
                            {assignee.hasAccount ? t("accountActive") : t("accountPending")}
                          </span>
                        </span>
                        {assignee.employeeKey && <ChevronRight size={16} className="text-[#9a9a96]" />}
                      </>
                    );

                    return (
                      <li key={assignee.id} className="border-t border-[#f0efeb] first:border-t-0">
                        {assignee.employeeKey ? (
                          <Link
                            href={`/u/${tenant}/employees/${assignee.employeeKey}`}
                            className="flex items-center gap-3 rounded-[8px] py-2.5 text-ink no-underline hover:bg-[#fafaf8]"
                          >
                            {content}
                          </Link>
                        ) : (
                          <span className="flex items-center gap-3 py-2.5">{content}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="m-0 mt-2 border-t border-[#f0efeb] pt-3 text-[12px] leading-[1.45] text-[#9a9a96]">{t("membersHint")}</p>
            </DbCard>
          </div>
        </div>

        <p className="mt-4 mb-0 text-[12.5px] text-[#9a9a96]">
          {t("timestamps", { created: formatDate(createdAt), updated: formatDate(updatedAt) })}
        </p>

        {dirty && (
          <div className="db-savebar sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#ecebe7] bg-white px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
            <span className="text-[13.5px] font-medium">{t("unsaved")}</span>
            <span className="flex gap-2">
              <button type="button" className={secondaryClass} onClick={reset} disabled={isPending}>
                {t("discard")}
              </button>
              <button type="submit" className={ctaClass} disabled={isPending || !name.trim()}>
                {isPending ? t("saving") : t("save")}
              </button>
            </span>
          </div>
        )}
      </form>

      <form id="role-delete-form" action={deleteAction} hidden>
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="roleId" value={role.id} />
      </form>

      {editingHead && (
        <HeadEditor
          name={name}
          description={description}
          onClose={() => setEditingHead(false)}
          onApply={(nextName, nextDescription) => {
            setName(nextName);
            setDescription(nextDescription);
            setEditingHead(false);
          }}
        />
      )}
    </>
  );
}

function HeadEditor({
  name,
  description,
  onClose,
  onApply,
}: {
  name: string;
  description: string;
  onClose: () => void;
  onApply: (name: string, description: string) => void;
}) {
  const t = useTranslations("RoleDetail");
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description);

  return (
    <DbModal title={t("editTitle")} subtitle={t("editSubtitle")} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onApply(draftName.trim(), draftDescription.trim());
        }}
      >
        <DbField label={t("roleName")}>
          <input value={draftName} onChange={(event) => setDraftName(event.target.value)} className={dbInputClass} required maxLength={80} />
        </DbField>
        <DbField label={t("description")}>
          <input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} className={dbInputClass} maxLength={200} />
        </DbField>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryClass} onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className={ctaClass}>
            {t("apply")}
          </button>
        </div>
      </form>
    </DbModal>
  );
}
