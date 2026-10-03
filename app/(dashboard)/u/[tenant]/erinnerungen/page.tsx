import CreateReminderButton from "@/components/CreateReminderButton";
import PageHeader from "@/components/PageHeader";
import RemindersListClient from "@/components/RemindersListClient";
import { getReminderFileBrowserData } from "@/lib/files-server";
import { type ReminderFileBrowserData } from "@/lib/files";
import {
  buildReminderMetrics,
  getRemindersForTenant,
  type ReminderMetric,
} from "@/lib/reminders";
import { hasPermissionLevel } from "@/lib/roles";
import { getTeamsForTenant } from "@/lib/team-service";
import { getTenantCapabilities, withAccessRedirect } from "@/lib/tenant-access";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Erinnerungen",
};

function ReminderMetricCard({ label, value, caption, tone }: ReminderMetric) {
  const valueClassName =
    tone === "danger"
      ? "text-danger"
      : tone === "success"
        ? "text-success"
        : "text-ink";

  return (
    <div className="rounded-[14px] border border-border bg-white px-[22px] pt-5 pb-4">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.6px] text-muted">
        {label}
      </div>
      <div
        className={`mt-4 mb-2 font-display text-[38px] font-semibold leading-none tracking-[-1.2px] ${valueClassName}`}
      >
        {value}
      </div>
      <div className="text-[12px] text-muted">{caption}</div>
    </div>
  );
}

export default async function RemindersPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const t = await getTranslations("RemindersPage");
  const { tenant } = await params;
  const returnPath = `/u/${tenant}/erinnerungen`;
  const reminders = await withAccessRedirect(tenant, () => getRemindersForTenant(tenant));
  // Nur für den "Datei anhängen"-Picker im Erinnerung-anlegen-Dialog —
  // fehlende Berechtigung dafür soll die Erinnerungsliste selbst nicht sperren.
  const fileBrowserData = await getReminderFileBrowserData(tenant).catch(
    () => ({ folders: [], files: [] }) as ReminderFileBrowserData,
  );
  // Nur für die "Team"-Auswahl im Anlege-Dialog — fehlende Berechtigung
  // dafür soll die Erinnerungsliste selbst nicht sperren.
  const teams = await getTeamsForTenant(tenant).catch(() => []);
  const teamOptions = teams.map((team) => ({ id: team.dbId ?? team.id, name: team.name }));
  const capabilities = await getTenantCapabilities(tenant);
  const canManage = hasPermissionLevel(capabilities.reminders.level, "write");
  const canDelete = capabilities.reminders.canDelete;
  const reminderMetrics = buildReminderMetrics(reminders, t);

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")}>
        {canManage && (
          <CreateReminderButton
            tenant={tenant}
            returnPath={returnPath}
            fileBrowserData={fileBrowserData}
            teamOptions={teamOptions}
          />
        )}
      </PageHeader>

      <section className="mb-7 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {reminderMetrics.map((metric) => (
          <ReminderMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <RemindersListClient
        tenant={tenant}
        returnPath={returnPath}
        allReminders={reminders}
        fileBrowserData={fileBrowserData}
        canManage={canManage}
        canDelete={canDelete}
      />
    </>
  );
}
