import { prisma } from "@/lib/prisma";
import { recordTenantAudit } from "@/lib/audit";
import { requireTenantAccess } from "@/lib/tenant-access";

export type SicknessMetric = { label: string; value: string; caption: string; tone?: "danger" };
export type CurrentSickness = { id: string; initials: string; name: string; location: string; since: string; days: string };
export type SicknessChartItem = { month: string; count: number; height: number; current?: boolean };
export type SicknessHistoryItem = { id: string; initials: string; name: string; location: string; startDate: string; endDate: string; days: string };
export type SicknessDashboardData = {
  metrics: SicknessMetric[];
  current: CurrentSickness[];
  chart: SicknessChartItem[];
  history: SicknessHistoryItem[];
};

const dayMs = 86_400_000;
const dateFormatter = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" });
const shortDateFormatter = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

function startOfUtcDay(value = new Date()) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function inclusiveDays(start: Date, end: Date) {
  return Math.max(1, Math.floor((startOfUtcDay(end).getTime() - startOfUtcDay(start).getTime()) / dayMs) + 1);
}

export async function getSicknessForTenant(tenantSlug: string): Promise<SicknessDashboardData> {
  const access = await requireTenantAccess(tenantSlug, "sickness", "read");
  const now = startOfUtcDay();
  const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const records = await prisma.tenantSicknessReport.findMany({
    where: { tenantId: access.tenantId, startDate: { gte: sixMonthsAgo } },
    include: { employee: { select: { initials: true, name: true, location: true } } },
    orderBy: { startDate: "desc" },
  });
  const active = records.filter((record) => record.status === "open" && (!record.endDate || startOfUtcDay(record.endDate) >= now));
  const finished = records.filter((record) => !active.includes(record));
  const monthRecords = records.filter((record) => record.startDate.getUTCFullYear() === now.getUTCFullYear() && record.startDate.getUTCMonth() === now.getUTCMonth());
  const durations = records.map((record) => inclusiveDays(record.startDate, record.endDate ?? now));
  const average = durations.length ? durations.reduce((sum, days) => sum + days, 0) / durations.length : 0;
  const employeeCount = await prisma.tenantEmployee.count({ where: { tenantId: access.tenantId, status: "active" } });
  const chart = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
    const count = records.filter((record) => record.startDate.getUTCFullYear() === date.getUTCFullYear() && record.startDate.getUTCMonth() === date.getUTCMonth()).length;
    return { month: new Intl.DateTimeFormat("de-DE", { month: "short", timeZone: "UTC" }).format(date), count, height: Math.max(8, Math.min(80, count * 16)), current: index === 5 };
  });

  return {
    metrics: [
      { label: "Aktuell krank", value: String(active.length), caption: "Mitarbeiter abwesend", tone: active.length ? "danger" : undefined },
      { label: "Diesen Monat", value: String(monthRecords.length), caption: "Krankmeldungen gesamt" },
      { label: "Ø Dauer", value: average.toFixed(1), caption: "Tage je Krankmeldung" },
      { label: "Krankenquote", value: `${employeeCount ? ((active.length / employeeCount) * 100).toFixed(1) : "0.0"}%`, caption: "aller Mitarbeiter" },
    ],
    current: active.map((record) => ({ id: record.id, initials: record.employee.initials, name: record.employee.name, location: record.employee.location, since: dateFormatter.format(record.startDate), days: String(inclusiveDays(record.startDate, now)) })),
    chart,
    history: finished.slice(0, 30).map((record) => ({ id: record.id, initials: record.employee.initials, name: record.employee.name, location: record.employee.location, startDate: shortDateFormatter.format(record.startDate), endDate: dateFormatter.format(record.endDate ?? record.updatedAt), days: `${inclusiveDays(record.startDate, record.endDate ?? record.updatedAt)} Tage` })),
  };
}

export async function createTenantSicknessReport(input: { tenantSlug: string; employeeId: string; startDate: string; endDate?: string; certificateStatus?: string; reportChannel?: string; note?: string }) {
  const access = await requireTenantAccess(input.tenantSlug, "sickness", "write");
  const employee = await prisma.tenantEmployee.findFirst({ where: { tenantId: access.tenantId, OR: [{ id: input.employeeId }, { key: input.employeeId }] }, select: { id: true, name: true } });
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
  const startDate = new Date(`${input.startDate}T00:00:00.000Z`);
  const endDate = input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null;
  if (Number.isNaN(startDate.getTime()) || (endDate && endDate < startDate)) throw new Error("INVALID_SICKNESS_DATES");
  const report = await prisma.tenantSicknessReport.create({ data: { tenantId: access.tenantId, employeeId: employee.id, startDate, endDate, certificateStatus: input.certificateStatus ?? "pending", reportChannel: input.reportChannel ?? "app", note: input.note?.trim() ?? "", reportedById: access.userId, reportedByName: access.userName } });
  await recordTenantAudit({ tenantId: access.tenantId, actorId: access.userId, actorName: access.userName, action: "Krankmeldung erfasst", source: "Krankheit", entityType: "sickness", entityId: report.id, detail: employee.name });
  return report;
}
