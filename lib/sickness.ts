import { prisma } from "@/lib/prisma";
import { recordTenantAudit } from "@/lib/audit";
import { decryptField, encryptField } from "@/lib/encryption";
import {
  requireTenantAccess,
  requireTenantMembership,
  assertEmployeeInScope,
  resolveScopeFilter,
} from "@/lib/tenant-access";
import { notifyManagersOfNewSicknessReport } from "@/lib/notifications/events";
import { notifyIfAbsenceConflictsWithPublishedShifts } from "@/lib/shift-service";

export type SicknessMetric = { label: string; value: string; caption: string; tone?: "danger" };
export type CurrentSickness = {
  id: string;
  /** Echte Mitarbeiter-DB-ID — zum Abgleich mit anderen Listen (z. B. Übersicht-Dashboard). */
  employeeId: string;
  initials: string;
  name: string;
  location: string;
  since: string;
  days: string;
  /** ISO-Werte + Detailfelder für das Bearbeitungsformular im Drawer. */
  startDateIso: string;
  endDateIso: string;
  certificateStatus: string;
  note: string;
  /** Woher die Meldung kam ("app", "phone", ...). */
  reportChannel: string;
  /** Hochgeladenes Attest, falls vorhanden — Datei-ID des Dateien-Moduls. */
  attachmentFileId?: string;
  attachmentName?: string;
};
export type SicknessChartItem = {
  month: string;
  /** `YYYY-MM` — für Clients, die den Monatsnamen selbst in ihrer Sprache setzen (Mitarbeiter-App). */
  monthIso: string;
  count: number;
  height: number;
  current?: boolean;
};
export type SicknessHistoryItem = {
  id: string;
  employeeId: string;
  initials: string;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  days: string;
  /** Dieselbe Zahl wie in `days`, aber ohne Einheit — die App hängt sie in ihrer Sprache an. */
  dayCount: number;
  /** Detailfelder wie bei `CurrentSickness` — abgeschlossene Meldungen sind in der App genauso anklickbar. */
  startDateIso: string;
  endDateIso: string;
  certificateStatus: string;
  note: string;
  reportChannel: string;
  attachmentFileId?: string;
  attachmentName?: string;
};
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

const certificateStatuses = ["pending", "received", "not-required"] as const;
type CertificateStatus = (typeof certificateStatuses)[number];

function normalizeCertificateStatus(
  value: string | undefined,
  fallback: CertificateStatus = "pending",
): CertificateStatus {
  return certificateStatuses.includes(value as CertificateStatus)
    ? (value as CertificateStatus)
    : fallback;
}

const reportChannels = ["phone", "email", "app", "manager"] as const;
type ReportChannel = (typeof reportChannels)[number];

function normalizeReportChannel(
  value: string | undefined,
  fallback: ReportChannel = "app",
): ReportChannel {
  return reportChannels.includes(value as ReportChannel) ? (value as ReportChannel) : fallback;
}

