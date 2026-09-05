import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { UnsavedChangesGuard } from "@/components/EditSafety";
import Checkbox from "@/components/inputs/checkbox";
import PageHeader from "@/components/PageHeader";
import { DeleteRoleForm, EditRoleForm } from "@/components/RoleEditForms";
import RolePermissionAreaFields from "@/components/RolePermissionAreaFields";
import { getRoleForTenant } from "@/lib/role-service";
import {
  groupPermissionAreas,
  permissionAreas,
  permissionLevelLabels,
  permissionLevels,
  permissionScopeLabels,
  type PermissionArea,
  type PermissionLevel,
  type PermissionRole,
} from "@/lib/roles";
import { getTenantCapabilities, withAccessRedirect } from "@/lib/tenant-access";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: PageProps<"/u/[tenant]/rollen/[roleId]">) {
  const { tenant, roleId } = await params;
  const role = await getRoleForTenant(tenant, roleId);

  return {
    title: role?.name ?? "Rollen",
  };
}

const levelTone = {
  none: "border-border-light bg-bg text-muted",
  read: "border-[#2A6FDB]/25 bg-[#2A6FDB]/10 text-[#2A6FDB]",
  write: "border-success/25 bg-success/10 text-success",
  admin: "border-ink bg-ink text-white",
} satisfies Record<PermissionLevel, string>;

type T = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Berechtigungs-/Sichtbarkeits-Editor plus Zusatzrechte für einen einzelnen
 * Bereich — für den übergeordneten Bereich (z. B. "Mitarbeiter") und seine
 * Unterbereiche (Verträge/Dateien/Lohnabrechnungen/Sensible Daten) gleich,
 * nur unterschiedlich groß/eingerückt eingebettet (siehe `RoleDetailPage`).
 */
