import "server-only";
import {
  createMyTimeCorrectionRequest,
  decideTimeCorrectionRequest,
  getMyTimeCorrectionRequests,
  getTenantTimeCorrectionRequests,
  withdrawMyTimeCorrectionRequest,
  type TimeCorrectionRequestView,
} from "@/lib/time-correction-service";
import { requireTenantAccess } from "@/lib/tenant-access";

/**
 * Antwortform der Korrektur-Anfragen für Ployo App 2
 * (`/api/me/time-correction-requests`, `/api/tenants/[tenant]/time-correction-requests`).
 *
 * Datenhaltung und Regeln liegen in `time-correction-service.ts` (dieselben
 * Anträge wie im Web unter "Meine Zeiten"); hier wird nur auf die Feldnamen
 * und Statuswerte der App übersetzt: `pending` → `open`, `decisionNote` →
 * `rejectReason`, `requested*` → `startTime`/`endTime`/`breakMinutes`.
 * Zurückgezogene Anträge kennt die App nicht — sie werden ausgeblendet.
 */
export type AppTimeCorrectionRequest = {
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
  current: { startTime: string; endTime: string | null } | null;
};

function toAppView(view: TimeCorrectionRequestView): AppTimeCorrectionRequest {
  return {
    id: view.id,
    employeeId: view.employeeId,
    employeeName: view.employeeName,
    timeEntryId: view.timeEntryId,
    date: view.date,
    startTime: view.requestedStartTime,
    endTime: view.requestedEndTime,
    breakMinutes: view.requestedBreakMinutes,
    reason: view.reason,
    status: view.status === "pending" ? "open" : (view.status as "approved" | "rejected"),
    rejectReason: view.status === "rejected" ? view.decisionNote : "",
    decidedBy: view.decidedBy,
    decidedAt: view.decidedAt,
    createdAt: view.createdAt,
    current: view.currentStartTime
      ? { startTime: view.currentStartTime, endTime: view.currentEndTime }
      : null,
  };
}

function visible(views: TimeCorrectionRequestView[]) {
  return views.filter((view) => view.status !== "withdrawn").map(toAppView);
}

export async function getMyAppTimeCorrectionRequests(tenantSlug: string) {
  return visible(await getMyTimeCorrectionRequests(tenantSlug));
}

export async function createMyAppTimeCorrectionRequest(input: {
  tenantSlug: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes?: unknown;
  reason: string;
}) {
  const created = await createMyTimeCorrectionRequest({
    tenantSlug: input.tenantSlug,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    breakMinutes: typeof input.breakMinutes === "number" ? input.breakMinutes : null,
    reason: input.reason,
  });

  return toAppView(created);
}

export async function withdrawMyAppTimeCorrectionRequest(tenantSlug: string, requestId: string) {
  await withdrawMyTimeCorrectionRequest({ tenantSlug, requestId });
}

export async function getTenantAppTimeCorrectionRequests(input: { tenantSlug: string; status?: string }) {
  const access = await requireTenantAccess(input.tenantSlug, "timeTracking", "read");
  const status =
    input.status === "open"
      ? "pending"
      : input.status === "approved" || input.status === "rejected"
        ? input.status
        : "all";

  return {
    requests: visible(await getTenantTimeCorrectionRequests({ tenantSlug: input.tenantSlug, status })),
    canDecide: access.permissionLevel === "write" || access.permissionLevel === "admin",
  };
}

/**
 * Freigeben oder ablehnen. Abweichende Zeiten beim Freigeben unterstützt der
 * gemeinsame Service nicht — es gelten immer die beantragten Zeiten.
 */
export async function decideAppTimeCorrectionRequest(input: {
  tenantSlug: string;
  requestId: string;
  decision: "approve" | "reject";
  rejectReason?: string;
}) {
  await decideTimeCorrectionRequest({
    tenantSlug: input.tenantSlug,
    requestId: input.requestId,
    decision: input.decision === "approve" ? "approved" : "rejected",
    note: input.rejectReason,
  });

  const { requests } = await getTenantAppTimeCorrectionRequests({ tenantSlug: input.tenantSlug, status: "all" });
  return requests.find((request) => request.id === input.requestId) ?? null;
}
