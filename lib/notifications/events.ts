import "server-only";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications/dispatch";

async function getTenantNotificationFlags(tenantId: string) {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { mailNotifications: true, absenceAlerts: true },
  });

  return {
    mailNotifications: settings?.mailNotifications ?? true,
    absenceAlerts: settings?.absenceAlerts ?? true,
  };
}

async function getTenantManagers(tenantId: string) {
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId, role: { in: ["OWNER", "ADMIN", "HR"] } },
    select: { userId: true, user: { select: { email: true } } },
  });

  return memberships;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  return year && month && day ? `${day}.${month}.${year}` : value;
}

/** Benachrichtigt einen Mitarbeiter, sobald über seinen Urlaubsantrag entschieden wurde. */
export async function notifyVacationRequestDecided(input: {
  tenantId: string;
  tenantName: string;
  employeeId: string;
  status: "approved" | "rejected";
  startDate: string;
  endDate: string;
}) {
  const flags = await getTenantNotificationFlags(input.tenantId);

  if (!flags.mailNotifications || !flags.absenceAlerts) {
    return;
  }

  const employee = await prisma.tenantEmployee.findUnique({
    where: { id: input.employeeId },
    select: { userId: true },
  });

  if (!employee?.userId) {
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: employee.userId },
    select: { email: true },
  });

  const range = `${formatDate(input.startDate)} – ${formatDate(input.endDate)}`;
  const decision = input.status === "approved" ? "genehmigt" : "abgelehnt";

  await dispatchNotification({
    userId: employee.userId,
    email: user?.email ?? null,
    subject: `Urlaubsantrag ${decision}`,
    text: `Ihr Urlaubsantrag für ${range} bei ${input.tenantName} wurde ${decision}.`,
    html: `<p style="font-size:14px;">Ihr Urlaubsantrag für <strong>${range}</strong> bei ${input.tenantName} wurde <strong>${decision}</strong>.</p>`,
    tenantId: input.tenantId,
    category: "vacation",
  });
}

/**
 * Benachrichtigt einen Mitarbeiter mit dem aktuellen Stand seiner Schichten
 * einer Woche — als einzige Sammel-Mail statt einer Einzel-Mail pro Schicht.
 * Wird sowohl beim erstmaligen Veröffentlichen einer Woche verwendet
 * (`publishShiftWeek`) als auch bei jeder weiteren Änderung an einer bereits
 * veröffentlichten Woche (`notifyEmployeeWeekOverview` in shift-service.ts).
 */
export async function notifyEmployeeOfShiftPlanPublished(input: {
  tenantId: string;
  tenantName: string;
  employeeId: string;
  weekLabel: string;
  weekRange: string;
  shifts: Array<{ date: string; startTime: string; endTime: string }>;
}) {
  const flags = await getTenantNotificationFlags(input.tenantId);

  if (!flags.mailNotifications) {
    return;
  }

  const employee = await prisma.tenantEmployee.findUnique({
    where: { id: input.employeeId },
    select: { userId: true },
  });

  if (!employee?.userId) {
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: employee.userId },
    select: { email: true },
  });

  const sorted = [...input.shifts].sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
  );
  const lines = sorted.map(
    (shift) => `${formatDate(shift.date)}, ${shift.startTime}–${shift.endTime}`,
  );
  const subject = `Schichtplan ${input.weekLabel} veröffentlicht`;
  const text = `Ihr Schichtplan für ${input.weekLabel} (${input.weekRange}) bei ${input.tenantName} wurde veröffentlicht:\n\n${lines.join("\n")}`;
  const html = `<p style="font-size:14px;">Ihr Schichtplan für <strong>${input.weekLabel}</strong> (${input.weekRange}) bei ${input.tenantName} wurde veröffentlicht:</p><ul style="font-size:14px;padding-left:18px;">${sorted
    .map((shift) => `<li>${formatDate(shift.date)}, ${shift.startTime}–${shift.endTime}</li>`)
    .join("")}</ul>`;

  await dispatchNotification({
    userId: employee.userId,
    email: user?.email ?? null,
    subject,
    text,
    html,
    tenantId: input.tenantId,
    category: "shift",
  });
}

