/**
 * Client-sichere Typen/Funktionen aus lib/reminders.ts ausgelagert (Fund aus
 * dem Probe-Build während QA-Bug BUG-013): `lib/reminders.ts` importiert
 * `@/lib/auth` (Server-Only, zieht transitiv `nodemailer`/Node-Builtins wie
 * `net`/`tls` nach sich). Ein reiner `import type` aus einer Client
 * Component wird vom Compiler entfernt und wäre unproblematisch — sobald
 * aber auch ein WERT (hier `getReminderPriorityConfig`) importiert wird,
 * bündelt Next.js die komplette Datei inkl. aller Top-Level-Importe für den
 * Browser und der Build schlägt fehl. Diese Datei enthält daher nur reine,
 * serverfreie Typen/Funktionen — `lib/reminders.ts` re-exportiert sie für
 * bestehende Server-seitige Importe unverändert mit.
 */

export type ReminderPriority = "urgent" | "important" | "normal";

export type ReminderMetric = {
  label: string;
  value: string;
  caption: string;
  tone?: "danger" | "success";
};

export type Reminder = {
  id: string;
  daysLeft: number;
  title: string;
  subject: string;
  category: string;
  priority: ReminderPriority;
  dueDate: string;
  status: "open" | "done";
  notes: string;
  linkedFiles: string[];
  createdByName: string;
  teamId: string | null;
  teamName: string | null;
  /** Echte Verknüpfung (Dashboard) — leer, wenn nur Freitext in `subject`. */
  subjectType?: ReminderSubjectType | "";
  subjectId?: string;
  ownerUserId?: string;
  ownerName?: string;
  recurrence?: ReminderRecurrence;
  remindDaysBefore?: number;
  checklist?: ReminderChecklistItem[];
  /** Vom System angelegt (z. B. Löschkonzept). */
  automatic?: boolean;
  createdAt?: string;
};

export type ReminderSubjectType = "employee" | "team" | "location";
export const reminderSubjectTypes: ReminderSubjectType[] = ["employee", "team", "location"];

export const reminderRecurrences = ["none", "weekly", "monthly", "quarterly", "yearly"] as const;
export type ReminderRecurrence = (typeof reminderRecurrences)[number];

export const reminderLeadDays = [0, 1, 3, 7, 14, 30] as const;

export type ReminderChecklistItem = { id: string; label: string; done: boolean };

export function isReminderRecurrence(value: unknown): value is ReminderRecurrence {
  return typeof value === "string" && (reminderRecurrences as readonly string[]).includes(value);
}

/** Nächste Fälligkeit einer wiederkehrenden Erinnerung (ISO-Datum). */
export function nextReminderDueDate(dueDate: string, recurrence: ReminderRecurrence): string | null {
  if (recurrence === "none" || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;

  const [year, month, day] = dueDate.split("-").map(Number);

  if (recurrence === "weekly") {
    return new Date(Date.UTC(year, month - 1, day + 7)).toISOString().slice(0, 10);
  }

  const months = recurrence === "monthly" ? 1 : recurrence === "quarterly" ? 3 : 12;
  const target = month - 1 + months;
  const lastDay = new Date(Date.UTC(year, target + 1, 0)).getUTCDate();

  return new Date(Date.UTC(year, target, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

/** Checkliste aus Formular/JSON bereinigen: höchstens 30 Punkte, Text gekürzt. */
export function normalizeReminderChecklist(value: unknown): ReminderChecklistItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      const entry = (item ?? {}) as Record<string, unknown>;
      const label = typeof entry.label === "string" ? entry.label.trim().slice(0, 160) : "";

      return {
        id: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim().slice(0, 40) : `c${index + 1}`,
        label,
        done: entry.done === true,
      };
    })
    .filter((item) => item.label)
    .slice(0, 30);
}

export function getReminderPriorityConfig(
  t: (key: string) => string,
): Record<
  ReminderPriority,
  {
    label: string;
    daysClassName: string;
    badgeClassName: string;
    rowClassName: string;
  }
> {
  return {
    urgent: {
      label: t("priorityUrgent"),
      daysClassName: "text-danger",
      badgeClassName: "bg-danger/10 text-danger font-semibold",
      rowClassName: "border-danger/25",
    },
    important: {
      label: t("priorityImportant"),
      daysClassName: "text-[#7A4E00]",
      badgeClassName: "bg-warning/10 text-[#7A4E00] font-semibold",
      rowClassName: "border-border",
    },
    normal: {
      label: t("priorityNormal"),
      daysClassName: "text-muted-2",
      badgeClassName: "bg-border-soft text-muted",
      rowClassName: "border-border",
    },
  };
}
