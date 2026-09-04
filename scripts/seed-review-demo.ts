import { config } from "dotenv";
import path from "node:path";

config({ path: path.join(process.cwd(), ".env") });

import { PrismaClient, Prisma } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { buildStorageKey } from "../lib/storage/key-builder";
import { uploadObject } from "../lib/storage/upload";
import { getStorageBucket } from "../lib/storage/buckets";

/**
 * Legt einen dauerhaften Reviewer-/Demo-Betrieb fuer den App-Store-/Play-Review
 * an (App-Store-Review-Checkliste.md): ein Owner-Konto, ein normaler
 * Mitarbeiter und ein Mitarbeiter mit HR-Rolle, samt Beispieldaten (Schicht,
 * Urlaub, Krankmeldung, Datei, Benachrichtigung). Direkter Prisma-Zugriff
 * statt der App-Service-Schicht, nach demselben Muster wie
 * tests/e2e/global-setup.ts (das dort schon fuer genau diesen Zweck -
 * Nutzer+Tenant direkt anlegen, ohne /register - erprobt ist). Idempotent:
 * loescht vorherige Demo-Daten unter denselben Kennungen und legt sie neu an,
 * damit sich das Skript gefahrlos erneut ausfuehren laesst.
 */

const TENANT_SLUG = "ployo-demo";
const TENANT_NAME = "Ployo Demo GmbH";
const DEMO_PASSWORD = "PloyoReview2026!";

