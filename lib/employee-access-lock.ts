import "server-only";

import { recordTenantAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assertEmployeeInScope, requireTenantAccess } from "@/lib/tenant-access";

export const ACCESS_LOCK_ERRORS = {
  notFound: "Mitarbeiter wurde nicht gefunden.",
  self: "Den eigenen Zugang können Sie nicht sperren.",
  owner: "Der Zugang des Inhabers kann nicht gesperrt werden.",
} as const;

/**
 * App-Zugang sperren bzw. wieder freigeben (Migration M2). Gesperrt wird nur
 * das verknüpfte Konto für diesen Betrieb — die Personalakte bleibt
 * vollständig erhalten. Durchgesetzt wird die Sperre zentral in
 * lib/tenant-access.ts (jede Mandanten-Prüfung, Web und App).
 *
 * Hat das Konto keine weiteren Betriebe, werden zusätzlich seine Sitzungen
 * beendet, damit auch eine geöffnete App sofort abgemeldet ist.
 */
export async function setEmployeeAppAccessLock(input: {
  tenantSlug: string;
  employeeId: string;
  locked: boolean;
  reason?: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "employees", "write");
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, OR: [{ id: input.employeeId }, { key: input.employeeId }] },
    select: { id: true, name: true, userId: true },
  });

  if (!employee) {
    throw new Error(ACCESS_LOCK_ERRORS.notFound);
  }

  await assertEmployeeInScope(access, employee.id);

  if (input.locked && employee.userId) {
    if (employee.userId === access.userId) {
      throw new Error(ACCESS_LOCK_ERRORS.self);
    }

    const membership = await prisma.tenantMembership.findFirst({
      where: { tenantId: access.tenantId, userId: employee.userId },
      select: { role: true },
    });

    if (membership?.role === "OWNER") {
      throw new Error(ACCESS_LOCK_ERRORS.owner);
    }
  }

  const reason = (input.reason ?? "").trim().slice(0, 300);

  await prisma.tenantEmployee.update({
    where: { id: employee.id },
    data: input.locked
      ? { appAccessLockedAt: new Date(), appAccessLockReason: reason }
      : { appAccessLockedAt: null, appAccessLockReason: "" },
  });

  if (input.locked && employee.userId) {
    const otherMemberships = await prisma.tenantMembership.count({
      where: { userId: employee.userId, tenantId: { not: access.tenantId } },
    });

    if (otherMemberships === 0) {
      await prisma.session.deleteMany({ where: { userId: employee.userId } });
    }
  }

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: input.locked ? "App-Zugang gesperrt" : "App-Zugang freigegeben",
    source: "Mitarbeiter",
    entityType: "employee",
    entityId: employee.id,
    detail: `${employee.name}${reason ? ` · ${reason}` : ""}`,
  });
}
