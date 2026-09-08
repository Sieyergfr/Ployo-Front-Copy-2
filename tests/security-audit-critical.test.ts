import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTenantForOwner } from "@/lib/tenants";
import { acceptInvitationForUser } from "@/lib/invitation-service";
import {
  createTenantEmployeeRecord,
  deleteEmployeeAccess,
  deleteTenantEmployee,
  getEmployeesForTenant,
  updateTenantEmployee,
} from "@/lib/employee-service";
import {
  createTenantShift,
  getISOWeekFromDate,
  getShiftFormOptions,
  publishShiftWeek,
  resetShiftWeekToPublished,
  unpublishShiftWeek,
  updateTenantShift,
} from "@/lib/shift-service";
import { createTenantInvitation, updateTenantSecurity } from "@/lib/settings-service";
import { sharesTenantWith } from "@/lib/tenant-access";
import { buildTenantExport } from "@/lib/tenant-export";
import { deleteTenantTeam, updateTenantTeam } from "@/lib/team-service";
import { updateTenantLocation } from "@/lib/location-service";
import { createTenantReminder, updateTenantReminder } from "@/lib/reminders";
import {
  getTenantFileSignedUrl,
  setTenantFileEmployeeVisibility,
  softDeleteTenantFile,
  uploadTenantFile,
  uploadTenantFileVersion,
} from "@/lib/storage/storage.service";
import { hashFolderPin, isFolderUnlocked, markFolderUnlocked } from "@/lib/folder-pin";
import {
  createTenantVacationRequest,
  runVacationCarryoverRollover,
  setTenantVacationRequestStatus,
  updateTenantVacationRequest,
} from "@/lib/vacation-service";
import { purgeTenantFiles } from "@/lib/storage/delete";
import { createTenantSicknessReport, getSicknessForTenant } from "@/lib/sickness";
import { getOwnerFiles, getReminderFileBrowserData } from "@/lib/files-server";
import { calculateVacationWorkDays, parseVacationWorkDays } from "@/lib/vacations";
import {
  anonymizeFormerEmployeePii,
  deleteEmployeeDataByCategory,
  getDeletionEligibilityForEmployee,
  purgeExpiredConsentRecords,
} from "@/lib/retention-service";
import { deleteUserAccessImmediately } from "@/lib/account-service";
import { unlinkAndCleanupBeforeUserDeletion } from "@/lib/user-deletion-lifecycle";
import { getAuditLogsForEntity, recordTenantAudit } from "@/lib/audit";
import { getMyPersonalakteExport, uploadMyDocument } from "@/lib/self-service";
import { encryptField } from "@/lib/encryption";
import { isStaleEvent } from "@/lib/stripe/webhook-idempotency";

/**
 * Regressionstests für kritische und hochpriore Befunde aus dem
 * Sicherheitsaudit ("Ployo Sicherheitsaudit", 73cb68f8-cfb8-4f65-b61d-0a5642ee40fd):
 *
 * - C01: unvollständiges Rollen-Template bei der Einladungsannahme
 *   (Scope/Fähigkeiten fielen auf den Prisma-Feld-Default statt das
 *   Template — siehe `buildRolePermissionCreateData` in lib/roles.ts).
 * - C02: `deleteEmployeeAccess` löschte global statt nur mandantenscopiert.
 * - C03: `updateTenantShift` prüfte eine fremde `locationId` nicht gegen den
 *   Mandanten (im Gegensatz zu `createTenantShift`).
 * - H01: das freie "Berechtigungsrolle"-Feld auf der Personalakte konnte
 *   ohne `roles`-Recht die echte `TenantMembership.roleId` hochstufen.
 * - H02: `settings:write` allein konnte ADMIN/HR einladen und den
 *   vollständigen Mandanten-Export inkl. sensibler Daten ohne die jeweilige
 *   Fachberechtigung erhalten.
 * - H03: ein Zusatzfilter (Standort) konnte den Own-Scope einer Mitarbeiter-
 *   liste überschreiben statt ihn nur einzuschränken; ein Team-Scope ohne
 *   eigene Teamzuordnung zeigte fälschlich alle nicht zugeordneten Kollegen.
 * - H04: create/updateTenantEmployee lieferten sensible Felder (Steuer-ID,
 *   IBAN, Mutterschutz, …) in der Antwort immer entschlüsselt zurück, auch
 *   ohne die jeweilige Leseberechtigung.
 * - H05: mehrere Mutationsservices (Teams, Standorte, Mitarbeiter-Löschung,
 *   Schicht-Zuweisung, Erinnerungen) prüften den tenantweiten Level, aber
 *   nicht den Objektscope des jeweiligen Zielobjekts.
 * - H06: Datei-Version-Upload, Soft-Delete und Sichtbarkeitswechsel prüften
 *   nur "files:write" plus Tenant, nicht ACL, Eigentümer-Fachscope oder
 *   Ordner-PIN.
 * - H07: eine neue Dateiversion übernahm ACL/hiddenFromEmployee/documentType
 *   nicht vom Wurzeldokument und ließ Vertrags-/Abrechnungsverknüpfungen auf
 *   der alten, ersetzten Version stehen.
 * - H08: eine als .pdf benannte Datei mit tatsächlichem HTML-Inhalt (oder
 *   einem clientseitig frei wählbaren MIME-Typ) wurde unverändert
 *   gespeichert und später mit diesem MIME-Typ ausgeliefert.
 * - H09: der Ordner-Freischalt-Cookie akzeptierte ein vom Client frei
 *   erzeugtes Klartext-JSON, ohne User oder Ablaufzeit zu prüfen.
 * - H10: über den eigenen Urlaubsantrag ließ sich selbst entscheiden; eine
 *   Datumsänderung an einem bereits entschiedenen Antrag behielt dessen
 *   Genehmigungsstatus; zwei parallele Entscheidungen konnten beide durchgehen.
 * - H11: ein fehlgeschlagenes S3-Löschen wurde nur geloggt, der DB-Verweis
 *   danach trotzdem entfernt — das S3-Objekt blieb dauerhaft verwaist.
 * - H12: deleteTenantEmployee/softDeleteTenantFile prüften weder Legal Hold
 *   noch laufende gesetzliche Aufbewahrungsfristen, obwohl der gezielte
 *   Kategorien-Löschantrag das bereits korrekt tat.
 * - H14: Krankheits-Konfliktbenachrichtigungen gingen an jeden
 *   Schicht-Schreibberechtigten im Mandanten, unabhängig von dessen Team-
 *   Scope und ohne sickness:read für den konkreten Krankheitsbezug zu prüfen.
 * - H15: getOwnerFiles prüfte den Objektscope der übergebenen employeeId
 *   nicht und filterte Metadaten (auch von getReminderFileBrowserData) nicht
 *   nach dem fachlichen Bereich (payroll/contracts/sickness/employeeFiles);
 *   getShiftFormOptions lieferte die Mitarbeiterliste unabhängig vom
 *   shifts-Scope des Aufrufers.
 */

let currentUserId = "";
// In-Memory-Cookie-Jar für den Ordner-Freischalt-Cookie (siehe H09-Test) —
// standardmäßig leer, d. h. "noch nie freigeschaltet" (siehe H06-PIN-Test).
let unlockCookieJar: Record<string, string> = {};

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) =>
      unlockCookieJar[name] !== undefined ? { value: unlockCookieJar[name] } : undefined,
    set: (name: string, value: string) => {
      unlockCookieJar[name] = value;
    },
  }),
}));

// Reine Persistenz-/Autorisierungslogik testen, ohne echtes S3/ClamAV zu
// benötigen (siehe H07-Test) — matcht das bestehende Muster dieses Audits,
// keine echten Upload-/Netzwerk-Aufrufe auszuführen.
vi.mock("@/lib/storage/upload", () => ({
  uploadObject: async () => ({ bucket: "test-bucket", key: "test-key", provider: "s3" as const }),
}));

// Simuliertes S3 für den H11-Test: Schlüssel mit "fail-me" schlagen mit einem
// echten Fehler fehl, "notfound-me" simuliert ein bereits gelöschtes Objekt
// (NoSuchKey), alles andere löscht "erfolgreich".
vi.mock("@/lib/storage/client", () => ({
  getStorageClient: () => ({
    send: async (command: { input?: { Key?: string } }) => {
      const key = command?.input?.Key ?? "";

      if (key.includes("fail-me")) {
        const error = new Error("Simulierter S3-Fehler") as Error & {
          name: string;
          $metadata: { httpStatusCode: number };
        };
        error.name = "InternalError";
        error.$metadata = { httpStatusCode: 500 };
        throw error;
      }

      if (key.includes("notfound-me")) {
        const error = new Error("NoSuchKey") as Error & { name: string };
        error.name = "NoSuchKey";
        throw error;
      }

      return {};
    },
  }),
}));

// Für den H14-Test: echte Zustellung (E-Mail/Push/DB) abschneiden, nur die
// tatsächlich aufgerufenen Empfänger/Nachrichten einsammeln.
const dispatchedNotifications: Array<{
  userId: string;
  message: { key: string; reason?: string; redactReason?: boolean; days?: number };
}> = [];

