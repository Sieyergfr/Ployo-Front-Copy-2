"use client";

import { useMemo, useState } from "react";
import { ReminderRowButton } from "@/components/ActionDrawers";
import ReminderCompleteButton from "@/components/ReminderCompleteButton";
import { type ReminderFileBrowserData } from "@/lib/files";
import { getReminderPriorityConfig, type Reminder } from "@/lib/reminders-shared";
import { UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations>;
type FilterValue = "all" | "expired" | "urgent" | "done" | string;

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
  const isDone = reminder.status === "done";

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
        canDelete={canDelete}
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
            {isDone ? (
              <span className="rounded-md bg-success/10 px-[7px] py-0.5 font-mono text-[10px] font-semibold text-success">
                {t("metricDoneLabel")}
              </span>
            ) : (
              isExpired && (
                <span className="rounded-md bg-danger/10 px-[7px] py-0.5 font-mono text-[10px] font-semibold text-danger">
                  {t("expiredBadge")}
                </span>
              )
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

      {/* Ein bereits erledigter Eintrag hat nichts mehr zu "erledigen" —
          Löschen ist über das Bearbeiten-Drawer (ReminderRowButton) erreichbar. */}
      {!isDone && (
        <ReminderCompleteButton
          reminder={reminder}
          tenant={tenant}
          returnPath={returnPath}
          canDelete={canDelete}
        />
      )}
    </div>
  );
}

/**
 * Ersetzt die bisherige rein serverseitige, nicht interaktive Filterleiste
 * (QA-Bug BUG-013): die Filter-Buttons waren bloße `<button>`-Elemente ohne
 * `onClick` in einer Server Component — keiner von ihnen tat etwas, "Alle"
 * war immer aktiv markiert. Zusätzlich gab es keinen Weg, erledigte
 * Erinnerungen einzusehen. `allReminders` enthält jetzt (seit der
 * `getRemindersForTenant`-Änderung) sowohl offene als auch erledigte
 * Einträge; die Standardanzeige ("Alle") zeigt weiterhin nur die offenen,
 * "Erledigt" ist ein expliziter Filter (Archiv).
 */
export default function RemindersListClient({
  tenant,
  returnPath,
  allReminders,
  fileBrowserData,
  canManage,
  canDelete,
}: {
  tenant: string;
  returnPath: string;
  allReminders: Reminder[];
  fileBrowserData: ReminderFileBrowserData;
  canManage: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations("RemindersPage");
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all");

  const openReminders = useMemo(
    () => allReminders.filter((reminder) => reminder.status !== "done"),
    [allReminders],
  );
  const doneReminders = useMemo(
    () => allReminders.filter((reminder) => reminder.status === "done"),
    [allReminders],
  );
  const categories = useMemo(
    () => Array.from(new Set(openReminders.map((reminder) => reminder.category).filter(Boolean))),
    [openReminders],
  );

  const filters = useMemo(
    () => [
      { value: "all" as FilterValue, label: t("filterAll"), count: openReminders.length },
      {
        value: "expired" as FilterValue,
        label: t("expiredBadge"),
        count: openReminders.filter((reminder) => reminder.daysLeft < 0).length,
      },
      {
        value: "urgent" as FilterValue,
        label: t("priorityUrgent"),
        count: openReminders.filter((reminder) => reminder.daysLeft <= 7).length,
      },
      ...categories.map((category) => ({
        value: category as FilterValue,
        label: category,
        count: openReminders.filter((reminder) => reminder.category === category).length,
      })),
      { value: "done" as FilterValue, label: t("metricDoneLabel"), count: doneReminders.length },
    ],
    [openReminders, doneReminders, categories, t],
  );

  const visibleReminders = useMemo(() => {
    if (activeFilter === "done") {
      return doneReminders;
    }

    if (activeFilter === "all") {
      return openReminders;
    }

    if (activeFilter === "expired") {
      return openReminders.filter((reminder) => reminder.daysLeft < 0);
    }

    if (activeFilter === "urgent") {
      return openReminders.filter((reminder) => reminder.daysLeft <= 7);
    }

    return openReminders.filter((reminder) => reminder.category === activeFilter);
  }, [activeFilter, openReminders, doneReminders]);

  return (
    <>
      <div className="mb-5 flex w-fit flex-wrap gap-1 rounded-xl border border-border bg-white p-[5px]">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`cursor-pointer whitespace-nowrap rounded-lg px-3.5 py-[7px] text-[13px] transition-colors ${
              activeFilter === filter.value
                ? "bg-border-soft font-semibold text-ink"
                : "bg-transparent font-normal text-muted hover:text-ink"
            }`}
            onClick={() => setActiveFilter(filter.value)}
          >
            {filter.label} ({filter.count})
          </button>
        ))}
      </div>

      <section className="flex flex-col gap-2.5">
        {visibleReminders.length > 0 ? (
          visibleReminders.map((reminder) => (
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
            {activeFilter === "done"
              ? t("emptyStateDone")
              : activeFilter === "all"
                ? t("emptyState")
                : t("emptyStateFiltered")}
          </div>
        )}
      </section>
    </>
  );
}
