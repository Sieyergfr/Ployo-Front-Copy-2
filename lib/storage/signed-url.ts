import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getStorageClient } from "@/lib/storage/client";

/**
 * S3 liefert `response-content-type` unverändert an den Browser durch — ohne
 * `charset` interpretiert der Browser eine Textdatei-Vorschau nach Latin-1
 * statt UTF-8, Umlaute erscheinen dadurch als Mojibake ("lÃ¶schen" statt
 * "löschen", QA-Bug BUG-023). Nur für tatsächlich textbasierte Typen
 * ergänzen, bei denen "Zeichensatz" überhaupt Sinn ergibt — Bilder/PDFs/ZIPs
 * etc. bleiben unangetastet.
 */
export function withCharsetIfText(contentType: string | undefined): string | undefined {
  if (!contentType || contentType.includes("charset")) {
    return contentType;
  }

  const isTextLike =
    contentType.startsWith("text/") ||
    contentType === "application/json" ||
    contentType === "application/xml" ||
    contentType === "image/svg+xml";

  return isTextLike ? `${contentType}; charset=utf-8` : contentType;
}

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
    ResponseContentType: withCharsetIfText(input.contentType),
  });

  return getSignedUrl(getStorageClient(), command, {
    expiresIn: input.expiresInSeconds ?? 60 * 5,
  });
}
