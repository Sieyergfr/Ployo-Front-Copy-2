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

/**
 * Entfernt Datei-Datensätze samt S3-Objekten endgültig.
 * S3-Fehler brechen den Vorgang nicht ab (werden geloggt), damit
 * verwaiste Objekte einen späteren Purge-Lauf nicht blockieren.
 */
export async function purgeTenantFiles(
  files: Array<{ id: string; bucket: string; storageKey: string }>,
) {
  for (const file of files) {
    try {
      await deleteObjectFromStorage({ bucket: file.bucket, key: file.storageKey });
    } catch (error) {
      logger.error("S3-Objekt konnte nicht gelöscht werden.", {
        bucket: file.bucket,
        key: file.storageKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (files.length) {
    await prisma.tenantFile.deleteMany({
      where: { id: { in: files.map((file) => file.id) } },
    });
  }
}
