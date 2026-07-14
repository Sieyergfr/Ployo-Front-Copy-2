import { deleteRoleAction, updateRoleAction } from "@/app/(dashboard)/u/[tenant]/rollen/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import FloatingEditBar from "@/components/FloatingEditBar";
import PageHeader from "@/components/PageHeader";
import { getRoleForTenant } from "@/lib/role-service";
import {
  permissionAreas,
  permissionLevelLabels,
  permissionLevels,
  type PermissionLevel,
} from "@/lib/roles";
import { ArrowLeft, EyeOff, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

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

export default async function RoleDetailPage({
  params,
  searchParams,
}: PageProps<"/u/[tenant]/rollen/[roleId]">) {
  const { tenant, roleId } = await params;
  const { edit } = await searchParams;
  const role = await getRoleForTenant(tenant, roleId);

  if (!role) {
    notFound();
  }

  const isEditing = edit === "1";
  const roleHref = `/u/${tenant}/rollen/${role.id}`;
  const canDelete = !role.isSystem && role.members === 0;

  return (
    <>
      <div className="mb-[18px]">
        <Link href={`/u/${tenant}/rollen`} className="btn btn-secondary btn-sm">
          <ArrowLeft size={14} />
          Rollen
        </Link>
      </div>

      <PageHeader
        eyebrow="Rollendetail"
        title={role.name}
        subtitle={`${role.members} zugewiesene Mitarbeiter · ${role.description}`}
      >
        {!isEditing && (
          <>
            {canDelete && (
              <form id="role-delete-form" action={deleteRoleAction}>
                <input type="hidden" name="tenant" value={tenant} />
                <input type="hidden" name="roleId" value={role.id} />
                <ConfirmSubmitButton
                  form="role-delete-form"
                  className="btn btn-secondary border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
                  description={`Die Rolle "${role.name}" wird dauerhaft geloescht.`}
                >
                  Loeschen
                </ConfirmSubmitButton>
              </form>
            )}
            <Link href={`${roleHref}?edit=1`} className="btn btn-secondary">
              <ShieldCheck size={15} />
              Rechte bearbeiten
            </Link>
          </>
        )}
      </PageHeader>

      {isEditing ? (
        <form id="role-edit-form" action={updateRoleAction} className="grid gap-3">
          <input type="hidden" name="tenant" value={tenant} />
          <input type="hidden" name="roleId" value={role.id} />
          <section className="rounded-card border border-border bg-white p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="role-name" className="label">
                  Rollenname
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
                  Beschreibung
                </label>
                <input
                  id="role-description"
                  name="description"
                  className="input"
                  defaultValue={role.description}
                />
              </div>
            </div>
          </section>
          {permissionAreas.map((area) => {
            const level = role.permissions[area.id] ?? "none";
            const hasAccess = level !== "none";

            return (
              <div
                key={area.id}
                className="rounded-card border border-border bg-white p-5"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-ink">
                      {area.label}
                    </div>
                    <div className="mt-1 text-[12.5px] leading-[1.45] text-muted-2">
                      {area.description}
                    </div>
                  </div>
                  <span
                    className={`inline-flex w-fit rounded-[9px] border px-2.5 py-1.5 font-mono text-[10.5px] font-semibold ${levelTone[level]}`}
                  >
                    Aktuell: {permissionLevelLabels[level]}
                  </span>
                </div>

                <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="min-w-0 rounded-xl border border-border-soft bg-bg p-3">
                    <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
                      Rechte
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {permissionLevels.map((permission) => (
                        <label
                          key={permission}
                          className="checkbox-row relative cursor-pointer"
                        >
                          <input
                            type="radio"
                            name={`permission-${area.id}`}
                            value={permission}
                            className="peer absolute inset-0 cursor-pointer opacity-0"
                            defaultChecked={permission === level}
                          />
                          <span className="checkbox" />
                          <span className="checkbox-label">
                            {permissionLevelLabels[permission]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="min-w-0 rounded-xl border border-border-soft bg-bg p-3">
                    <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
                      Sichtbarkeit
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      <label className="checkbox-row relative cursor-pointer">
                        <input
                          type="checkbox"
                          className="peer absolute inset-0 cursor-pointer opacity-0"
                          defaultChecked={!hasAccess}
                          disabled
                        />
                        <span className="checkbox" />
                        <span className="checkbox-label">
                          <span className="inline-flex items-center gap-1.5">
                            <EyeOff size={13} />
                            Navigation ausblenden
                          </span>
                        </span>
                      </label>
                      <label className="checkbox-row relative cursor-pointer">
                        <input
                          type="checkbox"
                          className="peer absolute inset-0 cursor-pointer opacity-0"
                          defaultChecked={!hasAccess}
                          disabled
                        />
                        <span className="checkbox" />
                        <span className="checkbox-label">Route sperren</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </form>
      ) : (
        <section className="overflow-hidden rounded-card border border-border bg-white">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[260px_minmax(260px,1fr)_160px] border-b border-border px-6 py-4 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
                <div>Bereich</div>
                <div>Beschreibung</div>
                <div>Recht</div>
              </div>
              {permissionAreas.map((area) => {
                const level = role.permissions[area.id] ?? "none";

                return (
                  <div
                    key={area.id}
                    className="grid grid-cols-[260px_minmax(260px,1fr)_160px] items-center gap-3 border-t border-border-soft px-6 py-3.5"
                  >
                    <div className="text-[13.5px] font-semibold text-ink">
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
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
      {isEditing && (
        <FloatingEditBar cancelHref={roleHref} formId="role-edit-form" />
      )}
    </>
  );
}
