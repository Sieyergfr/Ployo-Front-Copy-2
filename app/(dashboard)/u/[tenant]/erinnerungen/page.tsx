import RemindersBoard from "@/components/dashboard/reminders/RemindersBoard";
import { DbPageHead } from "@/components/dashboard/ui";
import { auth } from "@/lib/auth";
import { getReminderFileBrowserData } from "@/lib/files-server";
import { type ReminderFileBrowserData } from "@/lib/files";
import { getReminderFormOptions, getReminderSuggestions } from "@/lib/reminder-dashboard";
import { getRemindersForTenant } from "@/lib/reminders";
import { hasPermissionLevel } from "@/lib/roles";
import { getTenantCapabilities, withAccessRedirect } from "@/lib/tenant-access";
import { getTenantsForUser } from "@/lib/tenants";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Erinnerungen",
};

export default async function RemindersPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const t = await getTranslations("RemindersBoard");
  const { tenant } = await params;
  const reminders = await withAccessRedirect(tenant, () => getRemindersForTenant(tenant));
  const capabilities = await getTenantCapabilities(tenant);
  const canManage = hasPermissionLevel(capabilities.reminders.level, "write");
  const canDelete = capabilities.reminders.canDelete;
  // Nur für den "Datei anhängen"-Picker im Drawer — fehlende Berechtigung
  // dafür soll die Erinnerungsliste selbst nicht sperren.
  const fileBrowserData = canManage
    ? await getReminderFileBrowserData(tenant).catch(() => ({ folders: [], files: [] }) as ReminderFileBrowserData)
    : undefined;
  const options = await getReminderFormOptions(tenant);
  const suggestions = canManage ? await getReminderSuggestions(tenant).catch(() => []) : [];
  const session = await auth.api.getSession({ headers: await headers() });
  const memberships = session?.user?.id ? await getTenantsForUser(session.user.id).catch(() => null) : null;
  const tenantName = memberships?.find((item) => item.tenant.slug === tenant)?.tenant.name ?? tenant;
  const open = reminders.filter((reminder) => reminder.status === "open");

  return (
    <>
      <DbPageHead
        eyebrow={tenantName}
        title={t("title")}
        subtitle={t("subtitle", { open: open.length, overdue: open.filter((reminder) => reminder.daysLeft < 0).length })}
        actions={<span id="reminders-actions" className="contents" />}
      />

      <RemindersBoard
        tenant={tenant}
        reminders={reminders}
        suggestions={suggestions}
        subjects={options.subjects}
        teams={options.teams}
        assignees={options.assignees}
        currentUserId={options.currentUserId}
        fileBrowserData={fileBrowserData}
        canManage={canManage}
        canDelete={canDelete}
      />
    </>
  );
}
