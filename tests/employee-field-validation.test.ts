import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTenantEmployeeRecord } from "@/lib/employee-service";
import { createTenantLocation } from "@/lib/location-service";
import { createTenantShift } from "@/lib/shift-service";

/**
 * Integrationstest für QA-Bug BUG-008: keines der Felder IBAN, Steuer-ID,
 * Telefon, PLZ oder Pausenzeit wurde bisher validiert — offensichtlich
 * fehlerhafte Werte ("DE00 1234" als IBAN, "123" als Steuer-ID, "abc!!" als
 * Telefon, 600 Min. Pause bei einer 60-Min.-Schicht) wurden klaglos
 * gespeichert.
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
const tenantSlug = `test-field-validation-${RUN_ID}`;

let tenantId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Field Validation Test ${RUN_ID}` },
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
});

afterAll(async () => {
  const employees = await prisma.tenantEmployee.findMany({
    where: { tenantId },
    select: { privateAddressId: true, workAddressId: true },
  });
  const addressIds = employees
    .flatMap((employee) => [employee.privateAddressId, employee.workAddressId])
    .filter((id): id is string => Boolean(id));

  await prisma.tenant.deleteMany({ where: { id: tenantId } });

  if (addressIds.length) {
    await prisma.employeeAddress.deleteMany({ where: { id: { in: addressIds } } });
  }

  await prisma.user.deleteMany({ where: { id: actorUserId } });
  await prisma.$disconnect();
});

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantSlug,
    firstName: "Test",
    lastName: `Person-${Math.random().toString(36).slice(2)}`,
    email: `${Math.random().toString(36).slice(2)}@ployo.invalid`,
    ...overrides,
  };
}

describe("createTenantEmployeeRecord — Feldvalidierung (BUG-008)", () => {
  it("lehnt eine IBAN mit falscher Prüfsumme ab, akzeptiert eine gültige", async () => {
    await expect(
      createTenantEmployeeRecord({
        tenantId,
        actorId: "test-actor",
        actorName: "Test Actor",
        input: baseInput({ iban: "DE00 1234" }),
      }),
    ).rejects.toThrow(/gültige IBAN/);

    await expect(
      createTenantEmployeeRecord({
        tenantId,
        actorId: "test-actor",
        actorName: "Test Actor",
        input: baseInput({ iban: "DE89 3704 0044 0532 0130 00" }),
      }),
    ).resolves.toBeTruthy();
  });

  it("lehnt eine zu kurze Steuer-ID ab, akzeptiert eine gültige 11-stellige", async () => {
    await expect(
      createTenantEmployeeRecord({
        tenantId,
        actorId: "test-actor",
        actorName: "Test Actor",
        input: baseInput({ taxId: "123" }),
      }),
    ).rejects.toThrow(/Steuer-Identifikationsnummer/);

    await expect(
      createTenantEmployeeRecord({
        tenantId,
        actorId: "test-actor",
        actorName: "Test Actor",
        input: baseInput({ taxId: "12345678910" }),
      }),
    ).resolves.toBeTruthy();
  });

  it("lehnt eine Telefonnummer mit Buchstaben/Sonderzeichen ab", async () => {
    await expect(
      createTenantEmployeeRecord({
        tenantId,
        actorId: "test-actor",
        actorName: "Test Actor",
        input: baseInput({ phone: "abc!!" }),
      }),
    ).rejects.toThrow(/gültige Telefonnummer/);

    await expect(
      createTenantEmployeeRecord({
        tenantId,
        actorId: "test-actor",
        actorName: "Test Actor",
        input: baseInput({ phone: "+49 30 1234567" }),
      }),
    ).resolves.toBeTruthy();
  });

  it("lehnt eine ungültige deutsche PLZ ab", async () => {
    await expect(
      createTenantEmployeeRecord({
        tenantId,
        actorId: "test-actor",
        actorName: "Test Actor",
        input: baseInput({
          address: {
            street: "Teststraße",
            houseNumber: "1",
            postalCode: "ABCDEFG",
            city: "Berlin",
            country: "DE",
          },
        }),
      }),
    ).rejects.toThrow(/gültige deutsche Postleitzahl/);
  });

  it("lehnt einen ca. 250 Zeichen langen Namen ab", async () => {
    await expect(
      createTenantEmployeeRecord({
        tenantId,
        actorId: "test-actor",
        actorName: "Test Actor",
        input: baseInput({ firstName: "A".repeat(250), lastName: "" }),
      }),
    ).rejects.toThrow(/höchstens/);
  });
});

describe("createTenantLocation — PLZ-Validierung (BUG-008)", () => {
  it("lehnt eine ungültige deutsche PLZ beim Standort ab", async () => {
    await expect(
      createTenantLocation({
        tenantSlug,
        name: `Standort ${RUN_ID}`,
        kind: "Filiale",
        status: "active",
        email: "",
        accentClassName: "bg-[#C9622A]",
        address: {
          street: "Teststraße",
          houseNumber: "1",
          postalCode: "XXXXX",
          city: "Berlin",
          country: "DE",
        },
      }),
    ).rejects.toThrow(/gültige deutsche Postleitzahl/);
  });
});

describe("createTenantShift — Pause vs. Schichtdauer (BUG-008)", () => {
  it("lehnt eine Pause ab, die länger ist als die Schicht selbst", async () => {
    const employee = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: baseInput(),
    });

    await expect(
      createTenantShift({
        tenantSlug,
        date: "2027-01-04",
        startTime: "09:00",
        endTime: "10:00",
        breakMinutes: 600,
        employeeId: employee.dbId!,
      }),
    ).rejects.toThrow(/darf nicht länger sein als die Schicht selbst/);
  });
});
