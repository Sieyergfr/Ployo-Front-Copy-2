import "server-only";
import { prisma } from "@/lib/prisma";
import { recordTenantAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import {
  notifyApproversOfTimeCorrectionRequest,
  notifyTimeCorrectionDecided,
} from "@/lib/notifications/events";
import {
  assertEmployeeInScope,
  requireTenantAccess,
  requireTenantMembership,
} from "@/lib/tenant-access";
import {
  TIME_TRACKING_ERRORS,
  isClockTime,
  isIsoDate,
  localDateKey,
  localTimeKey,
} from "@/lib/time-tracking";
import {
  correctTimeEntry,
  createManualTimeEntry,
  loadTenantContext,
  scopedEmployeeWhere,
} from "@/lib/time-tracking-service";

/**
 * Korrektur-Anfragen zu gestempelten Zeiten ("Korrektur anfragen" in der App).
 *
 * Mitarbeitende schlagen für einen Tag neue Zeiten vor — bezogen auf einen
 * vorhandenen Eintrag oder als fehlenden Eintrag zum Nachtragen. Die Zeiten
 * selbst ändern sich erst, wenn jemand mit `timeTracking:write` (Mitarbeiter
 * im eigenen Ausschnitt) freigibt; dann laufen dieselben Prüfungen wie bei
 * einer direkten Korrektur (`correctTimeEntry`/`createManualTimeEntry`:
 * Überschneidung, Zukunft, Höchstdauer, Audit-Log).
 */

const MAX_OPEN_PER_EMPLOYEE = 10;

export type TimeCorrectionRequestView = {
  id: string;
  employeeId: string;
  employeeName: string;
  timeEntryId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number | null;
  reason: string;
  status: "open" | "approved" | "rejected";
  rejectReason: string;
  decidedBy: string;
  decidedAt: string | null;
  createdAt: string;
  /** Aktuell erfasste Zeiten des Bezugseintrags (Ortszeit) — zum Vergleich. */
  current: { startTime: string; endTime: string | null } | null;
};

const requestInclude = {
  employee: { select: { name: true, userId: true } },
  timeEntry: { select: { clockInAt: true, clockOutAt: true } },
} as const;

type RequestRecord = Awaited<ReturnType<typeof loadRequest>>;

async function loadRequest(id: string) {
  return prisma.tenantTimeCorrectionRequest.findUnique({ where: { id }, include: requestInclude });
}

function toView(record: NonNullable<RequestRecord>, timeZone: string): TimeCorrectionRequestView {
  return {
    id: record.id,
    employeeId: record.employeeId,
    employeeName: record.employee.name,
    timeEntryId: record.timeEntryId,
    date: record.date,
    startTime: record.startTime,
    endTime: record.endTime,
    breakMinutes: record.breakMinutes,
    reason: record.reason,
    status: (["open", "approved", "rejected"].includes(record.status) ? record.status : "open") as TimeCorrectionRequestView["status"],
    rejectReason: record.rejectReason,
    decidedBy: record.decidedBy,
    decidedAt: record.decidedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    current: record.timeEntry
      ? {
          startTime: localTimeKey(record.timeEntry.clockInAt, timeZone),
          endTime: record.timeEntry.clockOutAt ? localTimeKey(record.timeEntry.clockOutAt, timeZone) : null,
        }
      : null,
  };
}

function normalizeBreak(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 24 * 60) {
    throw new Error(TIME_TRACKING_ERRORS.invalidBreak);
  }
  return number;
}

async function resolveOwnEmployee(tenantSlug: string) {
  const access = await requireTenantMembership(tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true, name: true },
  });

  if (!employee) {
    throw new Error("Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden.");
  }

  return { access, employee };
}

