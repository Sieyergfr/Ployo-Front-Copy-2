import { describe, expect, it } from "vitest";
import { buildStorageKey, getFileExtension } from "@/lib/storage/key-builder";
import type { StorageBucketConfig } from "@/lib/storage/buckets";

const bucket = {} as StorageBucketConfig;

describe("getFileExtension", () => {
  it("liefert die Endung in Kleinbuchstaben", () => {
    expect(getFileExtension("Vertrag.PDF")).toBe("pdf");
  });

  it("liefert leer, wenn keine Endung vorhanden ist", () => {
    expect(getFileExtension("Vertrag")).toBe("");
  });

  it("entfernt Sonderzeichen aus der Endung", () => {
    expect(getFileExtension("datei.p df!")).toBe("pdf");
  });
});

describe("buildStorageKey", () => {
  const now = new Date(Date.UTC(2026, 7, 2));

  it("erzeugt einen mandantengebundenen Pfad", () => {
    const key = buildStorageKey(bucket, {
      tenantId: "tenant-1",
      fileName: "vertrag.pdf",
      ownerType: "employee",
      ownerId: "emp-9",
      now,
    });

    expect(key.startsWith("tenants/tenant-1/employee/emp-9/2026/08/02/v1/")).toBe(
      true,
    );
    expect(key.endsWith(".pdf")).toBe(true);
  });

  it("nutzt tenant/general als Standard", () => {
    const key = buildStorageKey(bucket, {
      tenantId: "tenant-1",
      fileName: "notiz.txt",
      now,
    });

    expect(key.startsWith("tenants/tenant-1/tenant/general/")).toBe(true);
  });

  it("übernimmt die Version in den Pfad", () => {
    const key = buildStorageKey(bucket, {
      tenantId: "tenant-1",
      fileName: "vertrag.pdf",
      version: 3,
      now,
    });

    expect(key).toContain("/v3/");
  });

  it("übernimmt niemals den Originalnamen in den Schlüssel", () => {
    const key = buildStorageKey(bucket, {
      tenantId: "tenant-1",
      fileName: "Krankmeldung Sophie Wagner.pdf",
      now,
    });

    expect(key.toLowerCase()).not.toContain("sophie");
    expect(key).not.toContain(" ");
  });

  it("vergibt für jeden Aufruf einen eigenen Schlüssel", () => {
    const input = { tenantId: "tenant-1", fileName: "a.pdf", now };

    expect(buildStorageKey(bucket, input)).not.toBe(
      buildStorageKey(bucket, input),
    );
  });
});
