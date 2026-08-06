import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getStorageClient } from "@/lib/storage/client";
import { prisma } from "@/lib/prisma";

export async function markObjectDeleted(input: {
  tenantId: string;
  fileId: string;
}) {
  return prisma.tenantFile.update({
    where: {
      id: input.fileId,
      tenantId: input.tenantId,
    },
    data: {
      status: "delete",
      deletedAt: new Date(),
    },
  });
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
      console.error(
        `[storage] S3-Objekt konnte nicht gelöscht werden (${file.bucket}/${file.storageKey}):`,
        error,
      );
    }
  }

  if (files.length) {
    await prisma.tenantFile.deleteMany({
      where: { id: { in: files.map((file) => file.id) } },
    });
  }
}
