import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTenantEmployeeRecord } from "@/lib/employee-service";
import { createTenantSicknessReport } from "@/lib/sickness";
import { getTenantProcessingRegister } from "@/lib/processing-register";

/**
 * Regressionstest für das Verzeichnis von Verarbeitungstätigkeiten
 * (Datenschutz-Umbauplan Phase 3, Batch C): jede Kategorie erscheint nur,
 * wenn sie für den Mandanten tatsächlich zutrifft (echte Nutzung statt
 * generischer Vorlage).
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
const tenantSlug = `test-processing-register-${RUN_ID}`;

let tenantId: string;
let ownerUserId: string;
let linkedUserId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Processing Register Test ${RUN_ID}` },
  });
  tenantId = tenant.id;

  const owner = await prisma.user.create({
    data: { email: `owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
  });
  ownerUserId = owner.id;

  const linkedUser = await prisma.user.create({
    data: { email: `linked-${RUN_ID}@ployo.invalid`, name: "Linked", emailVerified: true },
  });
  linkedUserId = linkedUser.id;

  await prisma.tenantMembership.create({
    data: { tenantId, userId: owner.id, role: "OWNER" },
  });

  currentUserId = ownerUserId;
});

afterAll(async () => {
  const employees = await prisma.tenantEmployee.findMany({
    where: { tenantId },
    select: { privateAddressId: true, workAddressId: true },
  });
  const addressIds = employees
    .flatMap((employee) => [employee.privateAddressId, employee.workAddressId])
    .filter((id): id is string => Boolean(id));

  if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });

  if (addressIds.length) {
    await prisma.employeeAddress.deleteMany({ where: { id: { in: addressIds } } });
  }

  await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, linkedUserId] } } });
  await prisma.$disconnect();
});

describe("getTenantProcessingRegister", () => {
  it("liefert eine leere Liste, solange kein Mitarbeiter existiert", async () => {
    const entries = await getTenantProcessingRegister(tenantSlug);
    expect(entries).toEqual([]);
  });

  it("zeigt Personalstammdaten und Push-Benachrichtigungen, sobald ein Mitarbeiter existiert", async () => {
    const employee = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: { tenantSlug, firstName: "Ada", lastName: "Register" },
    });

    const entries = await getTenantProcessingRegister(tenantSlug);
    const ids = entries.map((entry) => entry.id);

    expect(ids).toContain("personalstammdaten");
    expect(ids).toContain("push-benachrichtigungen");
    expect(ids).not.toContain("gehaltsabrechnung");
    expect(ids).not.toContain("krankmeldungen");
    expect(ids).not.toContain("schichtplanung");
    expect(ids).not.toContain("selbstauskunft");

    return employee;
  });

  it("zeigt Krankmeldungen, sobald eine Krankmeldung erfasst wurde", async () => {
    const employee = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: { tenantSlug, firstName: "Grace", lastName: "Sickness" },
    });

    await createTenantSicknessReport({
      tenantSlug,
      employeeId: employee.dbId!,
      startDate: "2027-01-05",
    });

    const entries = await getTenantProcessingRegister(tenantSlug);
    expect(entries.map((entry) => entry.id)).toContain("krankmeldungen");
  });

  it("zeigt Schichtplanung, sobald eine Schicht angelegt wurde", async () => {
    const employee = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: { tenantSlug, firstName: "Rosa", lastName: "Shift" },
    });

    await prisma.tenantShift.create({
      data: {
        tenantId,
        key: `shift-${RUN_ID}`,
        date: "2027-01-05",
        weekday: "Di",
        startTime: "09:00",
        endTime: "13:00",
        employeeId: employee.dbId,
      },
    });

    const entries = await getTenantProcessingRegister(tenantSlug);
    expect(entries.map((entry) => entry.id)).toContain("schichtplanung");
  });

  it("zeigt Gehaltsabrechnung, sobald eine Abrechnung hochgeladen wurde", async () => {
    const employee = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: { tenantSlug, firstName: "Katherine", lastName: "Payroll" },
    });

    const file = await prisma.tenantFile.create({
      data: {
        tenantId,
        storageKey: `test/${RUN_ID}/payroll-${Math.random().toString(36).slice(2)}`,
        originalName: "abrechnung.pdf",
        displayName: "abrechnung.pdf",
        employeeId: employee.dbId,
      },
    });

    await prisma.tenantPayrollStatement.create({
      data: {
        tenantId,
        employeeId: employee.dbId!,
        fileId: file.id,
        period: "Januar 2027",
      },
    });

    const entries = await getTenantProcessingRegister(tenantSlug);
    expect(entries.map((entry) => entry.id)).toContain("gehaltsabrechnung");
  });

  it("zeigt Selbstauskunft, sobald ein Mitarbeiter mit App-Konto verknüpft ist", async () => {
    await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: { tenantSlug, firstName: "Marie", lastName: "Linked" },
      linkUserId: linkedUserId,
    });

    const entries = await getTenantProcessingRegister(tenantSlug);
    expect(entries.map((entry) => entry.id)).toContain("selbstauskunft");
  });
});
