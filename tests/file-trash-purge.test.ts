import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * Cleanup-Cron: Nutzer-Löschungen (mit deletionBatchId) sind nach 24 h
 * endgültig weg — Datei-Datensatz, S3-Objekt und Ordner-Datensatz. Andere
 * Soft-Deletes behalten die bisherige 30-Tage-Karenz.
 */

const deletedKeys: string[] = [];

vi.mock("@/lib/storage/client", () => ({
  getStorageClient: () => ({
    send: async (command: { input: { Key?: string } }) => {
      if (command.input.Key) deletedKeys.push(command.input.Key);
      return {};
    },
  }),
}));

const RUN_ID = Math.random().toString(36).slice(2);
let tenantId: string;

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600 * 1000);

async function deletedFile(name: string, deletedAt: Date, deletionBatchId: string | null) {
  return prisma.tenantFile.create({
    data: {
      tenantId,
      storageKey: `tests/${RUN_ID}/${name}`,
      originalName: name,
      displayName: name,
      status: "deleted",
      deletedAt,
      deletionBatchId,
    },
  });
}

beforeAll(async () => {
  process.env.CRON_SECRET = "test-cron-secret";
  const tenant = await prisma.tenant.create({
    data: { slug: `test-trash-purge-${RUN_ID}`, name: `Trash Purge ${RUN_ID}` },
  });
  tenantId = tenant.id;
});

afterAll(async () => {
  if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe("Cleanup-Cron — Rückgängig-Frist", () => {
  it("entfernt Nutzer-Löschungen nach 24 h endgültig und lässt jüngere sowie andere Soft-Deletes liegen", async () => {
    const expired = await deletedFile("abgelaufen.pdf", hoursAgo(25), `batch-old-${RUN_ID}`);
    const fresh = await deletedFile("frisch.pdf", hoursAgo(1), `batch-new-${RUN_ID}`);
    const legacy = await deletedFile("ohne-batch.pdf", hoursAgo(25), null);
    const expiredFolder = await prisma.tenantFileFolder.create({
      data: {
        tenantId, name: "Alt", slug: "alt", path: `alt-${RUN_ID}`, status: "inactive",
        deletedAt: hoursAgo(25), deletionBatchId: `batch-old-${RUN_ID}`,
      },
    });
    const freshFolder = await prisma.tenantFileFolder.create({
      data: {
        tenantId, name: "Neu", slug: "neu", path: `neu-${RUN_ID}`, status: "inactive",
        deletedAt: hoursAgo(1), deletionBatchId: `batch-new-${RUN_ID}`,
      },
    });

    const { GET } = await import("@/app/api/cron/cleanup/route");
    const response = await GET(
      new Request("http://localhost/api/cron/cleanup", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(response.status).toBe(200);

    expect(await prisma.tenantFile.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(deletedKeys).toContain(expired.storageKey);
    expect(await prisma.tenantFile.findUnique({ where: { id: fresh.id } })).not.toBeNull();
    expect(await prisma.tenantFile.findUnique({ where: { id: legacy.id } })).not.toBeNull();
    expect(deletedKeys).not.toContain(fresh.storageKey);
    expect(deletedKeys).not.toContain(legacy.storageKey);
    expect(await prisma.tenantFileFolder.findUnique({ where: { id: expiredFolder.id } })).toBeNull();
    expect(await prisma.tenantFileFolder.findUnique({ where: { id: freshFolder.id } })).not.toBeNull();
  });
});
