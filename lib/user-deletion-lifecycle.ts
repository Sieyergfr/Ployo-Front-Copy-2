import "server-only";
import { prisma } from "@/lib/prisma";
import { getStorageBucket } from "@/lib/storage/buckets";
import { deleteObjectFromStorage } from "@/lib/storage/delete";
import { logger } from "@/lib/logger";

/**
 * Gemeinsame, auth-unabhängige Bausteine für JEDEN Weg, der einen `User`
 * endgültig löscht (Sofort-Löschung, verzögerte Selbst-Löschung nach
 * Karenzzeit, und der generische better-auth-SDK-Endpunkt `deleteUser`,
 * siehe `lib/auth.ts`) — bewusst in einem eigenen, blattförmigen Modul ohne
 * Import von `@/lib/auth` oder `@/lib/oauth-revocation` (beide importieren
 * ihrerseits `@/lib/auth`), damit `lib/auth.ts` diese Funktionen zirkelfrei
 * in seinen `deleteUser.beforeDelete`-Hook einbinden kann (Audit-Finding M07).
 */

/**
 * Verhindert, dass ein Konto gelöscht/vom Zugang getrennt wird, solange es
 * alleiniger Inhaber eines Mandanten ist — der Mandant würde sonst
 * verwaisen.
 */
export async function assertNoOrphanedTenantOwnership(userId: string) {
  const ownerships = await prisma.tenantMembership.findMany({
    where: { userId, role: "OWNER" },
    select: { tenantId: true, tenant: { select: { name: true } } },
  });

  for (const ownership of ownerships) {
    const otherOwners = await prisma.tenantMembership.count({
      where: {
        tenantId: ownership.tenantId,
        userId: { not: userId },
        role: "OWNER",
      },
    });

    if (otherOwners === 0) {
      throw new Error(
        `Diese Person ist alleinige/r Inhaber/in von „${ownership.tenant.name}“. Bitte zuerst eine andere Person als Inhaber/in eintragen oder den Mandanten löschen.`,
      );
    }
  }
}

/**
 * `TenantEmployee` und `ConsentRecord` haben beide keine harte FK/Kaskade zu
 * `User` (siehe jeweilige Schema-Kommentare) — vor JEDER endgültigen
 * User-Löschung ausdrücklich bereinigen, sonst bleibt `TenantEmployee.userId`
 * auf eine nicht mehr existierende ID zeigen bzw. `ConsentRecord` verwaist
 * zurück.
 */
export async function unlinkAndCleanupBeforeUserDeletion(userId: string) {
  await prisma.$transaction([
    prisma.tenantEmployee.updateMany({ where: { userId }, data: { userId: null } }),
    prisma.consentRecord.deleteMany({ where: { userId } }),
  ]);

  // Profilbild liegt unter einem festen, userId-basierten Schlüssel
  // (lib/avatar-service.ts `avatarStorageKey`) — ohne diese Bereinigung
  // blieb es nach einer Kontolöschung dauerhaft als verwaistes Objekt im
  // Bucket liegen (Audit-Finding M07). Best-effort: weder ein transienter
  // Storage-Fehler noch ein bereits fehlendes Objekt (kein eigener Avatar
  // hochgeladen) dürfen die eigentliche Kontolöschung blockieren.
  try {
    await deleteObjectFromStorage({
      bucket: getStorageBucket("hrDocuments").bucket,
      key: `avatars/${userId}`,
    });
  } catch (error) {
    logger.warn("Profilbild-Löschung beim Konto-Löschen fehlgeschlagen.", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Batch-Variante von `unlinkAndCleanupBeforeUserDeletion` für den
 * periodischen Cleanup-Cron (app/api/cron/cleanup/route.ts), der mehrere
 * fällige Konten pro Lauf endgültig löscht — bündelt die beiden DB-Schritte
 * über alle übergebenen Nutzer in je einer Abfrage statt zwei pro Nutzer. Die
 * Profilbild-Löschung bleibt zwangsläufig ein S3-Aufruf pro Nutzer (kein
 * "Lösche alle diese Keys"-Gegenstück in lib/storage/delete.ts), läuft aber
 * nebenläufig statt sequenziell.
 */
export async function unlinkAndCleanupBeforeUserDeletionBatch(userIds: string[]) {
  if (userIds.length === 0) {
    return;
  }

  await prisma.$transaction([
    prisma.tenantEmployee.updateMany({ where: { userId: { in: userIds } }, data: { userId: null } }),
    prisma.consentRecord.deleteMany({ where: { userId: { in: userIds } } }),
  ]);

  await Promise.all(
    userIds.map(async (userId) => {
      try {
        await deleteObjectFromStorage({
          bucket: getStorageBucket("hrDocuments").bucket,
          key: `avatars/${userId}`,
        });
      } catch (error) {
        logger.warn("Profilbild-Löschung beim Konto-Löschen fehlgeschlagen.", {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
}