export async function getSicknessForTenant(tenantSlug: string): Promise<SicknessDashboardData> {
  const access = await requireTenantAccess(tenantSlug, "sickness", "read");
  const scopeFilter = await resolveScopeFilter(access);
  // "sickness" unterstützt (bisher) keinen "assigned"-Scope — sollte er
  // dennoch auftreten, nichts treffen statt stillschweigend alles zu zeigen.
  // Kein eigenes Team darf nicht "alle nicht zugeordneten Kolleg:innen"
  // bedeuten (Audit-Finding H03).
  const employeeWhere =
    scopeFilter.type === "all"
      ? { tenantId: access.tenantId }
      : scopeFilter.type === "own"
        ? { tenantId: access.tenantId, id: scopeFilter.employeeId ?? "__none__" }
        : scopeFilter.type === "team"
          ? scopeFilter.team
            ? { tenantId: access.tenantId, team: scopeFilter.team }
            : { tenantId: access.tenantId, id: "__none__" }
          : { tenantId: access.tenantId, id: "__none__" };
  const reportWhere =
    scopeFilter.type === "all"
      ? { tenantId: access.tenantId }
      : scopeFilter.type === "own"
        ? { tenantId: access.tenantId, employeeId: scopeFilter.employeeId ?? "__none__" }
        : scopeFilter.type === "team"
          ? scopeFilter.team
            ? { tenantId: access.tenantId, employee: { team: scopeFilter.team } }
            : { tenantId: access.tenantId, employeeId: "__none__" }
          : { tenantId: access.tenantId, employeeId: "__none__" };
  const now = startOfUtcDay();
  const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  // `startDate` kann in der Zukunft liegen (z. B. "ab Montag krankgemeldet")
  // — ohne die Prüfung zählte ein noch nicht begonnener Krankheitsfall
  // schon heute als "aktuell krank".
  const isActiveRecord = (record: { status: string; startDate: Date; endDate: Date | null }) =>
    record.status === "open" &&
    startOfUtcDay(record.startDate) <= now &&
    (!record.endDate || startOfUtcDay(record.endDate) >= now);
  const sicknessInclude = {
    employee: { select: { initials: true, name: true, location: true } },
    attachmentFile: { select: { id: true, displayName: true, originalName: true } },
  } as const;
  const [records, currentlyOpenRecords] = await Promise.all([
    prisma.tenantSicknessReport.findMany({
      where: { ...reportWhere, startDate: { gte: sixMonthsAgo } },
      include: sicknessInclude,
      orderBy: { startDate: "desc" },
    }),
    // Ein durchgehend offener Fall kann vor dem 6-Monats-Chartfenster
    // begonnen haben und heute noch andauern — ohne diese separate,
    // startDate-unbeschränkte Abfrage verschwand er aus "Aktuell krank"
    // (Audit-Finding M16). Statistik (Chart/Monat/Ø Dauer) bleibt bewusst
    // auf das 6-Monats-Fenster begrenzt, nur die aktuelle operative Liste
    // nicht.
    prisma.tenantSicknessReport.findMany({
      where: { ...reportWhere, status: "open" },
      include: sicknessInclude,
      orderBy: { startDate: "desc" },
    }),
  ]);
  const active = currentlyOpenRecords.filter(isActiveRecord);
  const finished = records.filter((record) => !isActiveRecord(record));
  const monthRecords = records.filter((record) => record.startDate.getUTCFullYear() === now.getUTCFullYear() && record.startDate.getUTCMonth() === now.getUTCMonth());
  const durations = records.map((record) => inclusiveDays(record.startDate, record.endDate ?? now));
  const average = durations.length ? durations.reduce((sum, days) => sum + days, 0) / durations.length : 0;
  // Ohne `status`-Filter: das Feld wird nirgends automatisch synchron
  // gehalten (z. B. bleibt es "active", während jemand krankgemeldet ist) —
  // als Nenner der Krankenquote zählt daher die gesamte Belegschaft im Scope.
  const employeeCount = await prisma.tenantEmployee.count({ where: employeeWhere });
  const chart = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
    const count = records.filter((record) => record.startDate.getUTCFullYear() === date.getUTCFullYear() && record.startDate.getUTCMonth() === date.getUTCMonth()).length;
    return {
      month: new Intl.DateTimeFormat("de-DE", { month: "short", timeZone: "UTC" }).format(date),
      monthIso: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      count,
      height: Math.max(8, Math.min(80, count * 16)),
      current: index === 5,
    };
  });

  return {
    metrics: [
      { label: "Aktuell krank", value: String(active.length), caption: "Mitarbeiter abwesend", tone: active.length ? "danger" : undefined },
      { label: "Diesen Monat", value: String(monthRecords.length), caption: "Krankmeldungen gesamt" },
      { label: "Ø Dauer", value: average.toFixed(1), caption: "Tage je Krankmeldung" },
      { label: "Krankenquote", value: `${employeeCount ? ((active.length / employeeCount) * 100).toFixed(1) : "0.0"}%`, caption: "aller Mitarbeiter" },
    ],
    current: active.map((record) => ({
      id: record.id,
      employeeId: record.employeeId,
      initials: record.employee.initials,
      name: record.employee.name,
      location: record.employee.location,
      since: dateFormatter.format(record.startDate),
      days: String(inclusiveDays(record.startDate, now)),
      startDateIso: record.startDate.toISOString().slice(0, 10),
      endDateIso: record.endDate ? record.endDate.toISOString().slice(0, 10) : "",
      certificateStatus: record.certificateStatus,
      note: decryptField(record.note),
      reportChannel: record.reportChannel,
      attachmentFileId: record.attachmentFile?.id,
      attachmentName: record.attachmentFile
        ? record.attachmentFile.displayName || record.attachmentFile.originalName
        : undefined,
    })),
    chart,
    history: finished.slice(0, 30).map((record) => ({
      id: record.id,
      employeeId: record.employeeId,
      initials: record.employee.initials,
      name: record.employee.name,
      location: record.employee.location,
      startDate: shortDateFormatter.format(record.startDate),
      endDate: dateFormatter.format(record.endDate ?? record.updatedAt),
      days: `${inclusiveDays(record.startDate, record.endDate ?? record.updatedAt)} Tage`,
      dayCount: inclusiveDays(record.startDate, record.endDate ?? record.updatedAt),
      startDateIso: record.startDate.toISOString().slice(0, 10),
      endDateIso: record.endDate ? record.endDate.toISOString().slice(0, 10) : "",
      certificateStatus: record.certificateStatus,
      note: decryptField(record.note),
      reportChannel: record.reportChannel,
      attachmentFileId: record.attachmentFile?.id,
      attachmentName: record.attachmentFile
        ? record.attachmentFile.displayName || record.attachmentFile.originalName
        : undefined,
    })),
  };
}

