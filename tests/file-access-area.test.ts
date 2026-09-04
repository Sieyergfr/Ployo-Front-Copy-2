import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { requireTenantFileAreaAccess } from "@/lib/file-access";
import { resolveTenantAccessForUser } from "@/lib/tenant-access";

/**
 * Regressionstest für den kritischen Sofortbefund im Sicherheitsaudit
 * (Datenschutz-Sicherheitsaudit-und-Umbauplan.md, Teil 2.1): eine Rolle mit
 * "files: read" (Standard-Scope "all") konnte über die generischen
 * Datei-Ausgabe-Pfade (`getTenantFileSignedUrl`/`getTenantFileContentForUser`)
 * bislang jede Personalakten-/Gehalts-/Krankmeldungsdatei jedes anderen
 * Mitarbeiters abrufen, sobald die Datei-ACL leer war (Standard) — unabhängig
 * vom eigentlich zuständigen Bereich ("payroll"/"sickness") und dessen Scope.
 *
 * Die äußere `fileAccess` wird wie in tests/tenant-access.test.ts über die
 * request-unabhängige `resolveTenantAccessForUser` gebaut. Intern ruft
 * `requireTenantFileAreaAccess` für den Ziel-Bereich aber `requireTenantAccess`
 * auf, das an next/headers()/die echte Session hängt — dafür minimal gemockt,
 * analog zu tests/employee-service.test.ts.
 */

let currentUserId = "";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
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

const RUN_ID = Math.random().toString(36).slice(2);
const tenantSlug = `test-file-area-${RUN_ID}`;

let tenantId: string;
let userAId: string;
let ownerUserId: string;
let payrollFileB: { id: string; employeeId: string | null; locationId: string | null; teamId: string | null; hiddenFromEmployee: boolean };
let sicknessFileB: typeof payrollFileB;
let payrollFileA: typeof payrollFileB;
let hiddenFileA: typeof payrollFileB;

async function createUser(label: string) {
  const user = await prisma.user.create({
    data: {
      email: `file-area-${RUN_ID}-${label}@ployo.invalid`,
      name: `Test ${label}`,
      emailVerified: true,
    },
  });

  return user;
}

function makeFile(overrides: Partial<{ employeeId: string; hiddenFromEmployee: boolean }> = {}) {
  return prisma.tenantFile.create({
    data: {
      tenantId,
      storageKey: `test/${RUN_ID}/${Math.random().toString(36).slice(2)}`,
      originalName: "test.pdf",
      displayName: "test.pdf",
      ...overrides,
    },
    select: { id: true, employeeId: true, locationId: true, teamId: true, hiddenFromEmployee: true },
  });
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `File Area Test ${RUN_ID}` },
  });
  tenantId = tenant.id;

  const owner = await createUser("owner");
  ownerUserId = owner.id;
  const userA = await createUser("employee-a");
  userAId = userA.id;
  const userB = await createUser("employee-b");

  // Rolle wie der Standard "Mitarbeiter": generisches "files:read" (Default-
  // Scope "all", siehe normalizePermissionScope), aber payroll/sickness nur
  // "own" — genau die Konstellation aus dem Audit-Befund.
  const role = await prisma.tenantRole.create({
    data: {
      tenantId,
      key: "mitarbeiter-like",
      name: "Mitarbeiter-artig",
      permissions: {
        create: [
          { area: "files", level: "read" },
          { area: "payroll", level: "read", scope: "own", canViewFiles: true },
          { area: "sickness", level: "read", scope: "own", canViewFiles: true },
          { area: "employees", level: "read", scope: "own", canViewFiles: true },
        ],
      },
    },
  });

  const employeeA = await prisma.tenantEmployee.create({
    data: {
      tenantId,
      key: `employee-a-${RUN_ID}`,
      initials: "EA",
      name: "Employee A",
      employeeNumber: `A-${RUN_ID}`,
      userId: userA.id,
    },
  });

  const employeeB = await prisma.tenantEmployee.create({
    data: {
      tenantId,
      key: `employee-b-${RUN_ID}`,
      initials: "EB",
      name: "Employee B",
      employeeNumber: `B-${RUN_ID}`,
      userId: userB.id,
    },
  });

  await prisma.tenantMembership.createMany({
    data: [
      { tenantId, userId: owner.id, role: "OWNER" },
      { tenantId, userId: userA.id, role: "EMPLOYEE", roleId: role.id },
      { tenantId, userId: userB.id, role: "EMPLOYEE", roleId: role.id },
    ],
  });

  payrollFileB = await makeFile({ employeeId: employeeB.id });
  await prisma.tenantPayrollStatement.create({
    data: {
      tenantId,
      employeeId: employeeB.id,
      fileId: payrollFileB.id,
      period: "Januar 2026",
    },
  });

  sicknessFileB = await makeFile({ employeeId: employeeB.id });
  await prisma.tenantSicknessReport.create({
    data: {
      tenantId,
      employeeId: employeeB.id,
      attachmentFileId: sicknessFileB.id,
      startDate: new Date("2026-01-05"),
    },
  });

  payrollFileA = await makeFile({ employeeId: employeeA.id });
  await prisma.tenantPayrollStatement.create({
    data: {
      tenantId,
      employeeId: employeeA.id,
      fileId: payrollFileA.id,
      period: "Januar 2026",
    },
  });

  hiddenFileA = await makeFile({ employeeId: employeeA.id, hiddenFromEmployee: true });

  // Innere `requireTenantFileAreaAccess`-Prüfung hängt an der (gemockten)
  // Session — alle Tests außer dem Tenant-Manager-Fall agieren als Employee A.
  currentUserId = userAId;
});

