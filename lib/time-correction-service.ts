import "server-only";

import { recordTenantAudit } from "@/lib/audit";
import {
  notifyEmployeeOfTimeCorrectionDecision,
  notifyManagersOfTimeCorrectionRequest,
} from "@/lib/notifications/events";
import { prisma } from "@/lib/prisma";
import { requireTenantAccess, requireTenantMembership } from "@/lib/tenant-access";
import { isClockTime, isIsoDate, TIME_CORRECTION_ERRORS } from "@/lib/time-tracking";
import {
  correctTimeEntry,
  createManualTimeEntry,
  scopedEmployeeWhere,
} from "@/lib/time-tracking-service";

/**
 * Korrekturanträge ("Zeit korrigieren"): Mitarbeiter beantragen Kommen/Gehen
 * für einen Tag, die Teamleitung bzw. Verwaltung (timeTracking:write im
 * eigenen Scope) entscheidet. Genehmigen läuft über die bestehenden
 * Funktionen `correctTimeEntry` / `createManualTimeEntry` — damit gelten
 * dieselben Prüfungen (Überschneidung, Zukunft, max. 24 h) und dasselbe
 * Audit wie bei einer direkten Korrektur durch die Verwaltung.
 *
 * Die App kennt diese Anträge noch nicht; sie entstehen bis zum App-Update
 * nur im Web (Mein Bereich / Meine Zeiten).
 */

export type TimeCorrectionStatus = "pending" | "approved" | "rejected" | "withdrawn";

export type TimeCorrectionRequestView = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  timeEntryId: string | null;
  /** Bisher erfasste Zeiten des Eintrags ("HH:MM"), sofern es einen gibt. */
  currentStartTime: string | null;
  currentEndTime: string | null;
  requestedStartTime: string;
  requestedEndTime: string;
  requestedBreakMinutes: number | null;
  reason: string;
  status: TimeCorrectionStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string;
  decisionNote: string;
};

function localTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function localDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const requestInclude = {
  employee: { select: { name: true } },
  timeEntry: { select: { clockInAt: true, clockOutAt: true } },
  tenant: { select: { timezone: true } },
} as const;

type RequestRow = Awaited<
  ReturnType<typeof prisma.tenantTimeCorrectionRequest.findFirstOrThrow<{ include: typeof requestInclude }>>
>;

function toView(row: RequestRow): TimeCorrectionRequestView {
  const timeZone = row.tenant.timezone || "Europe/Berlin";

  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee.name,
    date: row.date,
    timeEntryId: row.timeEntryId,
    currentStartTime: row.timeEntry ? localTime(row.timeEntry.clockInAt, timeZone) : null,
    currentEndTime: row.timeEntry?.clockOutAt ? localTime(row.timeEntry.clockOutAt, timeZone) : null,
    requestedStartTime: row.requestedStartTime,
    requestedEndTime: row.requestedEndTime,
    requestedBreakMinutes: row.requestedBreakMinutes,
    reason: row.reason,
    status: row.status as TimeCorrectionStatus,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedBy: row.decidedBy,
    decisionNote: row.decisionNote,
  };
}

async function resolveMyEmployee(tenantSlug: string) {
  const access = await requireTenantMembership(tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true, name: true },
  });

  if (!employee) {
    throw new Error(TIME_CORRECTION_ERRORS.notLinked);
  }

  return { access, employee };
}

export async function getMyTimeCorrectionRequests(tenantSlug: string) {
  const { access, employee } = await resolveMyEmployee(tenantSlug);
  const rows = await prisma.tenantTimeCorrectionRequest.findMany({
    where: { tenantId: access.tenantId, employeeId: employee.id },
    include: requestInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return rows.map(toView);
}

export async function createMyTimeCorrectionRequest(input: {
  tenantSlug: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number | null;
  reason?: string;
}) {
  const { access, employee } = await resolveMyEmployee(input.tenantSlug);

  if (!isIsoDate(input.date) || !isClockTime(input.startTime) || !isClockTime(input.endTime)) {
    throw new Error(TIME_CORRECTION_ERRORS.invalid);
  }

  const breakMinutes =
    input.breakMinutes === null || input.breakMinutes === undefined
      ? null
      : Math.max(0, Math.min(24 * 60, Math.round(input.breakMinutes)));
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: access.tenantId },
    select: { name: true, timezone: true },
  });
  const timeZone = tenant.timezone || "Europe/Berlin";

  if (input.date > localDate(new Date(), timeZone)) {
    throw new Error(TIME_CORRECTION_ERRORS.future);
  }

  const existing = await prisma.tenantTimeCorrectionRequest.findFirst({
    where: { tenantId: access.tenantId, employeeId: employee.id, date: input.date, status: "pending" },
    select: { id: true },
  });

  if (existing) {
    throw new Error(TIME_CORRECTION_ERRORS.duplicate);
  }

  // Bezug auf den (ersten) Eintrag dieses Tages, falls es einen gibt.
  const dayEntries = await prisma.tenantTimeEntry.findMany({
    where: {
      employeeId: employee.id,
      clockInAt: {
        gte: new Date(new Date(`${input.date}T00:00:00Z`).getTime() - 14 * 3_600_000),
        lte: new Date(new Date(`${input.date}T23:59:59Z`).getTime() + 14 * 3_600_000),
      },
    },
    select: { id: true, clockInAt: true },
    orderBy: { clockInAt: "asc" },
  });
  const entry = dayEntries.find((item) => localDate(item.clockInAt, timeZone) === input.date) ?? null;

  const created = await prisma.tenantTimeCorrectionRequest.create({
    data: {
      tenantId: access.tenantId,
      employeeId: employee.id,
      timeEntryId: entry?.id ?? null,
      date: input.date,
      requestedStartTime: input.startTime,
      requestedEndTime: input.endTime,
      requestedBreakMinutes: breakMinutes,
      reason: (input.reason ?? "").trim().slice(0, 500),
    },
    include: requestInclude,
  });

  await notifyManagersOfTimeCorrectionRequest({
    tenantId: access.tenantId,
    tenantName: tenant.name,
    employeeName: employee.name,
    requestId: created.id,
    date: input.date,
  }).catch(() => {});

  return toView(created);
}