export async function createTenantSicknessReport(input: { tenantSlug: string; employeeId: string; startDate: string; endDate?: string; certificateStatus?: string; reportChannel?: string; note?: string }) {
  const access = await requireTenantAccess(input.tenantSlug, "sickness", "write");
  const employee = await prisma.tenantEmployee.findFirst({ where: { tenantId: access.tenantId, OR: [{ id: input.employeeId }, { key: input.employeeId }] }, select: { id: true, name: true } });
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
  await assertEmployeeInScope(access, employee.id);
  const startDate = new Date(`${input.startDate}T00:00:00.000Z`);
  const endDate = input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null;
  if (Number.isNaN(startDate.getTime()) || (endDate && endDate < startDate)) throw new Error("INVALID_SICKNESS_DATES");
  const notePlain = input.note?.trim() ?? "";
  const report = await prisma.tenantSicknessReport.create({ data: { tenantId: access.tenantId, employeeId: employee.id, startDate, endDate, certificateStatus: normalizeCertificateStatus(input.certificateStatus), reportChannel: normalizeReportChannel(input.reportChannel), note: encryptField(notePlain), reportedById: access.userId, reportedByName: access.userName } });
  await recordTenantAudit({ tenantId: access.tenantId, actorId: access.userId, actorName: access.userName, action: "Krankmeldung erfasst", source: "Krankheit", entityType: "sickness", entityId: report.id, detail: employee.name });

  const tenant = await prisma.tenant.findUnique({ where: { id: access.tenantId }, select: { name: true } });

  await notifyIfAbsenceConflictsWithPublishedShifts({
    tenantId: access.tenantId,
    tenantName: tenant?.name ?? input.tenantSlug,
    employeeId: employee.id,
    employeeName: employee.name,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    reason: "sickness",
  });

  return { ...report, note: notePlain };
}

/**
 * Self-Service-Variante: ein Mitarbeiter meldet sich selbst krank, ohne
 * "sickness:write"-Berechtigung auf den gesamten Mandanten zu benötigen.
 */
