"use client";

import { createRoleAction } from "@/app/(dashboard)/u/[tenant]/rollen/actions";
import { DbDrawer, DbField, dbInputClass } from "@/components/dashboard/DbDrawer";
import { RoleEditorHiddenInputs, RolePermissionTable } from "@/components/dashboard/roles/RolePermissionTable";
import { emptyRoleEditorState, levelCounts, roleTemplates } from "@/components/dashboard/roles/role-editor-state";
import { DbSwitch, ctaClass, secondaryClass } from "@/components/dashboard/ui";
import { useActionStateWithToast } from "@/components/Toasts";
import { permissionAreas } from "@/lib/roles";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

function CreateRoleDrawer({ tenant, onClose }: { tenant: string; onClose: () => void }) {
  const t = useTranslations("CreateRoleButton");
  const tEditor = useTranslations("RoleEditor");
  const [state, setState] = useState(emptyRoleEditorState);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [appOverview, setAppOverview] = useState(false);
  const [, formAction, isPending] = useActionStateWithToast(createRoleAction);
  const counts = levelCounts(state.permissions);
  const configured = permissionAreas.length - counts.none;

  return (
    <DbDrawer
      title={t("createRole")}
      subtitle={t("subtitle")}
      width={780}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryClass} onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" form="create-role-form" className={ctaClass} disabled={isPending}>
            {isPending ? t("creatingRole") : t("createRole")}
          </button>
        </div>
      }
    >
      <form id="create-role-form" action={formAction} className="flex flex-col gap-[18px]">
        <input type="hidden" name="tenant" value={tenant} />
        {appOverview && <input type="hidden" name="appOverviewEnabled" value="on" />}
        <RoleEditorHiddenInputs state={state} />

        <div className="grid gap-3 sm:grid-cols-[1fr_1.3fr]">
          <DbField label={t("roleNameRequired")}>
            <input name="name" className={dbInputClass} placeholder={t("roleNamePlaceholder")} required maxLength={80} autoFocus />
          </DbField>
          <DbField label={t("description")}>
            <input name="description" className={dbInputClass} placeholder={t("descriptionPlaceholder")} maxLength={200} />
          </DbField>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">{t("applyTemplate")}</span>
          <div className="flex flex-wrap gap-2">
            {roleTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                aria-pressed={activeTemplate === template.id}
                onClick={() => {
                  const base = emptyRoleEditorState();

                  setActiveTemplate(template.id);
                  setState({ ...base, permissions: { ...base.permissions, ...template.permissions } as typeof base.permissions });
                }}
                className={`db-focus min-h-9 cursor-pointer rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
                  activeTemplate === template.id ? "border-ink bg-ink text-white" : "border-[#e4e3df] bg-white text-ink hover:border-[#9a9a96]"
                }`}
              >
                {t(template.labelKey)}
              </button>
            ))}
          </div>
          <span className="text-[12.5px] leading-[1.45] text-[#6e6e6b]">{t("templateHint")}</span>
        </div>

        <div className="rounded-[12px] border border-[#ecebe7] px-4 py-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[14px] font-semibold">{t("progress", { configured, total: permissionAreas.length })}</span>
            <span className="text-[12.5px] text-[#6e6e6b]">{t("progressCounts", { read: counts.read, write: counts.write, admin: counts.admin })}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#f0efeb]">
            <span className="block h-full rounded-full bg-[#8b6fe0] transition-[width]" style={{ width: `${(configured / permissionAreas.length) * 100}%` }} />
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-[12px] border border-[#ecebe7] bg-[#fafaf8] px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[14px] font-semibold">{tEditor("appOverviewTitle")}</span>
            <span className="text-[12.5px] leading-[1.4] text-[#6e6e6b]">{tEditor("appOverviewDescription")}</span>
          </div>
          <DbSwitch checked={appOverview} onClick={() => setAppOverview((value) => !value)} aria-label={tEditor("appOverviewTitle")} />
        </div>

        <div className="-mx-6 flex flex-col">
          <h3 className="m-0 px-[18px] pb-3 font-display text-[17px] font-semibold tracking-[-0.3px]">{tEditor("title")}</h3>
          <RolePermissionTable
            state={state}
            setState={(next) => {
              setActiveTemplate(null);
              setState(next);
            }}
            toolbar="reset"
            onReset={() => {
              setActiveTemplate(null);
              setState(emptyRoleEditorState());
            }}
          />
        </div>
      </form>
    </DbDrawer>
  );
}

export default function CreateRoleButton({
  tenant,
  className = ctaClass,
  children,
}: {
  tenant: string;
  className?: string;
  children?: ReactNode;
}) {
  const t = useTranslations("CreateRoleButton");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children ?? (
          <>
            <Plus size={16} />
            {t("createRole")}
          </>
        )}
      </button>
      {open && <CreateRoleDrawer tenant={tenant} onClose={() => setOpen(false)} />}
    </>
  );
}