export async function withdrawMyTimeCorrectionRequest(input: { tenantSlug: string; requestId: string }) {
  const { access, employee } = await resolveMyEmployee(input.tenantSlug);
  const updated = await prisma.tenantTimeCorrectionRequest.updateMany({
    where: { id: input.requestId, tenantId: access.tenantId, employeeId: employee.id, status: "pending" },
    data: { status: "withdrawn" },
  });

  if (updated.count === 0) {
    throw new Error(TIME_CORRECTION_ERRORS.notFound);
  }
}

export async function getTenantTimeCorrectionRequests(input: {
  tenantSlug: string;
  status?: TimeCorrectionStatus | "all";
}) {
  const access = await requireTenantAccess(input.tenantSlug, "timeTracking", "read");
  const rows = await prisma.tenantTimeCorrectionRequest.findMany({
    where: {
      tenantId: access.tenantId,
      employee: await scopedEmployeeWhere(access),
      ...(input.status && input.status !== "all" ? { status: input.status } : {}),
    },
    include: requestInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return rows.map(toView);
}

export async function decideTimeCorrectionRequest(input: {
  tenantSlug: string;
  requestId: string;
  decision: "approved" | "rejected";
  note?: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "timeTracking", "write");
  const request = await prisma.tenantTimeCorrectionRequest.findFirst({
    where: { id: input.requestId, tenantId: access.tenantId, employee: await scopedEmployeeWhere(access) },
    include: requestInclude,
  });

  if (!request) {
    throw new Error(TIME_CORRECTION_ERRORS.notFound);
  }

  if (request.status !== "pending") {
    throw new Error(TIME_CORRECTION_ERRORS.notPending);
  }

  const note = (input.note ?? "").trim().slice(0, 500);

  if (input.decision === "approved") {
    const correctionNote = `Korrekturantrag von ${request.employee.name}${request.reason ? `: ${request.reason}` : ""}`;

    if (request.timeEntryId) {
      await correctTimeEntry({
        tenantSlug: input.tenantSlug,
        entryId: request.timeEntryId,
        date: request.date,
        startTime: request.requestedStartTime,
        endTime: request.requestedEndTime,
        breakMinutes: request.requestedBreakMinutes,
        note: correctionNote,
      });
    } else {
      await createManualTimeEntry({
        tenantSlug: input.tenantSlug,
        employeeId: request.employeeId,
        date: request.date,
        startTime: request.requestedStartTime,
        endTime: request.requestedEndTime,
        breakMinutes: request.requestedBreakMinutes,
        note: correctionNote,
      });
    }
  }

  // Nur ein noch offener Antrag wird entschieden — schützt vor Doppelklick.
  const updated = await prisma.tenantTimeCorrectionRequest.updateMany({
    where: { id: request.id, status: "pending" },
    data: {
      status: input.decision,
      decidedAt: new Date(),
      decidedBy: access.userName,
      decisionNote: note,
    },
  });

  if (updated.count === 0) {
    throw new Error(TIME_CORRECTION_ERRORS.notPending);
  }

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: input.decision === "approved" ? "Korrekturantrag genehmigt" : "Korrekturantrag abgelehnt",
    source: "Zeiterfassung",
    entityType: "time-correction-request",
    entityId: request.id,
    detail: `${request.employee.name} · ${request.date} · ${request.requestedStartTime}–${request.requestedEndTime}${note ? ` · ${note}` : ""}`,
  });

  const tenant = await prisma.tenant.findUnique({ where: { id: access.tenantId }, select: { name: true } });

  await notifyEmployeeOfTimeCorrectionDecision({
    tenantId: access.tenantId,
    tenantName: tenant?.name ?? "",
    employeeId: request.employeeId,
    requestId: request.id,
    date: request.date,
    status: input.decision,
    note,
  }).catch(() => {});
}