export async function createMySicknessReport(input: {
  tenantSlug: string;
  startDate: string;
  endDate?: string;
  note?: string;
  /** Optionale Krankschreibung, zuvor per `uploadMyDocument` hochgeladen. */
  attachmentFileId?: string;
}) {
  const access = await requireTenantMembership(input.tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true, name: true },
  });

  if (!employee) {
    throw new Error(
      "Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden.",
    );
  }

  const startDate = new Date(`${input.startDate}T00:00:00.000Z`);
  const endDate = input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null;

  if (Number.isNaN(startDate.getTime()) || (endDate && endDate < startDate)) {
    throw new Error("INVALID_SICKNESS_DATES");
  }

  let attachmentFileId: string | undefined;

  if (input.attachmentFileId) {
    // Nur ein eigenes, dem Konto zugeordnetes Dokument darf verlinkt werden
    // — verhindert, dass ein Mitarbeiter eine fremde fileId erraten/mit-
    // schickt und sie sich damit als eigene Krankschreibung anzeigt.
    const attachment = await prisma.tenantFile.findFirst({
      where: { id: input.attachmentFileId, tenantId: access.tenantId, employeeId: employee.id },
      select: { id: true },
    });

    if (!attachment) {
      throw new Error("Anhang nicht gefunden.");
    }

    attachmentFileId = attachment.id;
  }

  const notePlain = input.note?.trim() ?? "";
  const report = await prisma.tenantSicknessReport.create({
    data: {
      tenantId: access.tenantId,
      employeeId: employee.id,
      startDate,
      endDate,
      certificateStatus: attachmentFileId ? "received" : "pending",
      reportChannel: "app",
      note: encryptField(notePlain),
      reportedById: access.userId,
      reportedByName: access.userName,
      attachmentFileId,
    },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Krankmeldung erfasst (Self-Service)",
    source: "Krankheit",
    entityType: "sickness",
    entityId: report.id,
    detail: employee.name,
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: access.tenantId },
    select: { name: true },
  });

  await notifyManagersOfNewSicknessReport({
    tenantId: access.tenantId,
    tenantName: tenant?.name ?? input.tenantSlug,
    employeeName: employee.name,
    reportId: report.id,
    startDate: input.startDate,
  });

  await notifyIfAbsenceConflictsWithPublishedShifts({
    tenantId: access.tenantId,
    tenantName: tenant?.name ?? input.tenantSlug,
    employeeId: employee.id,
    employeeName: employee.name,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    reason: "sickness",
  });

  return { ...report, note: notePlain };
}

async function requireSicknessReport(tenantSlug: string, reportId: string) {
  const access = await requireTenantAccess(tenantSlug, "sickness", "write");
  const report = await prisma.tenantSicknessReport.findFirst({
    where: { id: reportId, tenantId: access.tenantId },
    include: { employee: { select: { name: true } } },
  });
  if (!report) throw new Error("Krankmeldung nicht gefunden.");
  // Der Scope filtert sonst nur die Liste: ohne diese Prüfung ließe sich mit
  // "nur eigene" über eine fremde reportId trotzdem jede Krankmeldung des
  // Betriebs ändern oder abschließen.
  await assertEmployeeInScope(access, report.employeeId);
  return { access, report };
}

export async function updateTenantSicknessReport(input: {
  tenantSlug: string;
  reportId: string;
  startDate: string;
  endDate?: string;
  certificateStatus?: string;
  note?: string;
}) {
  const { access, report } = await requireSicknessReport(input.tenantSlug, input.reportId);
  const startDate = new Date(`${input.startDate}T00:00:00.000Z`);
  const endDate = input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null;
  if (Number.isNaN(startDate.getTime()) || (endDate && endDate < startDate)) throw new Error("INVALID_SICKNESS_DATES");

  const updated = await prisma.tenantSicknessReport.update({
    where: { id: report.id },
    data: {
      startDate,
      endDate,
      certificateStatus: normalizeCertificateStatus(
        input.certificateStatus?.trim(),
        report.certificateStatus as CertificateStatus,
      ),
      note: input.note !== undefined ? encryptField(input.note.trim()) : report.note,
    },
  });

  await recordTenantAudit({ tenantId: access.tenantId, actorId: access.userId, actorName: access.userName, action: "Krankmeldung aktualisiert", source: "Krankheit", entityType: "sickness", entityId: report.id, detail: report.employee.name });
  return { ...updated, note: decryptField(updated.note) };
}

export async function closeTenantSicknessReport(input: {
  tenantSlug: string;
  reportId: string;
  endDate?: string;
}) {
  const { access, report } = await requireSicknessReport(input.tenantSlug, input.reportId);

  if (!access.canDelete) {
    throw new Error("FORBIDDEN");
  }

  const endDate = input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : startOfUtcDay();
  if (Number.isNaN(endDate.getTime()) || endDate < startOfUtcDay(report.startDate)) throw new Error("INVALID_SICKNESS_DATES");

  const updated = await prisma.tenantSicknessReport.update({
    where: { id: report.id },
    data: { status: "closed", endDate, closedAt: new Date() },
  });

  await recordTenantAudit({ tenantId: access.tenantId, actorId: access.userId, actorName: access.userName, action: "Krankmeldung beendet", source: "Krankheit", entityType: "sickness", entityId: report.id, detail: report.employee.name });
  return { ...updated, note: decryptField(updated.note) };
}
