import { completeReminderAction } from "@/app/(dashboard)/u/[tenant]/erinnerungen/actions";
import CreateReminderButton from "@/components/CreateReminderButton";
import { ReminderRowButton } from "@/components/ActionDrawers";
import PageHeader from "@/components/PageHeader";
import { getReminderFileBrowserData } from "@/lib/files-server";
import { type ReminderFileBrowserData } from "@/lib/files";
import {
  buildReminderFilters,
  buildReminderMetrics,
  getRemindersForTenant,
  getReminderPriorityConfig,
  type Reminder,
  type ReminderMetric,
} from "@/lib/reminders";
import { hasPermissionLevel } from "@/lib/roles";
import { getTeamsForTenant } from "@/lib/team-service";
import { getTenantCapabilities, withAccessRedirect } from "@/lib/tenant-access";
import { Check, UsersRound } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Erinnerungen",
};

type T = Awaited<ReturnType<typeof getTranslations>>;

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

function ReminderCompleteButton({
  reminder,
  tenant,
  returnPath,
  canDelete,
  t,
}: {
  reminder: Reminder;
  tenant: string;
  returnPath: string;
  canDelete: boolean;
  t: T;
}) {
  if (!canDelete) {
    return null;
  }

  return (
    <form action={completeReminderAction} className="shrink-0">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <input type="hidden" name="reminderId" value={reminder.id} />
      <button
        type="submit"
        title={t("markDoneTitle")}
        aria-label={t("markDoneAria", { title: reminder.title })}
        className="flex size-[34px] cursor-pointer items-center justify-center rounded-[9px] border border-border bg-white text-muted transition-colors hover:border-success/30 hover:text-success"
      >
        <Check size={14} strokeWidth={2} />
      </button>
    </form>
  );
}

function ReminderRow({
  reminder,
  tenant,
  returnPath,
  fileBrowserData,
  canManage,
  canDelete,
  t,
}: {
  reminder: Reminder;
  tenant: string;
  returnPath: string;
  fileBrowserData: ReminderFileBrowserData;
  canManage: boolean;
  canDelete: boolean;
  t: T;
}) {
  const priority = getReminderPriorityConfig(t)[reminder.priority];
  const isExpired = reminder.daysLeft < 0;
  const daysLabel = isExpired ? Math.abs(reminder.daysLeft) : reminder.daysLeft;

  return (
    <div
      className={`group flex w-full flex-wrap items-center gap-4 rounded-[14px] border bg-white px-5 py-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-muted hover:bg-bg hover:shadow-[0_10px_28px_rgba(0,0,0,0.06)] ${priority.rowClassName}`}
    >
      <ReminderRowButton
        reminder={reminder}
        tenant={tenant}
        returnPath={returnPath}
        fileBrowserData={fileBrowserData}
        canManage={canManage}
        className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-4 text-left"
      >
        <div className="w-[54px] shrink-0 text-center">
          <span
            className={`font-display text-[26px] font-semibold leading-none tracking-[-1px] ${priority.daysClassName}`}
          >
            {daysLabel}
          </span>
          <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.5px] text-muted">
            {isExpired ? t("overdueUnit") : t("daysUnit")}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-ink">
              {reminder.title}
            </span>
            <span
              className={`rounded-md px-[7px] py-0.5 font-mono text-[10px] ${priority.badgeClassName}`}
            >
              {priority.label}
            </span>
            {isExpired && (
              <span className="rounded-md bg-danger/10 px-[7px] py-0.5 font-mono text-[10px] font-semibold text-danger">
                {t("expiredBadge")}
              </span>
            )}
            {reminder.teamName && (
              <span className="inline-flex items-center gap-1 rounded-md bg-border-soft px-[7px] py-0.5 font-mono text-[10px] text-muted-2">
                <UsersRound size={10} />
                {reminder.teamName}
              </span>
            )}
          </div>
          <div className="text-[12.5px] text-muted-2">
            {reminder.subject || t("noSubject")}
          </div>
        </div>

        <div className="shrink-0">
          <span className="inline-flex rounded-[7px] border border-border px-[9px] py-[3px] font-mono text-[10px] text-muted">
            {reminder.category}
          </span>
        </div>
      </ReminderRowButton>

      <ReminderCompleteButton
        reminder={reminder}
        tenant={tenant}
        returnPath={returnPath}
        canDelete={canDelete}
        t={t}
      />
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
  const reminderFilters = buildReminderFilters(reminders, t);

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

      <div className="mb-5 flex w-fit flex-wrap gap-1 rounded-xl border border-border bg-white p-[5px]">
        {reminderFilters.map((filter, index) => (
          <button
            key={filter}
            type="button"
            className={`cursor-pointer whitespace-nowrap rounded-lg px-3.5 py-[7px] text-[13px] transition-colors ${
              index === 0
                ? "bg-border-soft font-semibold text-ink"
                : "bg-transparent font-normal text-muted hover:text-ink"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      <section className="flex flex-col gap-2.5">
        {reminders.length > 0 ? (
          reminders.map((reminder) => (
            <ReminderRow
              key={reminder.id}
              reminder={reminder}
              tenant={tenant}
              returnPath={returnPath}
              fileBrowserData={fileBrowserData}
              canManage={canManage}
              canDelete={canDelete}
              t={t}
            />
          ))
        ) : (
          <div className="rounded-[14px] border border-dashed border-border bg-white px-5 py-10 text-center text-[13px] text-muted">
            {t("emptyState")}
          </div>
        )}
      </section>
    </>
  );
}
