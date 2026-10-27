"use client";

import {
  completeReminderQuickAction,
  createReminderAction,
  deleteReminderAction,
  updateReminderAction,
} from "@/app/(dashboard)/u/[tenant]/erinnerungen/actions";
import { LinkedFileBrowser } from "@/components/ActionDrawers";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { DbDrawer, DbField, dbInputClass } from "@/components/dashboard/DbDrawer";
import { ctaClass, secondaryClass } from "@/components/dashboard/ui";
import { useActionStateWithToast, useToast } from "@/components/Toasts";
import type { ReminderFileBrowserData } from "@/lib/files";
import type { ReminderAssignee, ReminderOption } from "@/lib/reminder-dashboard";
import {
  nextReminderDueDate,
  reminderLeadDays,
  reminderRecurrences,
  type Reminder,
  type ReminderChecklistItem,
  type ReminderPriority,
  type ReminderRecurrence,
} from "@/lib/reminders-shared";
import { Bell, Check, Plus, Repeat, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export const DEFAULT_REMINDER_CATEGORIES = ["Allgemein", "Personal", "Hygiene", "Lohn", "Löschkonzept", "Urlaub", "Gesundheit", "Standort", "Schichtplanung", "Vertrag"];

export function todayIso() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function shiftIso(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function daysFromToday(iso: string) {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / 86_400_000);
}

export function subjectHref(tenant: string, option: ReminderOption | undefined) {
  if (!option) return null;

  return option.type === "employee"
    ? `/u/${tenant}/employees/${option.key}`
    : option.type === "team"
      ? `/u/${tenant}/teams/${option.key}`
      : `/u/${tenant}/standorte/${option.key}`;
}

const PRIORITY_ACTIVE: Record<ReminderPriority, string> = {
  normal: "border-[#dedad4] bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
  important: "border-[rgba(224,123,0,0.35)] bg-[rgba(224,123,0,0.12)] text-[#8a5300]",
  urgent: "border-[rgba(180,51,42,0.35)] bg-[rgba(180,51,42,0.10)] text-[#b4332a]",
};

export default function ReminderDrawer({
  tenant,
  reminder,
  subjects,
  teams,
  assignees,
  currentUserId,
  categories,
  fileBrowserData,
  canDelete,
  onClose,
}: {
  tenant: string;
  reminder?: Reminder;
  subjects: ReminderOption[];
  teams: Array<{ id: string; name: string }>;
  assignees: ReminderAssignee[];
  currentUserId: string;
  categories: string[];
  fileBrowserData?: ReminderFileBrowserData;
  canDelete: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("ReminderDrawer");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(reminder);
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [dueDate, setDueDate] = useState(reminder?.dueDate ?? shiftIso(todayIso(), 7));
  const [priority, setPriority] = useState<ReminderPriority>(reminder?.priority ?? "normal");
  const [category, setCategory] = useState(reminder?.category ?? "Allgemein");
  const [subject, setSubject] = useState<ReminderOption | null>(
    reminder?.subjectType ? (subjects.find((item) => item.id === reminder.subjectId && item.type === reminder.subjectType) ?? null) : null,
  );
  const [subjectQuery, setSubjectQuery] = useState("");
  const [pickingSubject, setPickingSubject] = useState(false);
  const [teamId, setTeamId] = useState(reminder?.teamId ?? "");
  const [ownerUserId, setOwnerUserId] = useState(reminder ? (reminder.ownerUserId ?? "") : currentUserId);
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>(reminder?.recurrence ?? "none");
  const [lead, setLead] = useState(reminder?.remindDaysBefore ?? 7);
  const [checklist, setChecklist] = useState<ReminderChecklistItem[]>(reminder?.checklist ?? []);
  const [newItem, setNewItem] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [notes, setNotes] = useState(reminder?.notes ?? "");
  const [linkedFiles, setLinkedFiles] = useState<string[]>(reminder?.linkedFiles ?? []);
  const [, formAction, isPending] = useActionStateWithToast(isEdit ? updateReminderAction : createReminderAction);
  const [, deleteAction] = useActionStateWithToast(deleteReminderAction);
  const [completing, startComplete] = useTransition();

  const relative = daysFromToday(dueDate);
  const remindOn = shiftIso(dueDate, -lead);
  const nextDue = nextReminderDueDate(dueDate, recurrence);
  const doneCount = checklist.filter((item) => item.done).length;
  const formatDate = (iso: string, withWeekday = false) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, {
      ...(withWeekday ? { weekday: "short" as const } : {}),
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    });
  const filteredSubjects = useMemo(() => {
    const needle = subjectQuery.trim().toLocaleLowerCase(locale);

    return subjects.filter((item) => !needle || item.name.toLocaleLowerCase(locale).includes(needle)).slice(0, 8);
  }, [subjects, subjectQuery, locale]);
  const monthEnd = (() => {
    const [year, month] = todayIso().split("-").map(Number);

    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  })();
  const quickDates = [
    { label: t("tomorrow"), value: shiftIso(todayIso(), 1) },
    { label: t("inOneWeek"), value: shiftIso(todayIso(), 7) },
    { label: t("inOneMonth"), value: shiftIso(todayIso(), 30) },
    { label: t("monthEnd"), value: monthEnd },
  ];
  const chip = (active: boolean) =>
    `db-focus min-h-8 cursor-pointer rounded-full border px-3 text-[12.5px] font-medium transition-colors ${
      active ? "border-ink bg-ink text-white" : "border-[#e4e3df] bg-white text-ink hover:border-[#9a9a96]"
    }`;
  const sectionLabel = "font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase";

  return (
    <DbDrawer
      title={isEdit ? t("editTitle") : t("createTitle")}
      subtitle={t("eyebrow")}
      width={540}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isEdit && canDelete && (
            <ConfirmSubmitButton form="reminder-delete-form" className={`${secondaryClass} mr-auto`} description={t("deleteConfirm", { title: reminder!.title })}>
              {t("delete")}
            </ConfirmSubmitButton>
          )}
          <button type="button" className={secondaryClass} onClick={onClose}>
            {t("cancel")}
          </button>
          {isEdit && reminder!.status === "open" && canDelete && (
            <button
              type="button"
              className={`${secondaryClass} border-[rgba(47,122,74,0.35)] bg-[rgba(47,122,74,0.08)] text-[#1f5d2c]`}
              disabled={completing}
              onClick={() =>
                startComplete(async () => {
                  const result = await completeReminderQuickAction({ tenant, reminderId: reminder!.id });

                  if (result.error) {
                    toast({ tone: "error", title: result.error });
                    return;
                  }

                  toast({ tone: "success", title: t("completed") });
                  onClose();
                  router.refresh();
                })
              }
            >
              <Check size={15} />
              {t("markDone")}
            </button>
          )}
          <button type="submit" form="reminder-form" className={ctaClass} disabled={isPending || !title.trim() || !dueDate}>
            {isPending ? t("saving") : isEdit ? t("save") : t("create")}
          </button>
        </div>
      }
    >
      <form id="reminder-form" action={formAction} className="flex flex-col gap-[18px]">
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="returnPath" value={`/u/${tenant}/erinnerungen`} />
        {reminder && <input type="hidden" name="reminderId" value={reminder.id} />}
        <input type="hidden" name="priority" value={priority} />
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="subjectType" value={subject?.type ?? ""} />
        <input type="hidden" name="subjectId" value={subject?.id ?? ""} />
        {/* Freitext-Bezug älterer Erinnerungen bleibt erhalten, solange nichts verknüpft ist. */}
        <input type="hidden" name="subject" value={subject ? subject.name : reminder && !reminder.subjectType ? reminder.subject : ""} />
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="ownerUserId" value={ownerUserId} />
        <input type="hidden" name="recurrence" value={recurrence} />
        <input type="hidden" name="remindDaysBefore" value={lead} />
        <input type="hidden" name="checklist" value={JSON.stringify(checklist)} />
        <input type="hidden" name="notes" value={notes} />
        {linkedFiles.map((id) => (
          <input key={id} type="hidden" name="linkedFiles" value={id} />
        ))}

        <DbField label={t("titleLabel")}>
          <input name="title" value={title} onChange={(event) => setTitle(event.target.value)} className={dbInputClass} placeholder={t("titlePlaceholder")} required maxLength={160} autoFocus={!isEdit} />
        </DbField>

        <div className="flex flex-col gap-2">
          <span className={sectionLabel}>{t("dueLabel")}</span>
          <div className="flex flex-wrap items-center gap-3">
            <input type="date" name="dueDate" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={`${dbInputClass} !w-auto`} required aria-label={t("dueLabel")} />
            {dueDate && (
              <span className={`text-[13px] ${relative < 0 || relative <= 7 ? "text-[#b4332a]" : "text-[#6e6e6b]"}`}>
                {relative < 0 ? t("overdue", { count: -relative }) : relative === 0 ? t("today") : t("inDays", { count: relative })}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {quickDates.map((item) => (
              <button key={item.label} type="button" className={chip(dueDate === item.value)} onClick={() => setDueDate(item.value)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className={sectionLabel}>{t("priorityLabel")}</span>
          <div role="radiogroup" className="flex w-fit gap-0.5 rounded-[10px] bg-[#f2f1ed] p-[3px]">
            {(["normal", "important", "urgent"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={priority === option}
                onClick={() => setPriority(option)}
                className={`db-focus min-h-9 cursor-pointer rounded-[8px] border px-3.5 text-[13px] font-medium ${
                  priority === option ? PRIORITY_ACTIVE[option] : "border-transparent bg-transparent text-[#6e6e6b]"
                }`}
              >
                {t(`priority.${option}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className={sectionLabel}>{t("categoryLabel")}</span>
          <input value={category} onChange={(event) => setCategory(event.target.value)} className={dbInputClass} maxLength={60} aria-label={t("categoryLabel")} />
          <div className="flex flex-wrap gap-1.5">
            {categories
              .filter((item) => item !== category)
              .map((item) => (
                <button key={item} type="button" className="db-focus cursor-pointer rounded-[7px] border-0 bg-[#f2f1ed] px-2 py-1 text-[12.5px] text-[#3d3d3a] hover:bg-[#e8e7e2]" onClick={() => setCategory(item)}>
                  {item}
                </button>
              ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className={sectionLabel}>{t("subjectLabel")}</span>
          {subject && !pickingSubject ? (
            <div className="flex items-center gap-3 rounded-[12px] border border-[#ecebe7] px-3 py-2.5">
              <span className="flex size-8 items-center justify-center rounded-[8px] bg-[#2c64c9] text-[11px] font-bold text-white">
                {subject.initials ?? subject.name.slice(0, 1)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[14px] font-semibold">{subject.name}</span>
                <span className="text-[12px] text-[#6e6e6b]">{t(`subjectType.${subject.type}`)}</span>
              </span>
              {subjectHref(tenant, subject) && (
                <Link href={subjectHref(tenant, subject)!} className={`${secondaryClass} min-h-8 bg-white px-2.5 py-1 text-[13px]`}>
                  {t("open")}
                </Link>
              )}
              <button type="button" className={`${secondaryClass} min-h-8 bg-white px-2.5 py-1 text-[13px]`} onClick={() => setPickingSubject(true)}>
                {t("change")}
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute top-[14px] left-3 text-[#9a9a96]" />
              <input
                value={subjectQuery}
                onChange={(event) => setSubjectQuery(event.target.value)}
                placeholder={t("subjectPlaceholder")}
                aria-label={t("subjectLabel")}
                className={`${dbInputClass} pl-9`}
              />
              {(subjectQuery || pickingSubject) && (
                <ul className="db-pop-light absolute top-[calc(100%+4px)] z-10 m-0 flex w-full list-none flex-col rounded-[12px] bg-white p-1.5">
                  {subject && (
                    <li>
                      <button type="button" className="w-full cursor-pointer rounded-[8px] border-0 bg-transparent px-2.5 py-2 text-left text-[13px] text-[#b4332a] hover:bg-[#f2f1ed]" onClick={() => { setSubject(null); setPickingSubject(false); setSubjectQuery(""); }}>
                        {t("noSubject")}
                      </button>
                    </li>
                  )}
                  {filteredSubjects.map((item) => (
                    <li key={`${item.type}-${item.id}`}>
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[8px] border-0 bg-transparent px-2.5 py-2 text-left text-[13.5px] hover:bg-[#f2f1ed]"
                        onClick={() => {
                          setSubject(item);
                          setPickingSubject(false);
                          setSubjectQuery("");
                        }}
                      >
                        {item.name}
                        <span className="text-[12px] text-[#9a9a96]">{t(`subjectType.${item.type}`)}</span>
                      </button>
                    </li>
                  ))}
                  {filteredSubjects.length === 0 && <li className="px-2.5 py-2 text-[13px] text-[#9a9a96]">{t("noMatches")}</li>}
                </ul>
              )}
            </div>
          )}
          {!subject && reminder?.subject && !reminder.subjectType && (
            <span className="text-[12.5px] text-[#3d3d3a]">{t("legacySubject", { subject: reminder.subject })}</span>
          )}
          {!subject && <span className="text-[12.5px] text-[#6e6e6b]">{t("subjectHint")}</span>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <DbField label={t("teamLabel")}>
            <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className={`${dbInputClass} cursor-pointer`}>
              <option value="">{t("noTeam")}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </DbField>
          <DbField label={t("ownerLabel")}>
            <select value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)} className={`${dbInputClass} cursor-pointer`}>
              <option value="">{t("noOwner")}</option>
              {assignees.map((assignee) => (
                <option key={assignee.userId} value={assignee.userId}>
                  {assignee.name}
                </option>
              ))}
            </select>
          </DbField>
          <DbField label={t("recurrenceLabel")}>
            <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as ReminderRecurrence)} className={`${dbInputClass} cursor-pointer`}>
              {reminderRecurrences.map((option) => (
                <option key={option} value={option}>
                  {t(`recurrence.${option}`)}
                </option>
              ))}
            </select>
          </DbField>
          <DbField label={t("leadLabel")}>
            <select value={lead} onChange={(event) => setLead(Number(event.target.value))} className={`${dbInputClass} cursor-pointer`}>
              {reminderLeadDays.map((days) => (
                <option key={days} value={days}>
                  {t("leadOption", { count: days })}
                </option>
              ))}
            </select>
          </DbField>
        </div>
        <div className="-mt-2 flex flex-col gap-1 text-[12.5px]">
          {nextDue && (
            <span className="flex items-center gap-1.5 text-[#6b4fc4]">
              <Repeat size={13} />
              {t("nextOccurrence", { date: formatDate(nextDue) })}
            </span>
          )}
          {dueDate && (
            <span className="flex items-center gap-1.5 text-[#6e6e6b]">
              <Bell size={13} />
              {t("remindOn", { date: formatDate(remindOn) })}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between gap-2">
            <span className={sectionLabel}>{t("checklistLabel")}</span>
            {checklist.length > 0 && <span className="text-[12.5px] text-[#6e6e6b]">{t("checklistProgress", { done: doneCount, total: checklist.length })}</span>}
          </span>
          {checklist.length > 0 && (
            <>
              <span className="h-1 overflow-hidden rounded-full bg-[#f0efeb]">
                <span className="block h-full rounded-full bg-[#2f7a4a]" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
              </span>
              <ul className="m-0 flex list-none flex-col p-0">
                {checklist.map((item) => (
                  <li key={item.id} className="flex items-center gap-2.5 py-1.5">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={item.done}
                      aria-label={item.label}
                      onClick={() => setChecklist((current) => current.map((entry) => (entry.id === item.id ? { ...entry, done: !entry.done } : entry)))}
                      className={`db-focus flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border ${item.done ? "border-[#2f7a4a] bg-[#2f7a4a] text-white" : "border-[#cfcec9] bg-white"}`}
                    >
                      {item.done && <Check size={13} strokeWidth={3} />}
                    </button>
                    <span className={`flex-1 text-[14px] ${item.done ? "text-[#9a9a96] line-through" : ""}`}>{item.label}</span>
                    <button
                      type="button"
                      aria-label={t("removeItem")}
                      onClick={() => setChecklist((current) => current.filter((entry) => entry.id !== item.id))}
                      className="flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-[#6e6e6b] hover:bg-[#f2f1ed]"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {addingItem ? (
            <div className="flex gap-2">
              <input
                value={newItem}
                onChange={(event) => setNewItem(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (newItem.trim()) {
                      setChecklist((current) => [...current, { id: `c${Date.now().toString(36)}`, label: newItem.trim(), done: false }]);
                      setNewItem("");
                    }
                  }
                }}
                className={dbInputClass}
                placeholder={t("itemPlaceholder")}
                aria-label={t("itemPlaceholder")}
                autoFocus
                maxLength={160}
              />
              <button
                type="button"
                className={secondaryClass}
                disabled={!newItem.trim()}
                onClick={() => {
                  setChecklist((current) => [...current, { id: `c${Date.now().toString(36)}`, label: newItem.trim(), done: false }]);
                  setNewItem("");
                }}
              >
                {t("add")}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setAddingItem(true)} className="inline-flex w-fit cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13.5px] font-semibold text-[#6b4fc4]">
              <Plus size={15} />
              {t("addItem")}
            </button>
          )}
        </div>

        <DbField label={t("notesLabel")}>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className={dbInputClass} placeholder={t("notesPlaceholder")} maxLength={4000} />
        </DbField>

        <details className="rounded-[12px] border border-[#ecebe7] px-3 py-2.5" open={linkedFiles.length > 0}>
          <summary className="cursor-pointer text-[13.5px] font-semibold">{t("files", { count: linkedFiles.length })}</summary>
          <div className="mt-3">
            <LinkedFileBrowser selectedIds={linkedFiles} setSelectedIds={setLinkedFiles} fileBrowserData={fileBrowserData} />
          </div>
        </details>
      </form>

      {isEdit && (
        <form id="reminder-delete-form" action={deleteAction} hidden>
          <input type="hidden" name="tenant" value={tenant} />
          <input type="hidden" name="reminderId" value={reminder!.id} />
          <input type="hidden" name="returnPath" value={`/u/${tenant}/erinnerungen`} />
        </form>
      )}
    </DbDrawer>
  );
}
