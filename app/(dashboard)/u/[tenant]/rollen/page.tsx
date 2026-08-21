import CreateRoleButton from "@/components/CreateRoleButton";
import { RolesListClient } from "@/components/RolesListClient";
import PageHeader from "@/components/PageHeader";
import { getRolesForTenant } from "@/lib/role-service";
import { withAccessRedirect } from "@/lib/tenant-access";
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

      <RolesListClient roles={roles} tenant={tenant} />
    </>
  );
}
