import { prisma } from "@/lib/prisma";
import { purgeTenantFiles } from "@/lib/storage/delete";

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
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET ist nicht konfiguriert." },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const now = new Date();

  const [expiredSessions, expiredVerifications] = await prisma.$transaction([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
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
    where: { status: "delete", deletedAt: { lt: purgeCutoff } },
    select: { id: true, bucket: true, storageKey: true },
    take: 200,
  });

  await purgeTenantFiles(filesToPurge);

  return Response.json({
    status: "ok",
    deleted: {
      sessions: expiredSessions.count,
      verifications: expiredVerifications.count,
      auditLogs: auditDeleted,
      purgedFiles: filesToPurge.length,
      expiredInvitations: expiredInvitations.count,
    },
  });
}
