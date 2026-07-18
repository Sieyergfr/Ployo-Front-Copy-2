import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getStorageClient } from "@/lib/storage/client";

export async function createReadSignedUrl(input: {
  bucket: string;
  key: string;
  fileName?: string;
  disposition?: "inline" | "attachment";
  contentType?: string;
  expiresInSeconds?: number;
}) {
  const disposition = input.disposition ?? "attachment";
  const command = new GetObjectCommand({
    Bucket: input.bucket,
    Key: input.key,
    ResponseContentDisposition: input.fileName
      ? `${disposition}; filename="${encodeURIComponent(input.fileName)}"`
      : undefined,
    ResponseContentType: input.contentType,
  });

  return getSignedUrl(getStorageClient(), command, {
    expiresIn: input.expiresInSeconds ?? 60 * 5,
  });
}
