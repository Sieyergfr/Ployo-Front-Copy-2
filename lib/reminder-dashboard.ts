import "server-only";

import { recordTenantAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { addDaysIso, upcomingStaffDeadlines } from "@/lib/report-analytics-core";
import { getVacationAccountAnalytics } from "@/lib/report-analytics";
import { createTenantReminder, updateTenantReminder } from "@/lib/reminders";
import type { ReminderPriority, ReminderSubjectType } from "@/lib/reminders-shared";
import { getOptionalTenantAccess, requireTenantAccess } from "@/lib/tenant-access";
import { localDateKey } from "@/lib/time-tracking";
import { loadTenantContext, scopedEmployeeWhere } from "@/lib/time-tracking-service";

/**
 * Ergänzungen der Erinnerungsseite im Dashboard: Auswahllisten für Bezug und
 * Zuständigkeit, Fristen-Vorschläge aus den vorhandenen Daten und das
 * Verschieben einer Fälligkeit. Vorschläge nutzen nur Daten, die der
 * Betrachter in den jeweiligen Bereichen ohnehin sehen darf.
 */

export type ReminderOption = { id: string; key: string; name: string; initials?: string; type: ReminderSubjectType };
export type ReminderAssignee = { userId: string; name: string };

export async function getReminderFormOptions(tenantSlug: string) {
  const access = await requireTenantAccess(tenantSlug, "reminders", "read");
  // Bewusst nacheinander: jede Prüfung löst dieselbe Session auf.
  const employeesAccess = await getOptionalTenantAccess(tenantSlug, "employees", "read");
  const [employees, teams, locations, memberships] = await Promise.all([
    employeesAccess
      ? prisma.tenantEmployee.findMany({
          where: { ...(await scopedEmployeeWhere(employeesAccess)), status: { not: "former" } },
          select: { id: true, key: true, name: true, initials: true },
          orderBy: { name: "asc" },
        })
      : [],
    prisma.tenantTeam.findMany({ where: { tenantId: access.tenantId }, select: { id: true, key: true, name: true }, orderBy: { name: "asc" } }),
    prisma.tenantLocation.findMany({ where: { tenantId: access.tenantId }, select: { id: true, key: true, name: true }, orderBy: { name: "asc" } }),
    prisma.tenantMembership.findMany({
      where: { tenantId: access.tenantId },
      select: { userId: true, user: { select: { name: true, email: true } } },
    }),
  ]);

  return {
    subjects: [
      ...employees.map((item): ReminderOption => ({ ...item, type: "employee" })),
      ...teams.map((item): ReminderOption => ({ ...item, type: "team" })),
      ...locations.map((item): ReminderOption => ({ ...item, type: "location" })),
    ],
    teams: teams.map(({ id, name }) => ({ id, name })),
    assignees: memberships
      .map((membership): ReminderAssignee => ({ userId: membership.userId, name: membership.user.name || membership.user.email }))
      .sort((a, b) => a.name.localeCompare(b.name, "de")),
    currentUserId: access.userId,
  };
}

// ---------------------------------------------------------------------------
// Fristen-Vorschläge
// ---------------------------------------------------------------------------

export type ReminderSuggestionKind = "probation" | "fixedTerm" | "eau" | "vacation";

export type ReminderSuggestion = {
  key: string;
  kind: ReminderSuggestionKind;
  title: string;
  detail: string;
  priority: ReminderPriority;
  dueDate: string;
  category: string;
  subjectType: ReminderSubjectType;
  subjectId: string;
};

const deDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const later = (a: string, b: string) => (a > b ? a : b);

export async function getReminderSuggestions(tenantSlug: string): Promise<ReminderSuggestion[]> {
  const access = await requireTenantAccess(tenantSlug, "reminders", "write");
  const { timeZone } = await loadTenantContext(access.tenantId);
  const today = localDateKey(new Date(), timeZone);
  const suggestions: ReminderSuggestion[] = [];

  const employeesAccess = await getOptionalTenantAccess(tenantSlug, "employees", "read");

  if (employeesAccess) {
    const employees = await prisma.tenantEmployee.findMany({
      where: { ...(await scopedEmployeeWhere(employeesAccess)), status: { not: "former" } },
      select: { id: true, name: true, startDate: true, endDate: true, contractDetails: { select: { probation: true } } },
    });

    for (const employee of employees) {
      for (const deadline of upcomingStaffDeadlines(
        { startDate: employee.startDate, fixedTermEnd: employee.endDate, probation: employee.contractDetails?.probation ?? "" },
        today,
        120,
      )) {
        if (deadline.kind === "probationEnd") {
          suggestions.push({
            key: `probation:${employee.id}:${deadline.date}`,
            kind: "probation",
            title: "Probezeitgespräch führen",
            detail: `Probezeit von ${employee.name} endet am ${deDate(deadline.date)}`,
            priority: "important",
            dueDate: later(addDaysIso(deadline.date, -14), today),
            category: "Personal",
            subjectType: "employee",
            subjectId: employee.id,
          });
        } else if (deadline.kind === "fixedTermEnd" && deadline.date <= addDaysIso(today, 90)) {
          suggestions.push({
            key: `fixedterm:${employee.id}:${deadline.date}`,
            kind: "fixedTerm",
            title: "Befristung – Verlängerung entscheiden",
            detail: `Befristung von ${employee.name} endet am ${deDate(deadline.date)}`,
            priority: "important",
            dueDate: later(addDaysIso(deadline.date, -30), today),
            category: "Vertrag",
            subjectType: "employee",
            subjectId: employee.id,
          });
        }
      }
    }
  }

  const sicknessAccess = await getOptionalTenantAccess(tenantSlug, "sickness", "read");

  if (sicknessAccess) {
    const reports = await prisma.tenantSicknessReport.findMany({
      where: {
        tenantId: access.tenantId,
        employee: await scopedEmployeeWhere(sicknessAccess),
        certificateStatus: "pending",
        status: "open",
        startDate: { lte: new Date(`${addDaysIso(today, -3)}T23:59:59.999Z`) },
      },
      select: { id: true, startDate: true, employee: { select: { id: true, name: true } } },
      take: 20,
    });

    for (const report of reports) {
      suggestions.push({
        key: `eau:${report.id}`,
        kind: "eau",
        title: "eAU nachfassen",
        detail: `Die eAU von ${report.employee.name} liegt seit ${deDate(report.startDate.toISOString().slice(0, 10))} noch nicht vor`,
        priority: "urgent",
        dueDate: addDaysIso(today, 1),
        category: "Gesundheit",
        subjectType: "employee",
        subjectId: report.employee.id,
      });
    }
  }

  const vacation = await getVacationAccountAnalytics(tenantSlug).catch(() => null);

  for (const account of vacation?.accounts ?? []) {
    if (account.requested === 0 && account.remaining >= 20) {
      suggestions.push({
        key: `vacation:${account.id}:${vacation!.year}`,
        kind: "vacation",
        title: "Urlaubsplanung anstoßen",
        detail: `${account.name} hat noch ${account.remaining} Urlaubstage ungeplant`,
        priority: "normal",
        dueDate: addDaysIso(today, 21),
        category: "Urlaub",
        subjectType: "employee",
        subjectId: account.id,
      });
    }
  }

  if (suggestions.length === 0) return [];

  const keys = suggestions.map((suggestion) => suggestion.key);
  const [dismissed, taken] = await Promise.all([
    prisma.tenantReminderSuggestionDismissal.findMany({ where: { tenantId: access.tenantId, key: { in: keys } }, select: { key: true } }),
    prisma.tenantReminder.findMany({ where: { tenantId: access.tenantId, suggestionKey: { in: keys } }, select: { suggestionKey: true } }),
  ]);
  const hidden = new Set([...dismissed.map((item) => item.key), ...taken.map((item) => item.suggestionKey)]);
  const rank = { urgent: 0, important: 1, normal: 2 } as const;

  return suggestions
    .filter((suggestion) => !hidden.has(suggestion.key))
    .sort((a, b) => rank[a.priority] - rank[b.priority] || a.dueDate.localeCompare(b.dueDate));
}

/** Übernimmt einen Vorschlag — der Server rechnet ihn neu, der Client liefert nur den Schlüssel. */
export async function acceptReminderSuggestion(input: { tenantSlug: string; key: string }) {
  const suggestion = (await getReminderSuggestions(input.tenantSlug)).find((item) => item.key === input.key);

  if (!suggestion) {
    throw new Error("Vorschlag nicht mehr verfügbar.");
  }

  return createTenantReminder({
    tenantSlug: input.tenantSlug,
    title: suggestion.title,
    dueDate: suggestion.dueDate,
    priority: suggestion.priority,
    category: suggestion.category,
    notes: suggestion.detail,
    subjectType: suggestion.subjectType,
    subjectId: suggestion.subjectId,
    suggestionKey: suggestion.key,
  });
}

export async function dismissReminderSuggestion(input: { tenantSlug: string; key: string }) {
  const access = await requireTenantAccess(input.tenantSlug, "reminders", "write");
  const key = input.key.trim().slice(0, 200);

  if (!key) {
    throw new Error("Vorschlag nicht mehr verfügbar.");
  }

  await prisma.tenantReminderSuggestionDismissal.upsert({
    where: { tenantId_key: { tenantId: access.tenantId, key } },
    create: { tenantId: access.tenantId, key },
    update: {},
  });
}

// ---------------------------------------------------------------------------
// Verschieben
// ---------------------------------------------------------------------------

/** Neue Fälligkeit setzen — mit denselben Rechten und Scope-Prüfungen wie das Bearbeiten. */
export async function rescheduleTenantReminder(input: { tenantSlug: string; reminderId: string; dueDate: string }) {
  const access = await requireTenantAccess(input.tenantSlug, "reminders", "write");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
    throw new Error("Titel und Fälligkeit sind erforderlich.");
  }

  const reminder = await prisma.tenantReminder.findFirst({
    where: { id: input.reminderId, tenantId: access.tenantId },
    select: { title: true, priority: true, subject: true, category: true, notes: true, linkedFilesJson: true, dueDate: true },
  });

  if (!reminder) {
    throw new Error("Erinnerung nicht gefunden.");
  }

  await updateTenantReminder({
    tenantSlug: input.tenantSlug,
    reminderId: input.reminderId,
    title: reminder.title,
    dueDate: input.dueDate,
    priority: reminder.priority,
    subject: reminder.subject,
    category: reminder.category,
    notes: reminder.notes,
    linkedFiles: Array.isArray(reminder.linkedFilesJson) ? reminder.linkedFilesJson.filter((item): item is string => typeof item === "string") : [],
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Erinnerung verschoben",
    source: "Erinnerungen",
    entityType: "reminder",
    entityId: input.reminderId,
    detail: `${reminder.title}: ${deDate(reminder.dueDate)} → ${deDate(input.dueDate)}`,
  });
}
