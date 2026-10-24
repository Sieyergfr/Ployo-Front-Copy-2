import { describe, expect, it, vi } from "vitest";
import type { PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * S3-Metadaten gehen als HTTP-Header raus und müssen ASCII sein — ein
 * Dateiname mit Umlaut ("Krankmeldung Müller.pdf") ließ jeden Upload mit
 * `SignatureDoesNotMatch` scheitern.
 */

const sent: PutObjectCommand[] = [];

vi.mock("@/lib/storage/client", () => ({
  getStorageClient: () => ({
    send: async (command: PutObjectCommand) => {
      sent.push(command);
      return {};
    },
  }),
}));

vi.mock("@/lib/storage/virus-scan", () => ({
  assertNoVirus: async () => undefined,
}));

describe("uploadObject — Metadaten", () => {
  it("kodiert Nicht-ASCII-Werte und lässt ASCII-Werte unverändert", async () => {
    const { uploadObject } = await import("@/lib/storage/upload");

    await uploadObject({
      key: "tests/umlaut.pdf",
      body: Buffer.from("x"),
      metadata: { tenantId: "tenant-1", originalName: "Krankmeldung Müller.pdf" },
    });

    const metadata = sent.at(-1)?.input.Metadata ?? {};
    expect(metadata.tenantId).toBe("tenant-1");
    expect(metadata.originalName).toBe("Krankmeldung%20M%C3%BCller.pdf");
    expect(Object.values(metadata).every((value) => /^[\x20-\x7E]*$/.test(value))).toBe(true);
    expect(decodeURIComponent(metadata.originalName)).toBe("Krankmeldung Müller.pdf");
  });
});
