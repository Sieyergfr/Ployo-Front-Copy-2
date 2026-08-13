import { prisma } from "@/lib/prisma";
import { purgeTenantFiles } from "@/lib/storage/delete";
import { logger, runWithRequestId } from "@/lib/logger";

export const runtime = "nodejs";

const SOFT_DELETE_GRACE_DAYS = 30;

/**
 * Aufräum-Job für Retention (DSGVO-Löschkonzept). Per externem Scheduler
 * (z. B. täglich) aufrufen: GET /api/cron/cleanup mit
 * Authorization: Bearer <CRON_SECRET>.
 *
 * - löscht abgelaufene Sessions und Verification-Einträge
 * - setzt die Audit-Log-Aufbewahrung je Mandant durch
 * - entfernt soft-gelöschte Dateien nach Ablauf der Karenzzeit endgültig
 *   (inkl. S3-Objekt)
 * - markiert abgelaufene Einladungen
 */
export async function GET(request: Request) {
  return runWithRequestId((requestId) => handleCleanup(request, requestId));
}

async function handleCleanup(request: Request, requestId: string) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    logger.error("CRON_SECRET ist nicht konfiguriert.");
    return Response.json(
      { error: "CRON_SECRET ist nicht konfiguriert." },
      { status: 503, headers: { "x-request-id": requestId } },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    logger.warn("Cron cleanup: nicht autorisierter Aufruf.");
    return Response.json(
      { error: "Nicht autorisiert." },
      { status: 401, headers: { "x-request-id": requestId } },
    );
  }

  logger.info("Cron cleanup gestartet.");
  const now = new Date();

  const [expiredSessions, expiredVerifications, staleRateLimits] =
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.appRateLimit.deleteMany({ where: { resetAt: { lt: now } } }),
    ]);

  const expiredInvitations = await prisma.tenantInvitation.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  let auditDeleted = 0;
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      settings: { select: { auditRetentionMonths: true } },
    },
  });

  for (const tenant of tenants) {
    const months = tenant.settings?.auditRetentionMonths ?? 24;
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - months);

    const result = await prisma.tenantAuditLog.deleteMany({
      where: { tenantId: tenant.id, createdAt: { lt: cutoff } },
    });
    auditDeleted += result.count;
  }

  const purgeCutoff = new Date(
    now.getTime() - SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );
  const filesToPurge = await prisma.tenantFile.findMany({
    where: { status: "deleted", deletedAt: { lt: purgeCutoff } },
    select: { id: true, bucket: true, storageKey: true },
    take: 200,
  });

  await purgeTenantFiles(filesToPurge);

  // Konten, deren 30-tägige Schutzfrist nach einer Selbst-Löschung
  // (siehe lib/account-service.ts) abgelaufen ist, endgültig löschen.
  const dueForDeletion = await prisma.user.findMany({
    where: { scheduledDeletionAt: { lte: now } },
    select: {
      id: true,
      memberships: {
        where: { role: "OWNER" },
        select: { tenantId: true, tenant: { select: { name: true } } },
      },
    },
  });

  let accountsDeleted = 0;
  const accountDeletionsSkipped: string[] = [];

  for (const user of dueForDeletion) {
    let orphansTenant = false;

    for (const ownership of user.memberships) {
      const otherOwners = await prisma.tenantMembership.count({
        where: { tenantId: ownership.tenantId, userId: { not: user.id }, role: "OWNER" },
      });

      if (otherOwners === 0) {
        orphansTenant = true;
        accountDeletionsSkipped.push(
          `${user.id} (alleinige/r Inhaber/in von "${ownership.tenant.name}")`,
        );
        break;
      }
    }

    if (orphansTenant) {
      continue;
    }

    await prisma.user.delete({ where: { id: user.id } });
    accountsDeleted += 1;
  }

  const deleted = {
    sessions: expiredSessions.count,
    verifications: expiredVerifications.count,
    auditLogs: auditDeleted,
    purgedFiles: filesToPurge.length,
    expiredInvitations: expiredInvitations.count,
    accounts: accountsDeleted,
    staleRateLimits: staleRateLimits.count,
  };

  logger.info("Cron cleanup abgeschlossen.", { deleted, accountDeletionsSkipped });

  return Response.json(
    { status: "ok", deleted, accountDeletionsSkipped },
    { headers: { "x-request-id": requestId } },
  );
}
