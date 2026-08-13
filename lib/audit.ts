import { prisma } from "@/lib/prisma";
import { requireTenantAccess, type TenantPermissionArea } from "@/lib/tenant-access";

export type AuditLogEntry = {
  id: string;
  actor: string;
  action: string;
  source: string;
  timestamp: string;
  ipAddress?: string;
  detail?: string;
};

function formatTimestamp(value: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(value);
}

/**
 * Pro-Entity-Audit-Trail (Employee-/Standort-/Team-Detailseiten): geprüft
 * wird das `canViewAudit` des jeweiligen Fachbereichs (`area`), nicht mehr
 * ein einziges globales "audit"-Recht — vorher blockierte fehlender
 * globaler Audit-Zugriff sogar das Laden der ganzen Detailseite, weil hier
 * ungefangen geworfen wurde. Ohne `canViewAudit` liefert dies daher leer
 * statt zu werfen; die aufrufende Seite entscheidet anhand desselben Flags,
 * ob der Abschnitt überhaupt gerendert wird.
 */
export async function getAuditLogsForEntity(input: {
  tenantSlug: string;
  area: TenantPermissionArea;
  entityType: string;
  entityId: string;
  take?: number;
}): Promise<AuditLogEntry[]> {
  const access = await requireTenantAccess(input.tenantSlug, input.area, "read");

  if (!access.canViewAudit) {
    return [];
  }

  const records = await prisma.tenantAuditLog.findMany({
    where: {
      tenantId: access.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
    },
    orderBy: { createdAt: "desc" },
    take: input.take ?? 25,
  });

  return records.map((record) => ({
    id: record.id,
    actor: record.actorName,
    action: record.action,
    source: record.source,
    timestamp: formatTimestamp(record.createdAt),
    ipAddress: record.ipAddress || undefined,
    detail: record.detail || undefined,
  }));
}

export async function recordTenantAudit(input: {
  tenantId: string;
  actorId: string;
  actorName: string;
  action: string;
  source: string;
  entityType: string;
  entityId: string;
  detail?: string;
  ipAddress?: string;
}) {
  return prisma.tenantAuditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorName: input.actorName,
      action: input.action,
      source: input.source,
      entityType: input.entityType,
      entityId: input.entityId,
      detail: input.detail ?? "",
      ipAddress: input.ipAddress ?? "",
    },
  });
}