/** Benachrichtigt die Mandanten-Manager (OWNER/ADMIN/HR) über einen neuen Self-Service-Urlaubsantrag. */
export async function notifyManagersOfNewVacationRequest(input: {
  tenantId: string;
  tenantName: string;
  employeeName: string;
  startDate: string;
  endDate: string;
}) {
  const flags = await getTenantNotificationFlags(input.tenantId);

  if (!flags.mailNotifications || !flags.absenceAlerts) {
    return;
  }

  const managers = await getTenantManagers(input.tenantId);
  const range = `${formatDate(input.startDate)} – ${formatDate(input.endDate)}`;

  await Promise.all(
    managers.map((manager) =>
      dispatchNotification({
        userId: manager.userId,
        email: manager.user.email,
        subject: `Neuer Urlaubsantrag von ${input.employeeName}`,
        text: `${input.employeeName} hat Urlaub für ${range} bei ${input.tenantName} beantragt.`,
        html: `<p style="font-size:14px;">${input.employeeName} hat Urlaub für <strong>${range}</strong> bei ${input.tenantName} beantragt.</p>`,
        tenantId: input.tenantId,
        // "system": Handlungsaufforderung an Manager, keine persönliche
        // Statusmeldung — nicht über notifyVacationEvents abbestellbar.
        category: "system",
      }),
    ),
  );
}

/** Benachrichtigt die Mandanten-Manager über eine neue Self-Service-Krankmeldung. */
export async function notifyManagersOfNewSicknessReport(input: {
  tenantId: string;
  tenantName: string;
  employeeName: string;
  startDate: string;
}) {
  const flags = await getTenantNotificationFlags(input.tenantId);

  if (!flags.mailNotifications || !flags.absenceAlerts) {
    return;
  }

  const managers = await getTenantManagers(input.tenantId);
  const since = formatDate(input.startDate);

  await Promise.all(
    managers.map((manager) =>
      dispatchNotification({
        userId: manager.userId,
        email: manager.user.email,
        subject: `Krankmeldung von ${input.employeeName}`,
        text: `${input.employeeName} hat sich seit ${since} bei ${input.tenantName} krankgemeldet.`,
        html: `<p style="font-size:14px;">${input.employeeName} hat sich seit <strong>${since}</strong> bei ${input.tenantName} krankgemeldet.</p>`,
        tenantId: input.tenantId,
        category: "system",
      }),
    ),
  );
}

/**
 * Benachrichtigt einen Mitarbeiter über eine neue Info-Anfrage (HR/Admin
 * bittet um Angaben/eine Datei). "system"-Kategorie wie bei den
 * Manager-Benachrichtigungen: eine Handlungsaufforderung, kein persönlicher
 * Statuswechsel — nicht über notifyShiftEvents/notifyVacationEvents abbestellbar.
 */
export async function notifyEmployeeOfInfoRequest(input: {
  tenantId: string;
  tenantName: string;
  employeeId: string;
  requestId: string;
  title: string;
  dueAt: Date | null;
}) {
  const flags = await getTenantNotificationFlags(input.tenantId);

  if (!flags.mailNotifications) {
    return;
  }

  const employee = await prisma.tenantEmployee.findUnique({
    where: { id: input.employeeId },
    select: { userId: true },
  });

  if (!employee?.userId) {
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: employee.userId },
    select: { email: true },
  });

  const dueLine = input.dueAt
    ? ` Bitte bis ${new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Berlin",
      }).format(input.dueAt)} Uhr antworten.`
    : "";

  await dispatchNotification({
    userId: employee.userId,
    email: user?.email ?? null,
    subject: `Neue Info-Anfrage: ${input.title}`,
    text: `${input.tenantName} bittet Sie um Informationen: "${input.title}".${dueLine}`,
    html: `<p style="font-size:14px;">${input.tenantName} bittet Sie um Informationen: <strong>${input.title}</strong>.${dueLine}</p>`,
    tenantId: input.tenantId,
    category: "system",
    entityType: "info-request",
    entityId: input.requestId,
  });
}