/** Eigene Korrektur-Anfrage stellen. */
export async function createMyTimeCorrectionRequest(input: {
  tenantSlug: string;
  timeEntryId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes?: unknown;
  reason: string;
}) {
  const { access, employee } = await resolveOwnEmployee(input.tenantSlug);
  const context = await loadTenantContext(access.tenantId);

  if (!context.settings.enabled) {
    throw new Error(TIME_TRACKING_ERRORS.disabled);
  }

  const reason = (input.reason ?? "").trim().slice(0, 500);
  if (!reason) throw new Error(TIME_TRACKING_ERRORS.correctionReasonRequired);
  if (!isIsoDate(input.date) || !isClockTime(input.startTime) || !isClockTime(input.endTime)) {
    throw new Error(TIME_TRACKING_ERRORS.invalidTimes);
  }
  if (input.date > localDateKey(new Date(), context.timeZone)) {
    throw new Error(TIME_TRACKING_ERRORS.inFuture);
  }
  const breakMinutes = normalizeBreak(input.breakMinutes);

  let timeEntryId: string | null = null;
  if (input.timeEntryId) {
    const entry = await prisma.tenantTimeEntry.findFirst({
      where: { id: input.timeEntryId, tenantId: access.tenantId, employeeId: employee.id },
      select: { id: true },
    });
    if (!entry) throw new Error(TIME_TRACKING_ERRORS.notFound);
    timeEntryId = entry.id;
  }

  const open = await prisma.tenantTimeCorrectionRequest.count({
    where: { employeeId: employee.id, status: "open" },
  });
  if (open >= MAX_OPEN_PER_EMPLOYEE) throw new Error(TIME_TRACKING_ERRORS.correctionTooMany);

  const created = await prisma.tenantTimeCorrectionRequest.create({
    data: {
      tenantId: access.tenantId,
      employeeId: employee.id,
      timeEntryId,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      breakMinutes,
      reason,
    },
    include: requestInclude,
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Zeitkorrektur angefragt",
    source: "Mein Bereich",
    entityType: "time-correction-request",
    entityId: created.id,
    detail: `${input.date} ${input.startTime} – ${input.endTime} · Grund: ${reason}`,
  });

  try {
    await notifyApproversOfTimeCorrectionRequest({
      tenantId: access.tenantId,
      tenantName: context.tenantName,
      employeeId: employee.id,
      employeeName: employee.name,
      requestId: created.id,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
    });
  } catch (error) {
    logger.error("time-correction: Benachrichtigung fehlgeschlagen", { error });
  }

  return toView(created, context.timeZone);
}