afterAll(async () => {
  await prisma.tenant.delete({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, userAId] } } });
  await prisma.$disconnect();
});

describe("requireTenantFileAreaAccess", () => {
  it("blockiert generisches files:read auf die Gehaltsabrechnung eines anderen Mitarbeiters (der kritische Audit-Befund)", async () => {
    const access = await resolveTenantAccessForUser(
      { id: userAId, email: "a@ployo.invalid" },
      tenantSlug,
      "files",
      "read",
    );

    await expect(requireTenantFileAreaAccess(access, payrollFileB)).rejects.toThrow("FORBIDDEN");
  });

  it("blockiert generisches files:read auf die Krankmeldung eines anderen Mitarbeiters", async () => {
    const access = await resolveTenantAccessForUser(
      { id: userAId, email: "a@ployo.invalid" },
      tenantSlug,
      "files",
      "read",
    );

    await expect(requireTenantFileAreaAccess(access, sicknessFileB)).rejects.toThrow("FORBIDDEN");
  });

  it("erlaubt Zugriff auf die eigene Gehaltsabrechnung (payroll:read scope 'own')", async () => {
    const access = await resolveTenantAccessForUser(
      { id: userAId, email: "a@ployo.invalid" },
      tenantSlug,
      "files",
      "read",
    );

    await expect(requireTenantFileAreaAccess(access, payrollFileA)).resolves.toBeUndefined();
  });

  it("blockiert die eigene Datei, wenn sie hiddenFromEmployee ist", async () => {
    const access = await resolveTenantAccessForUser(
      { id: userAId, email: "a@ployo.invalid" },
      tenantSlug,
      "files",
      "read",
    );

    await expect(requireTenantFileAreaAccess(access, hiddenFileA)).rejects.toThrow("FORBIDDEN");
  });

  it("lässt Tenant-Manager (OWNER) jede Datei unabhängig vom Bereich sehen", async () => {
    const access = await resolveTenantAccessForUser(
      { id: ownerUserId, email: "owner@ployo.invalid" },
      tenantSlug,
      "files",
      "read",
    );

    await expect(requireTenantFileAreaAccess(access, payrollFileB)).resolves.toBeUndefined();
  });
});
