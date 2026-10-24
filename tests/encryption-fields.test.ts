import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createTenantEmployeeRecord,
  updateTenantEmployee,
} from "@/lib/employee-service";
import { createTenantSicknessReport, updateTenantSicknessReport } from "@/lib/sickness";

/**
 * Regressionstest für die Verschlüsselungs-Erweiterung aus dem
 * Sicherheitsaudit (Teil 3.1): birthDate/birthPlace/nationality/
 * maritalStatus, TenantEmployeeContractDetails.compensation/
 * compensationGross, TenantSicknessReport.note, die Privat-/Arbeitsadresse
 * (jetzt `EmployeeAddress`, eigenes Modell statt der geteilten `Address`-
 * Tabelle, Migration `20260903000000_split_employee_address`) und
 * `emergencyContactsJson` (jetzt `String` statt `Json`) laufen jetzt durch
 * `encryptField`/`decryptField` (lib/encryption.ts), genau wie taxId/iban/
 * socialSecurityNumber/healthInsurance es schon vorher taten.
 *
 * Prüft beide Seiten: (a) in der DB liegt tatsächlich Chiffretext
 * (`enc:v1:`-Präfix), nicht mehr Klartext, und (b) die App-seitigen
 * Rückgabewerte (toEmployee/createTenantSicknessReport/...) sind trotzdem
 * Klartext — ein Missmatch hier hätte entweder die Verschlüsselung wirkungslos
 * gemacht oder Chiffretext an Aufrufer/API-Clients durchgereicht.
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
const tenantSlug = `test-encryption-fields-${RUN_ID}`;

let tenantId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Encryption Fields Test ${RUN_ID}` },
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
  // `EmployeeAddress` wird von TenantEmployee referenziert (nicht umgekehrt)
  // und hat kein `onDelete: Cascade` in diese Richtung — Tenant-Löschung
  // räumt Mitarbeiter aber nicht ihre Adresszeilen mit ab (genau deshalb
  // räumt `deleteTenantEmployee` sie im echten Code explizit auf, siehe
  // lib/employee-service.ts). Ohne diesen Schritt hier bleiben bei jedem
  // Testlauf verwaiste `EmployeeAddress`-Zeilen zurück.
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

  if (actorUserId) await prisma.user.deleteMany({ where: { id: actorUserId } });
  await prisma.$disconnect();
});

describe("TenantEmployee birthDate/birthPlace/nationality/maritalStatus", () => {
  it("liegt verschlüsselt in der DB, kommt aber entschlüsselt aus create/update zurück", async () => {
    const created = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Ada",
        lastName: "Encryption",
        email: `ada-encryption-${RUN_ID}@ployo.invalid`,
        birthDate: "1990-01-01",
        birthPlace: "Berlin",
        nationality: "Deutsch",
        maritalStatus: "ledig",
      },
    });

    expect(created.birthDate).toBe("1990-01-01");
    expect(created.birthPlace).toBe("Berlin");
    expect(created.nationality).toBe("Deutsch");
    expect(created.maritalStatus).toBe("ledig");

    const stored = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: created.dbId },
      select: { birthDate: true, birthPlace: true, nationality: true, maritalStatus: true },
    });
    expect(stored.birthDate).toMatch(/^enc:v1:/);
    expect(stored.birthPlace).toMatch(/^enc:v1:/);
    expect(stored.nationality).toMatch(/^enc:v1:/);
    expect(stored.maritalStatus).toMatch(/^enc:v1:/);
    expect(stored.birthDate).not.toContain("1990-01-01");

    const updated = await updateTenantEmployee({
      tenantSlug,
      employeeId: created.dbId!,
      birthPlace: "Hamburg",
    });

    // Geändertes Feld neu verschlüsselt, unverändertes Feld bleibt über den
    // (entschlüsselten) `currentEmployee`-Fallback erhalten statt zu Klartext-
    // "" zu kollabieren.
    expect(updated.birthPlace).toBe("Hamburg");
    expect(updated.birthDate).toBe("1990-01-01");
    expect(updated.nationality).toBe("Deutsch");

    const storedAfterUpdate = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: created.dbId },
      select: { birthPlace: true, birthDate: true },
    });
    expect(storedAfterUpdate.birthPlace).toMatch(/^enc:v1:/);
    expect(storedAfterUpdate.birthDate).toMatch(/^enc:v1:/);
  });
});

describe("TenantEmployeeContractDetails compensation/compensationGross", () => {
  it("liegt verschlüsselt in der DB, kommt aber entschlüsselt aus dem Update zurück", async () => {
    const created = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Grace",
        lastName: "Compensation",
        email: `grace-compensation-${RUN_ID}@ployo.invalid`,
      },
    });

    const updated = await updateTenantEmployee({
      tenantSlug,
      employeeId: created.dbId!,
      contractDetailsSubmitted: true,
      compensation: "3.500,00 €",
      compensationGross: "4.200,00 €",
    });

    expect(updated.contractDetails.compensation).toBe("3.500,00 €");
    expect(updated.contractDetails.compensationGross).toBe("4.200,00 €");

    const stored = await prisma.tenantEmployeeContractDetails.findFirstOrThrow({
      where: { employee: { id: created.dbId } },
      select: { compensation: true, compensationGross: true },
    });
    expect(stored.compensation).toMatch(/^enc:v1:/);
    expect(stored.compensationGross).toMatch(/^enc:v1:/);
  });
});

describe("TenantSicknessReport.note", () => {
  it("liegt verschlüsselt in der DB, kommt aber entschlüsselt aus create/update zurück", async () => {
    const employee = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Katherine",
        lastName: "Sickness",
        email: `katherine-sickness-${RUN_ID}@ployo.invalid`,
      },
    });

    const report = await createTenantSicknessReport({
      tenantSlug,
      employeeId: employee.dbId!,
      startDate: "2026-02-01",
      note: "Migräne, ärztliches Attest liegt vor",
    });

    expect(report.note).toBe("Migräne, ärztliches Attest liegt vor");

    const stored = await prisma.tenantSicknessReport.findUniqueOrThrow({
      where: { id: report.id },
      select: { note: true },
    });
    expect(stored.note).toMatch(/^enc:v1:/);
    expect(stored.note).not.toContain("Migräne");

    const updated = await updateTenantSicknessReport({
      tenantSlug,
      reportId: report.id,
      startDate: "2026-02-01",
      note: "Migräne, verlängert bis Freitag",
    });

    expect(updated.note).toBe("Migräne, verlängert bis Freitag");

    const storedAfterUpdate = await prisma.tenantSicknessReport.findUniqueOrThrow({
      where: { id: report.id },
      select: { note: true },
    });
    expect(storedAfterUpdate.note).toMatch(/^enc:v1:/);
  });
});

describe("Privat-/Arbeitsadresse (EmployeeAddress)", () => {
  it("liegt verschlüsselt in EmployeeAddress, kommt aber entschlüsselt aus create/update zurück", async () => {
    const created = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Rosalind",
        lastName: "Address",
        email: `rosalind-address-${RUN_ID}@ployo.invalid`,
        privateAddress: {
          street: "Musterstraße",
          houseNumber: "12",
          postalCode: "10115",
          city: "Berlin",
          country: "DE",
        },
      },
    });

    expect(created.privateAddressFields?.street).toBe("Musterstraße");
    expect(created.privateAddressFields?.city).toBe("Berlin");
    expect(created.privateAddress).toContain("Berlin");

    const storedEmployee = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: created.dbId },
      select: { privateAddressId: true },
    });
    const storedAddress = await prisma.employeeAddress.findUniqueOrThrow({
      where: { id: storedEmployee.privateAddressId! },
      select: { street: true, city: true },
    });
    expect(storedAddress.street).toMatch(/^enc:v1:/);
    expect(storedAddress.city).toMatch(/^enc:v1:/);
    expect(storedAddress.street).not.toContain("Musterstraße");

    const updated = await updateTenantEmployee({
      tenantSlug,
      employeeId: created.dbId!,
      privateAddress: {
        street: "Musterstraße",
        houseNumber: "12",
        postalCode: "10117",
        city: "Berlin Mitte",
        country: "DE",
      },
    });

    expect(updated.privateAddressFields?.city).toBe("Berlin Mitte");
    expect(updated.privateAddressFields?.postalCode).toBe("10117");

    const storedAfterUpdate = await prisma.employeeAddress.findUniqueOrThrow({
      where: { id: storedEmployee.privateAddressId! },
      select: { city: true },
    });
    expect(storedAfterUpdate.city).toMatch(/^enc:v1:/);
  });

  it("bewahrt die Adresse über ein Update hinweg, das sie nicht mitschickt", async () => {
    const created = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Alan",
        lastName: "AddressPreserve",
        email: `alan-address-preserve-${RUN_ID}@ployo.invalid`,
        privateAddress: { street: "Bahnhofstraße", houseNumber: "1", postalCode: "80331", city: "München", country: "DE" },
      },
    });

    // Update, das die Adresse nicht anfasst — darf die vorhandene
    // (verschlüsselte) Adresse nicht kaputt-normalisieren (siehe Fund beim
    // Umbau: der alte Fallback nutzte den rohen, verschlüsselten Datensatz
    // statt der entschlüsselten Felder).
    const updated = await updateTenantEmployee({
      tenantSlug,
      employeeId: created.dbId!,
      phone: "+49 89 1234567",
    });

    expect(updated.privateAddressFields?.street).toBe("Bahnhofstraße");
    expect(updated.privateAddressFields?.city).toBe("München");
    expect(updated.phone).toBe("+49 89 1234567");
  });
});

describe("emergencyContactsJson (String-Spalte statt Json)", () => {
  it("liegt verschlüsselt in der DB, kommt aber als entschlüsseltes Array zurück", async () => {
    const created = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Marie",
        lastName: "EmergencyContact",
        email: `marie-emergency-${RUN_ID}@ployo.invalid`,
      },
    });

    const updated = await updateTenantEmployee({
      tenantSlug,
      employeeId: created.dbId!,
      emergencyContacts: [
        { id: "temp-id", name: "Pierre Curie", relation: "Ehepartner", phone: "+49 30 1111111" },
      ],
    });

    expect(updated.emergencyContacts).toHaveLength(1);
    expect(updated.emergencyContacts[0]).toMatchObject({
      name: "Pierre Curie",
      relation: "Ehepartner",
      phone: "+49 30 1111111",
    });

    const stored = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: created.dbId },
      select: { emergencyContactsJson: true },
    });
    expect(typeof stored.emergencyContactsJson).toBe("string");
    expect(stored.emergencyContactsJson).toMatch(/^enc:v1:/);
    expect(stored.emergencyContactsJson).not.toContain("Pierre Curie");
  });
});
