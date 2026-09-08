import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getStorageClient } from "@/lib/storage/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function markObjectDeleted(input: {
  tenantId: string;
  fileId: string;
}) {
  const file = await prisma.tenantFile.update({
    where: {
      id: input.fileId,
      tenantId: input.tenantId,
    },
    data: {
      status: "deleted",
      deletedAt: new Date(),
    },
  });

  await pruneFileFromReminders(input);

  return file;
}

// TenantReminder.linkedFilesJson is a soft reference (no FK) to TenantFile.id,
// so a deleted file has to be pruned out of every reminder that still links it.
async function pruneFileFromReminders(input: { tenantId: string; fileId: string }) {
  const reminders = await prisma.tenantReminder.findMany({
    where: { tenantId: input.tenantId },
    select: { id: true, linkedFilesJson: true },
  });

  for (const reminder of reminders) {
    const linkedFiles = Array.isArray(reminder.linkedFilesJson)
      ? reminder.linkedFilesJson.filter((id): id is string => typeof id === "string")
      : [];

    if (!linkedFiles.includes(input.fileId)) {
      continue;
    }

    await prisma.tenantReminder.update({
      where: { id: reminder.id },
      data: { linkedFilesJson: linkedFiles.filter((id) => id !== input.fileId) },
    });
  }
}

/** Löscht das Objekt endgültig aus dem S3-Bucket (DSGVO-Löschkonzept). */
export async function deleteObjectFromStorage(input: {
  bucket: string;
  key: string;
}) {
  await getStorageClient().send(
    new DeleteObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
    }),
  );
}

/** Objekt ist im Bucket bereits nicht (mehr) vorhanden — wie ein erfolgreiches Löschen behandeln. */
function isObjectAlreadyGone(error: unknown): boolean {
  const code =
    (error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } } | null)
      ?.name ??
    (error as { Code?: string } | null)?.Code ??
    "";

  if (code === "NoSuchKey" || code === "NotFound") {
    return true;
  }

  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
    ?.httpStatusCode;

  return status === 404;
}

/**
 * Entfernt Datei-Datensätze samt S3-Objekten endgültig.
 *
 * Metadaten werden je Datei NUR gelöscht, wenn das S3-Objekt nachweislich
 * gelöscht wurde (oder bereits nicht mehr existierte) — vorher entfernte
 * ein fehlgeschlagenes S3-Delete (z. B. Timeout/AccessDenied) trotzdem den
 * DB-Verweis, sodass das Objekt dauerhaft verwaist im Bucket blieb und kein
 * späterer Lauf ihn je wiederfand (Audit-Finding H11). Bei fehlgeschlagenen
 * Dateien wird stattdessen `status: "deleted"` (mit frischem `deletedAt`)
 * gesetzt — der reguläre periodische Cleanup-Lauf
 * (`app/api/cron/cleanup/route.ts`) greift genau diesen Zustand nach der
 * Karenzzeit automatisch wieder auf und versucht die Löschung erneut, ohne
 * dass dafür eine gesonderte Warteschlangen-Tabelle nötig wäre.
 */
export async function purgeTenantFiles(
  files: Array<{ id: string; bucket: string; storageKey: string }>,
) {
  const succeededIds: string[] = [];
  const failedIds: string[] = [];

  for (const file of files) {
    try {
      await deleteObjectFromStorage({ bucket: file.bucket, key: file.storageKey });
      succeededIds.push(file.id);
    } catch (error) {
      if (isObjectAlreadyGone(error)) {
        succeededIds.push(file.id);
        continue;
      }

      logger.error("S3-Objekt konnte nicht gelöscht werden — Metadaten bleiben für Retry erhalten.", {
        bucket: file.bucket,
        key: file.storageKey,
        error: error instanceof Error ? error.message : String(error),
      });
      failedIds.push(file.id);
    }
  }

  if (succeededIds.length) {
    await prisma.tenantFile.deleteMany({
      where: { id: { in: succeededIds } },
    });
  }

  if (failedIds.length) {
    await prisma.tenantFile.updateMany({
      where: { id: { in: failedIds } },
      data: { status: "deleted", deletedAt: new Date() },
    });
  }

  return { succeededIds, failedIds };
}
