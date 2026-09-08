import { prisma } from "@/lib/prisma";
import { purgeTenantFiles } from "@/lib/storage/delete";
import { logger, runWithRequestId } from "@/lib/logger";
import {
  anonymizeFormerEmployeePii,
  assertFileDeletionAllowed,
  findEmployeesDueForPersonaldatenAnonymisierung,
  purgeExpiredConsentRecords,
  remindHrAboutExpiredHealthDataFreetext,
} from "@/lib/retention-service";
import { runVacationCarryoverRollover } from "@/lib/vacation-service";
import { unlinkAndCleanupBeforeUserDeletion } from "@/lib/user-deletion-lifecycle";

export const runtime = "nodejs";

const SOFT_DELETE_GRACE_DAYS = 30;
/**
 * PageView (lib/analytics.ts) ist anonym (kein Personenbezug, keine
 * IP/Nutzer-ID) und fällt nicht unter das Löschkonzept — reine
 * Datensparsamkeit, damit die Tabelle nicht unbegrenzt wächst. 13 statt 12
 * Monate, damit ein Jahresvergleich (z. B. "Dezember vs. Vorjahresdezember")
 * bis kurz vor dem nächsten Lauf noch möglich ist.
 */
const PAGE_VIEW_RETENTION_DAYS = 395;
/**
 * Die App frischt ihren Push-Token bei jedem Login auf. Bleibt ein Eintrag so
 * lange unberührt, ist das Gerät weg (deinstalliert, verloren, ersetzt) —
 * einen Push würde es nie sehen. Beim nächsten Start trägt sich die App
 * ohnehin von selbst wieder ein, das Löschen kostet also nichts.
 */
const PUSH_SUBSCRIPTION_STALE_DAYS = 90;

