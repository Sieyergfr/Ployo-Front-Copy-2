"use client";

import {
  acceptReminderSuggestionAction,
  completeReminderQuickAction,
  dismissReminderSuggestionAction,
  rescheduleReminderAction,
} from "@/app/(dashboard)/u/[tenant]/erinnerungen/actions";
import { dbInputClass } from "@/components/dashboard/DbDrawer";
import { DbMenu, dbMenuItemClass } from "@/components/dashboard/DbMenu";
import ReminderDrawer, {
  DEFAULT_REMINDER_CATEGORIES,
  shiftIso,
  subjectHref,
  todayIso,
} from "@/components/dashboard/reminders/ReminderDrawer";
import { DbCard, avatarColor, ctaClass } from "@/components/dashboard/ui";
import { useToast } from "@/components/Toasts";
import type { ReminderFileBrowserData } from "@/lib/files";
import type { ReminderAssignee, ReminderOption, ReminderSuggestion } from "@/lib/reminder-dashboard";
import type { Reminder, ReminderPriority } from "@/lib/reminders-shared";
import {
  AlarmClock,
  Bell,
  CalendarDays,
  Check,
  ChevronUp,
  Info,
  Paperclip,
  Plus,
  Repeat,
  Search,
  Sparkles,
  Thermometer,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";

type Filter = "all" | "expired" | "urgent" | "done";

const PRIORITY_DOT: Record<ReminderPriority, string> = { urgent: "#b4332a", important: "#e07b00", normal: "#8b6fe0" };
const PRIORITY_PILL: Record<ReminderPriority, string> = {
  urgent: "bg-[rgba(180,51,42,0.10)] text-[#b4332a]",
  important: "bg-[rgba(224,123,0,0.12)] text-[#8a5300]",
  normal: "bg-[#f2f1ed] text-[#6e6e6b]",
};
const SUGGESTION_ICONS: Record<ReminderSuggestion["kind"], LucideIcon> = {
  probation: UserPlus,
  fixedTerm: CalendarDays,
  eau: Thermometer,
  vacation: Sparkles,
};
const noopSubscribe = () => () => {};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);

  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
}

