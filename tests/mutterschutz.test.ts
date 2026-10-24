import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { decryptField } from "@/lib/encryption";
import {
  createTenantEmployee,
  createTenantEmployeeRecord,
  updateTenantEmployee,
} from "@/lib/employee-service";
import { createTenantShift, updateTenantShift } from "@/lib/shift-service";

/**
 * Regressionstest für die Mutterschutz-Kennzeichnung (Datenschutz-Umbauplan
 * Phase 3, Batch B): eigener Berechtigungsbereich "mutterschutz" (nicht Teil
 * von "sensitiveData"), verschlüsselte Notiz, und ein hartes
 * Schichtplan-Verbot für Nacht-/Sonntagsschichten (§ 5/§ 6 MuSchG), analog
 * zum bestehenden JArbSchG-Verbot (siehe tests/arbzg-rules.test.ts).
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
const tenantSlug = `test-mutterschutz-${RUN_ID}`;

let tenantId: string;
let ownerUserId: string;
let hrUserId: string;
let plainEmployeeUserId: string;
let userIds: string[];

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Mutterschutz Test ${RUN_ID}` },
  });
  tenantId = tenant.id;

  const owner = await prisma.user.create({
    data: { email: `owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
  });
  ownerUserId = owner.id;

  const hrUser = await prisma.user.create({
    data: { email: `hr-${RUN_ID}@ployo.invalid`, name: "HR", emailVerified: true },
  });
  hrUserId = hrUser.id;

  const plainUser = await prisma.user.create({
    data: { email: `plain-${RUN_ID}@ployo.invalid`, name: "Plain", emailVerified: true },
  });
  plainEmployeeUserId = plainUser.id;
  userIds = [ownerUserId, hrUserId, plainEmployeeUserId];

  // "hr-like": darf Mitarbeiter anlegen/bearbeiten UND Mutterschutz setzen.
  const hrLikeRole = await prisma.tenantRole.create({
    data: {
      tenantId,
      key: "hr-like",
      name: "HR-artig",
      permissions: {
        create: [
          { area: "employees", level: "write", scope: "all" },
          { area: "mutterschutz", level: "write", scope: "all" },
        ],
      },
    },
  });

  // "plain-employees": darf Mitarbeiter anlegen/bearbeiten, aber KEIN
  // Mutterschutz — genau die Konstellation, die die neue Berechtigung
  // von "sensitiveData" abgrenzen soll (z. B. Lohnbuchhaltung).
  const plainRole = await prisma.tenantRole.create({
    data: {
      tenantId,
      key: "plain-employees",
      name: "Nur Mitarbeiterverwaltung",
      permissions: {
        create: [{ area: "employees", level: "write", scope: "all" }],
      },
    },
  });

  await prisma.tenantMembership.createMany({
    data: [
      { tenantId, userId: owner.id, role: "OWNER" },
      { tenantId, userId: hrUser.id, role: "EMPLOYEE", roleId: hrLikeRole.id },
      { tenantId, userId: plainUser.id, role: "EMPLOYEE", roleId: plainRole.id },
    ],
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

  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("maternityProtectionNote — Verschlüsselung", () => {
  it("liegt verschlüsselt in der DB, kommt aber entschlüsselt zurück", async () => {
    const created = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Marie",
        lastName: "Mutterschutz",
        email: `marie-mutterschutz-${RUN_ID}@ployo.invalid`,
        maternityProtectionActive: true,
        maternityProtectionNote: "Schutzfrist bis ca. 15.03.2027",
      },
    });

    expect(created.maternityProtectionActive).toBe(true);
    expect(created.maternityProtectionNote).toBe("Schutzfrist bis ca. 15.03.2027");

    const stored = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: created.dbId },
      select: { maternityProtectionActive: true, maternityProtectionNote: true },
    });
    expect(stored.maternityProtectionActive).toBe(true);
    expect(stored.maternityProtectionNote).toMatch(/^enc:v1:/);
    expect(stored.maternityProtectionNote).not.toContain("15.03.2027");
  });
});

describe("Berechtigungs-Gating — eigener Bereich \"mutterschutz\"", () => {
  it("streicht das Feld beim Anlegen, wenn nur employees:write vorliegt (kein mutterschutz)", async () => {
    currentUserId = plainEmployeeUserId;

    const employee = await createTenantEmployee({
      tenantSlug,
      firstName: "Ada",
      lastName: "OhneRecht",
      email: `ada-ohne-recht-${RUN_ID}@ployo.invalid`,
      maternityProtectionActive: true,
      maternityProtectionNote: "sollte nicht ankommen",
    });

    expect(employee.maternityProtectionActive).toBe(false);
    expect(employee.maternityProtectionNote).toBe("");
  });

  it("übernimmt das Feld beim Anlegen, wenn mutterschutz:write vorliegt", async () => {
    currentUserId = hrUserId;

    const employee = await createTenantEmployee({
      tenantSlug,
      firstName: "Grace",
      lastName: "MitRecht",
      email: `grace-mit-recht-${RUN_ID}@ployo.invalid`,
      maternityProtectionActive: true,
      maternityProtectionNote: "Schutzfrist bis ca. 01.06.2027",
    });

    expect(employee.maternityProtectionActive).toBe(true);
    expect(employee.maternityProtectionNote).toBe("Schutzfrist bis ca. 01.06.2027");
  });

  it("ignoriert eine Änderung beim Update ohne mutterschutz-Recht, statt den bestehenden Wert zu löschen", async () => {
    currentUserId = hrUserId;
    const created = await createTenantEmployee({
      tenantSlug,
      firstName: "Rosa",
      lastName: "UpdateSchutz",
      email: `rosa-update-schutz-${RUN_ID}@ployo.invalid`,
      maternityProtectionActive: true,
      maternityProtectionNote: "aktiv",
    });

    currentUserId = plainEmployeeUserId;
    const updated = await updateTenantEmployee({
      tenantSlug,
      employeeId: created.dbId!,
      maternityProtectionActive: false,
      maternityProtectionNote: "versuchter Reset",
      phone: "+49 30 9999999",
    });

    // Kein mutterschutz-Recht -> die Antwort blendet das Feld aus (Audit-
    // Finding H04, siehe tests/security-audit-critical.test.ts), andere
    // Felder des selben Updates greifen trotzdem ganz normal.
    expect(updated.maternityProtectionActive).toBe(false);
    expect(updated.maternityProtectionNote).toBe("");
    expect(updated.phone).toBe("+49 30 9999999");

    // Der bestehende Wert selbst wurde durch den Reset-Versuch NICHT
    // gelöscht — nachweisbar über den ungekürzten DB-Stand.
    const stored = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: created.dbId! },
      select: { maternityProtectionActive: true, maternityProtectionNote: true },
    });
    expect(stored.maternityProtectionActive).toBe(true);
    expect(decryptField(stored.maternityProtectionNote)).toBe("aktiv");
  });
});

describe("Schichtplan-Block bei aktivem Mutterschutz (§ 5/§ 6 MuSchG)", () => {
  it("blockiert eine Nachtschicht (20-6 Uhr) beim Anlegen", async () => {
    currentUserId = ownerUserId;
    const employee = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Nacht",
        lastName: "Schutz",
        email: `nacht-schutz-${RUN_ID}@ployo.invalid`,
        maternityProtectionActive: true,
      },
    });

    await expect(
      createTenantShift({
        tenantSlug,
        date: "2027-04-06", // Dienstag
        startTime: "21:00",
        endTime: "23:00",
        breakMinutes: 0,
        employeeId: employee.dbId!,
      }),
    ).rejects.toThrow(/MuSchG/);
  });

  it("blockiert eine Sonntagsschicht beim Anlegen", async () => {
    const employee = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Sonntag",
        lastName: "Schutz",
        email: `sonntag-schutz-${RUN_ID}@ployo.invalid`,
        maternityProtectionActive: true,
      },
    });

    await expect(
      createTenantShift({
        tenantSlug,
        date: "2027-04-11", // Sonntag
        startTime: "09:00",
        endTime: "13:00",
        breakMinutes: 0,
        employeeId: employee.dbId!,
      }),
    ).rejects.toThrow(/MuSchG/);
  });

  it("erlaubt eine normale Werktagsschicht trotz aktivem Mutterschutz", async () => {
    const employee = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Normal",
        lastName: "Schutz",
        email: `normal-schutz-${RUN_ID}@ployo.invalid`,
        maternityProtectionActive: true,
      },
    });

    const shift = await createTenantShift({
      tenantSlug,
      date: "2027-04-06", // Dienstag
      startTime: "09:00",
      endTime: "13:00",
      breakMinutes: 0,
      employeeId: employee.dbId!,
    });

    expect(shift.employeeId).toBe(employee.dbId);
  });

  it("blockiert das nachträgliche Verschieben einer bestehenden Schicht auf einen Sonntag", async () => {
    const employee = await createTenantEmployeeRecord({
      tenantId,
      actorId: "test-actor",
      actorName: "Test Actor",
      input: {
        tenantSlug,
        firstName: "Verschoben",
        lastName: "Schutz",
        email: `verschoben-schutz-${RUN_ID}@ployo.invalid`,
        maternityProtectionActive: true,
      },
    });

    const shift = await createTenantShift({
      tenantSlug,
      date: "2027-04-06", // Dienstag
      startTime: "09:00",
      endTime: "13:00",
      breakMinutes: 0,
      employeeId: employee.dbId!,
    });

    await expect(
      updateTenantShift({
        tenantSlug,
        shiftId: shift.id,
        date: "2027-04-11", // Sonntag
        startTime: "09:00",
        endTime: "13:00",
        breakMinutes: 0,
        employeeId: employee.dbId!,
      }),
    ).rejects.toThrow(/MuSchG/);
  });
});
