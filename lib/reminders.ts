import { auth } from "@/lib/auth";
import { recordTenantAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { requireTenantAccess, resolveScopeFilter, type TenantAccess } from "@/lib/tenant-access";

// Re-Export für bestehende Server-seitige Importe (`@/lib/reminders`) —
// siehe lib/reminders-shared.ts für den Grund der Aufteilung.
export {
  getReminderPriorityConfig,
  type Reminder,
  type ReminderMetric,
  type ReminderPriority,
} from "@/lib/reminders-shared";
import type { Reminder, ReminderMetric, ReminderPriority } from "@/lib/reminders-shared";

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
    return { tenantId: access.tenantId, teamId: { in: scopeFilter.teamIds } };
  }

  return { tenantId: access.tenantId };
}

/**
 * Wie `assertEmployeeInScope`, aber für den own/team-Scope von Erinnerungen:
 * "own" erlaubt nur selbst erstellte Erinnerungen, "team" nur die am eigenen
 * Team hängenden (siehe `reminderScopeWhere`). `updateTenantReminder` und
 * `completeTenantReminder` prüften bisher nur den tenantweiten Level
 * ("reminders:write"/`canDelete`), nicht das Zielobjekt (Audit-Finding H05).
 */
async function assertReminderInScope(
  access: { tenantId: string; userId: string; tenantAccess: TenantAccess },
  reminderId: string,
) {
  const scopeFilter = await resolveScopeFilter(access.tenantAccess);

  if (scopeFilter.type === "all") return;

  const reminder = await prisma.tenantReminder.findFirst({
    where: { id: reminderId, tenantId: access.tenantId },
    select: { createdById: true, teamId: true },
  });

  if (!reminder) {
    throw new Error("FORBIDDEN");
  }

  if (scopeFilter.type === "own" && reminder.createdById === access.userId) {
    return;
  }

  if (
    scopeFilter.type === "team" &&
    reminder.teamId &&
    scopeFilter.teamIds.includes(reminder.teamId)
  ) {
    return;
  }

  throw new Error("FORBIDDEN");
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

/**
 * Liefert offene UND erledigte Erinnerungen (QA-Bug BUG-013 — bisher wurde
 * hart auf `status: "open"` gefiltert, wodurch "Erledigt"-Zähler/-Metriken
 * immer 0 blieben und erledigte Erinnerungen nirgends mehr auffindbar waren,
 * auch nicht über ein Archiv). Offene zuerst (nach Fälligkeit), danach
 * erledigte (zuletzt erledigt zuerst) — der Seiten-Client filtert die
 * Standardanzeige weiterhin auf "offen", "Erledigt" ist ein expliziter Filter.
 */
export async function getRemindersForTenant(tenantSlug: string) {
  const access = await requireTenantReminderAccess(tenantSlug);
  const where = await reminderScopeWhere(access);
  const [openRecords, doneRecords] = await Promise.all([
    prisma.tenantReminder.findMany({
      where: { ...where, status: "open" },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      include: { team: { select: { id: true, name: true } } },
    }),
    prisma.tenantReminder.findMany({
      where: { ...where, status: "done" },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      include: { team: { select: { id: true, name: true } } },
    }),
  ]);

  return [...openRecords, ...doneRecords].map(toReminder);
}

export function buildReminderMetrics(
  reminders: Reminder[],
  t: (key: string) => string,
): ReminderMetric[] {
  // `reminders` enthält seit BUG-013 auch erledigte Einträge — für "offen"/
  // "dringend"/"nächste Frist" zählen weiterhin nur die offenen; eine
  // erledigte, überfällig gewesene Erinnerung ist nicht mehr "dringend".
  const open = reminders.filter((reminder) => reminder.status !== "done");
  const urgent = open.filter((reminder) => reminder.daysLeft <= 7);
  const expired = open.filter((reminder) => reminder.daysLeft < 0);
  const done = reminders.filter((reminder) => reminder.status === "done");
  const next = open[0];
  const nextIsExpired = Boolean(next && next.daysLeft < 0);

  return [
    {
      label: t("metricOpenTotalLabel"),
      value: open.length.toString(),
      caption: t("metricOpenTotalCaption"),
    },
    {
      label: t("priorityUrgent"),
      value: urgent.length.toString(),
      caption: t("metricUrgentCaption"),
      tone: urgent.length > 0 ? "danger" : undefined,
    },
    {
      label: t("expiredBadge"),
      value: expired.length.toString(),
      caption: t("metricExpiredCaption"),
      tone: expired.length > 0 ? "danger" : undefined,
    },
    {
      label: t("metricDoneLabel"),
      value: done.length.toString(),
      caption: t("metricDoneCaption"),
      tone: "success",
    },
    {
      label: t("metricNextDeadlineLabel"),
      value: next ? String(nextIsExpired ? Math.abs(next.daysLeft) : next.daysLeft) : "-",
      caption: next
        ? `${nextIsExpired ? t("metricNextDeadlineCaptionOverdue") : t("daysUnit")} · ${next.title}`
        : t("metricNextDeadlineCaptionEmpty"),
      tone: next && next.daysLeft <= 7 ? "danger" : undefined,
    },
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

/**
 * Erinnerung, angelegt durch einen Hintergrundjob (cron/cleanup), nicht
 * durch einen eingeloggten Nutzer — deshalb ohne
 * `requireTenantAccess`/Berechtigungsprüfung, analog zu den übrigen
 * direkten Prisma-Schreibzugriffen im Cron-Job. Idempotent über den exakten
 * Titel: ein zweiter Lauf für dieselbe Fälligkeit legt keine zweite
 * Erinnerung an.
 */
export async function createSystemTenantReminder(input: {
  tenantId: string;
  title: string;
  dueDate: string;
  priority?: string;
  subject?: string;
  category?: string;
  notes?: string;
}) {
  const existing = await prisma.tenantReminder.findFirst({
    where: { tenantId: input.tenantId, title: input.title },
    select: { id: true },
  });

  if (existing) {
    return { reminder: existing, created: false as const };
  }

  const key = await createUniqueReminderKey({ tenantId: input.tenantId, title: input.title });

  const reminder = await prisma.tenantReminder.create({
    data: {
      tenantId: input.tenantId,
      key,
      title: input.title,
      dueDate: input.dueDate,
      priority: normalizePriority(input.priority),
      subject: input.subject?.trim() ?? "",
      category: input.category?.trim() || "Löschkonzept",
      notes: input.notes?.trim() ?? "",
      linkedFilesJson: [],
      createdById: "system",
      createdByName: "System (Löschkonzept)",
    },
  });

  return { reminder, created: true as const };
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

  await assertReminderInScope(access, input.reminderId);

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

  await assertReminderInScope(
    { tenantId: access.tenantId, userId: access.userId, tenantAccess: access },
    input.reminderId,
  );

  const reminder = await prisma.tenantReminder.findFirst({
    where: { id: input.reminderId, tenantId: access.tenantId },
    select: { id: true, title: true },
  });

  const result = await prisma.tenantReminder.updateMany({
    where: { id: input.reminderId, tenantId: access.tenantId },
    data: {
      status: "done",
      completedAt: new Date(),
    },
  });

  if (reminder) {
    await recordTenantAudit({
      tenantId: access.tenantId,
      actorId: access.userId,
      actorName: access.userName,
      action: "Erinnerung erledigt",
      source: "Erinnerungen",
      entityType: "reminder",
      entityId: reminder.id,
      detail: reminder.title,
    });
  }

  return result;
}

/**
 * Löscht eine Erinnerung endgültig (QA-Bug BUG-013 — bisher gab es dafür gar
 * keine Funktion, das Bearbeiten-Drawer bot nur "Abbrechen"/"Speichern" an).
 * Gleiche Berechtigungslogik wie `completeTenantReminder`.
 */
export async function deleteTenantReminder(input: {
  tenantSlug: string;
  reminderId: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "reminders", "read");

  if (!access.canDelete) {
    throw new Error("FORBIDDEN");
  }

  await assertReminderInScope(
    { tenantId: access.tenantId, userId: access.userId, tenantAccess: access },
    input.reminderId,
  );

  const reminder = await prisma.tenantReminder.findFirst({
    where: { id: input.reminderId, tenantId: access.tenantId },
    select: { id: true, title: true },
  });

  if (!reminder) {
    throw new Error("Erinnerung nicht gefunden.");
  }

  await prisma.tenantReminder.delete({ where: { id: reminder.id } });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Erinnerung gelöscht",
    source: "Erinnerungen",
    entityType: "reminder",
    entityId: reminder.id,
    detail: reminder.title,
  });
}
