import { S3Client } from "@aws-sdk/client-s3";

export type StorageProvider = "s3";

let cachedStorageClient: S3Client | null = null;

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Storage-Konfiguration fehlt: ${name}`);
  }

  return value;
}

export function createStorageClient(provider: StorageProvider = "s3") {
  if (provider !== "s3") {
    throw new Error(`Storage Provider wird nicht unterstuetzt: ${provider}`);
  }

  return new S3Client({
    region: process.env.STORAGE_S3_REGION ?? "de",
    endpoint:
      process.env.STORAGE_S3_ENDPOINT ?? "https://s3.de.io.cloud.ovh.net/",
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnv("STORAGE_S3_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("STORAGE_S3_SECRET_ACCESS_KEY"),
    },
  });
}

export function getStorageClient() {
  cachedStorageClient ??= createStorageClient();

  return cachedStorageClient;
}
