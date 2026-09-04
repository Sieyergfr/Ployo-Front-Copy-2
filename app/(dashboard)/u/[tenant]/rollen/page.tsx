import CreateRoleButton from "@/components/CreateRoleButton";
import { RolesListClient } from "@/components/RolesListClient";
import PageHeader from "@/components/PageHeader";
import { getRolesForTenant } from "@/lib/role-service";
import { withAccessRedirect } from "@/lib/tenant-access";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Rollen",
};

export default async function RolesPage({
  params,
}: PageProps<"/u/[tenant]/rollen">) {
  const { tenant } = await params;
  const [roles, t] = await Promise.all([
    withAccessRedirect(tenant, () => getRolesForTenant(tenant)),
    getTranslations("RolesPage"),
  ]);

  if (!roles) {
    notFound();
  }

  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("subtitle")}
      >
        <CreateRoleButton tenant={tenant} />
      </PageHeader>

      <RolesListClient roles={roles} tenant={tenant} />
    </>
  );
}