function Kpi({ label, value, caption, tone = "", hint, suffix }: { label: string; value: string | number; caption: string; tone?: string; hint?: string; suffix?: string }) {
  return (
    <DbCard className="db-insight flex flex-col gap-1.5 p-[16px]">
      <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-[#6e6e6b]">
        {label}
        {hint && (
          <span title={hint} className="flex size-4 items-center justify-center rounded-full bg-[#f2f1ed] text-[#9a9a96]">
            <Info size={10} />
          </span>
        )}
      </span>
      <span className={`font-display text-[28px] leading-none font-semibold tracking-[-1px] ${tone}`}>
        {value}
        {suffix && <span className="ml-1.5 font-sans text-[13px] font-normal tracking-normal text-[#9a9a96]">{suffix}</span>}
      </span>
      <span className="truncate text-[12.5px] text-[#6e6e6b]" title={caption}>
        {caption}
      </span>
    </DbCard>
  );
}

export default function RemindersBoard({
  tenant,
  reminders,
  suggestions,
  subjects,
  teams,
  assignees,
  currentUserId,
  fileBrowserData,
  canManage,
  canDelete,
}: {
  tenant: string;
  reminders: Reminder[];
  suggestions: ReminderSuggestion[];
  subjects: ReminderOption[];
  teams: Array<{ id: string; name: string }>;
  assignees: ReminderAssignee[];
  currentUserId: string;
  fileBrowserData?: ReminderFileBrowserData;
  canManage: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations("RemindersBoard");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [drawer, setDrawer] = useState<{ reminder?: Reminder } | null>(null);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);
  const [pending, startTransition] = useTransition();
  const headerSlot = useSyncExternalStore(noopSubscribe, () => document.getElementById("reminders-actions"), () => null);

  const open = reminders.filter((reminder) => reminder.status === "open");
  const done = reminders.filter((reminder) => reminder.status === "done");
  const expired = open.filter((reminder) => reminder.daysLeft < 0);
  const urgent = open.filter((reminder) => reminder.daysLeft >= 0 && reminder.daysLeft <= 7);
  const next = [...open].sort((a, b) => a.daysLeft - b.daysLeft)[0];
  const subjectById = useMemo(() => new Map(subjects.map((item) => [`${item.type}:${item.id}`, item])), [subjects]);
  const categories = useMemo(
    () => [...new Set([...DEFAULT_REMINDER_CATEGORIES, ...reminders.map((reminder) => reminder.category)])].filter(Boolean),
    [reminders],
  );
  const usedCategories = useMemo(() => [...new Set(reminders.map((reminder) => reminder.category))].sort((a, b) => a.localeCompare(b, locale)), [reminders, locale]);

  const needle = query.trim().toLocaleLowerCase(locale);
  const visible = (filter === "done" ? done : filter === "expired" ? expired : filter === "urgent" ? urgent : open).filter(
      (reminder) =>
        (!category || reminder.category === category) &&
        (!onlyMine || reminder.ownerUserId === currentUserId) &&
        (!needle ||
          [reminder.title, reminder.subject, reminder.category, reminder.notes, reminder.teamName ?? ""]
            .join(" ")
            .toLocaleLowerCase(locale)
            .includes(needle)),
  );

  const groups =
    filter === "done"
      ? [{ id: "done", label: t("groupDone"), color: "#2f7a4a", items: visible }]
      : [
          { id: "overdue", label: t("groupOverdue"), color: "#b4332a", items: visible.filter((item) => item.daysLeft < 0) },
          { id: "week", label: t("groupWeek"), color: "#e07b00", items: visible.filter((item) => item.daysLeft >= 0 && item.daysLeft <= 7) },
          { id: "month", label: t("groupMonth"), color: "#8b6fe0", items: visible.filter((item) => item.daysLeft > 7 && item.daysLeft <= 30) },
          { id: "later", label: t("groupLater"), color: "#9a9a96", items: visible.filter((item) => item.daysLeft > 30) },
        ].filter((group) => group.items.length > 0);

  const run = (action: () => Promise<{ error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await action();

      if (result.error) {
        toast({ tone: "error", title: result.error });
        return;
      }

      toast({ tone: "success", title: success });
      router.refresh();
    });

  const formatDate = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const relativeLabel = (days: number) => (days < 0 ? t("overdueDays", { count: -days }) : days === 0 ? t("today") : t("inDays", { count: days }));

  // Fristen-Radar: die nächsten 30 Tage, Überfällige links am Rand.
  const radarDays = 30;
  const radarItems = open.filter((reminder) => reminder.daysLeft <= radarDays);
  const today = todayIso();
  const pct = (days: number) => `${(Math.max(0, Math.min(radarDays, days)) / radarDays) * 96 + 2}%`;
  const weekStarts = Array.from({ length: 5 }, (_, index) => 7 * index).filter((offset) => offset <= radarDays);
  const visibleSuggestions = showAllSuggestions ? suggestions : suggestions.slice(0, 3);
  const pill = (active: boolean) =>
    `db-focus inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium ${
      active ? "border-ink bg-ink text-white" : "border-[#e4e3df] bg-white text-ink hover:border-[#9a9a96]"
    }`;

  return (
    <>
      {headerSlot &&
        canManage &&
        createPortal(
          <button type="button" className={ctaClass} onClick={() => setDrawer({})}>
            <Plus size={16} />
            {t("create")}
          </button>,
          headerSlot,
        )}

      <section className="mb-4 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <Kpi label={t("kpiOpen")} value={open.length} caption={t("kpiOpenCaption")} hint={t("kpiOpenHint")} />
        <Kpi label={t("kpiUrgent")} value={urgent.length} caption={t("kpiUrgentCaption")} tone={urgent.length ? "text-[#b4332a]" : ""} />
        <Kpi label={t("kpiExpired")} value={expired.length} caption={t("kpiExpiredCaption")} tone={expired.length ? "text-[#b4332a]" : ""} />
        <Kpi label={t("kpiDone")} value={done.length} caption={t("kpiDoneCaption")} tone="text-[#2f7a4a]" />
        <Kpi
          label={t("kpiNext")}
          value={next ? Math.abs(next.daysLeft) : "–"}
          suffix={next ? (next.daysLeft < 0 ? t("daysOverdue") : t("days")) : undefined}
          caption={next ? next.title : t("kpiNextEmpty")}
          tone={next && next.daysLeft < 0 ? "text-[#b4332a]" : next && next.daysLeft <= 7 ? "text-[#c2571f]" : ""}
        />
      </section>

      <DbCard className="mb-4 p-[18px]">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="m-0 font-display text-[17px] font-semibold tracking-[-0.3px]">{t("radarTitle")}</h2>
            <span className="text-[13px] text-[#6e6e6b]">{t("radarSubtitle")}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-[#6e6e6b]">
            {(["urgent", "important", "normal"] as const).map((priority) => (
              <span key={priority} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: PRIORITY_DOT[priority] }} />
                {t(`priority.${priority}`)}
              </span>
            ))}
            {expired.length > 0 && (
              <button type="button" onClick={() => setFilter("expired")} className="flex cursor-pointer items-center gap-1.5 rounded-full border-0 bg-[rgba(180,51,42,0.10)] px-2.5 py-1 text-[12.5px] font-semibold text-[#b4332a]">
                <span className="size-1.5 rounded-full bg-[#b4332a]" />
                {t("overdueCount", { count: expired.length })}
              </button>
            )}
          </div>
        </div>
        <div className="relative h-[110px]">
          {weekStarts.map((offset, index) =>
            index % 2 === 1 ? (
              <span key={offset} className="absolute top-0 bottom-6 bg-[#f6f5f2]" style={{ left: pct(offset), width: `${(7 / radarDays) * 96}%` }} />
            ) : null,
          )}
          <span className="absolute top-0 bottom-6 w-[3%] rounded-[4px] bg-[rgba(139,111,224,0.10)]" style={{ left: 0 }} />
          <span className="absolute right-0 bottom-6 left-0 h-px bg-[#dcdbd6]" />
          {radarItems.map((reminder, index) => (
            <button
              key={reminder.id}
              type="button"
              title={`${reminder.title} · ${formatDate(reminder.dueDate)}`}
              aria-label={`${reminder.title} · ${formatDate(reminder.dueDate)}`}
              onClick={() => setDrawer({ reminder })}
              className="absolute size-3.5 -translate-x-1/2 cursor-pointer rounded-full border-2 border-white p-0 shadow-[0_0_0_1px_rgba(0,0,0,0.08)] transition-transform hover:scale-125"
              style={{
                left: pct(reminder.daysLeft),
                bottom: 24 + 18 + (index % 3) * 18,
                background: PRIORITY_DOT[reminder.priority],
              }}
            />
          ))}
          <span className="absolute bottom-0 font-mono text-[10px] font-semibold text-[#6b4fc4]" style={{ left: 0 }}>
            {t("today")}
          </span>
          {weekStarts.slice(1).map((offset) => (
            <span key={offset} className="absolute bottom-0 -translate-x-1/2 font-mono text-[10px] text-[#9a9a96]" style={{ left: pct(offset) }}>
              {formatDate(shiftIso(today, offset)).slice(0, 6)}
            </span>
          ))}
        </div>
      </DbCard>

      {canManage && suggestions.length > 0 && (
        <DbCard className="mb-4 p-[18px]">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-ink text-white">
              <Sparkles size={16} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h2 className="m-0 font-display text-[16px] font-semibold">{t("suggestionsTitle")}</h2>
              <span className="text-[13px] text-[#6e6e6b]">{t("suggestionsSubtitle", { count: suggestions.length })}</span>
            </div>
            <button
              type="button"
              aria-expanded={suggestionsOpen}
              aria-label={t("toggleSuggestions")}
              onClick={() => setSuggestionsOpen((value) => !value)}
              className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent text-[#6e6e6b] hover:bg-[#f2f1ed]"
            >
              <ChevronUp size={17} className={suggestionsOpen ? "" : "rotate-180"} />
            </button>
          </div>
          {suggestionsOpen && (
            <>
              <div className="mt-3.5 grid gap-3 md:grid-cols-3">
                {visibleSuggestions.map((suggestion) => {
                  const Icon = SUGGESTION_ICONS[suggestion.kind];

                  return (
                    <div key={suggestion.key} className="flex flex-col gap-2 rounded-[12px] border border-[#ecebe7] p-3.5">
                      <div className="flex items-start gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-[rgba(139,111,224,0.10)] text-[#6b4fc4]">
                          <Icon size={14} />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[14px] font-semibold">{suggestion.title}</span>
                          <span className="text-[12.5px] leading-[1.4] text-[#6e6e6b]">{suggestion.detail}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[12.5px] text-[#6e6e6b]">
                        <span className={`rounded-[6px] px-1.5 py-[2px] text-[12px] font-semibold ${PRIORITY_PILL[suggestion.priority]}`}>{t(`priority.${suggestion.priority}`)}</span>
                        {t("dueOn", { date: formatDate(suggestion.dueDate) })}
                      </div>
                      <div className="mt-auto flex justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={pending}
                          className="cursor-pointer rounded-[8px] border-0 bg-transparent px-2.5 py-1.5 text-[13px] font-medium text-[#6e6e6b] hover:bg-[#f2f1ed]"
                          onClick={() => run(() => dismissReminderSuggestionAction({ tenant, key: suggestion.key }), t("suggestionDismissed"))}
                        >
                          {t("ignore")}
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          className="cursor-pointer rounded-[8px] border-0 bg-ink px-2.5 py-1.5 text-[13px] font-semibold text-white"
                          onClick={() => run(() => acceptReminderSuggestionAction({ tenant, key: suggestion.key }), t("suggestionAccepted"))}
                        >
                          {t("accept")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {suggestions.length > 3 && (
                <button type="button" onClick={() => setShowAllSuggestions((value) => !value)} className="mt-3 cursor-pointer border-0 bg-transparent p-0 text-[13.5px] font-semibold text-[#6b4fc4]">
                  {showAllSuggestions ? t("showFewerSuggestions") : t("showAllSuggestions", { count: suggestions.length })}
                </button>
              )}
            </>
          )}
        </DbCard>
      )}

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        {(
          [
            ["all", t("filterAll"), open.length, null],
            ["expired", t("filterExpired"), expired.length, "#b4332a"],
            ["urgent", t("filterUrgent"), urgent.length, "#e07b00"],
            ["done", t("filterDone"), done.length, null],
          ] as const
        ).map(([value, label, count, dot]) => (
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={pill(filter === value)}>
            {label}
            <span className={`text-[12px] ${filter === value ? "text-white/70" : "text-[#9a9a96]"}`}>{count}</span>
            {dot && count > 0 && <span className="size-1.5 rounded-full" style={{ background: dot }} />}
          </button>
        ))}
        <span className="flex-1" />
        <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label={t("category")} className={`${dbInputClass} !w-auto min-w-[170px] cursor-pointer bg-white`}>
          <option value="">{t("allCategories")}</option>
          {usedCategories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <label className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#9a9a96]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} aria-label={t("search")} className={`${dbInputClass} !w-[200px] bg-white pl-9`} />
        </label>
        <button type="button" aria-pressed={onlyMine} onClick={() => setOnlyMine((value) => !value)} className={pill(onlyMine)}>
          {t("onlyMine")}
        </button>
      </div>

      {groups.length === 0 && (
        <DbCard className="py-10 text-center">
          <div className="font-display text-[18px] font-semibold">{t("emptyTitle")}</div>
          <div className="mt-1.5 text-[13px] text-[#6e6e6b]">{t("emptyHint")}</div>
        </DbCard>
      )}

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <DbCard key={group.id} className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-[#ecebe7] px-[18px] py-3">
              <span className="size-2 rounded-full" style={{ background: group.color }} />
              <span className="text-[14.5px] font-semibold">{group.label}</span>
              <span className="rounded-[6px] bg-[#f2f1ed] px-1.5 text-[12px] text-[#6e6e6b]">{group.items.length}</span>
            </div>
            <ul className="m-0 list-none p-0">
              {group.items.map((reminder) => {
                const subject = reminder.subjectType ? subjectById.get(`${reminder.subjectType}:${reminder.subjectId}`) : undefined;
                const href = subjectHref(tenant, subject);
                const checklistDone = (reminder.checklist ?? []).filter((item) => item.done).length;
                const checklistTotal = reminder.checklist?.length ?? 0;
                const isDone = reminder.status === "done";

                return (
                  <li
                    key={reminder.id}
                    className={`relative grid items-center gap-3 border-b border-[#f0efeb] py-3 pr-[18px] pl-[18px] last:border-b-0 hover:bg-[#fafaf8] md:grid-cols-[28px_minmax(0,1fr)_190px_96px_110px_36px] ${
                      reminder.priority === "urgent" && !isDone ? "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[#b4332a]" : ""
                    }`}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isDone}
                      aria-label={t("markDone", { title: reminder.title })}
                      disabled={!canDelete || isDone || pending}
                      onClick={() => run(() => completeReminderQuickAction({ tenant, reminderId: reminder.id }), t("completed"))}
                      className={`db-focus z-[1] flex size-[22px] cursor-pointer items-center justify-center rounded-[7px] border disabled:cursor-default ${
                        isDone ? "border-[#2f7a4a] bg-[#2f7a4a] text-white" : "border-[#cfcec9] bg-white hover:border-[#2f7a4a]"
                      }`}
                    >
                      {isDone && <Check size={14} strokeWidth={3} />}
                    </button>
                    <button type="button" onClick={() => (canManage ? setDrawer({ reminder }) : undefined)} className="flex min-w-0 cursor-pointer flex-col items-start gap-1 border-0 bg-transparent p-0 text-left text-ink">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-[14.5px] font-semibold ${isDone ? "text-[#9a9a96] line-through" : ""}`}>{reminder.title}</span>
                        {reminder.daysLeft < 0 && !isDone && <span className="rounded-[5px] bg-[#b4332a] px-1.5 py-[1px] text-[11px] font-semibold text-white">{t("expiredBadge")}</span>}
                        {reminder.automatic && (
                          <span className="inline-flex items-center gap-1 rounded-[5px] bg-[rgba(139,111,224,0.10)] px-1.5 py-[1px] text-[11px] font-semibold text-[#6b4fc4]">
                            <Sparkles size={10} />
                            {t("automatic")}
                          </span>
                        )}
                        {reminder.linkedFiles.length > 0 && (
                          <span className="inline-flex items-center gap-0.5 rounded-[5px] bg-[#f2f1ed] px-1.5 py-[1px] text-[11px] text-[#6e6e6b]">
                            <Paperclip size={10} />
                            {reminder.linkedFiles.length}
                          </span>
                        )}
                        {reminder.recurrence && reminder.recurrence !== "none" && (
                          <span title={t(`recurrence.${reminder.recurrence}`)} className="inline-flex items-center rounded-[5px] bg-[#f2f1ed] px-1.5 py-[2px] text-[#6e6e6b]">
                            <Repeat size={11} />
                          </span>
                        )}
                        {checklistTotal > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-[5px] bg-[#f2f1ed] px-1.5 py-[1px] text-[11px] text-[#6e6e6b]">
                            <span className="h-1 w-5 overflow-hidden rounded-full bg-[#dcdbd6]">
                              <span className="block h-full bg-[#2f7a4a]" style={{ width: `${(checklistDone / checklistTotal) * 100}%` }} />
                            </span>
                            {checklistDone}/{checklistTotal}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-[#6e6e6b]">
                        {reminder.category}
                        {reminder.teamName && (
                          <>
                            <span className="text-[#cfcec9]">·</span>
                            <span className="flex items-center gap-1">
                              <span className="size-1.5 rounded-[2px] bg-[#2c64c9]" />
                              {reminder.teamName}
                            </span>
                          </>
                        )}
                        {reminder.ownerName && (
                          <>
                            <span className="text-[#cfcec9]">·</span>
                            <span
                              title={reminder.ownerName}
                              className="flex size-[18px] items-center justify-center rounded-full text-[8.5px] font-bold text-white"
                              style={{ background: avatarColor(reminder.ownerUserId ?? reminder.ownerName) }}
                            >
                              {initials(reminder.ownerName)}
                            </span>
                          </>
                        )}
                      </span>
                    </button>
                    <span className="min-w-0 overflow-hidden">
                      {subject ? (
                        href ? (
                          <Link href={href} className="relative z-[1] inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#ecebe7] bg-white px-2 py-1 text-[13px] text-ink no-underline hover:border-[#9a9a96]">
                            {subject.type === "employee" ? (
                              <span className="flex size-[18px] items-center justify-center rounded-full text-[8.5px] font-bold text-white" style={{ background: avatarColor(subject.id) }}>
                                {subject.initials ?? initials(subject.name)}
                              </span>
                            ) : (
                              <span className={`size-2 rounded-[2px] ${subject.type === "team" ? "bg-[#2f7a4a]" : "bg-[#2c64c9]"}`} />
                            )}
                            <span className="truncate">{subject.name}</span>
                          </Link>
                        ) : null
                      ) : reminder.subject ? (
                        <span className="block truncate text-[13px] text-[#3d3d3a]" title={reminder.subject}>
                          {reminder.subject}
                        </span>
                      ) : (
                        <span className="text-[13px] text-[#b5b4af]">{t("noSubject")}</span>
                      )}
                    </span>
                    <span>
                      <span className={`rounded-[6px] px-1.5 py-[2px] text-[12px] font-semibold ${PRIORITY_PILL[reminder.priority]}`}>{t(`priority.${reminder.priority}`)}</span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span className="text-[13.5px] font-semibold tabular-nums">{formatDate(reminder.dueDate)}</span>
                      {!isDone && (
                        <span className={`text-[12px] ${reminder.daysLeft <= 7 ? "text-[#b4332a]" : "text-[#6e6e6b]"}`}>{relativeLabel(reminder.daysLeft)}</span>
                      )}
                    </span>
                    <span className="relative z-[1] flex justify-end">
                      {canManage && !isDone && (
                        <DbMenu label={t("snooze")} icon={<AlarmClock size={16} />}>
                          {[
                            [t("snoozeTomorrow"), 1],
                            [t("snoozeWeek"), 7],
                            [t("snoozeMonth"), 30],
                          ].map(([label, days]) => (
                            <button
                              key={label}
                              type="button"
                              role="menuitem"
                              className={dbMenuItemClass}
                              onClick={() =>
                                run(
                                  () =>
                                    rescheduleReminderAction({
                                      tenant,
                                      reminderId: reminder.id,
                                      dueDate: shiftIso(reminder.daysLeft < 0 ? today : reminder.dueDate, days as number),
                                    }),
                                  t("snoozed"),
                                )
                              }
                            >
                              <Bell size={14} />
                              {label}
                            </button>
                          ))}
                        </DbMenu>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </DbCard>
        ))}
      </div>

      {drawer && (
        <ReminderDrawer
          key={drawer.reminder?.id ?? "new"}
          tenant={tenant}
          reminder={drawer.reminder}
          subjects={subjects}
          teams={teams}
          assignees={assignees}
          currentUserId={currentUserId}
          categories={categories}
          fileBrowserData={fileBrowserData}
          canDelete={canDelete}
          onClose={() => setDrawer(null)}
        />
      )}
    </>
  );
}
