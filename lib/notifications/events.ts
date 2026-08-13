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
      }),
    ),
  );
}
