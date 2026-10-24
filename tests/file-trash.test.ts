import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { buildRolePermissionCreateData, permissionRoles } from "@/lib/roles";
import {
  createTenantFileFolder,
  listTenantFileDeletions,
  restoreTenantFileDeletion,
  softDeleteTenantFile,
  softDeleteTenantFileFolder,
} from "@/lib/storage/storage.service";

/**
 * Löschen von Dateien/Ordnern mit 24-h-Rückgängig (lib/file-trash.ts):
 * Ordner samt Inhalt als eine Löschung, Liste "Kürzlich gelöscht",
 * Wiederherstellen, Frist, Sperren (Aufbewahrungsfrist, Berechtigung).
 */

let actorUserId: string;

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
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
const tenantSlug = `test-file-trash-${RUN_ID}`;

let tenantId: string;
let ownerUserId: string;
let employeeUserId: string;
let employeeId: string;

async function createFile(input: { folderSlug: string; name: string; employeeId?: string }) {
  return prisma.tenantFile.create({
    data: {
      tenantId,
      employeeId: input.employeeId,
      storageKey: `tests/${RUN_ID}/${Math.random().toString(36).slice(2)}`,
      originalName: input.name,
      displayName: input.name,
      folderSlug: input.folderSlug,
      folderName: input.folderSlug.split("/").pop() ?? "",
    },
  });
}

async function statusOf(id: string) {
  return (await prisma.tenantFile.findUniqueOrThrow({ where: { id } })).status;
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `File Trash Test ${RUN_ID}` },
  });
  tenantId = tenant.id;

  const owner = await prisma.user.create({
    data: { email: `trash-owner-${RUN_ID}@ployo.invalid`, name: "Test Actor", emailVerified: true },
  });
  ownerUserId = owner.id;
  actorUserId = owner.id;
  await prisma.tenantMembership.create({ data: { tenantId, userId: owner.id, role: "OWNER" } });

  const employeeTemplate = permissionRoles.find((role) => role.key === "employee")!;
  const employeeRole = await prisma.tenantRole.create({
    data: {
      tenantId,
      key: employeeTemplate.key,
      name: employeeTemplate.name,
      isSystem: true,
      permissions: { create: buildRolePermissionCreateData(employeeTemplate) },
    },
  });
  const employeeUser = await prisma.user.create({
    data: { email: `trash-employee-${RUN_ID}@ployo.invalid`, name: "Mitarbeiter", emailVerified: true },
  });
  employeeUserId = employeeUser.id;
  await prisma.tenantMembership.create({
    data: { tenantId, userId: employeeUser.id, role: "EMPLOYEE", roleId: employeeRole.id },
  });

  const employee = await prisma.tenantEmployee.create({
    data: { tenantId, key: `emp-${RUN_ID}`, initials: "EM", name: "Emma Muster", employeeNumber: `emp-${RUN_ID}` },
  });
  employeeId = employee.id;
});

