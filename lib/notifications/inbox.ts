import "server-only";
import { prisma } from "@/lib/prisma";
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

  const rows = await prisma.tenantEmployeeNotification.findMany({
    where: {
      tenantId: access.tenantId,
      userId: access.userId,
      ...(options?.unreadOnly ? { read: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(options?.limit ?? 50, 100),
  });

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    title: row.title,
    detail: row.detail,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
    entityType: row.entityType,
    entityId: row.entityId,
  }));
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
