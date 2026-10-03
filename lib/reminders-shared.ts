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
};

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