afterAll(async () => {
  if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
  const userIds = [ownerUserId, employeeUserId].filter(Boolean);
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("Ordner löschen und wiederherstellen", () => {
  it("löscht Ordner, Unterordner und alle Dateien darin als eine Löschung und stellt sie vollständig wieder her", async () => {
    actorUserId = ownerUserId;
    const parent = await createTenantFileFolder({ tenantSlug, name: `Projekt ${RUN_ID}` });
    const child = await createTenantFileFolder({ tenantSlug, name: "Unterlagen", parentPath: parent.path });
    const direct = await createFile({ folderSlug: parent.path, name: "direkt.pdf" });
    const nested = await createFile({ folderSlug: child.path, name: "tief.pdf" });
    const outside = await createFile({ folderSlug: "", name: "draussen.pdf" });

    const deletion = await softDeleteTenantFileFolder({ tenantSlug, path: parent.path });

    expect(deletion).toMatchObject({ kind: "folder", name: `Projekt ${RUN_ID}`, fileCount: 2, folderCount: 2 });
    expect(new Date(deletion.restorableUntil).getTime() - Date.now()).toBeGreaterThan(23 * 3600 * 1000);
    expect(await statusOf(direct.id)).toBe("deleted");
    expect(await statusOf(nested.id)).toBe("deleted");
    expect(await statusOf(outside.id)).toBe("active");
    const folders = await prisma.tenantFileFolder.findMany({ where: { id: { in: [parent.id, child.id] } } });
    expect(folders.every((folder) => folder.status === "inactive" && folder.deletionBatchId === deletion.batchId)).toBe(true);

    const entries = await listTenantFileDeletions({ tenantSlug });
    const entry = entries.find((item) => item.batchId === deletion.batchId);
    expect(entry).toMatchObject({ kind: "folder", name: `Projekt ${RUN_ID}`, fileCount: 2, folderCount: 2, deletedByName: "Test Actor" });

    const restored = await restoreTenantFileDeletion({ tenantSlug, batchId: deletion.batchId });
    expect(restored).toMatchObject({ kind: "folder", fileCount: 2, folderCount: 2 });
    expect(await statusOf(direct.id)).toBe("active");
    expect(await statusOf(nested.id)).toBe("active");
    const after = await prisma.tenantFileFolder.findMany({ where: { id: { in: [parent.id, child.id] } } });
    expect(after.every((folder) => folder.status === "active" && folder.deletionBatchId === null && folder.deletedAt === null)).toBe(true);
    expect((await listTenantFileDeletions({ tenantSlug })).some((item) => item.batchId === deletion.batchId)).toBe(false);
  });

  it("legt für einen nur über Dateien existierenden Ordner einen Datensatz an, damit er als Ordner gelistet wird", async () => {
    actorUserId = ownerUserId;
    const path = `nur-dateien-${RUN_ID}`;
    const file = await createFile({ folderSlug: path, name: "a.pdf" });

    const deletion = await softDeleteTenantFileFolder({ tenantSlug, path });

    expect(deletion).toMatchObject({ kind: "folder", fileCount: 1, folderCount: 1 });
    expect(await statusOf(file.id)).toBe("deleted");
    const entry = (await listTenantFileDeletions({ tenantSlug })).find((item) => item.batchId === deletion.batchId);
    expect(entry?.kind).toBe("folder");
  });

  it("löscht in der Ablage eines Mitarbeiters nur dessen Dateien, nicht gleichnamige zentrale", async () => {
    actorUserId = ownerUserId;
    const path = `geteilt-${RUN_ID}`;
    const own = await createFile({ folderSlug: path, name: "mitarbeiter.pdf", employeeId });
    const central = await createFile({ folderSlug: path, name: "zentral.pdf" });

    const deletion = await softDeleteTenantFileFolder({ tenantSlug, ownerType: "employee", ownerId: employeeId, path });

    expect(deletion.fileCount).toBe(1);
    expect(await statusOf(own.id)).toBe("deleted");
    expect(await statusOf(central.id)).toBe("active");
    expect((await listTenantFileDeletions({ tenantSlug, ownerType: "employee", ownerId: employeeId })).map((item) => item.batchId)).toContain(deletion.batchId);
    expect((await listTenantFileDeletions({ tenantSlug })).map((item) => item.batchId)).not.toContain(deletion.batchId);
  });

  it("verweigert das Löschen komplett, wenn eine Datei einer Aufbewahrungsfrist unterliegt", async () => {
    actorUserId = ownerUserId;
    const path = `abrechnungen-${RUN_ID}`;
    const free = await createFile({ folderSlug: path, name: "notiz.pdf", employeeId });
    const payslip = await createFile({ folderSlug: path, name: "lohn.pdf", employeeId });
    await prisma.tenantPayrollStatement.create({
      data: { tenantId, employeeId, fileId: payslip.id, period: "September 2026" },
    });

    await expect(
      softDeleteTenantFileFolder({ tenantSlug, ownerType: "employee", ownerId: employeeId, path }),
    ).rejects.toThrow(/^Ordner kann nicht gelöscht werden — „lohn\.pdf“: Löschung gesperrt/);
    expect(await statusOf(free.id)).toBe("active");
    expect(await statusOf(payslip.id)).toBe("active");
  });

  it("verweigert Nutzern ohne Löschrecht Löschen, Liste und Wiederherstellen", async () => {
    actorUserId = ownerUserId;
    const path = `kein-recht-${RUN_ID}`;
    const file = await createFile({ folderSlug: path, name: "x.pdf" });
    const deletion = await softDeleteTenantFileFolder({ tenantSlug, path });
    await restoreTenantFileDeletion({ tenantSlug, batchId: deletion.batchId });

    actorUserId = employeeUserId;
    await expect(softDeleteTenantFileFolder({ tenantSlug, path })).rejects.toThrow("FORBIDDEN");
    await expect(softDeleteTenantFile({ tenantSlug, fileId: file.id })).rejects.toThrow("FORBIDDEN");
    await expect(listTenantFileDeletions({ tenantSlug })).rejects.toThrow("FORBIDDEN");
    await expect(restoreTenantFileDeletion({ tenantSlug, batchId: deletion.batchId })).rejects.toThrow("FORBIDDEN");
    expect(await statusOf(file.id)).toBe("active");
    actorUserId = ownerUserId;
  });

  it("lässt sich nach Ablauf der 24 Stunden nicht mehr wiederherstellen und taucht nicht mehr in der Liste auf", async () => {
    actorUserId = ownerUserId;
    const path = `abgelaufen-${RUN_ID}`;
    await createFile({ folderSlug: path, name: "alt.pdf" });
    const deletion = await softDeleteTenantFileFolder({ tenantSlug, path });
    const expired = new Date(Date.now() - 25 * 3600 * 1000);
    await prisma.tenantFile.updateMany({ where: { deletionBatchId: deletion.batchId }, data: { deletedAt: expired } });
    await prisma.tenantFileFolder.updateMany({ where: { deletionBatchId: deletion.batchId }, data: { deletedAt: expired } });

    expect((await listTenantFileDeletions({ tenantSlug })).map((item) => item.batchId)).not.toContain(deletion.batchId);
    await expect(restoreTenantFileDeletion({ tenantSlug, batchId: deletion.batchId })).rejects.toThrow(
      "Die 24-Stunden-Frist zum Wiederherstellen ist abgelaufen.",
    );
  });

  it("stellt eine einzelne Datei nicht in einen separat gelöschten Ordner zurück", async () => {
    actorUserId = ownerUserId;
    const folder = await createTenantFileFolder({ tenantSlug, name: `Kette ${RUN_ID}` });
    const file = await createFile({ folderSlug: folder.path, name: "einzeln.pdf" });
    await createFile({ folderSlug: folder.path, name: "bleibt.pdf" });

    const fileDeletion = await softDeleteTenantFile({ tenantSlug, fileId: file.id });
    expect(fileDeletion.deletionBatchId).toBeTruthy();
    const folderDeletion = await softDeleteTenantFileFolder({ tenantSlug, path: folder.path });
    expect(folderDeletion.fileCount).toBe(1);

    await expect(
      restoreTenantFileDeletion({ tenantSlug, batchId: fileDeletion.deletionBatchId! }),
    ).rejects.toThrow(`Bitte zuerst den Ordner „Kette ${RUN_ID}“ wiederherstellen.`);

    await restoreTenantFileDeletion({ tenantSlug, batchId: folderDeletion.batchId });
    await restoreTenantFileDeletion({ tenantSlug, batchId: fileDeletion.deletionBatchId! });
    expect(await statusOf(file.id)).toBe("active");
  });

  it("belebt beim Neuanlegen unter gleichem Namen den gelöschten Ordner ohne alte Lösch-Kennung wieder", async () => {
    actorUserId = ownerUserId;
    const name = `Neu ${RUN_ID}`;
    const folder = await createTenantFileFolder({ tenantSlug, name });
    const deletion = await softDeleteTenantFileFolder({ tenantSlug, path: folder.path });

    const revived = await createTenantFileFolder({ tenantSlug, name });

    expect(revived.id).toBe(folder.id);
    expect(revived).toMatchObject({ status: "active", deletionBatchId: null, deletedAt: null });
    await expect(restoreTenantFileDeletion({ tenantSlug, batchId: deletion.batchId })).rejects.toThrow(/nicht gefunden/);
  });
});

describe("Einzelne Datei löschen", () => {
  it("liefert Lösch-Kennung und Frist und erscheint als Datei in „Kürzlich gelöscht“", async () => {
    actorUserId = ownerUserId;
    const file = await createFile({ folderSlug: "", name: `einzeln-${RUN_ID}.pdf` });

    const deleted = await softDeleteTenantFile({ tenantSlug, fileId: file.id });

    expect(deleted.status).toBe("deleted");
    expect(deleted.deletedByName).toBe("Test Actor");
    expect(new Date(deleted.restorableUntil).getTime()).toBeGreaterThan(Date.now());
    const entry = (await listTenantFileDeletions({ tenantSlug })).find((item) => item.batchId === deleted.deletionBatchId);
    expect(entry).toMatchObject({ kind: "file", name: `einzeln-${RUN_ID}.pdf`, fileCount: 1, folderCount: 0, path: "" });

    await restoreTenantFileDeletion({ tenantSlug, batchId: deleted.deletionBatchId! });
    expect(await statusOf(file.id)).toBe("active");
  });
});