/** Eigene Korrektur-Anfragen (neueste zuerst). */
export async function getMyTimeCorrectionRequests(tenantSlug: string) {
  const { access, employee } = await resolveOwnEmployee(tenantSlug);
  const { timeZone } = await loadTenantContext(access.tenantId);
  const records = await prisma.tenantTimeCorrectionRequest.findMany({
    where: { employeeId: employee.id },
    include: requestInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return records.map((record) => toView(record, timeZone));
}

/** Eigene, noch offene Anfrage zurückziehen. */
export async function withdrawMyTimeCorrectionRequest(tenantSlug: string, requestId: string) {
  const { access, employee } = await resolveOwnEmployee(tenantSlug);
  const record = await prisma.tenantTimeCorrectionRequest.findFirst({
    where: { id: requestId, employeeId: employee.id, tenantId: access.tenantId },
    select: { id: true, status: true },
  });

  if (!record) throw new Error(TIME_TRACKING_ERRORS.correctionNotFound);
  if (record.status !== "open") throw new Error(TIME_TRACKING_ERRORS.correctionAlreadyDecided);

  await prisma.tenantTimeCorrectionRequest.delete({ where: { id: record.id } });
}

/** Anfragen im eigenen Ausschnitt (`timeTracking:read`). */
export async function getTenantTimeCorrectionRequests(input: { tenantSlug: string; status?: string }) {
  const access = await requireTenantAccess(input.tenantSlug, "timeTracking", "read");
  const { timeZone } = await loadTenantContext(access.tenantId);
  const status = input.status === "open" || input.status === "approved" || input.status === "rejected" ? input.status : undefined;
  const records = await prisma.tenantTimeCorrectionRequest.findMany({
    where: {
      tenantId: access.tenantId,
      ...(status ? { status } : {}),
      employee: await scopedEmployeeWhere(access),
    },
    include: requestInclude,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return {
    requests: records.map((record) => toView(record, timeZone)),
    canDecide: access.permissionLevel === "write" || access.permissionLevel === "admin",
  };
}

/**
 * Freigeben (übernimmt die Zeiten) oder ablehnen. Beim Freigeben läuft die
 * Änderung über `correctTimeEntry`/`createManualTimeEntry` — schlägt deren
 * Prüfung fehl (z. B. Überschneidung), bleibt die Anfrage offen.
 */
export async function decideTimeCorrectionRequest(input: {
  tenantSlug: string;
  requestId: string;
  decision: "approve" | "reject";
  rejectReason?: string;
  /** Optional abweichende Zeiten beim Freigeben (z. B. leicht angepasst). */
  startTime?: string;
  endTime?: string;
  breakMinutes?: unknown;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "timeTracking", "write");
  if (access.permissionLevel !== "write" && access.permissionLevel !== "admin") {
    throw new Error("FORBIDDEN");
  }

  const record = await prisma.tenantTimeCorrectionRequest.findFirst({
    where: { id: input.requestId, tenantId: access.tenantId },
    include: requestInclude,
  });

  if (!record) throw new Error(TIME_TRACKING_ERRORS.correctionNotFound);
  await assertEmployeeInScope(access, record.employeeId);
  if (record.status !== "open") throw new Error(TIME_TRACKING_ERRORS.correctionAlreadyDecided);
  // Wie bei Urlaubsanträgen: niemand gibt die eigene Korrektur frei.
  if (record.employee.userId && record.employee.userId === access.userId) {
    throw new Error(TIME_TRACKING_ERRORS.correctionSelfDecision);
  }

  const context = await loadTenantContext(access.tenantId);
  const rejectReason = (input.rejectReason ?? "").trim().slice(0, 500);

  if (input.decision === "approve") {
    const startTime = isClockTime(input.startTime) ? input.startTime : record.startTime;
    const endTime = isClockTime(input.endTime) ? input.endTime : record.endTime;
    const breakMinutes = input.breakMinutes === undefined ? record.breakMinutes : normalizeBreak(input.breakMinutes);
    const note = `Korrektur-Anfrage: ${record.reason}`.slice(0, 500);

    if (record.timeEntryId) {
      await correctTimeEntry({
        tenantSlug: input.tenantSlug,
        entryId: record.timeEntryId,
        date: record.date,
        startTime,
        endTime,
        breakMinutes,
        note,
      });
    } else {
      await createManualTimeEntry({
        tenantSlug: input.tenantSlug,
        employeeId: record.employeeId,
        date: record.date,
        startTime,
        endTime,
        breakMinutes,
        note,
      });
    }
  }

  // Bedingtes Update: zwei gleichzeitige Entscheidungen dürfen nicht beide durchgehen.
  const { count } = await prisma.tenantTimeCorrectionRequest.updateMany({
    where: { id: record.id, status: "open" },
    data: {
      status: input.decision === "approve" ? "approved" : "rejected",
      rejectReason: input.decision === "reject" ? rejectReason : "",
      decidedBy: access.userName,
      decidedAt: new Date(),
    },
  });
  if (count === 0) throw new Error(TIME_TRACKING_ERRORS.correctionAlreadyDecided);

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: input.decision === "approve" ? "Zeitkorrektur übernommen" : "Zeitkorrektur abgelehnt",
    source: "Zeiterfassung",
    entityType: "time-correction-request",
    entityId: record.id,
    detail: `${record.employee.name} · ${record.date} ${record.startTime} – ${record.endTime}${rejectReason ? ` · Begründung: ${rejectReason}` : ""}`,
  });

  try {
    await notifyTimeCorrectionDecided({
      tenantId: access.tenantId,
      tenantName: context.tenantName,
      employeeId: record.employeeId,
      requestId: record.id,
      date: record.date,
      status: input.decision === "approve" ? "approved" : "rejected",
      rejectReason: input.decision === "reject" ? rejectReason : "",
    });
  } catch (error) {
    logger.error("time-correction: Benachrichtigung fehlgeschlagen", { error });
  }

  const updated = await loadRequest(record.id);
  return updated ? toView(updated, context.timeZone) : null;
}
