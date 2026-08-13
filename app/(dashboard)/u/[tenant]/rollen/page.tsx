import CreateRoleButton from "@/components/CreateRoleButton";
import DataTable from "@/components/DataTable";
import PageHeader from "@/components/PageHeader";
import { getRolesForTenant } from "@/lib/role-service";
import { withAccessRedirect } from "@/lib/tenant-access";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Rollen",
};

export default async function RolesPage({
  params,
}: PageProps<"/u/[tenant]/rollen">) {
  const { tenant } = await params;
  const roles = await withAccessRedirect(tenant, () => getRolesForTenant(tenant));

  if (!roles) {
    notFound();
  }

  return (
    <>
      <PageHeader
        eyebrow="Berechtigungen"
        title="Rollen"
        subtitle="Alle Rollen mit zugewiesenen Mitarbeitern"
      >
        <CreateRoleButton tenant={tenant} />
      </PageHeader>

      <DataTable
        minWidth={760}
        rows={roles}
        getRowKey={(role) => role.id}
        getRowHref={(role) => `/u/${tenant}/rollen/${role.id}`}
        columns={[
          {
            key: "role",
            header: "Rolle",
            width: "2fr",
            render: (role) => (
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-border-soft text-muted-2">
                  <ShieldCheck size={16} />
                </span>
                <span className="truncate text-[13.5px] font-semibold text-ink">
                  {role.name}
                </span>
              </div>
            ),
          },
          {
            key: "members",
            header: "Mitarbeiter",
            width: "160px",
            render: (role) => (
              <div className="font-display text-[24px] font-semibold text-ink">
                {role.members}
              </div>
            ),
          },
          {
            key: "description",
            header: "Beschreibung",
            width: "1.5fr",
            render: (role) => (
              <div className="truncate text-[12.5px] text-muted-2">
                {role.description}
              </div>
            ),
          },
          {
            key: "arrow",
            header: "",
            width: "80px",
            className: "flex justify-end",
            render: () => <ArrowRight size={15} className="text-muted" />,
          },
        ]}
      />
    </>
  );
}
