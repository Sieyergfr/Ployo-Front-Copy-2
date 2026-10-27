import SettingsPage from "@/components/dashboard/settings/SettingsPage";
import { SETTINGS_CATEGORIES, type SettingsCategory } from "@/components/dashboard/settings/settings-categories";
import { DbPageHead } from "@/components/dashboard/ui";
import { getSettingsPageData } from "@/lib/settings-page";
import { withAccessRedirect } from "@/lib/tenant-access";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Einstellungen",
};

export default async function TenantSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant } = await params;
  const query = await searchParams;
  const t = await getTranslations("SettingsPage");
  const data = await withAccessRedirect(tenant, () => getSettingsPageData(tenant));
  const requested = Array.isArray(query.kat) ? query.kat[0] : query.kat;
  const category = (SETTINGS_CATEGORIES as readonly string[]).includes(requested ?? "") ? (requested as SettingsCategory) : "account";

  return (
    <>
      <DbPageHead eyebrow={data.tenant.name} title={t("title")} subtitle={t("subtitle")} />
      <SettingsPage key={category} data={data} category={category} />
    </>
  );
}
