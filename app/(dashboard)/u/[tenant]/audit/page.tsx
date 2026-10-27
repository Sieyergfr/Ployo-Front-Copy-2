import AuditLogClient from "@/components/dashboard/audit/AuditLogClient";
import { DbPageHead } from "@/components/dashboard/ui";
import { auth } from "@/lib/auth";
import { getTenantAuditLog } from "@/lib/audit";
import { withAccessRedirect } from "@/lib/tenant-access";
import { getTenantsForUser } from "@/lib/tenants";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Audit-Log",
};

const RANGES = { today: 1, "7": 7, "30": 30, all: null } as const;
type Range = keyof typeof RANGES;

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant } = await params;
  const query = await searchParams;
  const t = await getTranslations("AuditLogPage");
  const requested = (Array.isArray(query.zeitraum) ? query.zeitraum[0] : query.zeitraum) ?? "30";
  const range: Range = requested in RANGES ? (requested as Range) : "30";
  const data = await withAccessRedirect(tenant, () => getTenantAuditLog({ tenantSlug: tenant, sinceDays: RANGES[range] }));
  const session = await auth.api.getSession({ headers: await headers() });
  const memberships = session?.user?.id ? await getTenantsForUser(session.user.id).catch(() => null) : null;
  const tenantName = memberships?.find((item) => item.tenant.slug === tenant)?.tenant.name ?? tenant;

  return (
    <>
      <DbPageHead eyebrow={tenantName} title={t("title")} subtitle={t("subtitle")} actions={<span id="audit-actions" className="contents" />} />
      <AuditLogClient
        tenant={tenant}
        range={range}
        sinceDays={RANGES[range]}
        entries={data.entries}
        truncated={data.truncated}
        retentionMonths={data.retentionMonths}
      />
    </>
  );
}
