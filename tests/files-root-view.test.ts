import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getFilesPageData } from "@/lib/files-server";

/**
 * Integrationstest für QA-Bug BUG-025: die Wurzelansicht ("Zuletzt geändert")
 * zeigte bisher nur Dateien ohne Ordner (`folderSlug === ""`) — eine in
 * einen Unterordner hochgeladene Datei blieb dort unsichtbar, obwohl die
 * "Dateien"-Kachel sie schon mitzählte.
 */

let actorUserId: string;

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: actorUserId, name: "Test Actor", email: "actor@test.invalid" },
      }),
    },
  },
}));

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-files-root-${RUN_ID}`;

let tenantId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Files Root Test ${RUN_ID}` },
  });
  tenantId = tenant.id;

  const actor = await prisma.user.create({
    data: {
      email: `actor-${RUN_ID}@ployo.invalid`,
      name: "Test Actor",
      emailVerified: true,
    },
  });
  actorUserId = actor.id;

  await prisma.tenantMembership.create({
    data: { tenantId, userId: actor.id, role: "OWNER" },
  });

  await prisma.tenantFileFolder.create({
    data: {
      tenantId,
      scope: "tenant",
      name: "Unterordner",
      slug: "unterordner",
      path: "unterordner",
    },
  });

  // Direkt per Prisma statt über uploadTenantFile() — vermeidet einen
  // echten S3-Roundtrip, dieser Test prüft nur die Lese-/Gruppierungslogik.
  await prisma.tenantFile.create({
    data: {
      tenantId,
      storageKey: `${RUN_ID}/root-file.txt`,
      originalName: "root-file.txt",
      displayName: "root-file.txt",
      folderSlug: "",
      folderName: "",
    },
  });
  await prisma.tenantFile.create({
    data: {
      tenantId,
      storageKey: `${RUN_ID}/subfolder-file.txt`,
      originalName: "subfolder-file.txt",
      displayName: "subfolder-file.txt",
      folderSlug: "unterordner",
      folderName: "Unterordner",
    },
  });
});

afterAll(async () => {
  if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
  if (actorUserId) await prisma.user.deleteMany({ where: { id: actorUserId } });
  await prisma.$disconnect();
});

describe("getFilesPageData — Wurzelansicht (BUG-025)", () => {
  it("zeigt in der Wurzelansicht auch Dateien aus Unterordnern (\"Zuletzt geändert\")", async () => {
    const data = await getFilesPageData(tenantSlug, []);
    const names = data.visibleFiles.map((file) => file.name);

    expect(names).toContain("root-file.txt");
    expect(names).toContain("subfolder-file.txt");
  });

  it("beschränkt sich innerhalb eines geöffneten Ordners weiterhin auf dessen eigene Dateien", async () => {
    const data = await getFilesPageData(tenantSlug, ["unterordner"]);
    const names = data.visibleFiles.map((file) => file.name);

    expect(names).toEqual(["subfolder-file.txt"]);
  });
});
