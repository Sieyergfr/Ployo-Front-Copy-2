import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { FILE_FOLDER_ERRORS, folderPathChain, isFolderPathDenied, sharedFolderPaths } from "@/lib/file-folders";

/**
 * Ordner-Einstellungen der zentralen Ablage (M1) gegen eine echte
 * Datenbank: Rollen-Einschränkung (Liste + Abruf), Freigabe für
 * Mitarbeitende (alle / Team), Umbenennen und Verschieben.
 */

let currentUserId = "";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: currentUserId, name: "Test Actor", email: "actor@test.invalid" },
      }),
    },
  },
}));

vi.mock("@/lib/storage/signed-url", () => ({
  createReadSignedUrl: async (input: { key: string }) => `https://signed.test/${input.key}`,
  withCharsetIfText: (value: string | undefined) => value,
}));

const service = await import("@/lib/file-folder-service");
const filesServer = await import("@/lib/files-server");
const fileAccess = await import("@/lib/file-access");
const tenantAccess = await import("@/lib/tenant-access");

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-folders-${RUN_ID}`;

let tenantId: string;
let ownerUserId: string;
let clerkUserId: string;
let kitchenUserId: string;
let serviceUserId: string;
let accountingRoleId: string;
let kitchenTeamId: string;

async function createFolder(path: string, name: string, data: Record<string, unknown> = {}) {
  const parts = path.split("/");

  return prisma.tenantFileFolder.create({
    data: { tenantId, scope: "tenant", name, slug: parts.at(-1)!, path, ...data },
  });
}

async function createFile(folderSlug: string, name: string) {
  return prisma.tenantFile.create({
    data: {
      tenantId,
      storageKey: `${RUN_ID}/${name}`,
      originalName: name,
      displayName: name,
      extension: "pdf",
      mimeType: "application/pdf",
      folderSlug,
      folderName: folderSlug || "Home",
    },
  });
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { slug: tenantSlug, name: `Ordner ${RUN_ID}` } });
  tenantId = tenant.id;

  const users = await Promise.all(
    ["owner", "clerk", "kitchen", "service"].map((name) =>
      prisma.user.create({ data: { email: `${name}-folders-${RUN_ID}@ployo.invalid`, name, emailVerified: true } }),
    ),
  );
  [ownerUserId, clerkUserId, kitchenUserId, serviceUserId] = users.map((user) => user.id);

  const [accounting, clerk, plain] = await Promise.all([
    prisma.tenantRole.create({
      data: { tenantId, key: "accounting", name: "Buchhaltung", permissions: { create: [{ area: "files", level: "write", scope: "all" }] } },
    }),
    prisma.tenantRole.create({
      data: { tenantId, key: "clerk", name: "Büro", permissions: { create: [{ area: "files", level: "write", scope: "all" }] } },
    }),
    prisma.tenantRole.create({
      data: { tenantId, key: "plain", name: "Mitarbeiter", permissions: { create: [{ area: "files", level: "none", scope: "all" }] } },
    }),
  ]);
  accountingRoleId = accounting.id;

  await prisma.tenantMembership.createMany({
    data: [
      { tenantId, userId: ownerUserId, role: "OWNER" },
      { tenantId, userId: clerkUserId, role: "EMPLOYEE", roleId: clerk.id },
      { tenantId, userId: kitchenUserId, role: "EMPLOYEE", roleId: plain.id },
      { tenantId, userId: serviceUserId, role: "EMPLOYEE", roleId: plain.id },
    ],
  });

  const kitchenTeam = await prisma.tenantTeam.create({ data: { tenantId, key: `kueche-${RUN_ID}`, name: "Küche" } });
  kitchenTeamId = kitchenTeam.id;

  const [kitchenEmployee] = await Promise.all(
    [
      ["kitchen", kitchenUserId],
      ["service", serviceUserId],
    ].map(([key, userId]) =>
      prisma.tenantEmployee.create({
        data: { tenantId, key: `${key}-${RUN_ID}`, employeeNumber: `${key}-${RUN_ID}`, userId, initials: "XX", name: key },
      }),
    ),
  );
  await prisma.tenantTeamMember.create({
    data: { teamId: kitchenTeamId, employeeId: kitchenEmployee.id, initials: "KI", name: "kitchen", location: "", role: "", contract: "" },
  });
});

beforeEach(async () => {
  currentUserId = ownerUserId;
  await prisma.tenantFile.deleteMany({ where: { tenantId } });
  await prisma.tenantFileFolder.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { slug: tenantSlug } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, clerkUserId, kitchenUserId, serviceUserId] } } });
  await prisma.$disconnect();
});

describe("Regeln", () => {
  it("vererbt Rollen-Einschränkungen an Unterordner", () => {
    const folders = [{ path: "buchhaltung", accessRoleIdsJson: ["r1"] }];

    expect(folderPathChain("a/b/c")).toEqual(["a", "a/b", "a/b/c"]);
    expect(isFolderPathDenied(folders, "buchhaltung/2026", { membershipRole: "EMPLOYEE", roleId: "r2" })).toBe(true);
    expect(isFolderPathDenied(folders, "buchhaltung/2026", { membershipRole: "EMPLOYEE", roleId: "r1" })).toBe(false);
    expect(isFolderPathDenied(folders, "buchhaltung", { membershipRole: "HR", roleId: null })).toBe(false);
    expect(isFolderPathDenied(folders, "marketing", { membershipRole: "EMPLOYEE", roleId: "r2" })).toBe(false);
  });

  it("gibt Unterordner mit frei, aber nie geschützte oder eingeschränkte", () => {
    const base = { locked: false, accessRoleIdsJson: [], sharedWithEmployees: false, visibleTeamIdsJson: [], visibleLocationIdsJson: [] };
    const folders = [
      { ...base, id: "1", name: "Handbuch", path: "handbuch", sharedWithEmployees: true },
      { ...base, id: "2", name: "Rezepte", path: "handbuch/rezepte" },
      { ...base, id: "3", name: "Intern", path: "handbuch/intern", locked: true },
      { ...base, id: "4", name: "Küche", path: "kueche", sharedWithEmployees: true, visibleTeamIdsJson: ["t1"] },
    ];

    expect([...sharedFolderPaths(folders, { teamIds: [], locationIds: [] })].sort()).toEqual(["handbuch", "handbuch/rezepte"]);
    expect(sharedFolderPaths(folders, { teamIds: ["t1"], locationIds: [] }).has("kueche")).toBe(true);
  });
});

describe("Rollen-Einschränkung", () => {
  it("blendet eingeschränkte Ordner samt Inhalt aus und sperrt den Abruf", async () => {
    await createFolder("buchhaltung", "Buchhaltung");
    const file = await createFile("buchhaltung", "bilanz.pdf");

    await service.updateTenantFolderSettings({ tenantSlug, path: "buchhaltung", accessRoleIds: [accountingRoleId], pinned: true });

    currentUserId = clerkUserId;
    const data = await filesServer.getFilesPageData(tenantSlug);

    expect(data.folders.map((folder) => folder.path)).not.toContain("buchhaltung");
    expect(data.files.map((item) => item.slug)).not.toContain(file.id);

    const access = await tenantAccess.requireTenantAccess(tenantSlug, "files", "read");

    await expect(fileAccess.requireTenantFileAreaAccess(access, file)).rejects.toThrow("FORBIDDEN");
    await expect(service.renameTenantFile({ tenantSlug, fileId: file.id, name: "x.pdf" })).rejects.toThrow();
    // Auch Einstellungen ändern geht nicht (Büro hat kein Datei-Admin-Recht).
    await expect(
      service.updateTenantFolderSettings({ tenantSlug, path: "buchhaltung", accessRoleIds: [] }),
    ).rejects.toThrow();

    currentUserId = ownerUserId;
    const ownerData = await filesServer.getFilesPageData(tenantSlug);

    expect(ownerData.folders.find((folder) => folder.path === "buchhaltung")).toMatchObject({
      pinned: true,
      accessRoleIds: [accountingRoleId],
    });
  });
});

describe("Freigabe für Mitarbeitende", () => {
  it("zeigt freigegebene Ordner nur der passenden Zielgruppe", async () => {
    await createFolder("handbuch", "Handbuch");
    await createFolder("kueche", "Küche");
    await createFolder("intern", "Intern");
    const manual = await createFile("handbuch", "handbuch.pdf");
    const recipes = await createFile("kueche", "rezepte.pdf");
    const internal = await createFile("intern", "intern.pdf");

    await service.updateTenantFolderSettings({ tenantSlug, path: "handbuch", sharedWithEmployees: true });
    await service.updateTenantFolderSettings({
      tenantSlug,
      path: "kueche",
      sharedWithEmployees: true,
      visibleTeamIds: [kitchenTeamId],
    });

    currentUserId = kitchenUserId;
    const kitchenView = await service.getMySharedFolders(tenantSlug);

    expect(kitchenView.map((folder) => folder.path).sort()).toEqual(["handbuch", "kueche"]);
    expect(kitchenView.find((folder) => folder.path === "kueche")?.files.map((file) => file.id)).toEqual([recipes.id]);
    await expect(service.getMySharedFileDownloadUrl({ tenantSlug, fileId: recipes.id })).resolves.toContain("rezepte.pdf");

    currentUserId = serviceUserId;
    expect((await service.getMySharedFolders(tenantSlug)).map((folder) => folder.path)).toEqual(["handbuch"]);
    await expect(service.getMySharedFileDownloadUrl({ tenantSlug, fileId: recipes.id })).rejects.toThrow("Datei nicht gefunden.");
    await expect(service.getMySharedFileDownloadUrl({ tenantSlug, fileId: internal.id })).rejects.toThrow("Datei nicht gefunden.");
    await expect(service.getMySharedFileDownloadUrl({ tenantSlug, fileId: manual.id })).resolves.toContain("handbuch.pdf");
  });

  it("lehnt die Freigabe geschützter oder eingeschränkter Ordner ab", async () => {
    await createFolder("tresor", "Tresor", { locked: true, pinHash: "x" });
    await createFolder("lohn", "Lohn");

    await expect(
      service.updateTenantFolderSettings({ tenantSlug, path: "tresor", sharedWithEmployees: true }),
    ).rejects.toThrow(FILE_FOLDER_ERRORS.lockedShare);
    await expect(
      service.updateTenantFolderSettings({ tenantSlug, path: "lohn", sharedWithEmployees: true, accessRoleIds: [accountingRoleId] }),
    ).rejects.toThrow(FILE_FOLDER_ERRORS.restrictedShare);
  });
});

describe("Umbenennen und Verschieben", () => {
  it("benennt Ordner und Dateien um und verschiebt Dateien", async () => {
    await createFolder("speisen", "Speisen");
    await createFolder("archiv", "Archiv");
    const file = await createFile("speisen", "karte.pdf");

    await service.updateTenantFolderSettings({ tenantSlug, path: "speisen", name: "Speisekarten" });
    expect((await prisma.tenantFile.findUniqueOrThrow({ where: { id: file.id } })).folderName).toBe("Speisekarten");

    await service.renameTenantFile({ tenantSlug, fileId: file.id, name: "Karte Herbst.pdf" });
    await expect(service.moveTenantFile({ tenantSlug, fileId: file.id, targetPath: "speisen" })).rejects.toThrow(
      FILE_FOLDER_ERRORS.sameFolder,
    );
    await service.moveTenantFile({ tenantSlug, fileId: file.id, targetPath: "archiv" });

    expect(await prisma.tenantFile.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({
      displayName: "Karte Herbst.pdf",
      folderSlug: "archiv",
      folderName: "Archiv",
    });
  });
});


describe("Owner-Dateiablagen", () => {
  it.each(["employee", "location", "team"] as const)("hält Umbenennen, Anheften und Verschieben in der %s-Ablage", async (ownerType) => {
    const key = `owner-${ownerType}-${RUN_ID}`;
    const owner = ownerType === "employee"
      ? await prisma.tenantEmployee.create({ data: { tenantId, key, name: "Owner test", employeeNumber: key, initials: "OT" } })
      : ownerType === "location"
        ? await prisma.tenantLocation.create({ data: { tenantId, key, name: "Owner test", kind: "Filiale" } })
        : await prisma.tenantTeam.create({ data: { tenantId, key, name: "Owner test" } });
    const relation = ownerType === "employee" ? { employeeId: owner.id } : ownerType === "location" ? { locationId: owner.id } : { teamId: owner.id };
    const scope = `${ownerType}:${owner.id}`;
    await createFolder("unterlagen", "Zentral");
    await createFolder("archiv", "Zentrales Archiv");
    await createFolder("unterlagen", "Unterlagen", { scope, ...relation });
    await createFolder("archiv", "Eigenes Archiv", { scope, ...relation });
    const central = await createFile("unterlagen", "central.pdf");
    const file = await prisma.tenantFile.create({ data: {
      tenantId, ...relation, folderSlug: "unterlagen", folderName: "Unterlagen", storageKey: `${key}/test.pdf`,
      originalName: "test.pdf", displayName: "test.pdf", extension: "pdf", mimeType: "application/pdf",
    } });

    await service.updateTenantFolderSettings({ tenantSlug, ownerType, ownerId: owner.id, path: "unterlagen", name: "Personalunterlagen", pinned: true });
    expect(await prisma.tenantFileFolder.findFirstOrThrow({ where: { tenantId, scope, path: "unterlagen" } })).toMatchObject({ name: "Personalunterlagen", pinned: true });
    expect(await prisma.tenantFile.findUniqueOrThrow({ where: { id: central.id } })).toMatchObject({ folderName: "unterlagen" });
    expect(await prisma.tenantFile.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({ folderName: "Personalunterlagen" });

    await service.renameTenantFile({ tenantSlug, fileId: file.id, name: "Aktualisiert.pdf" });
    await service.moveTenantFile({ tenantSlug, fileId: file.id, targetPath: "archiv" });
    expect(await prisma.tenantFile.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({ ...relation, displayName: "Aktualisiert.pdf", folderSlug: "archiv", folderName: "Eigenes Archiv" });

    // Ein rein zentraler Zielordner darf keine Datei aus ihrer Akte herausziehen.
    await createFolder("nur-zentral", "Nur zentral");
    await expect(service.moveTenantFile({ tenantSlug, fileId: file.id, targetPath: "nur-zentral" })).rejects.toThrow();
    currentUserId = clerkUserId;
    await expect(service.renameTenantFile({ tenantSlug, fileId: file.id, name: "Verboten.pdf" })).rejects.toThrow();
    await expect(service.updateTenantFolderSettings({ tenantSlug, ownerType, ownerId: owner.id, path: "unterlagen", name: "Verboten" })).rejects.toThrow();
  });
});


it("beachtet Owner-Ordnerrollen auch für Abruf und Mutationen", async () => {
  const scope = `team:${kitchenTeamId}`;
  const roleId = (await prisma.tenantMembership.findFirstOrThrow({ where: { tenantId, userId: clerkUserId } })).roleId!;
  await prisma.tenantRolePermission.create({ data: { roleId, area: "teams", level: "write", scope: "all", canViewFiles: true, canUploadFiles: true } });
  const folder = await createFolder("rollen", "Rollen", { scope, teamId: kitchenTeamId });
  const file = await prisma.tenantFile.create({ data: { tenantId, teamId: kitchenTeamId, folderSlug: "rollen", folderName: "Rollen", storageKey: `${RUN_ID}/rollen.pdf`, originalName: "rollen.pdf", displayName: "rollen.pdf", extension: "pdf", mimeType: "application/pdf" } });
  await service.updateTenantFolderSettings({ tenantSlug, ownerType: "team", ownerId: kitchenTeamId, path: "rollen", accessRoleIds: [accountingRoleId] });
  currentUserId = clerkUserId;
  const access = await tenantAccess.requireTenantAccess(tenantSlug, "files", "read");
  const storedFolder = await prisma.tenantFileFolder.findUniqueOrThrow({ where: { id: folder.id } });
  expect(fileAccess.ownerFolderPathAllowed(access, [storedFolder], "rollen/unterordner")).toBe(false);
  await expect(fileAccess.requireTenantFileAreaAccess(access, file)).rejects.toThrow("FORBIDDEN");
  await expect(service.renameTenantFile({ tenantSlug, fileId: file.id, name: "Verboten.pdf" })).rejects.toThrow("FORBIDDEN");
  currentUserId = ownerUserId;
  await service.updateTenantFolderSettings({ tenantSlug, ownerType: "team", ownerId: kitchenTeamId, path: "rollen", accessRoleIds: [] });
  currentUserId = clerkUserId;
  await service.renameTenantFile({ tenantSlug, fileId: file.id, name: "Erlaubt.pdf" });
  expect(await prisma.tenantFile.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({ displayName: "Erlaubt.pdf" });
});
