import "server-only";
import { prisma } from "@/lib/prisma";
import { assertEmployeeInScope, requireTenantAccess } from "@/lib/tenant-access";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordTenantAudit } from "@/lib/audit";

export class InfoRequestReminderError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "InfoRequestReminderError";
  }
}

export async function remindEmployeeOfInfoRequest(tenant: string, requestId: string) {
  const access = await requireTenantAccess(tenant, "employees", "write");
  if (access.scope === "own") throw new Error("FORBIDDEN");
  const request = await prisma.tenantEmployeeInfoRequest.findFirst({
    where: { id: requestId, tenantId: access.tenantId },
    include: { employee: { select: { id: true, name: true, user: { select: { id: true, email: true } } } }, tenant: { select: { name: true } } },
  });
  if (!request) throw new Error("Info-Anfrage nicht gefunden.");
  await assertEmployeeInScope(access, request.employee.id);
  if (request.status !== "open") throw new InfoRequestReminderError("Nur an offene Info-Anfragen kann erinnert werden.", 409);
  const recipient = request.employee.user;
  if (!recipient) throw new InfoRequestReminderError("Für diesen Mitarbeiter ist noch kein Konto verknüpft. Bitte laden Sie ihn zuerst ein oder verknüpfen Sie seine Personalakte.", 409);

  // Ein gemeinsames Fenster je Anfrage, unabhängig von Web/App und sendendem Manager.
  const limit = await checkRateLimit({ key: `info-request-reminder:${access.tenantId}:${request.id}`, limit: 1, windowSeconds: 60 });
  if (!limit.allowed) throw new InfoRequestReminderError("Für diese Info-Anfrage wurde gerade eine Erinnerung angefordert. Bitte warten Sie eine Minute.", 429, limit.retryAfterSeconds);
  const channels = await dispatchNotification({
    userId: recipient.id, email: recipient.email, tenantId: access.tenantId, category: "system",
    entityType: "info-request", entityId: request.id,
    message: { key: "infoRequestReminder", tenantName: request.tenant.name, title: request.title, dueAt: request.dueAt },
  });
  if (channels.length === 0) throw new InfoRequestReminderError("Die Erinnerung konnte über keinen aktivierten Benachrichtigungskanal versendet werden. Bitte prüfen Sie die Benachrichtigungseinstellungen.", 503);
  const sentAt = new Date().toISOString();
  await recordTenantAudit({
    tenantId: access.tenantId, actorId: access.userId, actorName: access.userName,
    action: "An offene Info-Anfrage erinnert", source: "Mitarbeiter", entityType: "employee", entityId: request.employee.id,
    detail: `${request.employee.name}: ${request.title}`,
  });
  return { sentAt, channels };
}
