import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getStorageBucket, type StorageBucketId } from "@/lib/storage/buckets";
import { getStorageClient } from "@/lib/storage/client";
import { assertNoVirus } from "@/lib/storage/virus-scan";

export type StorageUploadInput = {
  bucketId?: StorageBucketId;
  key: string;
  body: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
};

/**
 * Einziger Schreibpfad in den Objekt-Storage — jeder Upload (HR-Dateien,
 * Verträge, Gehaltsabrechnungen, Self-Service-Dokumente, Avatare) läuft
 * hier durch, daher genügt ein Virenscan an dieser Stelle für alle.
 */
export async function uploadObject(input: StorageUploadInput) {
  await assertNoVirus(input.body, { fileName: input.metadata?.originalName });

  const bucket = getStorageBucket(input.bucketId);

  await getStorageClient().send(
    new PutObjectCommand({
      Bucket: bucket.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType ?? "application/octet-stream",
      Metadata: input.metadata,
    }),
  );

  return {
    bucket: bucket.bucket,
    key: input.key,
    provider: "s3" as const,
  };
}
