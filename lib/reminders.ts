import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { requireTenantAccess, resolveScopeFilter, type TenantAccess } from "@/lib/tenant-access";

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

export const reminderPriorityConfig = {
  urgent: {
    label: "Dringend",
    daysClassName: "text-danger",
    badgeClassName: "bg-danger/10 text-danger font-semibold",
    rowClassName: "border-danger/25",
  },
  important: {
    label: "Wichtig",
    daysClassName: "text-[#7A4E00]",
    badgeClassName: "bg-warning/10 text-[#7A4E00] font-semibold",
    rowClassName: "border-border",
  },
  normal: {
    label: "Normal",
    daysClassName: "text-muted-2",
    badgeClassName: "bg-border-soft text-muted",
    rowClassName: "border-border",
  },
} satisfies Record<
  ReminderPriority,
  {
    label: string;
    daysClassName: string;
    badgeClassName: string;
    rowClassName: string;
  }
>;

function normalizeLinkedFiles(value?: string[]) {
  return Array.from(
    new Set((value ?? []).map((fileId) => fileId.trim()).filter(Boolean)),
  );
}

function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizePriority(value?: string): ReminderPriority {
  return value === "urgent" || value === "important" ? value : "normal";
}

function normalizeStatus(value?: string): "open" | "done" {
  return value === "done" ? "done" : "open";
}

function normalizeReminderKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function todayStart() {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function daysUntil(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);

  if (!year || !month || !day) {
    return 0;
  }

  const due = new Date(year, month - 1, day);
  const diff = due.getTime() - todayStart().getTime();

  return Math.ceil(diff / 86_400_000);
}

function toReminder(record: {
  id: string;
  key: string;
  title: string;
  subject: string;
  category: string;
  dueDate: string;
  priority: string;
  status: string;
  notes: string;
  linkedFilesJson: unknown;
  createdByName: string;
  team?: { id: string; name: string } | null;
}): Reminder {
  return {
    id: record.id,
    daysLeft: daysUntil(record.dueDate),
    title: record.title,
    subject: record.subject,
    category: record.category,
    priority: normalizePriority(record.priority),
    dueDate: record.dueDate,
    status: normalizeStatus(record.status),
    notes: record.notes,
    linkedFiles: parseStringArray(record.linkedFilesJson),
    createdByName: record.createdByName,
    teamId: record.team?.id ?? null,
    teamName: record.team?.name ?? null,
  };
}