vi.mock("@/lib/notifications/dispatch", () => ({
  dispatchNotification: async (event: {
    userId: string;
    message: { key: string; reason?: string; redactReason?: boolean; days?: number };
  }) => {
    dispatchedNotifications.push({ userId: event.userId, message: event.message });
  },
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

const tenantIds: string[] = [];
const userIds: string[] = [];

afterAll(async () => {
  const employees = await prisma.tenantEmployee.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { privateAddressId: true, workAddressId: true },
  });
  const addressIds = employees
    .flatMap((employee) => [employee.privateAddressId, employee.workAddressId])
    .filter((id): id is string => Boolean(id));

  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });

  if (addressIds.length) {
    await prisma.employeeAddress.deleteMany({ where: { id: { in: addressIds } } });
  }

  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("C01 — Rollen-Template vollständig (Scope/Fähigkeiten statt Prisma-Default)", () => {
  it("createTenantForOwner: die 'employee'-Systemrolle hat sofort die Template-Scopes, nicht den scope-Default 'all'", async () => {
    const owner = await prisma.user.create({
      data: { email: `c01a-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    const tenant = await createTenantForOwner({
      name: `C01a Test ${RUN_ID}`,
      userId: owner.id,
    });
    tenantIds.push(tenant.id);

    const employeeRole = await prisma.tenantRole.findFirstOrThrow({
      where: { tenantId: tenant.id, key: "employee" },
      include: { permissions: true },
    });

    const byArea = new Map(employeeRole.permissions.map((p) => [p.area, p]));

    expect(byArea.get("sensitiveData")?.scope).toBe("own");
    expect(byArea.get("sensitiveData")?.canDelete).toBe(false);
    expect(byArea.get("employees")?.scope).toBe("team");
    expect(byArea.get("contracts")?.scope).toBe("own");
    expect(byArea.get("payroll")?.scope).toBe("own");
  });

  it("Einladungsannahme auf einem Tenant ohne vorab gesäte Rollen: die neu angelegte 'employee'-Rolle hat ebenfalls die Template-Scopes", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `c01b-tenant-${RUN_ID}`, name: `C01b Test ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const invitee = await prisma.user.create({
      data: { email: `c01b-invitee-${RUN_ID}@ployo.invalid`, name: "Invitee", emailVerified: true },
    });
    userIds.push(invitee.id);

    const invitation = await prisma.tenantInvitation.create({
      data: {
        tenantId: tenant.id,
        email: invitee.email,
        role: "EMPLOYEE",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const preExisting = await prisma.tenantRole.count({
      where: { tenantId: tenant.id, key: "employee" },
    });
    expect(preExisting).toBe(0);

    const result = await acceptInvitationForUser(invitation.token, {
      id: invitee.id,
      email: invitee.email,
      name: "Invitee",
    });

    expect(result.ok).toBe(true);

    const employeeRole = await prisma.tenantRole.findFirstOrThrow({
      where: { tenantId: tenant.id, key: "employee" },
      include: { permissions: true },
    });

    const byArea = new Map(employeeRole.permissions.map((p) => [p.area, p]));

    expect(byArea.get("sensitiveData")?.scope).toBe("own");
    expect(byArea.get("sensitiveData")?.canDelete).toBe(false);
    expect(byArea.get("employees")?.scope).toBe("team");
    expect(byArea.get("contracts")?.scope).toBe("own");
  });
});

describe("C02 — Zugangs-Entzug bleibt mandantenscopiert", () => {
  it("deleteEmployeeAccess löscht nur die Membership DIESES Mandanten, nicht den globalen Account oder Membership/Employee im anderen Mandanten", async () => {
    const tenantA = await prisma.tenant.create({
      data: { slug: `c02-tenant-a-${RUN_ID}`, name: `C02 Tenant A ${RUN_ID}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { slug: `c02-tenant-b-${RUN_ID}`, name: `C02 Tenant B ${RUN_ID}` },
    });
    tenantIds.push(tenantA.id, tenantB.id);

    const owner = await prisma.user.create({
      data: { email: `c02-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const shared = await prisma.user.create({
      data: { email: `c02-shared-${RUN_ID}@ployo.invalid`, name: "Shared", emailVerified: true },
    });
    userIds.push(owner.id, shared.id);

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenantA.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenantA.id, userId: shared.id, role: "EMPLOYEE" },
        { tenantId: tenantB.id, userId: shared.id, role: "EMPLOYEE" },
      ],
    });

    currentUserId = owner.id;

    const employeeA = await createTenantEmployeeRecord({
      tenantId: tenantA.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenantA.slug,
        firstName: "Shared",
        lastName: "InA",
        email: `c02-shared-in-a-${RUN_ID}@ployo.invalid`,
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: employeeA.dbId! },
      data: { userId: shared.id },
    });

    const employeeB = await createTenantEmployeeRecord({
      tenantId: tenantB.id,
      actorId: shared.id,
      actorName: "Shared",
      input: {
        tenantSlug: tenantB.slug,
        firstName: "Shared",
        lastName: "InB",
        email: `c02-shared-in-b-${RUN_ID}@ployo.invalid`,
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: employeeB.dbId! },
      data: { userId: shared.id },
    });

    await deleteEmployeeAccess({ tenantSlug: tenantA.slug, employeeId: employeeA.dbId! });

    const userStillExists = await prisma.user.findUnique({ where: { id: shared.id } });
    expect(userStillExists).not.toBeNull();

    const membershipA = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenantA.id, userId: shared.id } },
    });
    expect(membershipA).toBeNull();

    const membershipB = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenantB.id, userId: shared.id } },
    });
    expect(membershipB).not.toBeNull();

    const employeeAAfter = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: employeeA.dbId! },
      select: { userId: true },
    });
    expect(employeeAAfter.userId).toBeNull();

    const employeeBAfter = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: employeeB.dbId! },
      select: { userId: true },
    });
    expect(employeeBAfter.userId).toBe(shared.id);
  });

  it("R01 — deleteEmployeeAccess darf den letzten OWNER eines Mandanten nicht entziehen", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `r01-tenant-${RUN_ID}`, name: `R01 Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const soleOwner = await prisma.user.create({
      data: { email: `r01-owner-${RUN_ID}@ployo.invalid`, name: "Sole Owner", emailVerified: true },
    });
    const hr = await prisma.user.create({
      data: { email: `r01-hr-${RUN_ID}@ployo.invalid`, name: "HR", emailVerified: true },
    });
    const secondOwner = await prisma.user.create({
      data: { email: `r01-owner2-${RUN_ID}@ployo.invalid`, name: "Second Owner", emailVerified: true },
    });
    userIds.push(soleOwner.id, hr.id, secondOwner.id);

    const hrRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "hr-manager",
        name: "HR-Verwaltung",
        permissions: {
          create: [{ area: "employees", level: "write", scope: "all" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: soleOwner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: hr.id, role: "EMPLOYEE", roleId: hrRole.id },
      ],
    });

    currentUserId = soleOwner.id;
    const ownerEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: soleOwner.id,
      actorName: "Sole Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Sole",
        lastName: "Owner",
        email: `r01-owner-emp-${RUN_ID}@ployo.invalid`,
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: ownerEmployee.dbId! },
      data: { userId: soleOwner.id },
    });

    // Ein Actor mit bloßem employees:write darf den einzigen Owner nicht
    // entziehen — sonst bliebe der Mandant ohne Owner zurück (Audit-Finding
    // R01).
    currentUserId = hr.id;
    await expect(
      deleteEmployeeAccess({ tenantSlug: tenant.slug, employeeId: ownerEmployee.dbId! }),
    ).rejects.toThrow();

    const membershipStillThere = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: soleOwner.id } },
    });
    expect(membershipStillThere).not.toBeNull();
    expect(membershipStillThere?.role).toBe("OWNER");

    // Kontrolle: ein normaler (Nicht-Owner-)Mitarbeiter lässt sich weiterhin
    // ganz regulär entziehen.
    currentUserId = soleOwner.id;
    const regularEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: soleOwner.id,
      actorName: "Sole Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Regular",
        lastName: "Staff",
        email: `r01-regular-emp-${RUN_ID}@ployo.invalid`,
      },
    });
    const regularUser = await prisma.user.create({
      data: { email: `r01-regular-${RUN_ID}@ployo.invalid`, name: "Regular", emailVerified: true },
    });
    userIds.push(regularUser.id);
    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: regularUser.id, role: "EMPLOYEE" },
    });
    await prisma.tenantEmployee.update({
      where: { id: regularEmployee.dbId! },
      data: { userId: regularUser.id },
    });

    currentUserId = hr.id;
    await deleteEmployeeAccess({ tenantSlug: tenant.slug, employeeId: regularEmployee.dbId! });
    const regularMembershipAfter = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: regularUser.id } },
    });
    expect(regularMembershipAfter).toBeNull();

    // Owner-Membership blieb durch den zweiten (regulären) Entzug unberührt.
    const ownerMembershipUnaffected = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: soleOwner.id } },
    });
    expect(ownerMembershipUnaffected).not.toBeNull();

    // Kontrolle: gibt es einen zweiten Owner, darf der erste sehr wohl
    // entzogen werden.
    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: secondOwner.id, role: "OWNER" },
    });
    currentUserId = hr.id;
    await deleteEmployeeAccess({ tenantSlug: tenant.slug, employeeId: ownerEmployee.dbId! });
    const soleOwnerMembershipAfter = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: soleOwner.id } },
    });
    expect(soleOwnerMembershipAfter).toBeNull();
  });
});

describe("C03 — updateTenantShift lehnt eine fremde locationId ab", () => {
  it("weist eine Standort-ID aus einem anderen Mandanten zurück und lässt die gespeicherte locationId unverändert", async () => {
    const tenantA = await prisma.tenant.create({
      data: { slug: `c03-tenant-a-${RUN_ID}`, name: `C03 Tenant A ${RUN_ID}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { slug: `c03-tenant-b-${RUN_ID}`, name: `C03 Tenant B ${RUN_ID}` },
    });
    tenantIds.push(tenantA.id, tenantB.id);

    const owner = await prisma.user.create({
      data: { email: `c03-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenantA.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;

    const locationA = await prisma.tenantLocation.create({
      data: { tenantId: tenantA.id, key: "standort-a", kind: "office", name: "Standort A" },
    });
    const locationB = await prisma.tenantLocation.create({
      data: { tenantId: tenantB.id, key: "standort-b", kind: "office", name: "Standort B" },
    });

    const shift = await createTenantShift({
      tenantSlug: tenantA.slug,
      date: "2027-04-06",
      startTime: "09:00",
      endTime: "13:00",
      breakMinutes: 0,
      locationId: locationA.id,
    });

    await expect(
      updateTenantShift({
        tenantSlug: tenantA.slug,
        shiftId: shift.id,
        date: "2027-04-06",
        startTime: "09:00",
        endTime: "13:00",
        breakMinutes: 0,
        locationId: locationB.id,
      }),
    ).rejects.toThrow("Standort nicht gefunden.");

    const shiftAfter = await prisma.tenantShift.findUniqueOrThrow({
      where: { id: shift.id },
      select: { locationId: true },
    });
    expect(shiftAfter.locationId).toBe(locationA.id);
  });
});

describe("H01 — Berechtigungsrolle über die Personalakte nur mit roles:write", () => {
  it("employees:write/own ohne roles-Recht ändert über das Job-Titel-Feld nicht die echte Berechtigungsrolle", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h01-tenant-${RUN_ID}`, name: `H01 Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h01-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const attacker = await prisma.user.create({
      data: { email: `h01-attacker-${RUN_ID}@ployo.invalid`, name: "Attacker", emailVerified: true },
    });
    userIds.push(owner.id, attacker.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    // Custom-Rolle: darf die eigene Akte bearbeiten (employees:write/own),
    // aber keine Rollen verwalten (kein roles-Recht) — genau die
    // Konstellation aus H01.
    const profileEditorRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "profile-editor",
        name: "Profil-Bearbeiter",
        permissions: {
          create: [{ area: "employees", level: "write", scope: "own" }],
        },
      },
    });

    // Hochprivilegierte Zielrolle, deren Name über das Job-Titel-Feld
    // eingetragen werden könnte.
    const adminRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "super-admin",
        name: "Super Admin Rolle",
        permissions: {
          create: [
            { area: "roles", level: "admin", scope: "all" },
            { area: "employees", level: "admin", scope: "all" },
          ],
        },
      },
    });

    await prisma.tenantMembership.create({
      data: {
        tenantId: tenant.id,
        userId: attacker.id,
        role: "EMPLOYEE",
        roleId: profileEditorRole.id,
      },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Attacker",
        lastName: "Profile",
        email: `h01-attacker-${RUN_ID}@ployo.invalid`,
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: employee.dbId! },
      data: { userId: attacker.id },
    });

    // Angriff: der Angreifer bearbeitet die EIGENE Akte und trägt den Namen
    // der hochprivilegierten Rolle als "Berechtigungsrolle" ein.
    currentUserId = attacker.id;
    const updated = await updateTenantEmployee({
      tenantSlug: tenant.slug,
      employeeId: employee.dbId!,
      role: "Super Admin Rolle",
      phone: "+49 30 1234567",
    });

    // Das Job-Titel-Feld selbst ist reine Anzeige und darf sich ändern...
    expect(updated.role).toBe("Super Admin Rolle");
    expect(updated.phone).toBe("+49 30 1234567");

    // ...die tatsächliche Berechtigungsrolle bleibt aber unverändert.
    const membershipAfterAttack = await prisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: tenant.id, userId: attacker.id } },
      select: { roleId: true },
    });
    expect(membershipAfterAttack.roleId).toBe(profileEditorRole.id);
    expect(membershipAfterAttack.roleId).not.toBe(adminRole.id);

    // Kontrolle: ein Aufrufer MIT roles:write (hier: OWNER, Legacy-Rolle)
    // kann dieselbe Zuweisung weiterhin ganz regulär über das Feld vornehmen.
    currentUserId = owner.id;
    await updateTenantEmployee({
      tenantSlug: tenant.slug,
      employeeId: employee.dbId!,
      role: "Super Admin Rolle",
    });

    const membershipAfterOwnerEdit = await prisma.tenantMembership.findUniqueOrThrow({
      where: { tenantId_userId: { tenantId: tenant.id, userId: attacker.id } },
      select: { roleId: true },
    });
    expect(membershipAfterOwnerEdit.roleId).toBe(adminRole.id);
  });
});

describe("H02 — settings:write vergibt keine höheren Rechte, als es selbst hat", () => {
  it("Custom-Rolle mit settings:write ohne OWNER/ADMIN kann keine ADMIN/HR-Einladung aussprechen", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h02a-tenant-${RUN_ID}`, name: `H02a Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h02a-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const attacker = await prisma.user.create({
      data: { email: `h02a-attacker-${RUN_ID}@ployo.invalid`, name: "Attacker", emailVerified: true },
    });
    userIds.push(owner.id, attacker.id);

    const settingsManagerRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "settings-manager",
        name: "Einstellungen-Verwalter",
        permissions: {
          create: [{ area: "settings", level: "write", scope: "all" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        {
          tenantId: tenant.id,
          userId: attacker.id,
          role: "EMPLOYEE",
          roleId: settingsManagerRole.id,
        },
      ],
    });

    currentUserId = attacker.id;
    const downgraded = await createTenantInvitation({
      tenantSlug: tenant.slug,
      email: `h02a-victim-${RUN_ID}@ployo.invalid`,
      role: "ADMIN",
    });
    expect(downgraded.role).toBe("EMPLOYEE");

    currentUserId = owner.id;
    const asOwner = await createTenantInvitation({
      tenantSlug: tenant.slug,
      email: `h02a-victim2-${RUN_ID}@ployo.invalid`,
      role: "ADMIN",
    });
    expect(asOwner.role).toBe("ADMIN");
  });

  it("Voll-Export blendet sensible Daten/Verträge/Abrechnungen/Krankmeldungen ohne die jeweilige Fachberechtigung aus", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h02b-tenant-${RUN_ID}`, name: `H02b Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h02b-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const attacker = await prisma.user.create({
      data: { email: `h02b-attacker-${RUN_ID}@ployo.invalid`, name: "Attacker", emailVerified: true },
    });
    userIds.push(owner.id, attacker.id);

    const settingsManagerRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "settings-manager",
        name: "Einstellungen-Verwalter",
        permissions: {
          create: [{ area: "settings", level: "write", scope: "all" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        {
          tenantId: tenant.id,
          userId: attacker.id,
          role: "EMPLOYEE",
          roleId: settingsManagerRole.id,
        },
      ],
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Max",
        lastName: "Muster",
        email: `h02b-emp-${RUN_ID}@ployo.invalid`,
        taxId: "DE123456789",
        iban: "DE1234000000000000",
        birthDate: "1990-01-01",
      },
    });

    const payrollFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        storageKey: `h02b-payroll-${RUN_ID}`,
        originalName: "lohn-januar.pdf",
        displayName: "Lohn Januar",
      },
    });
    const contractFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        storageKey: `h02b-contract-${RUN_ID}`,
        originalName: "arbeitsvertrag.pdf",
        displayName: "Arbeitsvertrag",
      },
    });
    await prisma.tenantPayrollStatement.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        period: "2027-01",
        gross: "3000",
        net: "2200",
        fileId: payrollFile.id,
      },
    });
    await prisma.tenantEmployeeContract.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        fileId: contractFile.id,
        title: "Arbeitsvertrag",
        startDate: "2027-01-01",
      },
    });
    await prisma.tenantSicknessReport.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        startDate: new Date("2027-02-01"),
        note: "Migräne",
      },
    });

    currentUserId = attacker.id;
    const restrictedExport = await buildTenantExport(tenant.slug);
    const restrictedEmployee = restrictedExport.employees.find(
      (e) => e.id === employee.dbId,
    );
    expect(restrictedEmployee?.taxId).toBe("•••");
    expect(restrictedEmployee?.iban).toBe("•••");
    expect(restrictedEmployee?.birthDate).toBe("•••");
    expect(restrictedExport.payrollStatements).toHaveLength(0);
    expect(restrictedExport.contracts).toHaveLength(0);
    expect(restrictedExport.sicknessReports).toHaveLength(0);
    expect(restrictedExport.hinweis).toContain("ausgeblendet");

    currentUserId = owner.id;
    const fullExport = await buildTenantExport(tenant.slug);
    const fullEmployee = fullExport.employees.find((e) => e.id === employee.dbId);
    expect(fullEmployee?.taxId).toBe("DE123456789");
    expect(fullEmployee?.iban).toBe("DE1234000000000000");
    expect(fullExport.payrollStatements).toHaveLength(1);
    expect(fullExport.contracts).toHaveLength(1);
    expect(fullExport.sicknessReports).toHaveLength(1);
  });

  it("R03 — payroll:read/own und sensitiveData:read/team im Voll-Export exportieren exakt die freigegebene Teilmenge, nicht den ganzen Mandanten", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h02c-tenant-${RUN_ID}`, name: `H02c Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h02c-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const caller = await prisma.user.create({
      data: { email: `h02c-caller-${RUN_ID}@ployo.invalid`, name: "Caller", emailVerified: true },
    });
    userIds.push(owner.id, caller.id);

    // settings:write (nötig für requireSettingsManager) + payroll:read/own +
    // sensitiveData:read/team in EINER Rolle — genau die Kombination, die vor
    // R03 wie payroll:all/sensitiveData:all behandelt wurde.
    const scopedRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "scoped-exporter",
        name: "Scoped-Exporter",
        permissions: {
          create: [
            { area: "settings", level: "write", scope: "all" },
            { area: "payroll", level: "read", scope: "own" },
            { area: "sensitiveData", level: "read", scope: "team" },
          ],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: caller.id, role: "EMPLOYEE", roleId: scopedRole.id },
      ],
    });

    await prisma.tenantTeam.createMany({
      data: [
        { tenantId: tenant.id, key: `h02c-team-a-${RUN_ID}`, name: "Team A" },
        { tenantId: tenant.id, key: `h02c-team-b-${RUN_ID}`, name: "Team B" },
      ],
    });

    currentUserId = owner.id;
    const callerEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Caller",
        lastName: "Self",
        email: `h02c-caller-emp-${RUN_ID}@ployo.invalid`,
        team: "Team A",
        taxId: "DE000000001",
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: callerEmployee.dbId! },
      data: { userId: caller.id },
    });

    const teammate = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Team",
        lastName: "Mate",
        email: `h02c-teammate-${RUN_ID}@ployo.invalid`,
        team: "Team A",
        taxId: "DE000000002",
      },
    });

    const outsider = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Other",
        lastName: "Team",
        email: `h02c-outsider-${RUN_ID}@ployo.invalid`,
        team: "Team B",
        taxId: "DE000000003",
      },
    });

    for (const emp of [callerEmployee, teammate, outsider]) {
      const payrollFile = await prisma.tenantFile.create({
        data: {
          tenantId: tenant.id,
          storageKey: `h02c-payroll-${emp.dbId}-${RUN_ID}`,
          originalName: "lohn.pdf",
          displayName: "Lohn",
        },
      });
      await prisma.tenantPayrollStatement.create({
        data: {
          tenantId: tenant.id,
          employeeId: emp.dbId!,
          period: "2027-01",
          gross: "3000",
          net: "2200",
          fileId: payrollFile.id,
        },
      });
    }

    currentUserId = caller.id;
    const scopedExport = await buildTenantExport(tenant.slug);

    // payroll:read/own — ausschließlich die eigene Abrechnung, nicht die von
    // Teammitglied oder fremdem Team.
    expect(scopedExport.payrollStatements).toHaveLength(1);
    expect(scopedExport.payrollStatements[0]?.employeeId).toBe(callerEmployee.dbId);

    // sensitiveData:read/team — eigene und Team-A-Kollegin entschlüsselt,
    // Team B redigiert. Die Roster-Zeile selbst bleibt für alle sichtbar.
    const callerRow = scopedExport.employees.find((e) => e.id === callerEmployee.dbId);
    const teammateRow = scopedExport.employees.find((e) => e.id === teammate.dbId);
    const outsiderRow = scopedExport.employees.find((e) => e.id === outsider.dbId);
    expect(callerRow?.taxId).toBe("DE000000001");
    expect(teammateRow?.taxId).toBe("DE000000002");
    expect(outsiderRow?.taxId).toBe("•••");
    expect(scopedExport.hinweis).toContain("Gehaltsabrechnungen");
  });
});

describe("H03 — Scope-Filter werden nicht durch Zusatzfilter oder leeres Team aufgeweicht", () => {
  it("Own-Scope + Standortfilter liefert ausschließlich den eigenen Datensatz", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h03a-tenant-${RUN_ID}`, name: `H03a Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h03a-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const selfUser = await prisma.user.create({
      data: { email: `h03a-self-${RUN_ID}@ployo.invalid`, name: "Self", emailVerified: true },
    });
    userIds.push(owner.id, selfUser.id);

    const ownViewerRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "own-viewer",
        name: "Own-Viewer",
        permissions: {
          create: [{ area: "employees", level: "read", scope: "own" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: selfUser.id, role: "EMPLOYEE", roleId: ownViewerRole.id },
      ],
    });

    await prisma.tenantLocation.create({
      data: { tenantId: tenant.id, key: "standort-a", kind: "office", name: "Standort A" },
    });

    currentUserId = owner.id;
    const selfEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Self",
        lastName: "Viewer",
        email: `h03a-self-emp-${RUN_ID}@ployo.invalid`,
        locations: ["Standort A"],
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: selfEmployee.dbId! },
      data: { userId: selfUser.id },
    });

    await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Colleague",
        lastName: "Other",
        email: `h03a-colleague-${RUN_ID}@ployo.invalid`,
        locations: ["Standort A"],
      },
    });

    currentUserId = selfUser.id;
    const list = await getEmployeesForTenant(tenant.slug, { location: "Standort A" });

    expect(list).not.toBeNull();
    expect(list!.map((employee) => employee.dbId)).toEqual([selfEmployee.dbId]);
  });

  it("Team-Scope ohne eigene Teamzuordnung liefert keine Treffer, auch wenn andere Mitarbeiter ebenfalls kein Team haben", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h03b-tenant-${RUN_ID}`, name: `H03b Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h03b-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const teamUser = await prisma.user.create({
      data: { email: `h03b-team-${RUN_ID}@ployo.invalid`, name: "TeamViewer", emailVerified: true },
    });
    userIds.push(owner.id, teamUser.id);

    const teamViewerRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "team-viewer",
        name: "Team-Viewer",
        permissions: {
          create: [{ area: "employees", level: "read", scope: "team" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: teamUser.id, role: "EMPLOYEE", roleId: teamViewerRole.id },
      ],
    });

    currentUserId = owner.id;
    // Beide Mitarbeiter bleiben ohne Team (team bleibt der Default-Leerstring).
    const teamViewerEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Team",
        lastName: "Viewer",
        email: `h03b-team-emp-${RUN_ID}@ployo.invalid`,
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: teamViewerEmployee.dbId! },
      data: { userId: teamUser.id },
    });

    await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Unassigned",
        lastName: "Colleague",
        email: `h03b-colleague-${RUN_ID}@ployo.invalid`,
      },
    });

    currentUserId = teamUser.id;
    const list = await getEmployeesForTenant(tenant.slug);

    expect(list).not.toBeNull();
    expect(list).toEqual([]);
  });
});

describe("H04 — Create-/Update-Antwort blendet sensible Felder ohne Leserecht aus", () => {
  it("updateTenantEmployee liefert bei fehlendem sensitiveData-/mutterschutz-Recht dieselben redigierten Felder wie GET", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h04-tenant-${RUN_ID}`, name: `H04 Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h04-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const editorUser = await prisma.user.create({
      data: { email: `h04-editor-${RUN_ID}@ployo.invalid`, name: "Editor", emailVerified: true },
    });
    userIds.push(owner.id, editorUser.id);

    // Darf Mitarbeiter mandantenweit bearbeiten, aber weder sensible
    // Stammdaten noch Mutterschutz lesen.
    const editorRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "profile-editor-h04",
        name: "Profil-Editor",
        permissions: {
          create: [{ area: "employees", level: "write", scope: "all" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: editorUser.id, role: "EMPLOYEE", roleId: editorRole.id },
      ],
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Jane",
        lastName: "Doe",
        email: `h04-emp-${RUN_ID}@ployo.invalid`,
        taxId: "DE999888777",
        iban: "DE1111000000000000",
        maternityProtectionActive: true,
        maternityProtectionNote: "Schutzfrist aktiv",
      },
    });

    currentUserId = editorUser.id;
    const updated = await updateTenantEmployee({
      tenantSlug: tenant.slug,
      employeeId: employee.dbId!,
      phone: "+49 30 5551234",
    });

    // Harmloses Feld greift ganz normal ...
    expect(updated.phone).toBe("+49 30 5551234");
    // ... die sensiblen Felder sind aber redigiert, exakt wie beim GET.
    expect(updated.taxId).toBe("•••");
    expect(updated.iban).toBe("•••");
    expect(updated.maternityProtectionActive).toBe(false);
    expect(updated.maternityProtectionNote).toBe("");

    // Kontrolle: der Owner sieht in derselben Antwort weiterhin alles.
    currentUserId = owner.id;
    const asOwner = await updateTenantEmployee({
      tenantSlug: tenant.slug,
      employeeId: employee.dbId!,
      phone: "+49 30 5551234",
    });
    expect(asOwner.taxId).toBe("DE999888777");
    expect(asOwner.iban).toBe("DE1111000000000000");
    expect(asOwner.maternityProtectionActive).toBe(true);
    expect(asOwner.maternityProtectionNote).toBe("Schutzfrist aktiv");
  });
});

describe("H05 — Mutationsservices erzwingen den Objektscope des Zielobjekts", () => {
  it("assigned-Team-Scope: updateTenantTeam/deleteTenantTeam lehnen ein fremdes Team ab", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h05a-tenant-${RUN_ID}`, name: `H05a Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h05a-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const leadUser = await prisma.user.create({
      data: { email: `h05a-lead-${RUN_ID}@ployo.invalid`, name: "Lead", emailVerified: true },
    });
    userIds.push(owner.id, leadUser.id);

    const teamLeadRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "team-lead-h05",
        name: "Team-Lead",
        permissions: {
          create: [{ area: "teams", level: "write", scope: "assigned", canDelete: true }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: leadUser.id, role: "EMPLOYEE", roleId: teamLeadRole.id },
      ],
    });

    currentUserId = owner.id;
    const leadEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Lead",
        lastName: "Person",
        email: `h05a-lead-emp-${RUN_ID}@ployo.invalid`,
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: leadEmployee.dbId! },
      data: { userId: leadUser.id },
    });

    const teamA = await prisma.tenantTeam.create({
      data: { tenantId: tenant.id, key: "team-a-h05", name: "Team A" },
    });
    const teamB = await prisma.tenantTeam.create({
      data: { tenantId: tenant.id, key: "team-b-h05", name: "Team B" },
    });

    await prisma.tenantTeamMember.create({
      data: {
        teamId: teamA.id,
        employeeId: leadEmployee.dbId!,
        initials: "LP",
        name: "Lead Person",
        location: "",
        role: "",
        contract: "",
      },
    });

    currentUserId = leadUser.id;

    await expect(
      updateTenantTeam({
        tenantSlug: tenant.slug,
        teamId: teamB.id,
        name: "Fremdes Team umbenannt",
        locations: [],
        colorClassName: "bg-[#C9622A]",
      }),
    ).rejects.toThrow("FORBIDDEN");

    const updatedOwn = await updateTenantTeam({
      tenantSlug: tenant.slug,
      teamId: teamA.id,
      name: "Team A neu",
      locations: [],
      colorClassName: "bg-[#C9622A]",
    });
    expect(updatedOwn.name).toBe("Team A neu");

    await expect(
      deleteTenantTeam({ tenantSlug: tenant.slug, teamId: teamB.id }),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("assigned-Standort-Scope: updateTenantLocation lehnt einen fremden Standort ab", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h05b-tenant-${RUN_ID}`, name: `H05b Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h05b-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const managerUser = await prisma.user.create({
      data: { email: `h05b-manager-${RUN_ID}@ployo.invalid`, name: "Manager", emailVerified: true },
    });
    userIds.push(owner.id, managerUser.id);

    const locationManagerRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "location-manager-h05",
        name: "Standort-Verwalter",
        permissions: {
          create: [{ area: "locations", level: "write", scope: "assigned" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        {
          tenantId: tenant.id,
          userId: managerUser.id,
          role: "EMPLOYEE",
          roleId: locationManagerRole.id,
        },
      ],
    });

    currentUserId = owner.id;
    const managerEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Standort",
        lastName: "Manager",
        email: `h05b-manager-emp-${RUN_ID}@ployo.invalid`,
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: managerEmployee.dbId! },
      data: { userId: managerUser.id },
    });

    const locationA = await prisma.tenantLocation.create({
      data: { tenantId: tenant.id, key: "standort-a-h05", kind: "office", name: "Standort A" },
    });
    const locationB = await prisma.tenantLocation.create({
      data: { tenantId: tenant.id, key: "standort-b-h05", kind: "office", name: "Standort B" },
    });

    await prisma.tenantLocationMember.create({
      data: { locationId: locationA.id, employeeId: managerEmployee.dbId!, initials: "SM", name: "Standort Manager" },
    });

    currentUserId = managerUser.id;

    await expect(
      updateTenantLocation({
        tenantSlug: tenant.slug,
        locationId: locationB.id,
        name: "Fremder Standort",
        kind: "Filiale",
        address: { street: "Teststr.", houseNumber: "1", postalCode: "12345", city: "Berlin" },
        status: "active",
        accentClassName: "bg-ink",
      }),
    ).rejects.toThrow("FORBIDDEN");

    const updated = await updateTenantLocation({
      tenantSlug: tenant.slug,
      locationId: locationA.id,
      name: "Standort A neu",
      kind: "Filiale",
      address: { street: "Teststr.", houseNumber: "1", postalCode: "12345", city: "Berlin" },
      status: "active",
      accentClassName: "bg-ink",
    });
    expect(updated.name).toBe("Standort A neu");
  });

  it("team-Scope: deleteTenantEmployee lehnt einen Mitarbeiter außerhalb des eigenen Teams ab", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h05c-tenant-${RUN_ID}`, name: `H05c Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h05c-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const managerUser = await prisma.user.create({
      data: { email: `h05c-manager-${RUN_ID}@ployo.invalid`, name: "Manager", emailVerified: true },
    });
    userIds.push(owner.id, managerUser.id);

    const teamManagerRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "employees-team-manager-h05",
        name: "Team-Mitarbeiterverwalter",
        permissions: {
          create: [{ area: "employees", level: "write", scope: "team", canDelete: true }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        {
          tenantId: tenant.id,
          userId: managerUser.id,
          role: "EMPLOYEE",
          roleId: teamManagerRole.id,
        },
      ],
    });

    await prisma.tenantTeam.createMany({
      data: [
        { tenantId: tenant.id, key: "alpha-h05c", name: "Alpha" },
        { tenantId: tenant.id, key: "beta-h05c", name: "Beta" },
      ],
    });

    currentUserId = owner.id;
    const managerEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Team",
        lastName: "Manager",
        email: `h05c-manager-emp-${RUN_ID}@ployo.invalid`,
        team: "Alpha",
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: managerEmployee.dbId! },
      data: { userId: managerUser.id },
    });

    const foreignEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Other",
        lastName: "Team",
        email: `h05c-foreign-${RUN_ID}@ployo.invalid`,
        team: "Beta",
      },
    });

    currentUserId = managerUser.id;

    await expect(
      deleteTenantEmployee({ tenantSlug: tenant.slug, employeeId: foreignEmployee.dbId! }),
    ).rejects.toThrow("FORBIDDEN");

    const stillExists = await prisma.tenantEmployee.findUnique({
      where: { id: foreignEmployee.dbId! },
      select: { id: true },
    });
    expect(stillExists).not.toBeNull();
  });

  it("team-Scope: createTenantShift lehnt eine Zuweisung an einen Mitarbeiter außerhalb des eigenen Teams ab", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h05d-tenant-${RUN_ID}`, name: `H05d Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h05d-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const plannerUser = await prisma.user.create({
      data: { email: `h05d-planner-${RUN_ID}@ployo.invalid`, name: "Planner", emailVerified: true },
    });
    userIds.push(owner.id, plannerUser.id);

    const shiftPlannerRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "team-shift-planner-h05",
        name: "Team-Schichtplaner",
        permissions: {
          create: [{ area: "shifts", level: "write", scope: "team" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        {
          tenantId: tenant.id,
          userId: plannerUser.id,
          role: "EMPLOYEE",
          roleId: shiftPlannerRole.id,
        },
      ],
    });

    await prisma.tenantTeam.createMany({
      data: [
        { tenantId: tenant.id, key: "alpha-h05d", name: "Alpha" },
        { tenantId: tenant.id, key: "beta-h05d", name: "Beta" },
      ],
    });

    currentUserId = owner.id;
    const plannerEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Shift",
        lastName: "Planner",
        email: `h05d-planner-emp-${RUN_ID}@ployo.invalid`,
        team: "Alpha",
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: plannerEmployee.dbId! },
      data: { userId: plannerUser.id },
    });

    const foreignEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Other",
        lastName: "Team",
        email: `h05d-foreign-${RUN_ID}@ployo.invalid`,
        team: "Beta",
      },
    });

    currentUserId = plannerUser.id;

    await expect(
      createTenantShift({
        tenantSlug: tenant.slug,
        date: "2027-05-10",
        startTime: "09:00",
        endTime: "13:00",
        breakMinutes: 0,
        employeeId: foreignEmployee.dbId!,
      }),
    ).rejects.toThrow("FORBIDDEN");

    const ownShift = await createTenantShift({
      tenantSlug: tenant.slug,
      date: "2027-05-10",
      startTime: "09:00",
      endTime: "13:00",
      breakMinutes: 0,
      employeeId: plannerEmployee.dbId!,
    });
    expect(ownShift.employeeId).toBe(plannerEmployee.dbId);
  });

  it("own-Scope: updateTenantReminder lehnt eine fremde Erinnerung ab", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h05e-tenant-${RUN_ID}`, name: `H05e Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h05e-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const staffUser = await prisma.user.create({
      data: { email: `h05e-staff-${RUN_ID}@ployo.invalid`, name: "Staff", emailVerified: true },
    });
    userIds.push(owner.id, staffUser.id);

    const ownReminderRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "own-reminder-h05",
        name: "Eigene-Erinnerungen",
        permissions: {
          create: [{ area: "reminders", level: "write", scope: "own" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: staffUser.id, role: "EMPLOYEE", roleId: ownReminderRole.id },
      ],
    });

    currentUserId = owner.id;
    const foreignReminder = await createTenantReminder({
      tenantSlug: tenant.slug,
      title: "Vom Owner erstellt",
      dueDate: "2027-06-01",
    });

    currentUserId = staffUser.id;
    const ownReminder = await createTenantReminder({
      tenantSlug: tenant.slug,
      title: "Eigene Erinnerung",
      dueDate: "2027-06-02",
    });

    await expect(
      updateTenantReminder({
        tenantSlug: tenant.slug,
        reminderId: foreignReminder.id,
        title: "Manipuliert",
        dueDate: "2027-06-03",
      }),
    ).rejects.toThrow("FORBIDDEN");

    const updatedOwn = await updateTenantReminder({
      tenantSlug: tenant.slug,
      reminderId: ownReminder.id,
      title: "Eigene Erinnerung bearbeitet",
      dueDate: "2027-06-02",
    });
    expect(updatedOwn.title).toBe("Eigene Erinnerung bearbeitet");
  });

  it("R08 — team-gescoptes shifts:write darf eine Woche NICHT veröffentlichen/zurückziehen/zurücksetzen (wirkt tenantweit über alle Teams)", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h05f-tenant-${RUN_ID}`, name: `H05f Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h05f-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const teamPlanner = await prisma.user.create({
      data: { email: `h05f-planner-${RUN_ID}@ployo.invalid`, name: "Planner", emailVerified: true },
    });
    userIds.push(owner.id, teamPlanner.id);

    const teamScopedShiftRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "team-shift-planner",
        name: "Team-Schichtplaner",
        permissions: {
          create: [{ area: "shifts", level: "write", scope: "team" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: teamPlanner.id, role: "EMPLOYEE", roleId: teamScopedShiftRole.id },
      ],
    });

    await prisma.tenantTeam.create({
      data: { tenantId: tenant.id, key: `h05f-team-a-${RUN_ID}`, name: "Team A" },
    });

    currentUserId = owner.id;
    const plannerEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Team",
        lastName: "Planner",
        email: `h05f-planner-emp-${RUN_ID}@ployo.invalid`,
        team: "Team A",
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: plannerEmployee.dbId! },
      data: { userId: teamPlanner.id },
    });

    const { year, week } = getISOWeekFromDate(new Date("2027-06-01T00:00:00Z"));

    currentUserId = teamPlanner.id;
    await expect(publishShiftWeek({ tenantSlug: tenant.slug, year, week })).rejects.toThrow();
    await expect(unpublishShiftWeek({ tenantSlug: tenant.slug, year, week })).rejects.toThrow();
    await expect(
      resetShiftWeekToPublished({ tenantSlug: tenant.slug, year, week }),
    ).rejects.toThrow();

    // Kontrolle: der Owner (scope "all") darf diese Wochenaktionen weiterhin ganz normal ausführen.
    currentUserId = owner.id;
    const published = await publishShiftWeek({ tenantSlug: tenant.slug, year, week });
    expect(published.status).toBe("published");
  });
});

describe("H06 — Datei-Mutationen erzwingen ACL, Eigentümer-Fachscope und Ordner-PIN", () => {
  it("ACL-gesperrte Datei: uploadTenantFileVersion lehnt einen Aufrufer außerhalb der ACL ab, bevor irgendein Upload versucht wird", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h06a-tenant-${RUN_ID}`, name: `H06a Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h06a-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const outsider = await prisma.user.create({
      data: { email: `h06a-outsider-${RUN_ID}@ployo.invalid`, name: "Outsider", emailVerified: true },
    });
    userIds.push(owner.id, outsider.id);

    const filesWriterRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "files-writer-h06a",
        name: "Dateien-Verwalter",
        permissions: {
          create: [{ area: "files", level: "write", scope: "all" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        {
          tenantId: tenant.id,
          userId: outsider.id,
          role: "EMPLOYEE",
          roleId: filesWriterRole.id,
        },
      ],
    });

    const restrictedFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        storageKey: `h06a-${RUN_ID}`,
        originalName: "geheim.pdf",
        displayName: "Geheime Datei",
        accessUserIdsJson: ["jemand-anderes"],
      },
    });

    currentUserId = outsider.id;
    const fakeFile = new File(["inhalt"], "neue-version.pdf", { type: "application/pdf" });

    await expect(
      uploadTenantFileVersion({ tenantSlug: tenant.slug, fileId: restrictedFile.id, file: fakeFile }),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("Eigentümer-Fachscope: setTenantFileEmployeeVisibility lehnt eine Datei außerhalb des eigenen Teams ab, erlaubt sie aber mit voller Berechtigung", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h06b-tenant-${RUN_ID}`, name: `H06b Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h06b-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const hrUser = await prisma.user.create({
      data: { email: `h06b-hr-${RUN_ID}@ployo.invalid`, name: "HR", emailVerified: true },
    });
    const teamEditorUser = await prisma.user.create({
      data: { email: `h06b-team-editor-${RUN_ID}@ployo.invalid`, name: "TeamEditor", emailVerified: true },
    });
    userIds.push(owner.id, hrUser.id, teamEditorUser.id);

    const hrRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "hr-full-files-h06b",
        name: "HR Volle Dateien",
        permissions: {
          create: [
            { area: "files", level: "write", scope: "all" },
            { area: "employeeFiles", level: "write", scope: "all" },
          ],
        },
      },
    });
    const teamEditorRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "team-editor-files-h06b",
        name: "Team-Editor Dateien",
        permissions: {
          create: [
            { area: "files", level: "write", scope: "all" },
            { area: "employeeFiles", level: "write", scope: "team" },
          ],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: hrUser.id, role: "EMPLOYEE", roleId: hrRole.id },
        { tenantId: tenant.id, userId: teamEditorUser.id, role: "EMPLOYEE", roleId: teamEditorRole.id },
      ],
    });

    await prisma.tenantTeam.createMany({
      data: [
        { tenantId: tenant.id, key: "alpha-h06b", name: "Alpha" },
        { tenantId: tenant.id, key: "beta-h06b", name: "Beta" },
      ],
    });

    currentUserId = owner.id;
    const editorEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Team",
        lastName: "Editor",
        email: `h06b-editor-emp-${RUN_ID}@ployo.invalid`,
        team: "Alpha",
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: editorEmployee.dbId! },
      data: { userId: teamEditorUser.id },
    });

    const employeeBeta = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Other",
        lastName: "Team",
        email: `h06b-beta-emp-${RUN_ID}@ployo.invalid`,
        team: "Beta",
      },
    });

    const fileOnBeta = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        employeeId: employeeBeta.dbId!,
        storageKey: `h06b-${RUN_ID}`,
        originalName: "akte.pdf",
        displayName: "Akte",
      },
    });

    currentUserId = teamEditorUser.id;
    await expect(
      setTenantFileEmployeeVisibility({ tenantSlug: tenant.slug, fileId: fileOnBeta.id, hidden: true }),
    ).rejects.toThrow("FORBIDDEN");

    currentUserId = hrUser.id;
    const result = await setTenantFileEmployeeVisibility({
      tenantSlug: tenant.slug,
      fileId: fileOnBeta.id,
      hidden: true,
    });
    expect(result.hiddenFromEmployee).toBe(true);
  });

  it("Ordner-PIN: setTenantFileEmployeeVisibility lehnt eine Datei in einem gesperrten Ordner ohne PIN ab, akzeptiert sie mit korrekter PIN", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h06c-tenant-${RUN_ID}`, name: `H06c Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h06c-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const hrUser = await prisma.user.create({
      data: { email: `h06c-hr-${RUN_ID}@ployo.invalid`, name: "HR", emailVerified: true },
    });
    userIds.push(owner.id, hrUser.id);

    const hrRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "hr-full-files-h06c",
        name: "HR Volle Dateien",
        permissions: {
          create: [
            { area: "files", level: "write", scope: "all" },
            { area: "employeeFiles", level: "write", scope: "all" },
          ],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: hrUser.id, role: "EMPLOYEE", roleId: hrRole.id },
      ],
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Locked",
        lastName: "Folder",
        email: `h06c-emp-${RUN_ID}@ployo.invalid`,
      },
    });

    await prisma.tenantFileFolder.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        scope: `employee:${employee.dbId}`,
        name: "Verträge",
        slug: "vertraege",
        path: "vertraege",
        locked: true,
        pinHash: hashFolderPin("123456"),
      },
    });

    const lockedFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        storageKey: `h06c-${RUN_ID}`,
        originalName: "vertrag.pdf",
        displayName: "Vertrag",
        folderSlug: "vertraege",
        folderName: "Verträge",
      },
    });

    currentUserId = hrUser.id;

    await expect(
      setTenantFileEmployeeVisibility({ tenantSlug: tenant.slug, fileId: lockedFile.id, hidden: true }),
    ).rejects.toThrow("FOLDER_LOCKED");

    const unlocked = await setTenantFileEmployeeVisibility({
      tenantSlug: tenant.slug,
      fileId: lockedFile.id,
      hidden: true,
      pin: "123456",
    });
    expect(unlocked.hiddenFromEmployee).toBe(true);
  });
});

describe("H07 — neue Dateiversion übernimmt Schutz-Metadaten und Vertragsverknüpfung vom Wurzeldokument", () => {
  it("kopiert ACL/hiddenFromEmployee/documentType und hängt die Vertragsverknüpfung auf die neue Version um", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h07-tenant-${RUN_ID}`, name: `H07 Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h07-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Contract",
        lastName: "Owner",
        email: `h07-emp-${RUN_ID}@ployo.invalid`,
      },
    });

    const rootFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        storageKey: `h07-root-${RUN_ID}`,
        originalName: "vertrag-v1.pdf",
        displayName: "Vertrag",
        documentType: "Vertrag",
        hiddenFromEmployee: true,
        accessUserIdsJson: [owner.id],
      },
    });

    const contract = await prisma.tenantEmployeeContract.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        title: "Arbeitsvertrag",
        startDate: "2027-01-01",
        fileId: rootFile.id,
      },
    });

    const fakeFile = new File(["%PDF-1.4\n% minimaler Test-PDF-Inhalt"], "vertrag-v2.pdf", {
      type: "application/pdf",
    });
    const newVersion = await uploadTenantFileVersion({
      tenantSlug: tenant.slug,
      fileId: rootFile.id,
      file: fakeFile,
    });

    // Schutz-Metadaten wurden übernommen, nicht auf die Schema-Defaults
    // zurückgefallen.
    expect(newVersion.documentType).toBe("Vertrag");
    expect(newVersion.hiddenFromEmployee).toBe(true);
    expect((newVersion.accessUserIdsJson as string[])).toEqual([owner.id]);

    // Die alte Version ist jetzt "replaced", die neue "active".
    const replacedRoot = await prisma.tenantFile.findUniqueOrThrow({
      where: { id: rootFile.id },
      select: { status: true },
    });
    expect(replacedRoot.status).toBe("replaced");

    // Die Vertragsverknüpfung zeigt jetzt auf die neue Version, nicht mehr
    // auf die ersetzte alte.
    const contractAfter = await prisma.tenantEmployeeContract.findUniqueOrThrow({
      where: { id: contract.id },
      select: { fileId: true },
    });
    expect(contractAfter.fileId).toBe(newVersion.id);
    expect(contractAfter.fileId).not.toBe(rootFile.id);
  });

  it("R08 — hängt die Krankheits-FK auf die neue Version um und die alte Version behält ihre Fachkategorie (nicht employeeFiles)", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h07b-tenant-${RUN_ID}`, name: `H07b Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h07b-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const employeeFilesOnlyUser = await prisma.user.create({
      data: { email: `h07b-viewer-${RUN_ID}@ployo.invalid`, name: "Viewer", emailVerified: true },
    });
    userIds.push(owner.id, employeeFilesOnlyUser.id);

    // employeeFiles:read/all, aber KEIN sickness:read — darf weder die alte
    // noch die neue Version einer Krankmeldungs-Anlage sehen.
    const employeeFilesRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "employee-files-only",
        name: "Nur-Personalakte-Dateien",
        permissions: {
          create: [{ area: "employeeFiles", level: "read", scope: "all" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        {
          tenantId: tenant.id,
          userId: employeeFilesOnlyUser.id,
          role: "EMPLOYEE",
          roleId: employeeFilesRole.id,
        },
      ],
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Sick",
        lastName: "Employee",
        email: `h07b-emp-${RUN_ID}@ployo.invalid`,
      },
    });

    const rootFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        storageKey: `h07b-root-${RUN_ID}`,
        originalName: "au-v1.pdf",
        displayName: "AU-Bescheinigung",
      },
    });

    const sicknessReport = await prisma.tenantSicknessReport.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        startDate: new Date("2027-03-01"),
        attachmentFileId: rootFile.id,
      },
    });

    const fakeFile = new File(["%PDF-1.4\n% minimaler Test-PDF-Inhalt"], "au-v2.pdf", {
      type: "application/pdf",
    });
    const newVersion = await uploadTenantFileVersion({
      tenantSlug: tenant.slug,
      fileId: rootFile.id,
      file: fakeFile,
    });

    // FK zeigt jetzt auf die neue Version.
    const sicknessAfter = await prisma.tenantSicknessReport.findUniqueOrThrow({
      where: { id: sicknessReport.id },
      select: { attachmentFileId: true },
    });
    expect(sicknessAfter.attachmentFileId).toBe(newVersion.id);

    currentUserId = employeeFilesOnlyUser.id;

    // Weder die neue noch die inzwischen "replaced" alte Version dürfen für
    // jemanden mit bloßem employeeFiles:read (ohne sickness:read) über die
    // generischen Datei-Ausgabepfade erreichbar sein.
    await expect(
      getTenantFileSignedUrl({ tenantSlug: tenant.slug, fileId: newVersion.id }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      getTenantFileSignedUrl({ tenantSlug: tenant.slug, fileId: rootFile.id }),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("H08 — Dateiinhalt muss zur Endung passen, MIME-Typ kommt vom Server statt vom Client", () => {
  it("lehnt eine als .pdf benannte Datei mit tatsächlichem HTML-Inhalt ab", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h08-tenant-${RUN_ID}`, name: `H08 Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h08-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;

    const htmlAsPdf = new File(
      ["<!doctype html><html><body><script>alert(1)</script></body></html>"],
      "harmlos.pdf",
      { type: "application/pdf" },
    );

    await expect(
      uploadTenantFile({ tenantSlug: tenant.slug, file: htmlAsPdf }),
    ).rejects.toThrow(/aktive Inhalte/);
  });

  it("speichert für eine echte PDF-Datei den serverseitig ermittelten MIME-Typ, unabhängig vom vom Client behaupteten Typ", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h08b-tenant-${RUN_ID}`, name: `H08b Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h08b-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;

    // Client behauptet fälschlich text/html, obwohl die Bytes ein echtes
    // (minimales) PDF sind — der gespeicherte MIME-Typ muss trotzdem
    // "application/pdf" sein, nicht die Client-Behauptung.
    const realPdf = new File(["%PDF-1.4\n% minimaler Test-PDF-Inhalt"], "echt.pdf", {
      type: "text/html",
    });

    const uploaded = await uploadTenantFile({ tenantSlug: tenant.slug, file: realPdf });
    expect(uploaded.mimeType).toBe("application/pdf");
  });

  it("R04 — der Self-Service-Upload (uploadMyDocument) prüft denselben Dateiinhalt wie der generische Upload", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h08c-tenant-${RUN_ID}`, name: `H08c Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h08c-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Self",
        lastName: "Service",
        email: `h08c-self-${RUN_ID}@ployo.invalid`,
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: employee.dbId! },
      data: { userId: owner.id },
    });

    const htmlAsPdf = new File(
      ["<!doctype html><html><body><script>alert(document.cookie)</script></body></html>"],
      "proof.pdf",
      { type: "text/html" },
    );

    await expect(
      uploadMyDocument({ tenantSlug: tenant.slug, file: htmlAsPdf, documentType: "Sonstiges" }),
    ).rejects.toThrow(/aktive Inhalte/);

    const realPdf = new File(["%PDF-1.4\n% minimaler Test-PDF-Inhalt"], "echt.pdf", {
      type: "text/html",
    });
    const created = await prisma.tenantFile.findMany({ where: { tenantId: tenant.id } });
    expect(created).toHaveLength(0);

    // Kontrolle: eine echte PDF geht weiterhin durch und bekommt den
    // serverseitig ermittelten MIME-Typ, nicht die Client-Behauptung.
    await uploadMyDocument({ tenantSlug: tenant.slug, file: realPdf, documentType: "Sonstiges" });
    const stored = await prisma.tenantFile.findFirstOrThrow({ where: { tenantId: tenant.id } });
    expect(stored.mimeType).toBe("application/pdf");
  });
});

describe("H09 — Ordner-Freischalt-Cookie ist an User und Ablaufzeit gebunden, kein Klartext-Fallback", () => {
  it("ein korrekt gesetzter Cookie schaltet frei; ein anderer User, ein manipulierter Wert oder rohes Klartext-JSON werden abgelehnt", async () => {
    unlockCookieJar = {};

    const tenantSlug = `h09-tenant-${RUN_ID}`;
    const userA = `h09-user-a-${RUN_ID}`;
    const userB = `h09-user-b-${RUN_ID}`;

    currentUserId = userA;
    await markFolderUnlocked(tenantSlug, "vertraege", "employee:x");

    expect(await isFolderUnlocked(tenantSlug, "vertraege", "employee:x")).toBe(true);

    // Anderer User mit demselben (kopierten) Cookie-Wert -> keine Freischaltung.
    currentUserId = userB;
    expect(await isFolderUnlocked(tenantSlug, "vertraege", "employee:x")).toBe(false);

    // Manipulierter Ciphertext -> keine Freischaltung, kein Crash.
    currentUserId = userA;
    const original = unlockCookieJar["ployo-folder-unlock"];
    unlockCookieJar["ployo-folder-unlock"] = original.slice(0, -4) + "abcd";
    expect(await isFolderUnlocked(tenantSlug, "vertraege", "employee:x")).toBe(false);

    // Rohes, vom Client frei erzeugtes Klartext-JSON (kein "flu:v1:"-Präfix)
    // -> darf NICHT als gültige Freischaltung durchgehen (Kern von H09).
    unlockCookieJar["ployo-folder-unlock"] = JSON.stringify([
      `${tenantSlug}:employee:x:vertraege`,
    ]);
    expect(await isFolderUnlocked(tenantSlug, "vertraege", "employee:x")).toBe(false);

    // Erneutes echtes Freischalten funktioniert weiterhin normal.
    await markFolderUnlocked(tenantSlug, "vertraege", "employee:x");
    expect(await isFolderUnlocked(tenantSlug, "vertraege", "employee:x")).toBe(true);
  });
});

describe("H10 — Urlaubsentscheidung: kein Selbst-Approval, Compare-and-Set, erneute Prüfung nach Datumsänderung", () => {
  it("lehnt die Entscheidung über den eigenen Antrag ab, erlaubt sie einem anderen Genehmiger und lässt keine Doppelentscheidung zu", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h10a-tenant-${RUN_ID}`, name: `H10a Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h10a-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const hrUser = await prisma.user.create({
      data: { email: `h10a-hr-${RUN_ID}@ployo.invalid`, name: "HR", emailVerified: true },
    });
    userIds.push(owner.id, hrUser.id);

    const vacationManagerRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "vacation-manager-h10",
        name: "Urlaubs-Verwalter",
        permissions: {
          create: [{ area: "vacation", level: "write", scope: "all" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: hrUser.id, role: "EMPLOYEE", roleId: vacationManagerRole.id },
      ],
    });

    currentUserId = owner.id;
    const hrEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "HR",
        lastName: "Self",
        email: `h10a-hr-emp-${RUN_ID}@ployo.invalid`,
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: hrEmployee.dbId! },
      data: { userId: hrUser.id },
    });

    currentUserId = hrUser.id;
    const ownRequest = await createTenantVacationRequest({
      tenantSlug: tenant.slug,
      employeeId: hrEmployee.dbId!,
      startDate: "2027-07-01",
      endDate: "2027-07-05",
      note: "",
    });

    // Über den eigenen Antrag nicht selbst entscheiden, obwohl vacation:write/all.
    await expect(
      setTenantVacationRequestStatus({
        tenantSlug: tenant.slug,
        requestId: ownRequest.id,
        status: "approved",
      }),
    ).rejects.toThrow("FORBIDDEN_SELF_APPROVAL");

    // Ein anderer Genehmiger darf ganz normal entscheiden.
    currentUserId = owner.id;
    await setTenantVacationRequestStatus({
      tenantSlug: tenant.slug,
      requestId: ownRequest.id,
      status: "approved",
    });

    const decided = await prisma.tenantVacationRequest.findUniqueOrThrow({
      where: { id: ownRequest.id },
      select: { status: true, decidedBy: true },
    });
    expect(decided.status).toBe("approved");
    expect(decided.decidedBy).toBe(owner.id);

    // Eine zweite Entscheidung, die am Status nichts ändern würde (erneut
    // "approved" auf einem bereits genehmigten Antrag), wird abgelehnt
    // (Compare-and-Set statt bedingungslosem Update).
    await expect(
      setTenantVacationRequestStatus({
        tenantSlug: tenant.slug,
        requestId: ownRequest.id,
        status: "approved",
      }),
    ).rejects.toThrow("ALREADY_DECIDED");

    // Eine abweichende Entscheidung — nachträglich doch noch ablehnen — ist
    // dagegen ausdrücklich erlaubt: ein bereits genehmigter Urlaub muss sich
    // zurücknehmen lassen, z. B. wenn sich Pläne ändern.
    await setTenantVacationRequestStatus({
      tenantSlug: tenant.slug,
      requestId: ownRequest.id,
      status: "rejected",
    });
    const revoked = await prisma.tenantVacationRequest.findUniqueOrThrow({
      where: { id: ownRequest.id },
      select: { status: true },
    });
    expect(revoked.status).toBe("rejected");

    // Und ebenso umgekehrt wieder zurück auf "approved" — damit die
    // nachfolgende Prüfung (Datumsänderung an einem genehmigten Antrag) auf
    // demselben Ausgangszustand wie zuvor aufsetzt.
    await setTenantVacationRequestStatus({
      tenantSlug: tenant.slug,
      requestId: ownRequest.id,
      status: "approved",
    });

    // Eine Datumsänderung am bereits genehmigten Antrag setzt ihn zurück auf
    // "pending" statt den Genehmigungsstatus stillschweigend mitzunehmen.
    await updateTenantVacationRequest({
      tenantSlug: tenant.slug,
      requestId: ownRequest.id,
      startDate: "2027-07-10",
      endDate: "2027-07-12",
      note: "verschoben",
    });

    const afterDateChange = await prisma.tenantVacationRequest.findUniqueOrThrow({
      where: { id: ownRequest.id },
      select: { status: true, decidedAt: true, decidedBy: true, startDate: true },
    });
    expect(afterDateChange.status).toBe("pending");
    expect(afterDateChange.decidedAt).toBeNull();
    expect(afterDateChange.decidedBy).toBe("");
    expect(afterDateChange.startDate).toBe("2027-07-10");
  });

  it("R08 — eine Datumsänderung, deren Statuslesung durch eine gleichzeitige Genehmigung überholt wurde, wird abgelehnt statt den Antrag stillschweigend 'approved' zu belassen", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h10b-tenant-${RUN_ID}`, name: `H10b Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h10b-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);
    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Race",
        lastName: "Condition",
        email: `h10b-emp-${RUN_ID}@ployo.invalid`,
      },
    });

    const request = await createTenantVacationRequest({
      tenantSlug: tenant.slug,
      employeeId: employee.dbId!,
      startDate: "2027-08-01",
      endDate: "2027-08-05",
      note: "",
    });

    // Der tatsächliche, aktuelle Zustand ist bereits "approved" — simuliert
    // eine Genehmigung, die genau zwischen dem Lesen und dem Schreiben in
    // updateTenantVacationRequest dazwischenkam.
    await prisma.tenantVacationRequest.update({
      where: { id: request.id },
      data: { status: "approved", decidedAt: new Date(), decidedBy: owner.id },
    });

    // updateTenantVacationRequest liest den Antrag selbst erneut — hier wird
    // GENAU diese eine Lesung auf den veralteten "pending"-Stand zurückgesetzt,
    // um das enge Zeitfenster deterministisch nachzustellen.
    const staleRead = (async () => ({
      id: request.id,
      employeeId: employee.dbId!,
      startDate: "2027-08-01",
      endDate: "2027-08-05",
      status: "pending",
      employee: { name: "Race Condition" },
    })) as unknown as typeof prisma.tenantVacationRequest.findFirst;
    const findFirstSpy = vi
      .spyOn(prisma.tenantVacationRequest, "findFirst")
      .mockImplementationOnce(staleRead);

    try {
      await expect(
        updateTenantVacationRequest({
          tenantSlug: tenant.slug,
          requestId: request.id,
          startDate: "2027-08-10",
          endDate: "2027-08-12",
          note: "verschoben",
        }),
      ).rejects.toThrow(/zwischenzeitlich geändert/);
    } finally {
      findFirstSpy.mockRestore();
    }

    // Der bereits genehmigte Antrag bleibt unverändert "approved" mit den
    // ursprünglichen Daten — nicht "approved" mit neuen, nie freigegebenen Daten.
    const stillApproved = await prisma.tenantVacationRequest.findUniqueOrThrow({
      where: { id: request.id },
      select: { status: true, startDate: true, endDate: true },
    });
    expect(stillApproved.status).toBe("approved");
    expect(stillApproved.startDate).toBe("2027-08-01");
    expect(stillApproved.endDate).toBe("2027-08-05");
  });
});

describe("H11 — S3-Löschfehler lassen die Metadaten für einen Retry bestehen", () => {
  it("löscht nur die DB-Zeile, deren S3-Objekt tatsächlich (oder schon vorher) weg ist; ein echter S3-Fehler markiert stattdessen erneut als 'deleted' statt die Zeile zu entfernen", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h11-tenant-${RUN_ID}`, name: `H11 Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const okFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        storageKey: `h11/ok-${RUN_ID}`,
        originalName: "ok.pdf",
        displayName: "OK",
        status: "deleted",
        deletedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40),
      },
    });
    const alreadyGoneFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        storageKey: `h11/notfound-me-${RUN_ID}`,
        originalName: "gone.pdf",
        displayName: "Gone",
        status: "deleted",
        deletedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40),
      },
    });
    const failingFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        storageKey: `h11/fail-me-${RUN_ID}`,
        originalName: "fails.pdf",
        displayName: "Fails",
        status: "deleted",
        deletedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40),
      },
    });

    const beforePurge = new Date();
    const result = await purgeTenantFiles([
      { id: okFile.id, bucket: "hr-documents", storageKey: okFile.storageKey },
      { id: alreadyGoneFile.id, bucket: "hr-documents", storageKey: alreadyGoneFile.storageKey },
      { id: failingFile.id, bucket: "hr-documents", storageKey: failingFile.storageKey },
    ]);

    expect(result.succeededIds.sort()).toEqual([alreadyGoneFile.id, okFile.id].sort());
    expect(result.failedIds).toEqual([failingFile.id]);

    // Erfolgreich (oder bereits weg) gelöschte Objekte: DB-Zeile ist weg.
    expect(await prisma.tenantFile.findUnique({ where: { id: okFile.id } })).toBeNull();
    expect(await prisma.tenantFile.findUnique({ where: { id: alreadyGoneFile.id } })).toBeNull();

    // Fehlgeschlagenes S3-Delete: die Zeile bleibt bestehen (kein verwaistes
    // S3-Objekt ohne jeden DB-Verweis) und wird erneut als "deleted" mit
    // frischem deletedAt markiert, damit der nächste Cleanup-Lauf sie nach
    // der Karenzzeit automatisch wieder aufgreift.
    const stillThere = await prisma.tenantFile.findUnique({
      where: { id: failingFile.id },
      select: { status: true, deletedAt: true },
    });
    expect(stillThere).not.toBeNull();
    expect(stillThere!.status).toBe("deleted");
    expect(stillThere!.deletedAt!.getTime()).toBeGreaterThanOrEqual(beforePurge.getTime());
  });
});

describe("H12 — direkte Löschpfade prüfen Legal Hold und Aufbewahrungsfristen", () => {
  it("deleteTenantEmployee lehnt einen Mitarbeiter mit Legal Hold ab", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h12a-tenant-${RUN_ID}`, name: `H12a Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h12a-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Legal",
        lastName: "Hold",
        email: `h12a-emp-${RUN_ID}@ployo.invalid`,
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: employee.dbId! },
      data: { legalHold: true, legalHoldReason: "Laufender Rechtsstreit" },
    });

    await expect(
      deleteTenantEmployee({ tenantSlug: tenant.slug, employeeId: employee.dbId! }),
    ).rejects.toThrow(/Legal Hold/);

    const stillExists = await prisma.tenantEmployee.findUnique({
      where: { id: employee.dbId! },
      select: { id: true },
    });
    expect(stillExists).not.toBeNull();
  });

  it("deleteTenantEmployee lehnt einen Mitarbeiter mit noch nicht abgelaufener Gehaltsabrechnungs-Frist ab", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h12b-tenant-${RUN_ID}`, name: `H12b Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h12b-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Payroll",
        lastName: "Retention",
        email: `h12b-emp-${RUN_ID}@ployo.invalid`,
      },
    });

    const payrollFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        storageKey: `h12b-${RUN_ID}`,
        originalName: "lohn.pdf",
        displayName: "Lohn",
      },
    });
    await prisma.tenantPayrollStatement.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        period: "2027-01",
        gross: "3000",
        net: "2200",
        fileId: payrollFile.id,
        issuedAt: new Date(), // frisch, Frist (8 Jahre) läuft noch
      },
    });

    await expect(
      deleteTenantEmployee({ tenantSlug: tenant.slug, employeeId: employee.dbId! }),
    ).rejects.toThrow(/Gehaltsabrechnung/);

    const stillExists = await prisma.tenantEmployee.findUnique({
      where: { id: employee.dbId! },
      select: { id: true },
    });
    expect(stillExists).not.toBeNull();
  });

  it("softDeleteTenantFile lehnt eine Gehaltsabrechnungsdatei mit noch laufender Frist ab", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h12c-tenant-${RUN_ID}`, name: `H12c Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h12c-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Payroll",
        lastName: "File",
        email: `h12c-emp-${RUN_ID}@ployo.invalid`,
      },
    });

    const payrollFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        storageKey: `h12c-${RUN_ID}`,
        originalName: "lohn.pdf",
        displayName: "Lohn",
      },
    });
    await prisma.tenantPayrollStatement.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        period: "2027-02",
        gross: "3000",
        net: "2200",
        fileId: payrollFile.id,
        issuedAt: new Date(),
      },
    });

    await expect(
      softDeleteTenantFile({ tenantSlug: tenant.slug, fileId: payrollFile.id }),
    ).rejects.toThrow(/Gehaltsabrechnung/);

    const stillActive = await prisma.tenantFile.findUniqueOrThrow({
      where: { id: payrollFile.id },
      select: { status: true },
    });
    expect(stillActive.status).toBe("active");
  });

  it("R08 — getDeletionEligibilityForEmployee sperrt Legal Hold auch für lohn_sozialversicherung/gesundheit_freitext, nicht nur personaldaten", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h12d-tenant-${RUN_ID}`, name: `H12d Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h12d-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Hold",
        lastName: "Employee",
        email: `h12d-emp-${RUN_ID}@ployo.invalid`,
      },
    });

    await prisma.tenantEmployee.update({
      where: { id: employee.dbId! },
      data: { legalHold: true, legalHoldReason: "Laufender Rechtsstreit" },
    });

    // Längst abgelaufene Gehaltsabrechnung/Krankmeldung — ohne Legal Hold
    // wären beide löschfähig.
    const payrollFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        storageKey: `h12d-payroll-${RUN_ID}`,
        originalName: "lohn.pdf",
        displayName: "Lohn",
      },
    });
    await prisma.tenantPayrollStatement.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        period: "2000-01",
        gross: "3000",
        net: "2200",
        fileId: payrollFile.id,
        issuedAt: new Date("2000-01-01"),
      },
    });
    await prisma.tenantSicknessReport.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        startDate: new Date("2000-01-01"),
        status: "closed",
        note: "Alte Notiz",
        closedAt: new Date("2000-01-05"),
      },
    });

    const eligibility = await getDeletionEligibilityForEmployee(tenant.slug, employee.dbId!);
    const payrollEligibility = eligibility.find((e) => e.category === "lohn_sozialversicherung");
    const sicknessEligibility = eligibility.find((e) => e.category === "gesundheit_freitext");

    expect(payrollEligibility?.eligible).toBe(false);
    expect(payrollEligibility?.reason).toContain("Legal Hold");
    expect(sicknessEligibility?.eligible).toBe(false);
    expect(sicknessEligibility?.reason).toContain("Legal Hold");

    // Kontrolle: deleteEmployeeDataByCategory darf die eigentlich abgelaufene
    // Gehaltsabrechnung wegen des Holds NICHT löschen.
    const result = await deleteEmployeeDataByCategory(tenant.slug, employee.dbId!, [
      "lohn_sozialversicherung",
    ]);
    expect(result[0]?.performed).toBe(false);
    const stillThere = await prisma.tenantPayrollStatement.findFirst({
      where: { employeeId: employee.dbId! },
    });
    expect(stillThere).not.toBeNull();
  });
});

describe("H14 — Krankheits-Konfliktbenachrichtigung nach Planungssicht und sickness:read filtern", () => {
  it("benachrichtigt nur Schicht-Verwalter im selben Team; nur mit sickness:read mit konkretem Krankheitsbezug, sonst neutral", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h14-tenant-${RUN_ID}`, name: `H14 Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h14-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const teamAWriter = await prisma.user.create({
      data: { email: `h14-teama-${RUN_ID}@ployo.invalid`, name: "TeamAWriter", emailVerified: true },
    });
    const teamBWriter = await prisma.user.create({
      data: { email: `h14-teamb-${RUN_ID}@ployo.invalid`, name: "TeamBWriter", emailVerified: true },
    });
    userIds.push(owner.id, teamAWriter.id, teamBWriter.id);

    const teamShiftNoSicknessRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "team-shift-no-sickness-h14",
        name: "Team-Schichtplaner ohne Krankheitsrecht",
        permissions: {
          create: [{ area: "shifts", level: "write", scope: "team" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        {
          tenantId: tenant.id,
          userId: teamAWriter.id,
          role: "EMPLOYEE",
          roleId: teamShiftNoSicknessRole.id,
        },
        {
          tenantId: tenant.id,
          userId: teamBWriter.id,
          role: "EMPLOYEE",
          roleId: teamShiftNoSicknessRole.id,
        },
      ],
    });

    await prisma.tenantTeam.createMany({
      data: [
        { tenantId: tenant.id, key: "alpha-h14", name: "Alpha" },
        { tenantId: tenant.id, key: "beta-h14", name: "Beta" },
      ],
    });

    currentUserId = owner.id;
    const targetEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Target",
        lastName: "Sick",
        email: `h14-target-${RUN_ID}@ployo.invalid`,
        team: "Alpha",
      },
    });
    const teamAWriterEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Team",
        lastName: "AWriter",
        email: `h14-teama-emp-${RUN_ID}@ployo.invalid`,
        team: "Alpha",
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: teamAWriterEmployee.dbId! },
      data: { userId: teamAWriter.id },
    });
    const teamBWriterEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Team",
        lastName: "BWriter",
        email: `h14-teamb-emp-${RUN_ID}@ployo.invalid`,
        team: "Beta",
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: teamBWriterEmployee.dbId! },
      data: { userId: teamBWriter.id },
    });

    const sickDate = "2027-08-11"; // Mittwoch
    const shift = await createTenantShift({
      tenantSlug: tenant.slug,
      date: sickDate,
      startTime: "09:00",
      endTime: "13:00",
      breakMinutes: 0,
      employeeId: targetEmployee.dbId!,
    });
    const { year, week } = getISOWeekFromDate(new Date(`${sickDate}T00:00:00Z`));
    await publishShiftWeek({ tenantSlug: tenant.slug, year, week });

    dispatchedNotifications.length = 0;
    await createTenantSicknessReport({
      tenantSlug: tenant.slug,
      employeeId: targetEmployee.dbId!,
      startDate: sickDate,
      endDate: sickDate,
    });

    const byUser = new Map(dispatchedNotifications.map((n) => [n.userId, n.message]));

    // Team B liegt außerhalb des Planungsscopes -> keine Benachrichtigung.
    expect(byUser.has(teamBWriter.id)).toBe(false);

    // Team A ist im Scope, hat aber kein sickness:read -> neutraler Hinweis.
    const teamAMessage = byUser.get(teamAWriter.id);
    expect(teamAMessage).toBeDefined();
    expect(teamAMessage!.key).toBe("absenceConflict");
    expect(teamAMessage!.redactReason).toBe(true);

    // OWNER sieht wie bisher den konkreten Krankheitsbezug.
    const ownerMessage = byUser.get(owner.id);
    expect(ownerMessage).toBeDefined();
    expect(ownerMessage!.redactReason).toBe(false);
    expect(ownerMessage!.reason).toBe("sickness");

    expect(shift.employeeId).toBe(targetEmployee.dbId);
  });

  it("R08 — sickness:read/own zählt NICHT als Recht auf die Krankheit eines fremden Mitarbeiters", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h14b-tenant-${RUN_ID}`, name: `H14b Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h14b-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const teamAWriter = await prisma.user.create({
      data: { email: `h14b-teama-${RUN_ID}@ployo.invalid`, name: "TeamAWriter", emailVerified: true },
    });
    userIds.push(owner.id, teamAWriter.id);

    const teamShiftOwnSicknessRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "team-shift-own-sickness-h14b",
        name: "Team-Schichtplaner mit sickness:own",
        permissions: {
          create: [
            { area: "shifts", level: "write", scope: "team" },
            { area: "sickness", level: "read", scope: "own" },
          ],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        {
          tenantId: tenant.id,
          userId: teamAWriter.id,
          role: "EMPLOYEE",
          roleId: teamShiftOwnSicknessRole.id,
        },
      ],
    });

    await prisma.tenantTeam.create({
      data: { tenantId: tenant.id, key: "alpha-h14b", name: "Alpha" },
    });

    currentUserId = owner.id;
    const targetEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Target",
        lastName: "Sick",
        email: `h14b-target-${RUN_ID}@ployo.invalid`,
        team: "Alpha",
      },
    });
    const teamAWriterEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Team",
        lastName: "AWriter",
        email: `h14b-teama-emp-${RUN_ID}@ployo.invalid`,
        team: "Alpha",
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: teamAWriterEmployee.dbId! },
      data: { userId: teamAWriter.id },
    });

    const sickDate = "2027-08-18"; // Mittwoch
    await createTenantShift({
      tenantSlug: tenant.slug,
      date: sickDate,
      startTime: "09:00",
      endTime: "13:00",
      breakMinutes: 0,
      employeeId: targetEmployee.dbId!,
    });
    const { year, week } = getISOWeekFromDate(new Date(`${sickDate}T00:00:00Z`));
    await publishShiftWeek({ tenantSlug: tenant.slug, year, week });

    dispatchedNotifications.length = 0;
    await createTenantSicknessReport({
      tenantSlug: tenant.slug,
      employeeId: targetEmployee.dbId!,
      startDate: sickDate,
      endDate: sickDate,
    });

    const byUser = new Map(dispatchedNotifications.map((n) => [n.userId, n.message]));
    const teamAMessage = byUser.get(teamAWriter.id);
    expect(teamAMessage).toBeDefined();
    // sickness:read/own darf sich nicht auf den FREMDEN targetEmployee
    // beziehen — trotz vorhandenem Leserecht muss der Hinweis neutral bleiben.
    expect(teamAMessage!.redactReason).toBe(true);
  });
});

describe("H15 — Dateimetadaten und Dateiauswahl respektieren fachliche Sichtgrenzen", () => {
  it("getOwnerFiles: verweigert eine fremde Team-ownerId und blendet Dateien ohne Fachbereichsrecht (hier: payroll) aus", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h15a-tenant-${RUN_ID}`, name: `H15a Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h15a-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const viewer = await prisma.user.create({
      data: { email: `h15a-viewer-${RUN_ID}@ployo.invalid`, name: "Viewer", emailVerified: true },
    });
    userIds.push(owner.id, viewer.id);

    const viewerRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "team-viewer-no-payroll-h15a",
        name: "Team-Viewer ohne Payroll",
        permissions: {
          create: [
            { area: "files", level: "read", scope: "all" },
            { area: "employees", level: "read", scope: "team" },
            { area: "employeeFiles", level: "read", scope: "team" },
          ],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: viewer.id, role: "EMPLOYEE", roleId: viewerRole.id },
      ],
    });

    await prisma.tenantTeam.createMany({
      data: [
        { tenantId: tenant.id, key: "alpha-h15a", name: "Alpha" },
        { tenantId: tenant.id, key: "beta-h15a", name: "Beta" },
      ],
    });

    currentUserId = owner.id;
    const viewerEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Viewer",
        lastName: "Alpha",
        email: `h15a-viewer-emp-${RUN_ID}@ployo.invalid`,
        team: "Alpha",
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: viewerEmployee.dbId! },
      data: { userId: viewer.id },
    });

    const targetEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Target",
        lastName: "Alpha",
        email: `h15a-target-${RUN_ID}@ployo.invalid`,
        team: "Alpha",
      },
    });
    const foreignEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Foreign",
        lastName: "Beta",
        email: `h15a-foreign-${RUN_ID}@ployo.invalid`,
        team: "Beta",
      },
    });

    const plainFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        employeeId: targetEmployee.dbId!,
        storageKey: `h15a-plain-${RUN_ID}`,
        originalName: "notiz.pdf",
        displayName: "Notiz",
      },
    });
    const payrollFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        employeeId: targetEmployee.dbId!,
        storageKey: `h15a-payroll-${RUN_ID}`,
        originalName: "lohn.pdf",
        displayName: "Lohn",
      },
    });
    await prisma.tenantPayrollStatement.create({
      data: {
        tenantId: tenant.id,
        employeeId: targetEmployee.dbId!,
        period: "2027-03",
        gross: "3000",
        net: "2200",
        fileId: payrollFile.id,
        issuedAt: new Date(),
      },
    });

    currentUserId = viewer.id;

    // Objektscope: die eigene Team-Zuordnung (Alpha) erlaubt "targetEmployee",
    // aber nicht "foreignEmployee" (Beta) — vorher lieferte die nur generische
    // "employees:read"-Prüfung hier fälschlich auch fremde Team-Akten aus.
    await expect(
      getOwnerFiles({ tenantSlug: tenant.slug, ownerType: "employee", ownerId: foreignEmployee.dbId! }),
    ).rejects.toThrow(/FORBIDDEN/);

    // Fachbereich: viewer hat kein "payroll:read" — die Gehaltsabrechnung
    // darf auch dann nicht in der Metadaten-Liste auftauchen, wenn der
    // Mitarbeiter selbst im Scope liegt.
    const { files } = await getOwnerFiles({
      tenantSlug: tenant.slug,
      ownerType: "employee",
      ownerId: targetEmployee.dbId!,
    });
    const fileIds = files.map((file) => file.id);
    expect(fileIds).toContain(plainFile.id);
    expect(fileIds).not.toContain(payrollFile.id);
  });

  it("getReminderFileBrowserData: blendet Dateien ohne Fachbereichsrecht (hier: payroll) aus der tenantweiten Auswahl aus", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h15b-tenant-${RUN_ID}`, name: `H15b Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h15b-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const viewer = await prisma.user.create({
      data: { email: `h15b-viewer-${RUN_ID}@ployo.invalid`, name: "Viewer", emailVerified: true },
    });
    userIds.push(owner.id, viewer.id);

    const viewerRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "files-all-no-payroll-h15b",
        name: "Dateien ohne Payroll",
        permissions: {
          create: [
            { area: "files", level: "read", scope: "all" },
            { area: "employeeFiles", level: "read", scope: "all" },
          ],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: viewer.id, role: "EMPLOYEE", roleId: viewerRole.id },
      ],
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Some",
        lastName: "Employee",
        email: `h15b-emp-${RUN_ID}@ployo.invalid`,
      },
    });

    const plainFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        storageKey: `h15b-plain-${RUN_ID}`,
        originalName: "notiz.pdf",
        displayName: "Notiz",
      },
    });
    const payrollFile = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        storageKey: `h15b-payroll-${RUN_ID}`,
        originalName: "lohn.pdf",
        displayName: "Lohn",
      },
    });
    await prisma.tenantPayrollStatement.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        period: "2027-04",
        gross: "3000",
        net: "2200",
        fileId: payrollFile.id,
        issuedAt: new Date(),
      },
    });

    currentUserId = viewer.id;
    const { files } = await getReminderFileBrowserData(tenant.slug);
    const fileIds = files.map((file) => file.id);
    expect(fileIds).toContain(plainFile.id);
    expect(fileIds).not.toContain(payrollFile.id);
  });

  it("R08 — getReminderFileBrowserData/getOwnerFiles blenden auch ORDNER ohne ausreichendes Fachbereichsrecht aus", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h15d-tenant-${RUN_ID}`, name: `H15d Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h15d-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const filesOnlyViewer = await prisma.user.create({
      data: { email: `h15d-viewer-${RUN_ID}@ployo.invalid`, name: "Viewer", emailVerified: true },
    });
    userIds.push(owner.id, filesOnlyViewer.id);

    // Nur "files:read" — KEIN "employeeFiles"-Recht.
    const filesOnlyRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "files-only-h15d",
        name: "Nur Dateien-Modul",
        permissions: {
          create: [{ area: "files", level: "read", scope: "all" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: filesOnlyViewer.id, role: "EMPLOYEE", roleId: filesOnlyRole.id },
      ],
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Folder",
        lastName: "Owner",
        email: `h15d-emp-${RUN_ID}@ployo.invalid`,
      },
    });

    const employeeFolder = await prisma.tenantFileFolder.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        name: "Zeugnisse",
        slug: "zeugnisse",
        path: "zeugnisse",
        ownerName: "HR",
      },
    });

    currentUserId = filesOnlyViewer.id;
    const { folders } = await getReminderFileBrowserData(tenant.slug);
    expect(folders.map((folder) => folder.id)).not.toContain(employeeFolder.id);

    // Kontrolle: mit employeeFiles:read taucht der Ordner wieder auf.
    await prisma.tenantRolePermission.create({
      data: { roleId: filesOnlyRole.id, area: "employeeFiles", level: "read", scope: "all" },
    });
    const { folders: foldersWithAccess } = await getReminderFileBrowserData(tenant.slug);
    expect(foldersWithAccess.map((folder) => folder.id)).toContain(employeeFolder.id);
  });

  it("getShiftFormOptions: Mitarbeiterliste respektiert den shifts-Team-Scope", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `h15c-tenant-${RUN_ID}`, name: `H15c Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `h15c-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const planner = await prisma.user.create({
      data: { email: `h15c-planner-${RUN_ID}@ployo.invalid`, name: "Planner", emailVerified: true },
    });
    userIds.push(owner.id, planner.id);

    const plannerRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "team-shift-planner-h15c",
        name: "Team-Schichtplaner",
        permissions: {
          create: [{ area: "shifts", level: "write", scope: "team" }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: planner.id, role: "EMPLOYEE", roleId: plannerRole.id },
      ],
    });

    await prisma.tenantTeam.createMany({
      data: [
        { tenantId: tenant.id, key: "alpha-h15c", name: "Alpha" },
        { tenantId: tenant.id, key: "beta-h15c", name: "Beta" },
      ],
    });

    currentUserId = owner.id;
    const plannerEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Planner",
        lastName: "Alpha",
        email: `h15c-planner-emp-${RUN_ID}@ployo.invalid`,
        team: "Alpha",
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: plannerEmployee.dbId! },
      data: { userId: planner.id },
    });

    const alphaEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Alpha",
        lastName: "Member",
        email: `h15c-alpha-${RUN_ID}@ployo.invalid`,
        team: "Alpha",
      },
    });
    const betaEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Beta",
        lastName: "Member",
        email: `h15c-beta-${RUN_ID}@ployo.invalid`,
        team: "Beta",
      },
    });

    currentUserId = planner.id;
    const options = await getShiftFormOptions(tenant.slug);
    const employeeIds = options?.employees.map((employee) => employee.id) ?? [];

    expect(employeeIds).toContain(alphaEmployee.dbId);
    expect(employeeIds).not.toContain(betaEmployee.dbId);
  });
});

describe("M01 — Urlaubsverbrauch zählt individuelle Arbeitstage inkl. Standort-Feiertage, nicht mehr alle Kalendertage", () => {
  it("derselbe Kalenderzeitraum verbraucht in Bayern (Fronleichnam) einen Tag weniger als in Sachsen (kein Fronleichnam)", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m01-tenant-${RUN_ID}`, name: `M01 Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m01-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    await prisma.tenantLocation.createMany({
      data: [
        { tenantId: tenant.id, key: "bayern-m01", kind: "office", name: "München", bundesland: "BY" },
        { tenantId: tenant.id, key: "sachsen-m01", kind: "office", name: "Dresden", bundesland: "SN" },
      ],
    });

    currentUserId = owner.id;
    const bavarianEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Bavarian",
        lastName: "Employee",
        email: `m01-by-${RUN_ID}@ployo.invalid`,
        location: "München",
      },
    });
    const saxonEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Saxon",
        lastName: "Employee",
        email: `m01-sn-${RUN_ID}@ployo.invalid`,
        location: "Dresden",
      },
    });

    // 24.-28.05.2027 (Mo-Fr): Fronleichnam fällt auf Do, 27.05.2027 — gilt
    // in Bayern (BW/BY/HE/NW/RP/SL), nicht in Sachsen.
    const bavarianRequest = await createTenantVacationRequest({
      tenantSlug: tenant.slug,
      employeeId: bavarianEmployee.dbId!,
      startDate: "2027-05-24",
      endDate: "2027-05-28",
      note: "",
    });
    const saxonRequest = await createTenantVacationRequest({
      tenantSlug: tenant.slug,
      employeeId: saxonEmployee.dbId!,
      startDate: "2027-05-24",
      endDate: "2027-05-28",
      note: "",
    });

    expect(bavarianRequest.days).toBe(4);
    expect(saxonRequest.days).toBe(5);
  });

  it("eine individuelle 4-Tage-Woche (kein Freitag) verbraucht für dieselbe Woche entsprechend weniger Tage", () => {
    const fourDayWeek = parseVacationWorkDays(["Mo", "Di", "Mi", "Do"]);
    expect(calculateVacationWorkDays("2027-06-07", "2027-06-13", fourDayWeek, null)).toBe(4);
  });

  it("R08 — lehnt einen Urlaubsantrag ab, der laut Dienstplan keinen einzigen Arbeitstag enthält", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m01b-tenant-${RUN_ID}`, name: `M01b Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m01b-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Weekend",
        lastName: "Only",
        email: `m01b-emp-${RUN_ID}@ployo.invalid`,
      },
    });

    // 2027-06-13 ist ein Sonntag, außerhalb der Standard-Mo-Fr-Woche.
    await expect(
      createTenantVacationRequest({
        tenantSlug: tenant.slug,
        employeeId: employee.dbId!,
        startDate: "2027-06-13",
        endDate: "2027-06-13",
        note: "",
      }),
    ).rejects.toThrow(/keinen einzigen Arbeitstag/);

    const requests = await prisma.tenantVacationRequest.findMany({ where: { tenantId: tenant.id } });
    expect(requests).toHaveLength(0);
  });
});

describe("M02 — Resturlaubs-Übertrag: Jahreswechsel, Hinweispflicht, Verfall nur nach Hinweis", () => {
  it("übernimmt den Vorjahresrest, weist rechtzeitig hin und lässt ihn erst danach verfallen", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m02-tenant-${RUN_ID}`, name: `M02 Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m02-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const employeeUser = await prisma.user.create({
      data: { email: `m02-emp-user-${RUN_ID}@ployo.invalid`, name: "Employee", emailVerified: true },
    });
    userIds.push(owner.id, employeeUser.id);

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: employeeUser.id, role: "EMPLOYEE" },
      ],
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Carry",
        lastName: "Over",
        email: `m02-target-${RUN_ID}@ployo.invalid`,
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: employee.dbId! },
      data: { userId: employeeUser.id, vacationTotal: 30 },
    });

    // 22 von 30 Tagen des Vorjahres (2027) verbraucht → 8 Tage Rest.
    await prisma.tenantVacationRequest.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.dbId!,
        key: `m02-2027-req-${RUN_ID}`,
        startDate: "2027-06-01",
        endDate: "2027-06-22",
        days: 22,
        status: "approved",
      },
    });

    // Schritt 1: erster Cronlauf im neuen Jahr (05.01.2028) — Übertrag berechnen.
    const rollover1 = await runVacationCarryoverRollover(new Date("2028-01-05T00:00:00Z"), tenant.id);
    expect(rollover1.rolledOver).toBe(1);
    expect(rollover1.remindersSent).toBe(0);
    expect(rollover1.flaggedForReview).toBe(0);

    const afterRollover = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: employee.dbId! },
      select: { vacationCarryover: true, vacationCarryoverExpiresAt: true, vacationCarryoverRemindedAt: true },
    });
    expect(afterRollover.vacationCarryover).toBe(8);
    expect(afterRollover.vacationCarryoverExpiresAt?.toISOString().slice(0, 10)).toBe("2028-03-31");
    expect(afterRollover.vacationCarryoverRemindedAt).toBeNull();

    // Ein zweiter Lauf noch im selben Jahr darf nicht erneut aufaddieren.
    const rolloverIdempotent = await runVacationCarryoverRollover(
      new Date("2028-01-20T00:00:00Z"),
      tenant.id,
    );
    expect(rolloverIdempotent.rolledOver).toBe(0);

    // Schritt 2: innerhalb der Vorlauffrist (15.03.2028) — Hinweis versenden.
    const rollover2 = await runVacationCarryoverRollover(new Date("2028-03-15T00:00:00Z"), tenant.id);
    expect(rollover2.remindersSent).toBe(1);
    expect(rollover2.flaggedForReview).toBe(0);

    const carryoverNotification = dispatchedNotifications.find(
      (n) => n.userId === employeeUser.id && n.message.key === "vacationCarryoverExpiring",
    );
    expect(carryoverNotification).toBeDefined();
    expect(carryoverNotification!.message.days).toBe(8);

    const afterReminder = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: employee.dbId! },
      select: { vacationCarryover: true, vacationCarryoverRemindedAt: true },
    });
    expect(afterReminder.vacationCarryover).toBe(8); // noch nicht verfallen
    expect(afterReminder.vacationCarryoverRemindedAt).not.toBeNull();

    // Schritt 3: nach Fristablauf (05.04.2028), rechtzeitig hingewiesen → jetzt
    // HR zur Prüfung vorgelegt (R05: kein automatisches Nullsetzen mehr).
    const rollover3 = await runVacationCarryoverRollover(new Date("2028-04-05T00:00:00Z"), tenant.id);
    expect(rollover3.flaggedForReview).toBe(1);

    const afterForfeit = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: employee.dbId! },
      select: { vacationCarryover: true },
    });
    // Anspruch bleibt bestehen, bis HR bewusst entscheidet.
    expect(afterForfeit.vacationCarryover).toBe(8);

    const reviewReminder = await prisma.tenantReminder.findFirst({
      where: { tenantId: tenant.id, title: { contains: "Urlaubsverfall prüfen" } },
    });
    expect(reviewReminder).not.toBeNull();
  });

  it("lässt einen Carryover NICHT verfallen, wenn nie rechtzeitig hingewiesen wurde", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m02b-tenant-${RUN_ID}`, name: `M02b Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m02b-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Never",
        lastName: "Reminded",
        email: `m02b-target-${RUN_ID}@ployo.invalid`,
      },
    });
    // Kein verknüpftes User-Konto → notifyEmployeeOfExpiringVacationCarryover
    // kann den Hinweis technisch nicht zustellen (kein Konto zum Benachrichtigen).
    await prisma.tenantEmployee.update({
      where: { id: employee.dbId! },
      data: {
        vacationCarryover: 4,
        vacationCarryoverExpiresAt: new Date("2028-03-31T23:59:59.999Z"),
        vacationCarryoverRemindedAt: null,
      },
    });

    const result = await runVacationCarryoverRollover(new Date("2028-04-05T00:00:00Z"), tenant.id);
    expect(result.flaggedForReview).toBe(0);

    const stillThere = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: employee.dbId! },
      select: { vacationCarryover: true },
    });
    expect(stillThere.vacationCarryover).toBe(4);
  });

  it("R05 — ohne verknüpftes Konto bleibt vacationCarryoverRemindedAt leer, auch wenn der Hinweis planmäßig fällig war", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m02c-tenant-${RUN_ID}`, name: `M02c Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m02c-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "NoAccount",
        lastName: "Target",
        email: `m02c-target-${RUN_ID}@ployo.invalid`,
      },
    });
    // Kein verknüpftes User-Konto — genau der ursprünglich reproduzierte
    // Fehlerpfad (Audit-Finding R05): kein Konto → kein Versand →
    // `remindedAt` durfte vorher trotzdem gesetzt werden → Verfall danach
    // fälschlich erlaubt.
    await prisma.tenantEmployee.update({
      where: { id: employee.dbId! },
      data: {
        vacationCarryover: 6,
        vacationCarryoverExpiresAt: new Date("2028-03-31T23:59:59.999Z"),
        vacationCarryoverRemindedAt: null,
      },
    });

    // Schritt 1: innerhalb der Vorlauffrist — der Hinweis wäre fällig, kann
    // aber technisch nicht zugestellt werden.
    const dueRun = await runVacationCarryoverRollover(new Date("2028-03-15T00:00:00Z"), tenant.id);
    expect(dueRun.remindersSent).toBe(0);

    const afterDueRun = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: employee.dbId! },
      select: { vacationCarryoverRemindedAt: true },
    });
    expect(afterDueRun.vacationCarryoverRemindedAt).toBeNull();

    const undeliverableReminder = await prisma.tenantReminder.findFirst({
      where: { tenantId: tenant.id, title: { contains: "nicht zustellbar" } },
    });
    expect(undeliverableReminder).not.toBeNull();

    // Schritt 2: nach Fristablauf — OHNE dokumentierten rechtzeitigen Hinweis
    // darf der Anspruch nicht zur Prüfung/zum Verfall markiert werden.
    const afterExpiry = await runVacationCarryoverRollover(new Date("2028-04-05T00:00:00Z"), tenant.id);
    expect(afterExpiry.flaggedForReview).toBe(0);

    const stillThere = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: employee.dbId! },
      select: { vacationCarryover: true },
    });
    expect(stillThere.vacationCarryover).toBe(6);
  });
});

describe("M03 — Schichtprüfung: Pausen, Überschneidungen, Jugendarbeitsschutz-Wochenlimit, Veröffentlichungs-Revalidierung", () => {
  it("lehnt eine Schicht mit unzureichender Pause ab (§4 ArbZG: über 9h Anwesenheit verlangt 45 Min.)", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m03a-tenant-${RUN_ID}`, name: `M03a Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m03a-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);
    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Break",
        lastName: "Rule",
        email: `m03a-emp-${RUN_ID}@ployo.invalid`,
      },
    });

    await expect(
      createTenantShift({
        tenantSlug: tenant.slug,
        date: "2027-06-07",
        startTime: "08:00",
        endTime: "18:00", // 10h Anwesenheit, >9h -> 45 Min. Pause vorgeschrieben
        breakMinutes: 20,
        employeeId: employee.dbId!,
      }),
    ).rejects.toThrow(/Pause/);
  });

  it("lehnt eine zeitliche Überschneidung mit einer bestehenden Schicht derselben Person ab", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m03b-tenant-${RUN_ID}`, name: `M03b Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m03b-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);
    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Overlap",
        lastName: "Case",
        email: `m03b-emp-${RUN_ID}@ployo.invalid`,
      },
    });

    await createTenantShift({
      tenantSlug: tenant.slug,
      date: "2027-06-07",
      startTime: "08:00",
      endTime: "16:00",
      breakMinutes: 30,
      employeeId: employee.dbId!,
    });

    await expect(
      createTenantShift({
        tenantSlug: tenant.slug,
        date: "2027-06-07",
        startTime: "14:00",
        endTime: "20:00",
        breakMinutes: 30,
        employeeId: employee.dbId!,
      }),
    ).rejects.toThrow(/überschneidet/);
  });

  it("lehnt eine Schicht ab, die für einen Jugendlichen die Wochenhöchstarbeitszeit von 40h überschreitet (§8 JArbSchG)", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m03c-tenant-${RUN_ID}`, name: `M03c Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m03c-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);
    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const minor = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Young",
        lastName: "Worker",
        email: `m03c-emp-${RUN_ID}@ployo.invalid`,
        birthDate: "2011-01-01",
      },
    });

    // Mo-Fr, je 9h Anwesenheit mit vorgeschriebener 60-Min.-Pause (§11
    // JArbSchG, >6h) -> 8h Nettoarbeitszeit/Tag, in Summe 40h/Woche.
    const weekdaysOfWeek = ["2027-06-07", "2027-06-08", "2027-06-09", "2027-06-10", "2027-06-11"];
    for (const date of weekdaysOfWeek) {
      await createTenantShift({
        tenantSlug: tenant.slug,
        date,
        startTime: "08:00",
        endTime: "17:00",
        breakMinutes: 60,
        employeeId: minor.dbId!,
      });
    }

    // Samstag derselben Kalenderwoche, nur 1h zusätzlich -> Wochensumme 41h.
    await expect(
      createTenantShift({
        tenantSlug: tenant.slug,
        date: "2027-06-12",
        startTime: "09:00",
        endTime: "10:00",
        breakMinutes: 0,
        employeeId: minor.dbId!,
      }),
    ).rejects.toThrow(/40h\/Woche/);
  });

  it("publishShiftWeek lehnt eine Woche ab, in der eine Schicht seit ihrer Anlage gegen Mutterschutz verstößt", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m03d-tenant-${RUN_ID}`, name: `M03d Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m03d-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);
    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Later",
        lastName: "Protected",
        email: `m03d-emp-${RUN_ID}@ployo.invalid`,
      },
    });

    // 2027-06-13 ist ein Sonntag — zum Anlagezeitpunkt ohne Mutterschutz-Flag
    // zulässig.
    await createTenantShift({
      tenantSlug: tenant.slug,
      date: "2027-06-13",
      startTime: "10:00",
      endTime: "14:00",
      breakMinutes: 0,
      employeeId: employee.dbId!,
    });

    // Mutterschutz wird NACH der Schichtanlage aktiv gesetzt — die Schicht
    // selbst wurde seither nicht erneut gespeichert.
    await prisma.tenantEmployee.update({
      where: { id: employee.dbId! },
      data: { maternityProtectionActive: true },
    });

    const { year, week } = getISOWeekFromDate(new Date("2027-06-13T00:00:00Z"));

    await expect(publishShiftWeek({ tenantSlug: tenant.slug, year, week })).rejects.toThrow(
      /Mutterschutz/,
    );
  });

  it("R08 — eine erste, noch nie zuvor verplante 8,5h-Schicht wird nicht mehr pauschal als Ausgleichsverstoß abgelehnt", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m03e-tenant-${RUN_ID}`, name: `M03e Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m03e-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "First",
        lastName: "Shift",
        email: `m03e-emp-${RUN_ID}@ployo.invalid`,
      },
    });

    // Erste jemals verplante Schicht dieser Person: 8,5h netto. Mit "Tage,
    // an denen eine Schicht existiert" als Nenner (Bug) wäre das immer genau
    // 1 Tag -> 8,5h Schnitt -> immer abgelehnt. Mit Werktagen im 6-Monats-
    // Fenster als Nenner verdünnen die vielen schichtfreien Werktage den
    // Schnitt weit unter 8h.
    const shift = await createTenantShift({
      tenantSlug: tenant.slug,
      date: "2027-06-09", // Mittwoch
      startTime: "08:00",
      endTime: "17:00",
      breakMinutes: 30,
      employeeId: employee.dbId!,
    });

    expect(shift.startTime).toBe("08:00");
  });
});

describe("M05 — Anonymisierung/Löschung erfasst Namens-Slug, Konto-Verknüpfung und Namens-Schnappschüsse in anderen Modellen", () => {
  it("anonymizeFormerEmployeePii regeneriert den Namens-Slug, trennt die Konto-Verknüpfung und bereinigt Standort-Leitung/Datei-Zuweisung", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m05a-tenant-${RUN_ID}`, name: `M05a Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m05a-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const employeeUser = await prisma.user.create({
      data: { email: `m05a-emp-user-${RUN_ID}@ployo.invalid`, name: "Former Employee", emailVerified: true },
    });
    userIds.push(owner.id, employeeUser.id);

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: employeeUser.id, role: "EMPLOYEE" },
      ],
    });

    currentUserId = owner.id;
    const created = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Former",
        lastName: "Leader",
        email: `m05a-target-${RUN_ID}@ployo.invalid`,
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: created.dbId! },
      data: { userId: employeeUser.id },
    });

    const location = await prisma.tenantLocation.create({
      data: {
        tenantId: tenant.id,
        key: `m05a-loc-${RUN_ID}`,
        kind: "office",
        name: "Filiale Nord",
        leadEmployeeId: created.dbId!,
        leadName: "Former Leader",
        leadInitials: "FL",
        leadPhone: "+49 30 1234567",
        leadEmail: `m05a-target-${RUN_ID}@ployo.invalid`,
      },
    });

    const file = await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        storageKey: `m05a-file-${RUN_ID}`,
        originalName: "notiz.pdf",
        displayName: "Notiz",
        assignedEmployeeId: created.dbId!,
        assignedEmployeeName: "Former Leader",
      },
    });

    const team = await prisma.tenantTeam.create({
      data: { tenantId: tenant.id, key: `m05a-team-${RUN_ID}`, name: "Team Nord" },
    });
    const teamMember = await prisma.tenantTeamMember.create({
      data: {
        teamId: team.id,
        employeeId: created.dbId!,
        initials: "FL",
        name: "Former Leader",
        location: "Filiale Nord",
        role: "Verkauf",
        contract: "Vollzeit",
      },
    });
    const locationMember = await prisma.tenantLocationMember.create({
      data: {
        locationId: location.id,
        employeeId: created.dbId!,
        initials: "FL",
        name: "Former Leader",
      },
    });

    const employee = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: created.dbId! },
      select: {
        id: true,
        tenantId: true,
        employeeNumber: true,
        privateAddressId: true,
        workAddressId: true,
        userId: true,
      },
    });

    await anonymizeFormerEmployeePii(employee);

    const anonymized = await prisma.tenantEmployee.findUniqueOrThrow({
      where: { id: created.dbId! },
      select: { key: true, userId: true, name: true },
    });
    expect(anonymized.key).toBe(`anon-${employee.employeeNumber}`.toLowerCase());
    expect(anonymized.userId).toBeNull();
    expect(anonymized.name).toContain(employee.employeeNumber);

    const updatedLocation = await prisma.tenantLocation.findUniqueOrThrow({
      where: { id: location.id },
      select: { leadEmployeeId: true, leadName: true, leadInitials: true, leadPhone: true, leadEmail: true },
    });
    expect(updatedLocation.leadEmployeeId).toBeNull();
    expect(updatedLocation.leadName).toBe("Keine Leitung");
    expect(updatedLocation.leadPhone).toBe("");
    expect(updatedLocation.leadEmail).toBe("");

    const updatedFile = await prisma.tenantFile.findUniqueOrThrow({
      where: { id: file.id },
      select: { assignedEmployeeId: true, assignedEmployeeName: true },
    });
    expect(updatedFile.assignedEmployeeId).toBe("");
    expect(updatedFile.assignedEmployeeName).toBe("");

    // R08 — Team-/Standort-Mitgliedslisten führen denselben Name-Schnappschuss
    // wie die Standort-Leitung oben und blieben bisher unangetastet.
    const updatedTeamMember = await prisma.tenantTeamMember.findUniqueOrThrow({
      where: { id: teamMember.id },
      select: { name: true, initials: true },
    });
    expect(updatedTeamMember.name).not.toBe("Former Leader");
    expect(updatedTeamMember.name).toContain(employee.employeeNumber);
    expect(updatedTeamMember.initials).toBe("EM");

    const updatedLocationMember = await prisma.tenantLocationMember.findUniqueOrThrow({
      where: { id: locationMember.id },
      select: { name: true, initials: true },
    });
    expect(updatedLocationMember.name).not.toBe("Former Leader");
    expect(updatedLocationMember.name).toContain(employee.employeeNumber);
    expect(updatedLocationMember.initials).toBe("EM");
  });

  it("deleteUserAccessImmediately entfernt auch verwaiste ConsentRecord-Einträge (keine harte FK/Kaskade zu User)", async () => {
    const user = await prisma.user.create({
      data: { email: `m05b-user-${RUN_ID}@ployo.invalid`, name: "Consent User", emailVerified: true },
    });
    userIds.push(user.id);

    const consent = await prisma.consentRecord.create({
      data: { userId: user.id, value: "accepted-all", bannerVersion: "v1" },
    });

    await deleteUserAccessImmediately(user.id);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.consentRecord.findUnique({ where: { id: consent.id } })).toBeNull();
  });

  it("purgeExpiredConsentRecords löscht nur abgelaufene Cookie-Consent-Nachweise, nicht aktuelle", async () => {
    const old = await prisma.consentRecord.create({
      data: {
        userId: `m05c-old-${RUN_ID}`,
        value: "accepted-all",
        bannerVersion: "v1",
        createdAt: new Date("2020-01-01T00:00:00Z"),
      },
    });
    const recent = await prisma.consentRecord.create({
      data: { userId: `m05c-recent-${RUN_ID}`, value: "accepted-all", bannerVersion: "v1" },
    });

    const result = await purgeExpiredConsentRecords(new Date("2026-09-06T00:00:00Z"));

    expect(result.deleted).toBeGreaterThanOrEqual(1);
    expect(await prisma.consentRecord.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.consentRecord.findUnique({ where: { id: recent.id } })).not.toBeNull();

    await prisma.consentRecord.delete({ where: { id: recent.id } });
  });
});

describe("M13 — Audit-Log-Bereich wird serverseitig aus entityType abgeleitet, nicht vom Aufrufer gewählt", () => {
  it("Custom-Rolle mit Leserecht+canViewAudit nur in 'reminders' bekommt keinen Zugriff auf das Audit-Log eines Mitarbeiters", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m13a-tenant-${RUN_ID}`, name: `M13a Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m13a-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const viewer = await prisma.user.create({
      data: { email: `m13a-viewer-${RUN_ID}@ployo.invalid`, name: "Viewer", emailVerified: true },
    });
    userIds.push(owner.id, viewer.id);

    const viewerRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "reminders-audit-only-m13a",
        name: "Nur Erinnerungen + Audit",
        permissions: {
          create: [{ area: "reminders", level: "read", scope: "all", canViewAudit: true }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: viewer.id, role: "EMPLOYEE", roleId: viewerRole.id },
      ],
    });

    currentUserId = owner.id;
    const target = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Audit",
        lastName: "Target",
        email: `m13a-target-${RUN_ID}@ployo.invalid`,
      },
    });
    await recordTenantAudit({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      action: "Testeintrag",
      source: "Test",
      entityType: "employee",
      entityId: target.dbId!,
    });

    currentUserId = viewer.id;
    await expect(
      getAuditLogsForEntity({ tenantSlug: tenant.slug, entityType: "employee", entityId: target.dbId! }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("ein team-gescopter Leser mit 'employees'-Audit-Recht sieht das Audit-Log eines Mitarbeiters außerhalb des eigenen Teams nicht", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m13b-tenant-${RUN_ID}`, name: `M13b Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m13b-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const viewer = await prisma.user.create({
      data: { email: `m13b-viewer-${RUN_ID}@ployo.invalid`, name: "Viewer", emailVerified: true },
    });
    userIds.push(owner.id, viewer.id);

    const viewerRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "team-employees-audit-m13b",
        name: "Team-Mitarbeiter + Audit",
        permissions: {
          create: [{ area: "employees", level: "read", scope: "team", canViewAudit: true }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: viewer.id, role: "EMPLOYEE", roleId: viewerRole.id },
      ],
    });

    await prisma.tenantTeam.createMany({
      data: [
        { tenantId: tenant.id, key: "alpha-m13b", name: "Alpha" },
        { tenantId: tenant.id, key: "beta-m13b", name: "Beta" },
      ],
    });

    currentUserId = owner.id;
    const viewerEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Viewer",
        lastName: "Alpha",
        email: `m13b-viewer-emp-${RUN_ID}@ployo.invalid`,
        team: "Alpha",
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: viewerEmployee.dbId! },
      data: { userId: viewer.id },
    });
    const target = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Beta",
        lastName: "Target",
        email: `m13b-target-${RUN_ID}@ployo.invalid`,
        team: "Beta",
      },
    });
    await recordTenantAudit({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      action: "Testeintrag",
      source: "Test",
      entityType: "employee",
      entityId: target.dbId!,
    });

    currentUserId = viewer.id;
    await expect(
      getAuditLogsForEntity({ tenantSlug: tenant.slug, entityType: "employee", entityId: target.dbId! }),
    ).rejects.toThrow(/FORBIDDEN/);

    // Zur Kontrolle: das eigene Team-Audit-Log bleibt zugänglich.
    await recordTenantAudit({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      action: "Testeintrag",
      source: "Test",
      entityType: "employee",
      entityId: viewerEmployee.dbId!,
    });
    const ownEntries = await getAuditLogsForEntity({
      tenantSlug: tenant.slug,
      entityType: "employee",
      entityId: viewerEmployee.dbId!,
    });
    expect(ownEntries.length).toBeGreaterThan(0);
  });

  it("lehnt einen unbekannten entityType ab, statt zu raten", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m13c-tenant-${RUN_ID}`, name: `M13c Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m13c-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);
    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    await expect(
      getAuditLogsForEntity({ tenantSlug: tenant.slug, entityType: "not-a-real-type", entityId: "whatever" }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("R08 — ein own-gescopter Leser mit vacation-Audit-Recht sieht den Audit-Trail eines FREMDEN vacation-request nicht", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m13d-tenant-${RUN_ID}`, name: `M13d Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m13d-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const viewer = await prisma.user.create({
      data: { email: `m13d-viewer-${RUN_ID}@ployo.invalid`, name: "Viewer", emailVerified: true },
    });
    userIds.push(owner.id, viewer.id);

    const ownVacationAuditRole = await prisma.tenantRole.create({
      data: {
        tenantId: tenant.id,
        key: "own-vacation-audit-m13d",
        name: "Eigener Urlaub + Audit",
        permissions: {
          create: [{ area: "vacation", level: "read", scope: "own", canViewAudit: true }],
        },
      },
    });

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: viewer.id, role: "EMPLOYEE", roleId: ownVacationAuditRole.id },
      ],
    });

    currentUserId = owner.id;
    const viewerEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Viewer",
        lastName: "Self",
        email: `m13d-viewer-emp-${RUN_ID}@ployo.invalid`,
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: viewerEmployee.dbId! },
      data: { userId: viewer.id },
    });

    const otherEmployee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Other",
        lastName: "Employee",
        email: `m13d-other-${RUN_ID}@ployo.invalid`,
      },
    });

    const foreignRequest = await prisma.tenantVacationRequest.create({
      data: {
        tenantId: tenant.id,
        employeeId: otherEmployee.dbId!,
        key: `m13d-req-${RUN_ID}`,
        startDate: "2027-07-01",
        endDate: "2027-07-05",
        days: 5,
        status: "pending",
      },
    });
    await recordTenantAudit({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      action: "Testeintrag",
      source: "Test",
      entityType: "vacation-request",
      entityId: foreignRequest.id,
    });

    currentUserId = viewer.id;
    await expect(
      getAuditLogsForEntity({
        tenantSlug: tenant.slug,
        entityType: "vacation-request",
        entityId: foreignRequest.id,
      }),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("M16 — Krankheitsübersicht zeigt seit über 6 Monaten durchgehend offene Fälle weiterhin als aktuell krank", () => {
  it("ein Fall, der vor 7 Monaten begann und noch offen ist (kein Enddatum), bleibt in 'Aktuell krank' sichtbar", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m16-tenant-${RUN_ID}`, name: `M16 Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m16-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);
    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "LongTerm",
        lastName: "Sick",
        email: `m16-emp-${RUN_ID}@ployo.invalid`,
      },
    });

    const sevenMonthsAgo = new Date();
    sevenMonthsAgo.setUTCMonth(sevenMonthsAgo.getUTCMonth() - 7);

    await createTenantSicknessReport({
      tenantSlug: tenant.slug,
      employeeId: employee.dbId!,
      startDate: sevenMonthsAgo.toISOString().slice(0, 10),
    });

    const dashboard = await getSicknessForTenant(tenant.slug);
    expect(dashboard.current.some((entry) => entry.employeeId === employee.dbId)).toBe(true);
  });
});

describe("M07 — jeder endgültige Löschpfad prüft dieselbe Sole-Owner-Sperre und Aufräumschritte", () => {
  it("deleteUserAccessImmediately lehnt die Löschung des alleinigen Inhabers eines Mandanten ab", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m07-tenant-${RUN_ID}`, name: `M07 Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const soleOwner = await prisma.user.create({
      data: { email: `m07-owner-${RUN_ID}@ployo.invalid`, name: "Sole Owner", emailVerified: true },
    });
    userIds.push(soleOwner.id);
    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: soleOwner.id, role: "OWNER" },
    });

    await expect(deleteUserAccessImmediately(soleOwner.id)).rejects.toThrow(/alleinige/);

    expect(await prisma.user.findUnique({ where: { id: soleOwner.id } })).not.toBeNull();
  });

  it("erlaubt die Löschung, sobald ein weiterer Inhaber existiert", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m07b-tenant-${RUN_ID}`, name: `M07b Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const leavingOwner = await prisma.user.create({
      data: { email: `m07b-leaving-${RUN_ID}@ployo.invalid`, name: "Leaving Owner", emailVerified: true },
    });
    const otherOwner = await prisma.user.create({
      data: { email: `m07b-other-${RUN_ID}@ployo.invalid`, name: "Other Owner", emailVerified: true },
    });
    userIds.push(leavingOwner.id, otherOwner.id);
    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: leavingOwner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: otherOwner.id, role: "OWNER" },
      ],
    });

    await deleteUserAccessImmediately(leavingOwner.id);

    expect(await prisma.user.findUnique({ where: { id: leavingOwner.id } })).toBeNull();
  });

  it("R08 — unlinkAndCleanupBeforeUserDeletion (gemeinsamer Baustein für den SDK-Hook) räumt auch das Profilbild-S3-Objekt auf, ohne bei einem Storage-Fehler zu blockieren", async () => {
    const user = await prisma.user.create({
      data: { email: `m07c-user-${RUN_ID}@ployo.invalid`, name: "Avatar User", emailVerified: true },
    });
    userIds.push(user.id);

    // Erfolgsfall: normaler Schlüssel, das gemockte S3 "löscht" klaglos.
    await expect(unlinkAndCleanupBeforeUserDeletion(user.id)).resolves.not.toThrow();

    // Ein Storage-Fehler beim Profilbild darf die restliche Bereinigung
    // nicht blockieren (best-effort) — Schlüssel enthält "fail-me", siehe
    // gemockter S3-Client oben.
    await expect(unlinkAndCleanupBeforeUserDeletion(`fail-me-${user.id}`)).resolves.not.toThrow();
  });
});

describe("M06 — Personalakte-Export enthält Mutterschutz-Notiz, In-App-Posteingang und Consent-Nachweise", () => {
  it("enthält jetzt entschlüsselte Mutterschutz-Notiz, eigene Benachrichtigungen und eigene Consent-Einträge", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `m06-tenant-${RUN_ID}`, name: `M06 Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `m06-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    const employeeUser = await prisma.user.create({
      data: { email: `m06-emp-user-${RUN_ID}@ployo.invalid`, name: "Self", emailVerified: true },
    });
    userIds.push(owner.id, employeeUser.id);

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
        { tenantId: tenant.id, userId: employeeUser.id, role: "EMPLOYEE" },
      ],
    });

    currentUserId = owner.id;
    const employee = await createTenantEmployeeRecord({
      tenantId: tenant.id,
      actorId: owner.id,
      actorName: "Owner",
      input: {
        tenantSlug: tenant.slug,
        firstName: "Self",
        lastName: "Export",
        email: `m06-target-${RUN_ID}@ployo.invalid`,
      },
    });
    await prisma.tenantEmployee.update({
      where: { id: employee.dbId! },
      data: {
        userId: employeeUser.id,
        maternityProtectionActive: true,
        maternityProtectionNote: encryptField("Geschützt bis ca. 12.2027"),
      },
    });
    await prisma.tenantEmployeeNotification.create({
      data: {
        tenantId: tenant.id,
        userId: employeeUser.id,
        category: "system",
        title: "Test-Benachrichtigung",
        detail: "Details",
      },
    });
    const consent = await prisma.consentRecord.create({
      data: { userId: employeeUser.id, value: "accepted-all", bannerVersion: "v1", ipAddress: "203.0.113.5" },
    });

    currentUserId = employeeUser.id;
    const exportData = await getMyPersonalakteExport(tenant.slug);

    expect(exportData.maternityProtection).toEqual({ active: true, note: "Geschützt bis ca. 12.2027" });
    expect(exportData.notifications.some((n) => n.title === "Test-Benachrichtigung")).toBe(true);
    expect(exportData.consentRecords.some((c) => c.ipAddress === "203.0.113.5")).toBe(true);

    await prisma.consentRecord.delete({ where: { id: consent.id } });
  });
});

describe("M14 — Stripe-Webhook: Event-Dedup und Schutz vor veralteten Ereignissen", () => {
  it("isStaleEvent lehnt ein Event ab, das älter ist als der zuletzt angewendete Stand, lässt Gleichstand/Neueres durch", () => {
    const lastAppliedAt = new Date("2027-01-10T12:00:00Z");
    const tenant = { stripeLastEventCreatedAt: lastAppliedAt };
    const olderEventCreated = Math.floor(new Date("2027-01-10T11:00:00Z").getTime() / 1000);
    const sameEventCreated = Math.floor(lastAppliedAt.getTime() / 1000);
    const newerEventCreated = Math.floor(new Date("2027-01-10T13:00:00Z").getTime() / 1000);

    expect(isStaleEvent(tenant, olderEventCreated)).toBe(true);
    expect(isStaleEvent(tenant, sameEventCreated)).toBe(false);
    expect(isStaleEvent(tenant, newerEventCreated)).toBe(false);
    expect(isStaleEvent({ stripeLastEventCreatedAt: null }, olderEventCreated)).toBe(false);
  });

  it("StripeWebhookEvent erzwingt Eindeutigkeit je Event-ID (DB-Ebene der Dedup-Sperre)", async () => {
    const eventId = `evt_test_${RUN_ID}_${Math.random().toString(36).slice(2)}`;
    await prisma.stripeWebhookEvent.create({ data: { id: eventId } });

    await expect(prisma.stripeWebhookEvent.create({ data: { id: eventId } })).rejects.toThrow();

    await prisma.stripeWebhookEvent.delete({ where: { id: eventId } });
  });
});

describe("L03 — Profilbild-Sichtbarkeit setzt eine gemeinsame Tenant-Mitgliedschaft voraus", () => {
  it("sharesTenantWith erkennt gemeinsame und fehlende Mitgliedschaft korrekt, inkl. sich selbst", async () => {
    const tenantA = await prisma.tenant.create({
      data: { slug: `l03-tenant-a-${RUN_ID}`, name: `L03 Tenant A ${RUN_ID}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { slug: `l03-tenant-b-${RUN_ID}`, name: `L03 Tenant B ${RUN_ID}` },
    });
    tenantIds.push(tenantA.id, tenantB.id);

    const alice = await prisma.user.create({
      data: { email: `l03-alice-${RUN_ID}@ployo.invalid`, name: "Alice", emailVerified: true },
    });
    const bob = await prisma.user.create({
      data: { email: `l03-bob-${RUN_ID}@ployo.invalid`, name: "Bob", emailVerified: true },
    });
    const carol = await prisma.user.create({
      data: { email: `l03-carol-${RUN_ID}@ployo.invalid`, name: "Carol", emailVerified: true },
    });
    userIds.push(alice.id, bob.id, carol.id);

    await prisma.tenantMembership.createMany({
      data: [
        { tenantId: tenantA.id, userId: alice.id, role: "EMPLOYEE" },
        { tenantId: tenantA.id, userId: bob.id, role: "EMPLOYEE" },
        { tenantId: tenantB.id, userId: carol.id, role: "EMPLOYEE" },
      ],
    });

    expect(await sharesTenantWith(alice.id, bob.id)).toBe(true);
    expect(await sharesTenantWith(alice.id, carol.id)).toBe(false);
    expect(await sharesTenantWith(alice.id, alice.id)).toBe(true);
  });
});

describe("L04 — sessionTimeout-Schalter wird abgelehnt statt wirkungslos gespeichert", () => {
  it("updateTenantSecurity lehnt einen gesetzten sessionTimeout-Wert ab, twoFactorRequired bleibt unberührt davon wirksam", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `l04-tenant-${RUN_ID}`, name: `L04 Tenant ${RUN_ID}` },
    });
    tenantIds.push(tenant.id);

    const owner = await prisma.user.create({
      data: { email: `l04-owner-${RUN_ID}@ployo.invalid`, name: "Owner", emailVerified: true },
    });
    userIds.push(owner.id);

    await prisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: owner.id, role: "OWNER" },
    });

    currentUserId = owner.id;

    await expect(
      updateTenantSecurity({ tenantSlug: tenant.slug, sessionTimeout: true }),
    ).rejects.toThrow(/sessionTimeout/);

    const updated = await updateTenantSecurity({
      tenantSlug: tenant.slug,
      twoFactorRequired: true,
    });
    expect(updated.twoFactorRequired).toBe(true);
  });
});