/**
 * Aufräum-Job für Retention (DSGVO-Löschkonzept). Per externem Scheduler
 * (z. B. täglich) aufrufen: GET /api/cron/cleanup mit
 * Authorization: Bearer <CRON_SECRET>.
 *
 * - löscht abgelaufene Sessions und Verification-Einträge
 * - setzt die Audit-Log-Aufbewahrung je Mandant durch
 * - entfernt soft-gelöschte und durch eine neue Version ersetzte Dateien
 *   nach Ablauf der Karenzzeit endgültig (inkl. S3-Objekt)
 * - markiert abgelaufene Einladungen
 * - entfernt Push-Tokens von Geräten, die sich lange nicht mehr gemeldet haben
 * - anonymisiert Kategorie-1-Stammdaten ehemaliger Mitarbeiter nach Ablauf
 *   der Frist (lib/data-retention.ts), erinnert HR an ablaufende
 *   Gesundheitsdaten-Freitexte statt sie automatisch zu löschen
 * - entfernt anonyme Pageview-Datensätze (lib/analytics.ts) nach 13 Monaten
 * - schreibt den Resturlaubs-Übertrag zum Jahreswechsel fort, weist
 *   Mitarbeiter rechtzeitig auf drohenden Verfall hin und lässt ihn nur nach
 *   dokumentiertem Hinweis verfallen (lib/vacation-carryover.ts)
 * - entfernt abgelaufene Cookie-Consent-Nachweise (ConsentRecord) und
 *   bereinigt sie zusätzlich beim endgültigen Löschen eines Kontos (keine
 *   harte FK/Kaskade zu User)
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

  const pageViewCutoff = new Date(
    now.getTime() - PAGE_VIEW_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const [expiredSessions, expiredVerifications, staleRateLimits, oldPageViews] =
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.appRateLimit.deleteMany({ where: { resetAt: { lt: now } } }),
      prisma.pageView.deleteMany({ where: { occurredAt: { lt: pageViewCutoff } } }),
    ]);
  // Cookie-Consent-Nachweis (ConsentRecord) wurde bisher gar nicht
  // automatisch bereinigt (Audit-Finding M05) — Frist analog zu
  // "personaldaten" (§195/199 BGB, siehe lib/data-retention.ts).
  const purgedConsentRecords = await purgeExpiredConsentRecords(now);

  const expiredInvitations = await prisma.tenantInvitation.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  const pushCutoff = new Date(
    now.getTime() - PUSH_SUBSCRIPTION_STALE_DAYS * 24 * 60 * 60 * 1000,
  );
  const stalePushSubscriptions = await prisma.pushSubscription.deleteMany({
    where: { updatedAt: { lt: pushCutoff } },
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
    where: {
      OR: [
        { status: "deleted", deletedAt: { lt: purgeCutoff } },
        // Durch eine neue Version ersetzte Dateiversionen (siehe
        // uploadTenantFileVersion) blieben bisher für immer liegen — analog
        // zum Soft-Delete-Purge nach derselben Karenzzeit endgültig entfernen.
        { status: "replaced", replacedAt: { lt: purgeCutoff } },
      ],
    },
    select: { id: true, bucket: true, storageKey: true, tenantId: true, employeeId: true, parentId: true },
    take: 200,
  });

  // Legal Hold bzw. eine noch laufende gesetzliche Aufbewahrungsfrist
  // (Gehaltsabrechnungen/Krankmeldungs-Anhänge) darf der periodische Purge
  // nicht übergehen, nur weil die 30-tägige Karenzzeit des Soft-Deletes
  // abgelaufen ist (Audit-Finding H12) — betroffene Dateien bleiben liegen
  // und werden beim nächsten Lauf erneut geprüft.
  const purgeableFiles: typeof filesToPurge = [];
  for (const file of filesToPurge) {
    try {
      await assertFileDeletionAllowed(file.tenantId, file);
      purgeableFiles.push(file);
    } catch (error) {
      logger.warn("Purge übersprungen: Löschung gesperrt.", {
        fileId: file.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await purgeTenantFiles(purgeableFiles);

  // Löschkonzept (Datenschutz-Sicherheitsaudit-und-Umbauplan.md, Teil 4):
  // Kategorie 1 (Stammdaten) automatisch anonymisieren, sobald die Frist
  // abgelaufen ist. Kategorie 3/4/5 (Lohn/SV/Gesundheit) NIE automatisch
  // löschen — für Gesundheitsdaten stattdessen nur eine HR-Erinnerung.
  const dueForAnonymisierung = await findEmployeesDueForPersonaldatenAnonymisierung(now);
  for (const employee of dueForAnonymisierung) {
    await anonymizeFormerEmployeePii(employee);
  }

  const healthDataReminders = await remindHrAboutExpiredHealthDataFreetext(now);

  // Resturlaubs-Übertrag zum Jahreswechsel, gesetzlicher Verfalls-Hinweis und
  // -Verfall (BUrlG §7 Abs. 3, Audit-Finding M02).
  const vacationCarryover = await runVacationCarryoverRollover(now);

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

    // Dieselben Aufräumschritte wie jeder andere endgültige Löschpfad
    // (lib/account-service.ts, lib/auth.ts deleteUser-Hook) — TenantEmployee
    // hat keine harte FK zu User (würde sonst auf eine gelöschte ID zeigen)
    // und ConsentRecord gar keine FK/Kaskade (Audit-Finding M05/M07).
    await unlinkAndCleanupBeforeUserDeletion(user.id);
    await prisma.user.delete({ where: { id: user.id } });
    accountsDeleted += 1;
  }

  const deleted = {
    sessions: expiredSessions.count,
    verifications: expiredVerifications.count,
    auditLogs: auditDeleted,
    purgedFiles: purgeableFiles.length,
    expiredInvitations: expiredInvitations.count,
    accounts: accountsDeleted,
    staleRateLimits: staleRateLimits.count,
    stalePushSubscriptions: stalePushSubscriptions.count,
    oldPageViews: oldPageViews.count,
    oldConsentRecords: purgedConsentRecords.deleted,
    anonymizedFormerEmployees: dueForAnonymisierung.length,
    healthDataRemindersCreated: healthDataReminders.remindersCreated,
    vacationCarryover,
  };

  logger.info("Cron cleanup abgeschlossen.", { deleted, accountDeletionsSkipped });

  return Response.json(
    { status: "ok", deleted, accountDeletionsSkipped },
    { headers: { "x-request-id": requestId } },
  );
}