const OWNER_EMAIL = "demo@ployo.io";
const EMPLOYEE_EMAIL = "maxmustermann@ployo.io";
const HR_EMAIL = "hrmuster@ployo.io";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function isoDate(date: Date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** ISO-8601-Wochennummer + zugehoeriges Jahr (Montag = Wochenstart). */
function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** Montag der Woche, die `date` enthaelt. */
function mondayOf(date: Date) {
  const d = new Date(date);
  const day = d.getUTCDay() || 7;
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

const WEEKDAY_BY_INDEX = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log("[seed] Räume alte Demo-Daten weg (falls vorhanden) …");
    await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, EMPLOYEE_EMAIL, HR_EMAIL] } } });
    await prisma.tenant.deleteMany({ where: { slug: TENANT_SLUG } });

    const passwordHash = await hashPassword(DEMO_PASSWORD);

    async function createUser(email: string, name: string) {
      const user = await prisma.user.create({
        data: { email, name, emailVerified: true },
      });
      await prisma.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: passwordHash,
        },
      });
      return user;
    }

    console.log("[seed] Lege Nutzer an …");
    const ownerUser = await createUser(OWNER_EMAIL, "Demo Admin");
    const employeeUser = await createUser(EMPLOYEE_EMAIL, "Max Mustermann");
    const hrUser = await createUser(HR_EMAIL, "Hanna Muster");

    console.log("[seed] Lege Mandant + Mitgliedschaften an …");
    const tenant = await prisma.tenant.create({
      data: {
        slug: TENANT_SLUG,
        name: TENANT_NAME,
        country: "DE",
        timezone: "Europe/Berlin",
        size: "11-50",
        industry: "Gastronomie",
        contactEmail: OWNER_EMAIL,
        memberships: {
          create: [
            { userId: ownerUser.id, role: "OWNER" },
            { userId: employeeUser.id, role: "EMPLOYEE" },
            { userId: hrUser.id, role: "HR" },
          ],
        },
        settings: {
          create: {
            defaultLocationId: "",
          },
        },
      },
    });

    const location = await prisma.tenantLocation.create({
      data: {
        tenantId: tenant.id,
        key: "hauptsitz",
        kind: "Filiale",
        name: "Hauptsitz München",
        employeeCount: 3,
        status: "active",
        leadName: "Demo Admin",
        leadInitials: "DA",
        leadEmail: OWNER_EMAIL,
      },
    });

    console.log("[seed] Lege Personalakten an …");
    const ownerEmployee = await prisma.tenantEmployee.create({
      data: {
        tenantId: tenant.id,
        userId: ownerUser.id,
        key: "demo-admin",
        employeeNumber: "MA-0001",
        initials: "DA",
        name: "Demo Admin",
        location: location.name,
        role: "Geschäftsführung",
        status: "active",
        email: OWNER_EMAIL,
        startDate: isoDate(addDays(new Date(), -365)),
        birthDate: "1985-03-14",
        emergencyContactsJson: JSON.stringify([
          { name: "Alex Admin", relation: "Ehepartner", phone: "+49 151 00000001" },
        ]),
      },
    });

    const employeeEmployee = await prisma.tenantEmployee.create({
      data: {
        tenantId: tenant.id,
        userId: employeeUser.id,
        key: "max-mustermann",
        employeeNumber: "MA-0002",
        initials: "MM",
        name: "Max Mustermann",
        location: location.name,
        role: "Servicekraft",
        status: "active",
        email: EMPLOYEE_EMAIL,
        phone: "+49 151 00000002",
        startDate: isoDate(addDays(new Date(), -200)),
        birthDate: "1997-07-22",
        vacationTotal: 30,
        vacationRemaining: 22,
        vacationTaken: 8,
        emergencyContactsJson: JSON.stringify([
          { name: "Erika Mustermann", relation: "Partnerin", phone: "+49 151 00000003" },
        ]),
      },
    });

    const hrEmployee = await prisma.tenantEmployee.create({
      data: {
        tenantId: tenant.id,
        userId: hrUser.id,
        key: "hanna-muster",
        employeeNumber: "MA-0003",
        initials: "HM",
        name: "Hanna Muster",
        location: location.name,
        role: "HR-Leitung",
        status: "active",
        email: HR_EMAIL,
        phone: "+49 151 00000004",
        startDate: isoDate(addDays(new Date(), -500)),
        birthDate: "1990-11-02",
      },
    });

    await prisma.tenantLocation.update({
      where: { id: location.id },
      data: { leadEmployeeId: ownerEmployee.id },
    });

    await prisma.tenantLocationMember.createMany({
      data: [ownerEmployee, employeeEmployee, hrEmployee].map((employee) => ({
        locationId: location.id,
        employeeId: employee.id,
        initials: employee.initials,
        name: employee.name,
      })),
    });

    console.log("[seed] Lege Schichtplan (laufende Woche, veröffentlicht) an …");
    const now = new Date();
    const { year, week } = getISOWeek(now);
    const monday = mondayOf(now);

    type ShiftSeed = { dayOffset: number; start: string; end: string; note: string };
    const shiftSeeds: ShiftSeed[] = [
      { dayOffset: 0, start: "08:00", end: "16:00", note: "Frühschicht" },
      { dayOffset: 1, start: "08:00", end: "16:00", note: "Frühschicht" },
      { dayOffset: 2, start: "14:00", end: "22:00", note: "Spätschicht" },
      { dayOffset: 4, start: "08:00", end: "16:00", note: "Frühschicht" },
    ];

    const publishedShiftsJson: Prisma.InputJsonValue[] = [];

    for (const [index, seed] of shiftSeeds.entries()) {
      const shiftDate = addDays(monday, seed.dayOffset);
      const dateStr = isoDate(shiftDate);
      const weekday = WEEKDAY_BY_INDEX[seed.dayOffset];
      const key = `demo-shift-${index + 1}`;

      await prisma.tenantShift.create({
        data: {
          tenantId: tenant.id,
          key,
          date: dateStr,
          weekday,
          startTime: seed.start,
          endTime: seed.end,
          breakMinutes: 30,
          note: seed.note,
          employeeId: employeeEmployee.id,
          locationId: location.id,
        },
      });

      publishedShiftsJson.push({
        id: key,
        key,
        date: dateStr,
        weekday,
        startTime: seed.start,
        endTime: seed.end,
        time: `${seed.start} – ${seed.end}`,
        location: location.name,
        locationId: location.id,
        locationAccentClassName: null,
        note: seed.note,
        breakMinutes: 30,
        employeeId: employeeEmployee.id,
        team: "",
      });
    }

    await prisma.tenantShiftWeek.create({
      data: {
        tenantId: tenant.id,
        year,
        week,
        status: "published",
        publishedAt: new Date(),
        publishedBy: "Demo Admin",
        publishedShiftsJson,
      },
    });

    console.log("[seed] Lege Urlaubsanträge an …");
    await prisma.tenantVacationRequest.create({
      data: {
        tenantId: tenant.id,
        employeeId: employeeEmployee.id,
        key: "demo-urlaub-1",
        startDate: isoDate(addDays(now, 20)),
        endDate: isoDate(addDays(now, 24)),
        days: 5,
        status: "approved",
        decidedAt: addDays(now, -5),
        decidedBy: "Demo Admin",
        note: "Sommerurlaub",
      },
    });
    await prisma.tenantVacationRequest.create({
      data: {
        tenantId: tenant.id,
        employeeId: employeeEmployee.id,
        key: "demo-urlaub-2",
        startDate: isoDate(addDays(now, 60)),
        endDate: isoDate(addDays(now, 61)),
        days: 2,
        status: "pending",
        note: "Kurztrip",
      },
    });

    console.log("[seed] Lege Krankmeldung an …");
    await prisma.tenantSicknessReport.create({
      data: {
        tenantId: tenant.id,
        employeeId: employeeEmployee.id,
        startDate: addDays(now, -3),
        endDate: addDays(now, -1),
        status: "closed",
        certificateStatus: "received",
        reportChannel: "app",
        reportedById: employeeUser.id,
        reportedByName: "Max Mustermann",
        note: "Grippaler Infekt, Attest nachgereicht.",
      },
    });

    console.log("[seed] Lege Dateiablage inkl. echtem Upload an …");
    const folder = await prisma.tenantFileFolder.create({
      data: {
        tenantId: tenant.id,
        scope: "tenant",
        name: "Beispieldokumente",
        slug: "beispieldokumente",
        path: "beispieldokumente",
        ownerName: "HR",
      },
    });

    const demoFileContent = Buffer.from(
      "Ployo Demo-Dokument\n\nDies ist ein Beispieldokument für den App-Store-/Play-Review.\n",
      "utf-8",
    );
    const bucketConfig = getStorageBucket("hrDocuments");
    const storageKey = buildStorageKey(bucketConfig, {
      tenantId: tenant.id,
      fileName: "Beispieldokument.txt",
      ownerType: "tenant",
    });

    let fileUploadOk = true;
    try {
      await uploadObject({
        key: storageKey,
        body: demoFileContent,
        contentType: "text/plain",
        metadata: { tenantId: tenant.id, originalName: "Beispieldokument.txt" },
      });
    } catch (error) {
      fileUploadOk = false;
      console.warn(
        "[seed] Echter S3-Upload fehlgeschlagen, lege Datei-Datensatz trotzdem an (Vorschau wird nicht funktionieren):",
        error instanceof Error ? error.message : error,
      );
    }

    await prisma.tenantFile.create({
      data: {
        tenantId: tenant.id,
        folderSlug: "beispieldokumente",
        folderName: "Beispieldokumente",
        bucket: bucketConfig.bucket,
        storageKey,
        originalName: "Beispieldokument.txt",
        displayName: "Beispieldokument.txt",
        mimeType: "text/plain",
        sizeBytes: demoFileContent.byteLength,
        extension: "txt",
        ownerName: "HR",
        uploadedById: ownerUser.id,
        uploadedByName: "Demo Admin",
        documentType: "Sonstiges",
        description: "Beispieldokument für den Review.",
      },
    });

    console.log("[seed] Lege Benachrichtigung an …");
    await prisma.tenantEmployeeNotification.create({
      data: {
        tenantId: tenant.id,
        userId: employeeUser.id,
        category: "shift",
        title: "Neuer Schichtplan veröffentlicht",
        detail: `Dein Schichtplan für KW ${week} wurde veröffentlicht.`,
        entityType: "shift-week",
        entityId: `${year}-${week}`,
      },
    });

    console.log("\n[seed] Fertig.");
    console.log(`  Tenant: ${TENANT_NAME} (Slug: ${TENANT_SLUG})`);
    console.log(`  Owner:    ${OWNER_EMAIL}`);
    console.log(`  Employee: ${EMPLOYEE_EMAIL}`);
    console.log(`  HR:       ${HR_EMAIL}`);
    console.log(`  Passwort (alle drei): ${DEMO_PASSWORD}`);
    console.log(`  Schichtplan-Woche: KW ${week}/${year}, ${shiftSeeds.length} Schichten, veröffentlicht`);
    console.log(`  Datei-Upload erfolgreich: ${fileUploadOk ? "ja" : "NEIN — siehe Warnung oben"}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[seed] Fehlgeschlagen:", error);
  process.exit(1);
});
