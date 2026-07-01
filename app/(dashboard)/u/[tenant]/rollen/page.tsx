import CreateRoleButton from "@/components/CreateRoleButton";
import PageHeader from "@/components/PageHeader";
import { permissionRoles } from "@/lib/roles";
import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default async function RolesPage({
  params,
}: PageProps<"/u/[tenant]/rollen">) {
  const { tenant } = await params;

  return (
    <>
      <PageHeader
        eyebrow="Berechtigungen"
        title="Rollen"
        subtitle="Alle Rollen mit zugewiesenen Mitarbeitern"
      >
        <CreateRoleButton />
      </PageHeader>

      <section className="overflow-hidden rounded-card border border-border bg-white">
        <div className="grid min-w-[760px] grid-cols-[2fr_160px_1.5fr_80px] gap-3 border-b border-border px-6 py-4 font-mono text-[9.5px] uppercase tracking-[0.6px] text-muted">
          <div>Rolle</div>
          <div>Mitarbeiter</div>
          <div>Beschreibung</div>
          <div />
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            {permissionRoles.map((role) => (
              <Link
                key={role.id}
                href={`/u/${tenant}/rollen/${role.id}`}
                className="grid grid-cols-[2fr_160px_1.5fr_80px] items-center gap-3 border-t border-border-soft px-6 py-4 text-left no-underline transition-colors hover:bg-bg"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-border-soft text-muted-2">
                    <ShieldCheck size={16} />
                  </span>
                  <span className="truncate text-[13.5px] font-semibold text-ink">
                    {role.name}
                  </span>
                </div>
                <div className="font-display text-[24px] font-semibold text-ink">
                  {role.members}
                </div>
                <div className="truncate text-[12.5px] text-muted-2">
                  {role.description}
                </div>
                <div className="flex justify-end">
                  <ArrowRight size={15} className="text-muted" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
