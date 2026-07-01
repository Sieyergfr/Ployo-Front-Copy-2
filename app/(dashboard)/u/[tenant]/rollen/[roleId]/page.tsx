import PageHeader from "@/components/PageHeader";
import {
  permissionAreas,
  permissionLevelLabels,
  permissionRoles,
  type PermissionLevel,
} from "@/lib/roles";
import { ArrowLeft, EyeOff, Save, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

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
  const role = permissionRoles.find((item) => item.id === roleId);

  if (!role) {
    notFound();
  }

  const isEditing = edit === "1";
  const roleHref = `/u/${tenant}/rollen/${role.id}`;

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
        {isEditing ? (
          <>
            <Link href={roleHref} className="btn btn-secondary">
              <X size={15} />
              Abbrechen
            </Link>
            <Link href={roleHref} className="btn btn-primary">
              <Save size={15} />
              Speichern
            </Link>
          </>
        ) : (
          <Link href={`${roleHref}?edit=1`} className="btn btn-secondary">
            <ShieldCheck size={15} />
            Rechte bearbeiten
          </Link>
        )}
      </PageHeader>

      {isEditing ? (
        <section className="grid gap-3">
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
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {(["read", "write", "admin"] as PermissionLevel[]).map(
                        (permission) => (
                          <label
                            key={permission}
                            className="checkbox-row relative cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              className="peer absolute inset-0 cursor-pointer opacity-0"
                              defaultChecked={
                                permission === "read"
                                  ? level !== "none"
                                  : permission === level || level === "admin"
                              }
                            />
                            <span className="checkbox" />
                            <span className="checkbox-label">
                              {permissionLevelLabels[permission]}
                            </span>
                          </label>
                        ),
                      )}
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
        </section>
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
    </>
  );
}
