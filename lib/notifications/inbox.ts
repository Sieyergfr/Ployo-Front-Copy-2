import "server-only";
import { prisma } from "@/lib/prisma";
import {
  renderNotification,
  toNotificationLocale,
  type NotificationMessage,
} from "@/lib/notifications/messages";
import { requireTenantMembership } from "@/lib/tenant-access";

export type MyNotification = {
  id: string;
  category: string;
  title: string;
  detail: string;
  read: boolean;
  createdAt: string;
  entityType: string;
  entityId: string;
};

/** Persistierter In-App-Posteingang des eingeloggten Nutzers (Mitarbeiter-App). */
export async function getMyNotifications(
  tenantSlug: string,
  options?: { unreadOnly?: boolean; limit?: number },
): Promise<MyNotification[]> {
  const access = await requireTenantMembership(tenantSlug);

  const [rows, preference] = await Promise.all([
    prisma.tenantEmployeeNotification.findMany({
      where: {
        tenantId: access.tenantId,
        userId: access.userId,
        ...(options?.unreadOnly ? { read: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(options?.limit ?? 50, 100),
    }),
    prisma.userPreference.findUnique({
      where: { userId: access.userId },
      select: { language: true },
    }),
  ]);

  // Beim Lesen rendern, nicht beim Versand: title/detail in der Zeile stehen
  // in der Sprache, die zum Zeitpunkt des Versands eingestellt war. Wer
  // später umstellt, soll auch den bestehenden Posteingang in der neuen
  // Sprache sehen. Zeilen ohne Payload (von vor dieser Änderung) behalten
  // ihren gespeicherten Text.
  const locale = toNotificationLocale(preference?.language);

  return rows.map((row) => {
    const rendered = renderStoredMessage(row.messagePayload, locale);

    return {
      id: row.id,
      category: row.category,
      title: rendered?.subject ?? row.title,
      detail: rendered?.text ?? row.detail,
      read: row.read,
      createdAt: row.createdAt.toISOString(),
      entityType: row.entityType,
      entityId: row.entityId,
    };
  });
}

/**
 * Ein fehlerhaftes Payload darf keine Zeile aus dem Posteingang kippen —
 * im Zweifel bleibt der gespeicherte Text stehen.
 */
function renderStoredMessage(payload: unknown, locale: ReturnType<typeof toNotificationLocale>) {
  if (!payload || typeof payload !== "object" || !("key" in payload)) {
    return null;
  }

  try {
    return renderNotification(payload as NotificationMessage, locale, { compact: true });
  } catch {
    return null;
  }
}

export async function markMyNotificationRead(tenantSlug: string, notificationId: string) {
  const access = await requireTenantMembership(tenantSlug);

  const result = await prisma.tenantEmployeeNotification.updateMany({
    where: { id: notificationId, tenantId: access.tenantId, userId: access.userId },
    data: { read: true, readAt: new Date() },
  });

  if (result.count === 0) {
    throw new Error("Benachrichtigung nicht gefunden.");
  }
}

export async function markAllMyNotificationsRead(tenantSlug: string) {
  const access = await requireTenantMembership(tenantSlug);

  await prisma.tenantEmployeeNotification.updateMany({
    where: { tenantId: access.tenantId, userId: access.userId, read: false },
    data: { read: true, readAt: new Date() },
  });
}
