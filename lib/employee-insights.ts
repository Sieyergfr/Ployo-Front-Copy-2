import "server-only";

import { prisma } from "@/lib/prisma";
import { assertEmployeeInScope, requireTenantAccess } from "@/lib/tenant-access";

/**
 * Lesende Auswertungen für die Personalakte (Tabs "Übersicht" und
 * "Abwesenheiten"). Jeder Teil prüft sein eigenes Recht samt Scope —
 * Krankheitsdaten sind Gesundheitsdaten (Art. 9 DSGVO) und erscheinen nur mit
 * "sickness:read" für genau diese Person.
 */

async function scopedAccess(tenantSlug: string, area: "vacation" | "sickness", employeeId: string) {
  try {
    const access = await requireTenantAccess(tenantSlug, area, "read");

    await assertEmployeeInScope(access, employeeId);

    return access;
  } catch {
    return null;
  }
}

function inclusiveDays(start: Date, end: Date) {
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

  return Math.max(1, Math.round((endDay - startDay) / 86_400_000) + 1);
}

export type EmployeeAbsences = {
  vacations: Array<{
    id: string;
    startDate: string;
    endDate: string;
    days: number;
    status: string;
    note: string;
  }> | null;
  sickness: Array<{
    id: string;
    startDate: string;
    endDate: string | null;
    days: number;
    status: string;
    certificateStatus: string;
  }> | null;
  /** Krankheitstage im laufenden Jahr und der Durchschnitt im eigenen Team (gleicher Scope). */
  sickDaysThisYear: number | null;
  teamAverageSickDays: number | null;
};

export async function getEmployeeAbsences(input: {
  tenantSlug: string;
  employeeId: string;
  team: string;
}): Promise<EmployeeAbsences> {
  const [vacationAccess, sicknessAccess] = await Promise.all([
    scopedAccess(input.tenantSlug, "vacation", input.employeeId),
    scopedAccess(input.tenantSlug, "sickness", input.employeeId),
  ]);
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const vacations = vacationAccess
    ? (
        await prisma.tenantVacationRequest.findMany({
          where: { tenantId: vacationAccess.tenantId, employeeId: input.employeeId },
          orderBy: { startDate: "desc" },
          take: 50,
        })
      ).map((request) => ({
        id: request.id,
        startDate: request.startDate,
        endDate: request.endDate,
        days: request.days,
        status: request.status,
        note: request.note,
      }))
    : null;

  if (!sicknessAccess) {
    return { vacations, sickness: null, sickDaysThisYear: null, teamAverageSickDays: null };
  }

  const reports = await prisma.tenantSicknessReport.findMany({
    where: { tenantId: sicknessAccess.tenantId, employeeId: input.employeeId },
    orderBy: { startDate: "desc" },
    take: 50,
  });
  const daysThisYear = (rows: Array<{ startDate: Date; endDate: Date | null }>) =>
    rows.reduce((sum, row) => {
      const start = row.startDate < yearStart ? yearStart : row.startDate;
      const end = row.endDate && row.endDate < now ? row.endDate : now;

      return end < start ? sum : sum + inclusiveDays(start, end);
    }, 0);

  // Teamvergleich nur innerhalb des eigenen Sichtbereichs (Scope).
  let teamAverageSickDays: number | null = null;

  if (input.team) {
    const teammates = await prisma.tenantEmployee.findMany({
      where: { tenantId: sicknessAccess.tenantId, team: input.team, status: { not: "former" } },
      select: { id: true },
    });
    const visible: string[] = [];

    for (const teammate of teammates) {
      try {
        await assertEmployeeInScope(sicknessAccess, teammate.id);
        visible.push(teammate.id);
      } catch {
        // außerhalb des Scopes — zählt nicht mit
      }
    }

    if (visible.length > 1) {
      const teamReports = await prisma.tenantSicknessReport.findMany({
        where: {
          tenantId: sicknessAccess.tenantId,
          employeeId: { in: visible },
          OR: [{ endDate: null }, { endDate: { gte: yearStart } }],
          startDate: { lte: now },
        },
        select: { startDate: true, endDate: true },
      });

      teamAverageSickDays = Math.round((daysThisYear(teamReports) / visible.length) * 10) / 10;
    }
  }

  return {
    vacations,
    sickness: reports.map((report) => ({
      id: report.id,
      startDate: report.startDate.toISOString().slice(0, 10),
      endDate: report.endDate ? report.endDate.toISOString().slice(0, 10) : null,
      days: inclusiveDays(report.startDate, report.endDate ?? now),
      status: report.status,
      certificateStatus: report.certificateStatus,
    })),
    sickDaysThisYear: daysThisYear(reports.filter((report) => report.startDate <= now)),
    teamAverageSickDays,
  };
}
