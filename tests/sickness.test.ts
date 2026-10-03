import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  closeTenantSicknessReport,
  createTenantSicknessReport,
  getSicknessForTenant,
  updateTenantSicknessReport,
} from "@/lib/sickness";

/**
 * Integrationstest für QA-Bug BUG-015: eine Krankmeldung mit vergangenem
 * Zeitraum galt bisher sofort als "abgeschlossen" (rein anhand des Datums),
 * obwohl `TenantSicknessReport.status` weiterhin "open" war — Korrektur/
 * Storno waren dadurch unmöglich. Jetzt unterscheidet der zurückgegebene
 * `status` beide Fälle, und nur ein echtes `closeTenantSicknessReport`
 * sperrt eine Meldung wirklich.
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
const tenantSlug = `test-sickness-status-${RUN_ID}`;

let tenantId: string;
let employeeId: string;

/** ISO-Datum (YYYY-MM-DD) `daysAgo` Tage vor heute — bleibt innerhalb des 6-Monats-Fensters von `getSicknessForTenant`. */
function isoDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { slug: tenantSlug, name: `Sickness Status Test ${RUN_ID}` },
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

  const employee = await prisma.tenantEmployee.create({
    data: {
      tenantId,
      key: `employee-${RUN_ID}`,
      initials: "TE",
      name: `Test Employee ${RUN_ID}`,
      employeeNumber: `emp-${RUN_ID}`,
    },
  });
  employeeId = employee.id;
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.user.deleteMany({ where: { id: actorUserId } });
  await prisma.$disconnect();
});

describe("getSicknessForTenant — history status (BUG-015)", () => {
  it("markiert eine Meldung mit vergangenem, nie geschlossenem Zeitraum als weiterhin 'open'", async () => {
    const startDate = isoDaysAgo(20);
    await createTenantSicknessReport({
      tenantSlug,
      employeeId,
      startDate,
      endDate: isoDaysAgo(19),
    });

    const dashboard = await getSicknessForTenant(tenantSlug);
    const entry = dashboard.history.find((item) => item.startDateIso === startDate);

    expect(entry).toBeDefined();
    expect(entry?.status).toBe("open");
  });

  it("markiert eine explizit geschlossene Meldung als 'closed'", async () => {
    const report = await createTenantSicknessReport({
      tenantSlug,
      employeeId,
      startDate: isoDaysAgo(30),
      endDate: isoDaysAgo(29),
    });

    await closeTenantSicknessReport({ tenantSlug, reportId: report.id });

    const dashboard = await getSicknessForTenant(tenantSlug);
    const entry = dashboard.history.find((item) => item.id === report.id);

    expect(entry).toBeDefined();
    expect(entry?.status).toBe("closed");
  });

  it("erlaubt weiterhin eine Korrektur einer 'open', aber vergangenen Meldung", async () => {
    const report = await createTenantSicknessReport({
      tenantSlug,
      employeeId,
      startDate: isoDaysAgo(40),
      endDate: isoDaysAgo(39),
    });
    const correctedEndDate = isoDaysAgo(38);

    await expect(
      updateTenantSicknessReport({
        tenantSlug,
        reportId: report.id,
        startDate: isoDaysAgo(40),
        endDate: correctedEndDate,
      }),
    ).resolves.toBeTruthy();

    const updated = await prisma.tenantSicknessReport.findUniqueOrThrow({
      where: { id: report.id },
    });
    expect(updated.endDate?.toISOString().slice(0, 10)).toBe(correctedEndDate);
  });
});
