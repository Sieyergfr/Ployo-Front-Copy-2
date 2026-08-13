import type { StorageBucketConfig } from "@/lib/storage/buckets";

type BuildStorageKeyInput = {
  tenantId: string;
  fileName: string;
  ownerType?: "tenant" | "employee" | "location" | "team";
  ownerId?: string;
  version?: number;
  now?: Date;
};

function extensionFromName(fileName: string) {
  const index = fileName.lastIndexOf(".");

  if (index < 0) {
    return "";
  }

  return fileName.slice(index + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function datePath(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("/");
}

export function getFileExtension(fileName: string) {
  return extensionFromName(fileName);
}

export function buildStorageKey(
  _bucket: StorageBucketConfig,
  input: BuildStorageKeyInput,
) {
  const id = crypto.randomUUID();
  const extension = extensionFromName(input.fileName);
  const fileName = extension ? `${id}.${extension}` : id;
  const ownerType = input.ownerType ?? "tenant";
  const ownerId = input.ownerId ?? "general";
  const version = input.version ?? 1;

  return [
    "tenants",
    input.tenantId,
    ownerType,
    ownerId,
    datePath(input.now ?? new Date()),
    `v${version}`,
    fileName,
  ].join("/");
}
