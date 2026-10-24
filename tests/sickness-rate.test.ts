import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTenantSicknessReport, getSicknessForTenant } from "@/lib/sickness";

/**
 * Integrationstest für QA-Bug BUG-011: "Krankenquote" zeigte bisher
 * "aktuell krank (JETZT) / Gesamtbelegschaft" — an den meisten Tagen 0,0%,
 * selbst wenn im laufenden Monat längst Krankmeldungen bestanden. Jetzt:
 * Krankheitstage / Soll-Arbeitstage im laufenden Monat (bis heute).
 *
 * Beide Test-Mitarbeiter arbeiten laut `workDaysJson` an allen 7
 * Wochentagen — das macht den erwarteten Wert unabhängig vom aktuellen
 * Wochentag/Monatstag (keine Feiertags-/Wochenend-Flakiness): Mitarbeiter A
 * ist den GESAMTEN bisherigen Monat krankgemeldet (trägt gleich viel zu
 * Zähler wie Nenner bei), Mitarbeiter B ist gesund (trägt nur zum Nenner
 * bei) — macht die erwartete Quote exakt 50,0%.
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
const tenantSlug = `test-sickness-rate-${RUN_ID}`;
const ALL_WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

let tenantId: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Sickness Rate Test ${RUN_ID}` },
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
  if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
  if (actorUserId) await prisma.user.deleteMany({ where: { id: actorUserId } });
  await prisma.$disconnect();
});

describe("getSicknessForTenant — Krankenquote (BUG-011)", () => {
  it("berechnet die Quote als Krankheitstage / Soll-Arbeitstage statt 'aktuell krank / Belegschaft'", async () => {
    const now = new Date();
    const monthStartIso = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;

    const sickEmployee = await prisma.tenantEmployee.create({
      data: {
        tenantId,
        key: `sick-employee-${RUN_ID}`,
        initials: "SI",
        name: `Sick Employee ${RUN_ID}`,
        employeeNumber: `sick-${RUN_ID}`,
        workDaysJson: ALL_WEEKDAYS,
      },
    });
    await prisma.tenantEmployee.create({
      data: {
        tenantId,
        key: `healthy-employee-${RUN_ID}`,
        initials: "HE",
        name: `Healthy Employee ${RUN_ID}`,
        employeeNumber: `healthy-${RUN_ID}`,
        workDaysJson: ALL_WEEKDAYS,
      },
    });

    // Krankgemeldet vom Monatsanfang bis heute (offen, kein Enddatum) — die
    // Funktion klippt ein noch offenes Ende automatisch auf "heute".
    await createTenantSicknessReport({
      tenantSlug,
      employeeId: sickEmployee.id,
      startDate: monthStartIso,
    });

    const dashboard = await getSicknessForTenant(tenantSlug);
    const rateMetric = dashboard.metrics.find((metric) => metric.label === "Krankenquote");

    expect(rateMetric).toBeDefined();
    expect(rateMetric?.value).toBe("50.0%");
  });
});
