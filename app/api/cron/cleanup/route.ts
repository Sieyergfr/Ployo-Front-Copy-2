import { prisma } from "@/lib/prisma";
import { purgeTenantFiles } from "@/lib/storage/delete";
import { logger, runWithRequestId } from "@/lib/logger";
import {
  anonymizeFormerEmployeePii,
  assertFileDeletionAllowedBatch,
  findEmployeesDueForPersonaldatenAnonymisierung,
  purgeExpiredConsentRecords,
  remindHrAboutExpiredHealthDataFreetext,
} from "@/lib/retention-service";
import { runVacationCarryoverRollover } from "@/lib/vacation-service";
import { unlinkAndCleanupBeforeUserDeletionBatch } from "@/lib/user-deletion-lifecycle";

export const runtime = "nodejs";

// Seitengröße für die Cursor-Paginierung der Mandanten-/Nutzer-Schleifen
// unten — hält Speicher- und Abfragegröße pro Batch unabhängig von der
// Gesamtzahl der Mandanten/fälligen Konten beschränkt.
const TENANT_PAGE_SIZE = 500;
const USER_PAGE_SIZE = 500;
// Anzahl gleichzeitig laufender Anonymisierungs-Transaktionen (jede läuft in
// ihrer eigenen `$transaction`, siehe anonymizeFormerEmployeePii) — begrenzt
// statt unbegrenzt parallel, um den Verbindungs-Pool nicht zu sprengen.
const ANONYMIZATION_CONCURRENCY = 10;

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

  // Seitenweise statt eines einzigen `findMany` ohne `take` (skaliert sonst
  // nicht mit wachsender Mandantenzahl). Pro Seite werden die Mandanten nach
  // ihrer konfigurierten Aufbewahrungsdauer gruppiert und je Gruppe in EINER
  // `deleteMany`-Abfrage bereinigt statt einer pro Mandant.
  let auditDeleted = 0;
  let tenantCursor: string | undefined;

  for (;;) {
    const tenantPage = await prisma.tenant.findMany({
      take: TENANT_PAGE_SIZE,
      ...(tenantCursor ? { cursor: { id: tenantCursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        settings: { select: { auditRetentionMonths: true } },
      },
    });

    if (tenantPage.length === 0) break;
    tenantCursor = tenantPage[tenantPage.length - 1]!.id;

    const tenantIdsByRetentionMonths = new Map<number, string[]>();
    for (const tenant of tenantPage) {
      const months = tenant.settings?.auditRetentionMonths ?? 24;
      const bucket = tenantIdsByRetentionMonths.get(months);
      if (bucket) {
        bucket.push(tenant.id);
      } else {
        tenantIdsByRetentionMonths.set(months, [tenant.id]);
      }
    }

    for (const [months, tenantIds] of tenantIdsByRetentionMonths) {
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - months);

      const result = await prisma.tenantAuditLog.deleteMany({
        where: { tenantId: { in: tenantIds }, createdAt: { lt: cutoff } },
      });
      auditDeleted += result.count;
    }

    if (tenantPage.length < TENANT_PAGE_SIZE) break;
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
  // und werden beim nächsten Lauf erneut geprüft. Gebündelt statt einer
  // Prüfung pro Datei (bis zu vier Queries/Datei, siehe
  // assertFileDeletionAllowedBatch).
  const { allowed: purgeableFiles, blocked: blockedFiles } =
    await assertFileDeletionAllowedBatch(filesToPurge);

  for (const entry of blockedFiles) {
    logger.warn("Purge übersprungen: Löschung gesperrt.", {
      fileId: entry.file.id,
      error: entry.reason,
    });
  }

  await purgeTenantFiles(purgeableFiles);

  // Löschkonzept (Datenschutz-Sicherheitsaudit-und-Umbauplan.md, Teil 4):
  // Kategorie 1 (Stammdaten) automatisch anonymisieren, sobald die Frist
  // abgelaufen ist. Kategorie 3/4/5 (Lohn/SV/Gesundheit) NIE automatisch
  // löschen — für Gesundheitsdaten stattdessen nur eine HR-Erinnerung.
  const dueForAnonymisierung = await findEmployeesDueForPersonaldatenAnonymisierung(now);
  // Jede Anonymisierung läuft in ihrer eigenen, auf genau diesen Mitarbeiter
  // beschränkten Transaktion (siehe anonymizeFormerEmployeePii) — die
  // einzelnen Datensätze überschneiden sich nicht, ein echtes Zusammenlegen
  // in eine einzige Mehrzeilen-Schreiboperation würde die individuell
  // berechneten Werte je Mitarbeiter (anonymisierter Name/Key aus der
  // jeweiligen `employeeNumber`) und die Transaktionsgrenze aufgeben — bei
  // Löschkonzept-Daten bewusst nicht angetastet. Begrenzt nebenläufig statt
  // sequenziell ist der sichere Mittelweg.
  for (let i = 0; i < dueForAnonymisierung.length; i += ANONYMIZATION_CONCURRENCY) {
    const chunk = dueForAnonymisierung.slice(i, i + ANONYMIZATION_CONCURRENCY);
    await Promise.all(chunk.map((employee) => anonymizeFormerEmployeePii(employee)));
  }

  const healthDataReminders = await remindHrAboutExpiredHealthDataFreetext(now);

  // Resturlaubs-Übertrag zum Jahreswechsel, gesetzlicher Verfalls-Hinweis und
  // -Verfall (BUrlG §7 Abs. 3, Audit-Finding M02).
  const vacationCarryover = await runVacationCarryoverRollover(now);

  // Konten, deren 30-tägige Schutzfrist nach einer Selbst-Löschung
  // (siehe lib/account-service.ts) abgelaufen ist, endgültig löschen.
  // Seitenweise (skaliert sonst nicht mit vielen fälligen Konten); pro Seite
  // wird die Eigentümer-Prüfung für ALLE betroffenen Mandanten in einer
  // Abfrage geholt statt einer COUNT-Query pro (Nutzer, Mandant)-Paar, und
  // die eigentliche Löschung läuft gebündelt (siehe
  // unlinkAndCleanupBeforeUserDeletionBatch + `deleteMany` unten).
  let accountsDeleted = 0;
  const accountDeletionsSkipped: string[] = [];
  let userCursor: string | undefined;

  for (;;) {
    const userPage = await prisma.user.findMany({
      where: { scheduledDeletionAt: { lte: now } },
      take: USER_PAGE_SIZE,
      ...(userCursor ? { cursor: { id: userCursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        memberships: {
          where: { role: "OWNER" },
          select: { tenantId: true, tenant: { select: { name: true } } },
        },
      },
    });

    if (userPage.length === 0) break;
    userCursor = userPage[userPage.length - 1]!.id;

    const ownedTenantIds = [
      ...new Set(userPage.flatMap((user) => user.memberships.map((m) => m.tenantId))),
    ];
    const owners = ownedTenantIds.length
      ? await prisma.tenantMembership.findMany({
          where: { tenantId: { in: ownedTenantIds }, role: "OWNER" },
          select: { tenantId: true, userId: true },
        })
      : [];

    const ownerUserIdsByTenant = new Map<string, string[]>();
    for (const owner of owners) {
      const bucket = ownerUserIdsByTenant.get(owner.tenantId);
      if (bucket) {
        bucket.push(owner.userId);
      } else {
        ownerUserIdsByTenant.set(owner.tenantId, [owner.userId]);
      }
    }

    const deletableUserIds: string[] = [];

    for (const user of userPage) {
      const orphanedOwnership = user.memberships.find((ownership) => {
        const otherOwners = (ownerUserIdsByTenant.get(ownership.tenantId) ?? []).filter(
          (userId) => userId !== user.id,
        );
        return otherOwners.length === 0;
      });

      if (orphanedOwnership) {
        accountDeletionsSkipped.push(
          `${user.id} (alleinige/r Inhaber/in von "${orphanedOwnership.tenant.name}")`,
        );
        continue;
      }

      deletableUserIds.push(user.id);
    }

    if (deletableUserIds.length > 0) {
      // Dieselben Aufräumschritte wie jeder andere endgültige Löschpfad
      // (lib/account-service.ts, lib/auth.ts deleteUser-Hook) — TenantEmployee
      // hat keine harte FK zu User (würde sonst auf eine gelöschte ID zeigen)
      // und ConsentRecord gar keine FK/Kaskade (Audit-Finding M05/M07).
      await unlinkAndCleanupBeforeUserDeletionBatch(deletableUserIds);
      const result = await prisma.user.deleteMany({ where: { id: { in: deletableUserIds } } });
      accountsDeleted += result.count;
    }

    if (userPage.length < USER_PAGE_SIZE) break;
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
