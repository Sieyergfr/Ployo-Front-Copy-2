import RoleDetailClient from "@/components/dashboard/roles/RoleDetailClient";
import { getRoleDetailForTenant, getRoleForTenant } from "@/lib/role-service";
import { getTenantCapabilities, withAccessRedirect } from "@/lib/tenant-access";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: PageProps<"/u/[tenant]/rollen/[roleId]">) {
  const { tenant, roleId } = await params;
  const role = await getRoleForTenant(tenant, roleId).catch(() => null);

  return {
    title: role?.name ?? "Rollen",
  };
}

export default async function RoleDetailPage({
  params,
}: PageProps<"/u/[tenant]/rollen/[roleId]">) {
  const { tenant, roleId } = await params;
  const detail = await withAccessRedirect(tenant, () => getRoleDetailForTenant(tenant, roleId));

  if (!detail) {
    notFound();
  }

  const capabilities = await getTenantCapabilities(tenant);
  const canDelete = capabilities.roles.canDelete && !detail.role.isSystem && detail.role.members === 0;

  return (
    <RoleDetailClient
      // Nach dem Speichern (Redirect auf dieselbe Seite) frisch aus den Serverdaten starten.
      key={detail.updatedAt}
      tenant={tenant}
      role={detail.role}
      assignees={detail.assignees}
      createdAt={detail.createdAt}
      updatedAt={detail.updatedAt}
      canDelete={canDelete}
    />
  );
}