async function requireTenantReminderAccess(tenantSlug: string) {
  const tenantAccess = await requireTenantAccess(tenantSlug, "reminders", "read");
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId: session.user.id,
      tenant: { slug: tenantSlug },
    },
    include: {
      tenant: { select: { id: true, slug: true } },
      roleRef: { include: { permissions: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  const role = membership.role;
  const permission = membership.roleRef?.permissions.find(
    (item) => item.area === "reminders",
  );
  const canWrite =
    ["OWNER", "ADMIN", "HR"].includes(role) ||
    permission?.level === "write" ||
    permission?.level === "admin";

  return {
    tenantId: membership.tenant.id,
    tenantSlug: membership.tenant.slug,
    userId: membership.user.id,
    userName: membership.user.name || membership.user.email,
    canWrite,
    tenantAccess,
  };
}

/**
 * Übersetzt den "reminders"-Scope (own/team/all) in einen zusätzlichen
 * `where`-Filter. "own" zeigt nur selbst erstellte Erinnerungen, "team" nur
 * die, die am eigenen Team hängen (TenantReminder.teamId, über die
 * Team-Detailseite oder beim Anlegen gesetzt) — nicht zu verwechseln mit
 * "von jemandem aus meinem Team erstellt". "all" zeigt alles (bisheriges
 * Verhalten).
 */
async function reminderScopeWhere(access: {
  tenantId: string;
  userId: string;
  tenantAccess: TenantAccess;
}) {
  const scopeFilter = await resolveScopeFilter(access.tenantAccess);

  if (scopeFilter.type === "own") {
    return { tenantId: access.tenantId, createdById: access.userId };
  }

  if (scopeFilter.type === "team") {
    if (!scopeFilter.team) {
      return { tenantId: access.tenantId, id: "__none__" };
    }

    return { tenantId: access.tenantId, team: { name: scopeFilter.team } };
  }

  return { tenantId: access.tenantId };
}

async function createUniqueReminderKey(input: {
  tenantId: string;
  title: string;
  excludeReminderId?: string;
}) {
  const keyBase = normalizeReminderKey(input.title) || "erinnerung";
  let key = keyBase;
  let suffix = 2;

  while (
    await prisma.tenantReminder.findFirst({
      where: {
        tenantId: input.tenantId,
        key,
        id: input.excludeReminderId ? { not: input.excludeReminderId } : undefined,
      },
      select: { id: true },
    })
  ) {
    key = `${keyBase}-${suffix}`;
    suffix += 1;
  }

  return key;
}

async function getAllowedLinkedFileIds(input: {
  tenantId: string;
  linkedFiles?: string[];
}) {
  const linkedFiles = normalizeLinkedFiles(input.linkedFiles);

  if (linkedFiles.length === 0) {
    return [];
  }

  const files = await prisma.tenantFile.findMany({
    where: {
      id: { in: linkedFiles },
      tenantId: input.tenantId,
      status: "active",
    },
    select: { id: true },
  });
  const allowedIds = new Set(files.map((file) => file.id));

  return linkedFiles.filter((fileId) => allowedIds.has(fileId));
}

export async function getRemindersForTenant(tenantSlug: string) {
  const access = await requireTenantReminderAccess(tenantSlug);
  const where = await reminderScopeWhere(access);
  const records = await prisma.tenantReminder.findMany({
    where: { ...where, status: "open" },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: { team: { select: { id: true, name: true } } },
  });

  return records.map(toReminder);
}

export function buildReminderMetrics(reminders: Reminder[]): ReminderMetric[] {
  const urgent = reminders.filter((reminder) => reminder.daysLeft <= 7);
  const expired = reminders.filter((reminder) => reminder.daysLeft < 0);
  const done = reminders.filter((reminder) => reminder.status === "done");
  const next = reminders[0];
  const nextIsExpired = Boolean(next && next.daysLeft < 0);

  return [
    {
      label: "Offen gesamt",
      value: reminders.length.toString(),
      caption: "aktive Erinnerungen",
    },
    {
      label: "Dringend",
      value: urgent.length.toString(),
      caption: "< 7 Tage fällig",
      tone: urgent.length > 0 ? "danger" : undefined,
    },
    {
      label: "Abgelaufen",
      value: expired.length.toString(),
      caption: "überfällige Fristen",
      tone: expired.length > 0 ? "danger" : undefined,
    },
    {
      label: "Erledigt",
      value: done.length.toString(),
      caption: "archiviert",
      tone: "success",
    },
    {
      label: "N\u00e4chste Frist",
      value: next ? String(nextIsExpired ? Math.abs(next.daysLeft) : next.daysLeft) : "-",
      caption: next
        ? `${nextIsExpired ? "Tage \u00fcberf\u00e4llig" : "Tage"} \u00b7 ${next.title}`
        : "keine offene Frist",
      tone: next && next.daysLeft <= 7 ? "danger" : undefined,
    },
  ];
}

export function buildReminderFilters(reminders: Reminder[]) {
  const urgentCount = reminders.filter((reminder) => reminder.daysLeft <= 7).length;
  const expiredCount = reminders.filter((reminder) => reminder.daysLeft < 0).length;
  const categories = Array.from(
    new Set(reminders.map((reminder) => reminder.category).filter(Boolean)),
  );

  return [
    `Alle (${reminders.length})`,
    `Abgelaufen (${expiredCount})`,
    `Dringend (${urgentCount})`,
    ...categories.map(
      (category) =>
        `${category} (${reminders.filter((reminder) => reminder.category === category).length})`,
    ),
  ];
}

/**
 * `TenantReminder.teamId` verweist auf ein echtes Team — ohne diese Prüfung
 * könnte ein direkter Server-Action-Aufruf eine beliebige ID setzen.
 * Bewusst scope-frei (kein `requireTenantAccess` auf "teams"), damit ein
 * Nutzer mit `reminders:write`, aber ohne Leserecht auf Teams, weiterhin
 * Erinnerungen anlegen kann — nur zur Validierung, nicht für die Anzeige.
 */
async function assertKnownTeam(tenantId: string, teamId?: string) {
  if (!teamId) {
    return;
  }

  const team = await prisma.tenantTeam.findFirst({
    where: { id: teamId, tenantId },
    select: { id: true },
  });

  if (!team) {
    throw new Error("Unbekanntes Team.");
  }
}

export async function createTenantReminder(input: {
  tenantSlug: string;
  title: string;
  dueDate: string;
  priority?: string;
  subject?: string;
  category?: string;
  notes?: string;
  linkedFiles?: string[];
  teamId?: string;
}) {
  await requireTenantAccess(input.tenantSlug, "reminders", "write");
  const access = await requireTenantReminderAccess(input.tenantSlug);

  if (!access.canWrite) {
    throw new Error("FORBIDDEN");
  }

  const title = input.title.trim();
  const dueDate = input.dueDate.trim();

  if (!title || !dueDate) {
    throw new Error("Titel und Fälligkeit sind erforderlich.");
  }

  await assertKnownTeam(access.tenantId, input.teamId);

  const key = await createUniqueReminderKey({
    tenantId: access.tenantId,
    title,
  });
  const linkedFiles = await getAllowedLinkedFileIds({
    tenantId: access.tenantId,
    linkedFiles: input.linkedFiles,
  });

  return prisma.tenantReminder.create({
    data: {
      tenantId: access.tenantId,
      key,
      title,
      dueDate,
      priority: normalizePriority(input.priority),
      subject: input.subject?.trim() ?? "",
      category: input.category?.trim() || "Allgemein",
      notes: input.notes?.trim() ?? "",
      linkedFilesJson: linkedFiles,
      createdById: access.userId,
      createdByName: access.userName,
      teamId: input.teamId?.trim() || undefined,
    },
  });
}

export async function updateTenantReminder(input: {
  tenantSlug: string;
  reminderId: string;
  title: string;
  dueDate: string;
  priority?: string;
  subject?: string;
  category?: string;
  notes?: string;
  linkedFiles?: string[];
}) {
  await requireTenantAccess(input.tenantSlug, "reminders", "write");
  const access = await requireTenantReminderAccess(input.tenantSlug);

  if (!access.canWrite) {
    throw new Error("FORBIDDEN");
  }

  const current = await prisma.tenantReminder.findFirst({
    where: { id: input.reminderId, tenantId: access.tenantId },
    select: { id: true },
  });

  if (!current) {
    throw new Error("Erinnerung nicht gefunden.");
  }

  const title = input.title.trim();
  const dueDate = input.dueDate.trim();

  if (!title || !dueDate) {
    throw new Error("Titel und Fälligkeit sind erforderlich.");
  }

  const key = await createUniqueReminderKey({
    tenantId: access.tenantId,
    title,
    excludeReminderId: input.reminderId,
  });
  const linkedFiles = await getAllowedLinkedFileIds({
    tenantId: access.tenantId,
    linkedFiles: input.linkedFiles,
  });

  return prisma.tenantReminder.update({
    where: { id: input.reminderId },
    data: {
      key,
      title,
      dueDate,
      priority: normalizePriority(input.priority),
      subject: input.subject?.trim() ?? "",
      category: input.category?.trim() || "Allgemein",
      notes: input.notes?.trim() ?? "",
      linkedFilesJson: linkedFiles,
    },
  });
}

export async function completeTenantReminder(input: {
  tenantSlug: string;
  reminderId: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "reminders", "read");

  if (!access.canDelete) {
    throw new Error("FORBIDDEN");
  }

  return prisma.tenantReminder.updateMany({
    where: { id: input.reminderId, tenantId: access.tenantId },
    data: {
      status: "done",
      completedAt: new Date(),
    },
  });
}
