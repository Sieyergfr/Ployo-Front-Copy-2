import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getStorageBucket, type StorageBucketId } from "@/lib/storage/buckets";
import { getStorageClient } from "@/lib/storage/client";

export type StorageUploadInput = {
  bucketId?: StorageBucketId;
  key: string;
  body: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
};

export async function uploadObject(input: StorageUploadInput) {
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
