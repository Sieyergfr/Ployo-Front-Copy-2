import CreateRoleButton from "@/components/CreateRoleButton";
import { RolesListClient } from "@/components/RolesListClient";
import { DbCard, DbPageHead } from "@/components/dashboard/ui";
import { auth } from "@/lib/auth";
import { getRolesOverviewForTenant } from "@/lib/role-service";
import { withAccessRedirect } from "@/lib/tenant-access";
import { getTenantsForUser } from "@/lib/tenants";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Rollen",
};

export default async function RolesPage({
  params,
}: PageProps<"/u/[tenant]/rollen">) {
  const { tenant } = await params;
  const [overview, t] = await Promise.all([
    withAccessRedirect(tenant, () => getRolesOverviewForTenant(tenant)),
    getTranslations("RolesPage"),
  ]);

  if (!overview) {
    notFound();
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const memberships = session?.user?.id ? await getTenantsForUser(session.user.id).catch(() => null) : null;
  const tenantName = memberships?.find((item) => item.tenant.slug === tenant)?.tenant.name ?? tenant;

  const { roles, assignees } = overview;
  const systemCount = roles.filter((role) => role.isSystem).length;
  // Eine Person kann mehreren Rollen zugeordnet sein — für die Kennzahlen nur einmal zählen.
  const people = new Map(Object.values(assignees).flat().map((person) => [person.id, person]));
  const withAccount = [...people.values()].filter((person) => person.hasAccount).length;
  const metrics = [
    { label: t("metricRoles"), value: roles.length, caption: t("metricRolesCaption", { system: systemCount, custom: roles.length - systemCount }) },
    { label: t("metricAccounts"), value: withAccount, caption: t("metricAccountsCaption") },
    { label: t("metricPending"), value: people.size - withAccount, caption: t("metricPendingCaption") },
  ];

  return (
    <>
      <DbPageHead
        eyebrow={tenantName}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={<CreateRoleButton tenant={tenant} />}
      />

      <section className="mb-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {metrics.map((metric) => (
          <DbCard key={metric.label} className="db-insight flex flex-col gap-2 p-[18px]">
            <span className="text-[13px] font-medium text-[#6e6e6b]">{metric.label}</span>
            <span className="font-display text-[30px] leading-none font-semibold tracking-[-1px]">{metric.value}</span>
            <span className="text-[13px] text-[#6e6e6b]">{metric.caption}</span>
          </DbCard>
        ))}
      </section>

      <RolesListClient roles={roles} assignees={assignees} tenant={tenant} />
    </>
  );
}
