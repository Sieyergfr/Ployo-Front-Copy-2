export type StorageBucketId = "hrDocuments";

export type StorageBucketConfig = {
  id: StorageBucketId;
  bucket: string;
  label: string;
};

export const storageBuckets = {
  hrDocuments: {
    id: "hrDocuments",
    bucket: process.env.STORAGE_HR_DOCUMENTS_BUCKET ?? "hr-documents",
    label: "HR-Dokumente",
  },
} satisfies Record<StorageBucketId, StorageBucketConfig>;

export function getStorageBucket(id: StorageBucketId = "hrDocuments") {
  return storageBuckets[id];
}