function AreaCapabilityFields({
  area,
  role,
  t,
}: {
  area: PermissionArea;
  role: PermissionRole;
  t: T;
}) {
  const level = role.permissions[area.id] ?? "none";
  const hasAccess = level !== "none";
  const scope = role.scopes[area.id] ?? "all";

  return (
    <>
      <RolePermissionAreaFields area={area} defaultLevel={level} defaultScope={scope} />

      {hasAccess && (
        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="min-w-0 rounded-xl border border-border-soft bg-bg p-3">
            <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
              {t("additionalPermissions")}
            </div>
            <div className="grid gap-2">
              <Checkbox
                id={`can-delete-${area.id}`}
                defaultChecked={role.canDelete[area.id] ?? false}
              >
                {t("deleteAllowed")}
              </Checkbox>
              <Checkbox
                id={`can-view-audit-${area.id}`}
                defaultChecked={role.canViewAudit[area.id] ?? false}
              >
                {t("auditLogVisible")}
              </Checkbox>
            </div>
          </div>

          {area.fileRelevant && (
            <div className="min-w-0 rounded-xl border border-border-soft bg-bg p-3">
              <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
                {t("files")}
              </div>
              <div className="grid gap-2">
                <Checkbox
                  id={`can-upload-files-${area.id}`}
                  defaultChecked={role.canUploadFiles[area.id] ?? false}
                >
                  {t("upload")}
                </Checkbox>
                <Checkbox
                  id={`can-edit-files-${area.id}`}
                  defaultChecked={role.canEditFiles[area.id] ?? false}
                >
                  {t("edit")}
                </Checkbox>
                <Checkbox
                  id={`can-view-files-${area.id}`}
                  defaultChecked={role.canViewFiles[area.id] ?? false}
                >
                  {t("view")}
                </Checkbox>
              </div>
            </div>
          )}

          {area.supportsAssignedScope && (
            <div className="min-w-0 rounded-xl border border-border-soft bg-bg p-3">
              <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
                {t("shifts")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {permissionLevels.map((shiftLevel) => (
                  <label key={shiftLevel} className="checkbox-row relative cursor-pointer">
                    <input
                      type="radio"
                      name={`shifts-level-${area.id}`}
                      value={shiftLevel}
                      className="peer absolute inset-0 cursor-pointer opacity-0"
                      defaultChecked={(role.shiftsLevel[area.id] ?? "none") === shiftLevel}
                    />
                    <span className="checkbox" />
                    <span className="checkbox-label">{permissionLevelLabels[shiftLevel]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function AreaHeader({ area, role, t }: { area: PermissionArea; role: PermissionRole; t: T }) {
  const level = role.permissions[area.id] ?? "none";

  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-ink">{area.label}</div>
        <div className="mt-1 text-[12.5px] leading-[1.45] text-muted-2">{area.description}</div>
      </div>
      <span
        className={`inline-flex w-fit rounded-[9px] border px-2.5 py-1.5 font-mono text-[10.5px] font-semibold ${levelTone[level]}`}
      >
        {t("currentLevel", { level: permissionLevelLabels[level] })}
      </span>
    </div>
  );
}

export default async function RoleDetailPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/rollen/[roleId]">) {
  const { tenant, roleId } = await params;
  const { edit } = await searchParams;
  const t = await getTranslations("RoleDetailPage");
  const role = await withAccessRedirect(tenant, () => getRoleForTenant(tenant, roleId));

  if (!role) {
    notFound();
  }

  const isEditing = edit === "1";
  const roleHref = `/u/${tenant}/rollen/${role.id}`;
  const capabilities = await getTenantCapabilities(tenant);
  const canDelete = capabilities.roles.canDelete && !role.isSystem && role.members === 0;

  return (
    <>
      <UnsavedChangesGuard active={isEditing} />
      <div className="mb-[18px]">
        <Link href={`/u/${tenant}/rollen`} className="btn btn-secondary btn-sm">
          <ArrowLeft size={14} />
          {t("backToRoles")}
        </Link>
      </div>

      <PageHeader
        eyebrow={t("eyebrow")}
        title={role.name}
        subtitle={t("subtitle", { count: role.members, description: role.description })}
      >
        {!isEditing && (
          <>
            {canDelete && (
              <DeleteRoleForm tenant={tenant} roleId={role.id}>
                <ConfirmSubmitButton
                  form="role-delete-form"
                  className="btn btn-secondary border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
                  description={t("deleteConfirmDescription", { name: role.name })}
                >
                  {t("delete")}
                </ConfirmSubmitButton>
              </DeleteRoleForm>
            )}
            <Link href={`${roleHref}?edit=1`} className="btn btn-secondary">
              <ShieldCheck size={15} />
              {t("editPermissions")}
            </Link>
          </>
        )}
      </PageHeader>

      {isEditing ? (
        <EditRoleForm tenant={tenant} roleId={role.id} cancelHref={roleHref}>
          <section className="rounded-card border border-border bg-white p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="role-name" className="label">
                  {t("roleName")}
                </label>
                <input
                  id="role-name"
                  name="name"
                  className="input"
                  defaultValue={role.name}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="role-description" className="label">
                  {t("description")}
                </label>
                <input
                  id="role-description"
                  name="description"
                  className="input"
                  defaultValue={role.description}
                />
              </div>
            </div>

            <label className="mt-4 flex items-start gap-2.5 rounded-[12px] border border-border bg-bg p-3">
              <input
                type="checkbox"
                name="appOverviewEnabled"
                defaultChecked={role.appOverviewEnabled}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink">
                  {t("appOverviewTitle")}
                </span>
                <span className="mt-0.5 block text-[12px] leading-[1.35] text-muted">
                  {t("appOverviewDescription")}
                </span>
              </span>
            </label>
          </section>
          {groupPermissionAreas().map(({ area, children }) => (
            <div key={area.id} className="rounded-card border border-border bg-white p-5">
              <AreaHeader area={area} role={role} t={t} />
              <AreaCapabilityFields area={area} role={role} t={t} />

              {children.length > 0 && (
                <div className="mt-5 flex flex-col gap-4 border-t border-border-soft pt-4">
                  {children.map((child) => (
                    <div
                      key={child.id}
                      className="rounded-xl border border-border-soft bg-bg/60 p-4 pl-5"
                    >
                      <AreaHeader area={child} role={role} t={t} />
                      <AreaCapabilityFields area={child} role={role} t={t} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </EditRoleForm>
      ) : (
        <section className="overflow-hidden rounded-card border border-border bg-white">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[220px_minmax(200px,1fr)_130px_130px] border-b border-border px-6 py-4 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
                <div>{t("columnArea")}</div>
                <div>{t("columnDescription")}</div>
                <div>{t("columnPermission")}</div>
                <div>{t("columnVisibility")}</div>
              </div>
              {permissionAreas.map((area) => {
                const level = role.permissions[area.id] ?? "none";
                const scope = role.scopes[area.id] ?? "all";
                const hasAccess = level !== "none";
                const isChild = Boolean(area.parentAreaId);

                return (
                  <div
                    key={area.id}
                    className={`grid grid-cols-[220px_minmax(200px,1fr)_130px_130px] items-center gap-3 border-t border-border-soft px-6 py-3.5 ${
                      isChild ? "bg-bg/50" : ""
                    }`}
                  >
                    <div
                      className={`text-[13.5px] text-ink ${isChild ? "pl-4 font-medium" : "font-semibold"}`}
                    >
                      {isChild ? "↳ " : ""}
                      {area.label}
                    </div>
                    <div className="truncate text-[12.5px] text-muted-2">
                      {area.description}
                    </div>
                    <span
                      className={`inline-flex w-fit rounded-[9px] border px-2.5 py-1.5 font-mono text-[10.5px] font-semibold ${levelTone[level]}`}
                    >
                      {permissionLevelLabels[level]}
                    </span>
                    <span className="text-[12px] text-muted-2">
                      {hasAccess && area.supportsScope ? permissionScopeLabels[scope] : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
