import { auth } from "@/lib/auth";
import { recordTenantAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  calculateVacationWorkDays,
  parseVacationWorkDays,
  type VacationMetric,
  type VacationRequest,
  type VacationRequestStatus,
} from "@/lib/vacations";
import { headers } from "next/headers";
import {
  requireTenantAccess,
  requireTenantMembership,
  assertEmployeeInScope,
  resolveScopeFilter,
} from "@/lib/tenant-access";
import {
  notifyEmployeeOfExpiringVacationCarryover,
  notifyManagersOfNewVacationRequest,
  notifyVacationRequestDecided,
} from "@/lib/notifications/events";
import { notifyIfAbsenceConflictsWithPublishedShifts } from "@/lib/shift-service";
import { createSystemTenantReminder } from "@/lib/reminders";
import {
  FIRST_TRACKED_VACATION_YEAR,
  isCarryoverReminderDue,
  rollOverVacationCarryover,
  shouldForfeitCarryover,
} from "@/lib/vacation-carryover";

type VacationRecord = {
  id: string;
  key: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  note: string;
  employeeId: string;
  employee: {
    id: string;
    key: string;
    initials: string;
    name: string;
    location: string;
    team: string;
  };
};

function normalizeVacationKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function createUniqueVacationKey(input: {
  tenantId: string;
  employeeName: string;
  startDate: string;
  excludeRequestId?: string;
}) {
  const keyBase =
    normalizeVacationKey(`${input.employeeName}-${input.startDate}`) ||
    "urlaubsantrag";
  let key = keyBase;
  let suffix = 2;

  while (
    await prisma.tenantVacationRequest.findFirst({
      where: {
        tenantId: input.tenantId,
        key,
        id: input.excludeRequestId ? { not: input.excludeRequestId } : undefined,
      },
      select: { id: true },
    })
  ) {
    key = `${keyBase}-${suffix}`;
    suffix += 1;
  }

  return key;
}

function normalizeStatus(value: string): VacationRequestStatus {
  if (value === "approved" || value === "rejected") {
    return value;
  }

  return "pending";
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}.${month}.${year}`;
}

function daysLabel(days: number) {
  return days === 1 ? "1 Tag" : `${days} Tage`;
}

/**
 * Kalendertage zwischen zwei Datums-Strings (inklusive beider Enden), rein
 * über UTC-komponierte Zeitstempel statt lokaler Millisekundendifferenz —
 * eine lokale Mitternacht-zu-Mitternacht-Differenz ist über einen
 * DST-Wechsel hinweg nicht exakt durch 86.400.000ms teilbar und hätte den
 * Tagesbetrag je nach Serverzeitzone verfälscht (Audit-Finding M01, erster
 * Teil). Reine Kalenderdauer-Anzeige — der tatsächliche Urlaubsverbrauch
 * kommt seitdem aus `calculateVacationWorkDays` (lib/vacations.ts), das
 * individuelle Arbeitstage und Feiertage berücksichtigt (M01, zweiter Teil).
 */
export function calculateVacationDays(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (!start || !end) {
    return 1;
  }

  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const diffDays = Math.round((endUtc - startUtc) / 86_400_000);

  if (!Number.isFinite(diffDays) || diffDays < 0) {
    return 1;
  }

  return Math.max(1, diffDays + 1);
}

/**
 * Löst Arbeitstage-Muster und Standort-Bundesland eines Mitarbeiters auf,
 * als Grundlage für `calculateVacationWorkDays`. `TenantEmployee.location`
 * ist (wie überall in diesem Codebasis-Muster) der Standortname, kein
 * Fremdschlüssel — daher die Suche über `name` statt `id`.
 */
async function resolveVacationWorkCalendar(tenantId: string, employeeId: string) {
  const employee = await prisma.tenantEmployee.findUnique({
    where: { id: employeeId },
    select: { location: true, workDaysJson: true },
  });

  const workDays = parseVacationWorkDays(employee?.workDaysJson);
  const location = employee?.location
    ? await prisma.tenantLocation.findFirst({
        where: { tenantId, name: employee.location },
        select: { bundesland: true },
      })
    : null;

  return { workDays, bundesland: location?.bundesland ?? null };
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;

  return new Date(Number(year), Number(month) - 1, Number(day));
}

/**
 * `employment` begrenzt den erlaubten Zeitraum auf die tatsächliche
 * Beschäftigungsdauer (QA-Bug BUG-009): ein Antrag vor dem Eintrittsdatum
 * oder nach dem Austrittsdatum eines bereits ausgeschiedenen Mitarbeiters
 * wird abgelehnt. `endDate` ist nur beim Status "former" ein echtes,
 * autoritatives Austrittsdatum (siehe `offboardEmployee`) — bei aktiven
 * Mitarbeitern bleibt das Feld unberücksichtigt.
 */
function validateVacationDateRange(
  startDate: string,
  endDate: string,
  employment?: { startDate: string; endDate: string; status: string },
) {
  const parsedStartDate = parseDateOnly(startDate);
  const parsedEndDate = parseDateOnly(endDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (!parsedStartDate || !parsedEndDate) {
    throw new Error("Bitte gültige Datumswerte auswählen.");
  }

  if (parsedStartDate < today || parsedEndDate < today) {
    throw new Error("Urlaubsantrag darf nicht in der Vergangenheit liegen.");
  }

  if (parsedEndDate < parsedStartDate) {
    throw new Error("Das Enddatum darf nicht vor dem Startdatum liegen.");
  }

  const employmentStart = employment?.startDate ? parseDateOnly(employment.startDate) : null;

  if (employmentStart && parsedStartDate < employmentStart) {
    throw new Error("Urlaubsantrag darf nicht vor dem Eintrittsdatum liegen.");
  }

  const employmentEnd =
    employment?.status === "former" && employment.endDate
      ? parseDateOnly(employment.endDate)
      : null;

  if (employmentEnd && parsedEndDate > employmentEnd) {
    throw new Error("Urlaubsantrag darf nicht nach dem Austrittsdatum liegen.");
  }
}

/**
 * Lehnt einen Urlaubsantrag ab, der sich mit einem bereits offenen oder
 * genehmigten Antrag derselben Person überschneidet (QA-Bug BUG-001 —
 * bisher wurden zwei identische Anträge klaglos angenommen und beide
 * genehmigt, was den Resturlaub doppelt abzog). Abgelehnte Anträge blockieren
 * nichts. Intervall-Überschneidung: `a.start <= b.end && a.end >= b.start`,
 * per lexikographischem String-Vergleich korrekt für `YYYY-MM-DD`.
 */
async function assertNoVacationOverlap(input: {
  employeeId: string;
  startDate: string;
  endDate: string;
  excludeRequestId?: string;
}) {
  const overlapping = await prisma.tenantVacationRequest.findFirst({
    where: {
      employeeId: input.employeeId,
      status: { in: ["pending", "approved"] },
      startDate: { lte: input.endDate },
      endDate: { gte: input.startDate },
      id: input.excludeRequestId ? { not: input.excludeRequestId } : undefined,
    },
    select: { id: true },
  });

  if (overlapping) {
    throw new Error(
      "Für diesen Zeitraum besteht bereits ein offener oder genehmigter Urlaubsantrag.",
    );
  }
}

/**
 * Wie `calculateVacationWorkDays`, lehnt aber einen Zeitraum ganz ohne
 * individuellen Arbeitstag (z. B. ausschließlich arbeitsfreie Tage) mit
 * einem fachlichen Fehler ab, statt ihn zu erlauben und dabei fälschlich 0
 * Urlaubstage zu verbuchen (Audit-Finding M01).
 */
function calculateAndValidateVacationWorkDays(
  startDate: string,
  endDate: string,
  calendar: Awaited<ReturnType<typeof resolveVacationWorkCalendar>>,
): number {
  const days = calculateVacationWorkDays(startDate, endDate, calendar.workDays, calendar.bundesland);

  if (days === 0) {
    throw new Error(
      "Der gewählte Zeitraum enthält laut hinterlegtem Dienstplan keinen einzigen Arbeitstag — dafür ist kein Urlaubsantrag nötig.",
    );
  }

  return days;
}

function toVacationRequest(record: VacationRecord): VacationRequest {
  return {
    id: record.key,
    dbId: record.id,
    key: record.key,
    employeeId: record.employeeId,
    initials: record.employee.initials,
    name: record.employee.name,
    location: record.employee.location,
    team: record.employee.team,
    startDate: formatDate(record.startDate),
    endDate: formatDate(record.endDate),
    startDateIso: record.startDate,
    endDateIso: record.endDate,
    days: daysLabel(record.days),
    note: record.note,
    status: normalizeStatus(record.status),
  };
}

async function getSessionUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user?.id ?? null;
}

export async function getTenantIdForVacation(tenantSlug: string) {
  return (await requireTenantAccess(tenantSlug, "vacation", "read")).tenantId;
}

/**
 * Übersetzt den konfigurierten Scope (own/team/all) der "vacation"-
 * Berechtigung in einen zusätzlichen `where`-Filter. "own"/"team" ohne
 * verknüpften eigenen Mitarbeiterdatensatz liefert einen Filter, der nichts
 * trifft — nie stillschweigend auf "alles sehen" zurückfallen.
 */
async function vacationScopeWhere(tenantSlug: string) {
  const access = await requireTenantAccess(tenantSlug, "vacation", "read");
  const scopeFilter = await resolveScopeFilter(access);

  if (scopeFilter.type === "all") {
    return { tenantId: access.tenantId };
  }

  if (scopeFilter.type === "own") {
    return { tenantId: access.tenantId, employeeId: scopeFilter.employeeId ?? "__none__" };
  }

  if (scopeFilter.type === "team") {
    // Kein eigenes Team darf nicht "alle Urlaubsanträge nicht zugeordneter
    // Kolleg:innen" bedeuten (Audit-Finding H03).
    return { tenantId: access.tenantId, employeeId: { in: scopeFilter.teammateIds } };
  }

  // "vacation" unterstützt (bisher) keinen "assigned"-Scope — sollte er
  // dennoch auftreten, nichts treffen statt stillschweigend alles zu zeigen.
  return { tenantId: access.tenantId, employeeId: "__none__" };
}

export async function getVacationRequestsForTenant(tenantSlug: string) {
  const where = await vacationScopeWhere(tenantSlug);

  if (!where.tenantId) {
    return null;
  }

  const records = await prisma.tenantVacationRequest.findMany({
    where,
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    include: {
      employee: {
        select: {
          id: true,
          key: true,
          initials: true,
          name: true,
          location: true,
          team: true,
        },
      },
    },
  });

  return records.map(toVacationRequest);
}

export function getVacationMetrics(
  requests: VacationRequest[],
  employees: Array<{ vacationRemaining: number }>,
  t: (key: string) => string,
): VacationMetric[] {
  const pending = requests.filter((request) => request.status === "pending").length;
  const approved = requests.filter((request) => request.status === "approved").length;
  const requestedDays = requests.reduce((total, request) => {
    const parsed = Number.parseInt(request.days, 10);

    return total + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
  const averageRemaining =
    employees.length > 0
      ? Math.round(
          employees.reduce((total, employee) => total + employee.vacationRemaining, 0) /
            employees.length,
        )
      : 0;

  return [
    {
      label: t("metricPendingLabel"),
      value: pending.toString(),
      caption: t("metricPendingCaption"),
      tone: "warning",
    },
    {
      label: t("metricApprovedLabel"),
      value: approved.toString(),
      caption: t("metricApprovedCaption"),
      tone: "success",
    },
    {
      label: t("metricAvgRemainingLabel"),
      value: averageRemaining.toString(),
      caption: t("metricAvgRemainingCaption"),
    },
    {
      label: t("metricRequestedDaysLabel"),
      value: requestedDays.toString(),
      caption: t("metricRequestedDaysCaption"),
    },
  ];
}

export async function requireVacationManager(tenantSlug: string) {
  await requireTenantAccess(tenantSlug, "vacation", "write");
  const userId = await getSessionUserId();

  if (!userId) {
    throw new Error("Nicht angemeldet.");
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId,
      tenant: { slug: tenantSlug },
    },
    select: {
      role: true,
      roleRef: {
        select: {
          permissions: {
            where: { area: "vacation" },
            select: { level: true },
          },
        },
      },
    },
  });

  if (!membership) {
    throw new Error("Keine Berechtigung für diesen Mandanten.");
  }

  const role = membership.role;
  const permission = membership.roleRef?.permissions[0]?.level ?? "none";

  if (
    role === "OWNER" ||
    role === "ADMIN" ||
    role === "HR" ||
    permission === "write" ||
    permission === "admin"
  ) {
    return { userId, role };
  }

  throw new Error("Keine Berechtigung zum Bearbeiten von Urlaub.");
}

export async function createTenantVacationRequest(input: {
  tenantSlug: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  note: string;
}) {
  await requireVacationManager(input.tenantSlug);

  const tenantId = await getTenantIdForVacation(input.tenantSlug);

  if (!tenantId) {
    throw new Error("Mandant nicht gefunden.");
  }

  const employee = await prisma.tenantEmployee.findFirst({
    where: {
      tenantId,
      id: input.employeeId,
    },
    select: { id: true, name: true, startDate: true, endDate: true, status: true },
  });

  if (!employee) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  // Mit Scope "nur eigene" ist "Urlaub für jemand anderen eintragen" keine
  // erlaubte Aktion — die Mitarbeiterauswahl der App blendet sie dort auch
  // aus, durchgesetzt wird sie aber erst hier.
  await assertEmployeeInScope(
    await requireTenantAccess(input.tenantSlug, "vacation", "write"),
    employee.id,
  );

  validateVacationDateRange(input.startDate, input.endDate, employee);
  await assertNoVacationOverlap({
    employeeId: employee.id,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  const key = await createUniqueVacationKey({
    tenantId,
    employeeName: employee.name,
    startDate: input.startDate,
  });
  const calendar = await resolveVacationWorkCalendar(tenantId, employee.id);

  return prisma.tenantVacationRequest.create({
    data: {
      tenantId,
      employeeId: employee.id,
      key,
      startDate: input.startDate,
      endDate: input.endDate,
      days: calculateAndValidateVacationWorkDays(input.startDate, input.endDate, calendar),
      note: input.note.trim(),
      status: "pending",
    },
  });
}

/**
 * Self-Service-Variante: ein Mitarbeiter beantragt Urlaub für sich selbst.
 * Braucht anders als `createTenantVacationRequest` keine "vacation:write"-
 * Berechtigung auf den gesamten Mandanten — nur eine gültige Mitgliedschaft
 * und eine verknüpfte Personalakte.
 */
export async function createMyVacationRequest(input: {
  tenantSlug: string;
  startDate: string;
  endDate: string;
  note: string;
}) {
  const access = await requireTenantMembership(input.tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true, name: true, startDate: true, endDate: true, status: true },
  });

  if (!employee) {
    throw new Error(
      "Ihr Konto ist noch keiner Personalakte zugeordnet. Bitte an HR wenden.",
    );
  }

  validateVacationDateRange(input.startDate, input.endDate, employee);
  await assertNoVacationOverlap({
    employeeId: employee.id,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  const key = await createUniqueVacationKey({
    tenantId: access.tenantId,
    employeeName: employee.name,
    startDate: input.startDate,
  });
  const calendar = await resolveVacationWorkCalendar(access.tenantId, employee.id);

  const request = await prisma.tenantVacationRequest.create({
    data: {
      tenantId: access.tenantId,
      employeeId: employee.id,
      key,
      startDate: input.startDate,
      endDate: input.endDate,
      days: calculateAndValidateVacationWorkDays(input.startDate, input.endDate, calendar),
      note: input.note.trim(),
      status: "pending",
    },
  });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Urlaubsantrag gestellt (Self-Service)",
    source: "Urlaub",
    entityType: "vacation",
    entityId: request.id,
    detail: employee.name,
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: access.tenantId },
    select: { name: true },
  });

  await notifyManagersOfNewVacationRequest({
    tenantId: access.tenantId,
    tenantName: tenant?.name ?? input.tenantSlug,
    employeeName: employee.name,
    requestId: request.id,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  return request;
}

export async function setTenantVacationRequestStatus(input: {
  tenantSlug: string;
  requestId: string;
  status: "approved" | "rejected";
}) {
  const access = await requireVacationManager(input.tenantSlug);
  const tenantId = await getTenantIdForVacation(input.tenantSlug);

  if (!tenantId) {
    throw new Error("Mandant nicht gefunden.");
  }

  const request = await prisma.tenantVacationRequest.findFirst({
    where: {
      id: input.requestId,
      tenantId,
    },
    select: {
      id: true,
      employeeId: true,
      startDate: true,
      endDate: true,
      employee: { select: { name: true, userId: true } },
    },
  });

  if (!request) {
    throw new Error("Urlaubsantrag nicht gefunden.");
  }

  // Scope begrenzt sonst nur die Liste, nicht das Genehmigen/Ablehnen per
  // requestId — ein team-/own-gescopter Genehmiger dürfte sonst über eine
  // bekannte requestId auch außerhalb seines Scopes entscheiden.
  await assertEmployeeInScope(
    await requireTenantAccess(input.tenantSlug, "vacation", "write"),
    request.employeeId,
  );

  // Über den eigenen Antrag entscheidet man nicht selbst — das gilt
  // unabhängig vom Scope, auch für "vacation:write/all" (Audit-Finding H10):
  // die Scope-Prüfung oben lässt "own" bewusst den eigenen Datensatz zu, das
  // ist für Anlegen/Bearbeiten richtig, für eine Genehmigungsentscheidung
  // aber genau der falsche Fall. Ausnahme: der Tenant-Owner hat niemanden
  // über sich, der stattdessen entscheiden könnte — für ihn bleibt Self-
  // Service sonst eine Sackgasse.
  if (request.employee.userId === access.userId && access.role !== "OWNER") {
    throw new Error("Über den eigenen Urlaubsantrag kann nicht selbst entschieden werden.");
  }

  // Compare-and-Set statt bedingungslosem Update: verhindert, dass zwei
  // gleichzeitige Entscheidungen (z. B. zwei Tabs, zwei Genehmiger) beide
  // durchgehen und der zweite Schreibvorgang den ersten unbemerkt
  // überschreibt (Audit-Finding H10).
  //
  // Bedingung ist "Status ändert sich tatsächlich", nicht "Status ist noch
  // pending": eine bereits getroffene Entscheidung muss sich nachträglich
  // umkehren lassen (genehmigt und doch noch abgelehnt, oder umgekehrt) —
  // genau dafür bietet `vacation-request/[id].tsx` in der App auch nach einer
  // Entscheidung beide Buttons an. Nur ein Klick, der am Status nichts
  // ändern würde (z. B. erneut "genehmigen" auf einem bereits genehmigten
  // Antrag), bleibt ein "Bereits entschieden".
  const { count } = await prisma.tenantVacationRequest.updateMany({
    where: { id: input.requestId, status: { not: input.status } },
    data: {
      status: input.status,
      decidedAt: new Date(),
      decidedBy: access.userId,
    },
  });

  if (count === 0) {
    throw new Error("Der Genehmigungsstatus dieses Antrags hat sich zwischenzeitlich geändert. Bitte die Seite neu laden.");
  }

  const tenantAccess = await requireTenantAccess(input.tenantSlug, "vacation", "write");

  await recordTenantAudit({
    tenantId,
    actorId: tenantAccess.userId,
    actorName: tenantAccess.userName,
    action:
      input.status === "approved"
        ? "Urlaubsantrag genehmigt"
        : "Urlaubsantrag abgelehnt",
    source: "Urlaub",
    entityType: "vacation",
    entityId: request.id,
    detail: request.employee.name,
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  await notifyVacationRequestDecided({
    tenantId,
    tenantName: tenant?.name ?? input.tenantSlug,
    employeeId: request.employeeId,
    requestId: request.id,
    status: input.status,
    startDate: request.startDate,
    endDate: request.endDate,
  });

  // Nachträglich genehmigter Urlaub kann bereits veröffentlichte Schichten
  // betreffen (Urlaub wurde erst NACH dem Veröffentlichen beantragt/genehmigt)
  // — dann bekommen alle mit Schichtplan-Admin-Recht eine Konflikt-Meldung.
  if (input.status === "approved") {
    await notifyIfAbsenceConflictsWithPublishedShifts({
      tenantId,
      tenantName: tenant?.name ?? input.tenantSlug,
      employeeId: request.employeeId,
      employeeName: request.employee.name,
      startDate: request.startDate,
      endDate: request.endDate,
      reason: "vacation",
    });
  }
}

export async function updateTenantVacationRequest(input: {
  tenantSlug: string;
  requestId: string;
  startDate: string;
  endDate: string;
  note: string;
}) {
  await requireVacationManager(input.tenantSlug);
  const access = await requireTenantAccess(input.tenantSlug, "vacation", "write");
  const tenantId = access.tenantId;

  const request = await prisma.tenantVacationRequest.findFirst({
    where: { id: input.requestId, tenantId },
    select: {
      id: true,
      employeeId: true,
      startDate: true,
      endDate: true,
      status: true,
      employee: { select: { name: true } },
    },
  });

  if (!request) {
    throw new Error("Urlaubsantrag nicht gefunden.");
  }

  await assertEmployeeInScope(access, request.employeeId);

  // Bestehende Anträge dürfen auch auf vergangene Zeiträume korrigiert
  // werden (z. B. nachträgliche Erfassung) – nur das Format und die
  // Reihenfolge der Daten werden geprüft.
  const parsedStartDate = parseDateOnly(input.startDate);
  const parsedEndDate = parseDateOnly(input.endDate);

  if (!parsedStartDate || !parsedEndDate) {
    throw new Error("Bitte gültige Datumswerte auswählen.");
  }

  if (parsedEndDate < parsedStartDate) {
    throw new Error("Das Enddatum darf nicht vor dem Startdatum liegen.");
  }

  // Eine Änderung des Zeitraums an einem bereits entschiedenen Antrag darf
  // dessen Genehmigungsstatus nicht einfach mitnehmen — sonst wäre ein
  // genehmigter Zeitraum nachträglich frei erweiterbar, ohne dass das
  // jemand erneut freigibt (Audit-Finding H10). Eine reine Notiz-Änderung
  // löst dagegen keine erneute Prüfung aus.
  const datesChanged =
    input.startDate !== request.startDate || input.endDate !== request.endDate;
  const needsReapproval = datesChanged && request.status !== "pending";

  if (datesChanged) {
    await assertNoVacationOverlap({
      employeeId: request.employeeId,
      startDate: input.startDate,
      endDate: input.endDate,
      excludeRequestId: request.id,
    });
  }

  const calendar = await resolveVacationWorkCalendar(tenantId, request.employeeId);

  // Compare-and-Set gegen den oben gelesenen Status, statt bedingungslos zu
  // schreiben (Audit-Finding H10, Rest): ohne das konnte zwischen dem Lesen
  // eines "pending"-Antrags (needsReapproval=false) und diesem Schreiben
  // eine GLEICHZEITIGE Genehmigung dazwischenkommen — die neuen Datumswerte
  // landeten dann auf einem inzwischen "approved" Antrag, ohne dass jemand
  // GENAU diese Daten je freigegeben hätte. Schlägt die Bedingung fehl, war
  // der Status zwischenzeitlich nicht mehr derselbe — dann lieber einen
  // klaren Fehler werfen und die aktuelle Reapproval-Entscheidung erneut
  // (gegen den jetzt echten Status) anfordern, statt still zu überschreiben.
  const { count } = await prisma.tenantVacationRequest.updateMany({
    where: { id: input.requestId, status: request.status },
    data: {
      startDate: input.startDate,
      endDate: input.endDate,
      days: calculateAndValidateVacationWorkDays(input.startDate, input.endDate, calendar),
      note: input.note.trim(),
      ...(needsReapproval ? { status: "pending", decidedAt: null, decidedBy: "" } : {}),
    },
  });

  if (count === 0) {
    throw new Error(
      "Der Genehmigungsstatus dieses Antrags hat sich zwischenzeitlich geändert. Bitte die Seite neu laden und erneut versuchen.",
    );
  }

  await recordTenantAudit({
    tenantId,
    actorId: access.userId,
    actorName: access.userName,
    action: "Urlaubsantrag aktualisiert",
    source: "Urlaub",
    entityType: "vacation",
    entityId: request.id,
    detail: `${request.employee.name}: ${formatDate(input.startDate)} – ${formatDate(input.endDate)}`,
  });
}

export async function deleteTenantVacationRequest(input: {
  tenantSlug: string;
  requestId: string;
}) {
  const access = await requireTenantAccess(input.tenantSlug, "vacation", "read");

  if (!access.canDelete) {
    throw new Error("FORBIDDEN");
  }

  const tenantId = access.tenantId;

  const request = await prisma.tenantVacationRequest.findFirst({
    where: {
      id: input.requestId,
      tenantId,
    },
    select: { id: true, employeeId: true },
  });

  if (!request) {
    throw new Error("Urlaubsantrag nicht gefunden.");
  }

  await assertEmployeeInScope(access, request.employeeId);

  await prisma.tenantVacationRequest.delete({
    where: { id: input.requestId },
  });
}

/**
 * Verbucht Resturlaubs-Übertrag zum Jahreswechsel, versendet den gesetzlich
 * erforderlichen Verfalls-Hinweis (BUrlG §7 Abs. 3) und lässt einen
 * rechtzeitig hingewiesenen, abgelaufenen Carryover verfallen (Audit-Finding
 * M02). Von `app/api/cron/cleanup/route.ts` täglich aufgerufen — jeder
 * einzelne Schritt ist idempotent (siehe lib/vacation-carryover.ts), ein
 * mehrfacher Lauf pro Tag/Jahr verändert den Zustand nicht erneut.
 *
 * Näherung mangels Historie: `vacationTotal` ist ein einziges, live
 * gepflegtes Feld ohne Jahresbezug — als "Anspruch des abgelaufenen Jahres"
 * wird hier der aktuelle Wert verwendet, weil kein historischer
 * Jahresanspruch gespeichert ist. Ändert HR den Anspruch untermittig, wirkt
 * sich das rückwirkend auf die Carryover-Berechnung aus.
 *
 * `tenantId` ist nur für gezielte Tests gegen die reale (geteilte) DB gedacht
 * — der Cronjob selbst ruft ohne dieses Argument auf und verarbeitet
 * mandantenübergreifend alle aktiven Mitarbeiter, wie die übrigen
 * Cleanup-Teilschritte auch.
 */
export async function runVacationCarryoverRollover(now: Date = new Date(), tenantId?: string) {
  const employees = await prisma.tenantEmployee.findMany({
    where: { status: "active", ...(tenantId ? { tenantId } : {}) },
    select: {
      id: true,
      name: true,
      tenantId: true,
      vacationTotal: true,
      vacationCarryover: true,
      vacationCarryoverExpiresAt: true,
      vacationCarryoverRemindedAt: true,
      tenant: { select: { name: true } },
    },
  });

  let rolledOver = 0;
  let remindersSent = 0;
  let flaggedForReview = 0;

  for (const employee of employees) {
    const previousYear = now.getUTCFullYear() - 1;
    let state = {
      carryover: employee.vacationCarryover,
      expiresAt: employee.vacationCarryoverExpiresAt,
      remindedAt: employee.vacationCarryoverRemindedAt,
    };

    const alreadyRolledOverThisYear =
      state.expiresAt !== null && state.expiresAt.getUTCFullYear() === now.getUTCFullYear();

    // Bekannte Prüfgrenze (Audit-Finding R05, "Initialisierung"): ohne ein
    // Jahres-Ledger für vacationTotal nimmt auch der allererste Lauf für
    // einen Mitarbeiter dessen AKTUELLE vacationTotal als Vorjahresanspruch
    // an. Für langjährig Beschäftigte mit stabilem Anspruch ist das in der
    // Praxis eine vernünftige Näherung; bei einer erst dieses Jahr
    // wirksamen Anspruchsänderung kann sie zu hoch/zu niedrig ausfallen.
    // Eine zuverlässigere Lösung bräuchte eine echte Historie des
    // Jahresanspruchs (nicht nur den aktuellen Wert) — das ist eine
    // Produktentscheidung, keine reine Code-Korrektur, und deshalb hier
    // bewusst nicht verändert.
    if (!alreadyRolledOverThisYear) {
      // Vor FIRST_TRACKED_VACATION_YEAR wurden Urlaubsanträge nicht
      // durchgängig erfasst — "0 Anträge gefunden" hieße dort "keine Daten",
      // nicht "0 Tage genommen". Für ein solches Vorjahr keinen Übertrag
      // fingieren (0/0 statt echter Werte), sonst bekäme jeder
      // Bestandsmitarbeiter beim ersten Lauf seinen vollen Jahresanspruch
      // nochmal gutgeschrieben.
      const previousYearIsTracked = previousYear >= FIRST_TRACKED_VACATION_YEAR;
      const previousYearTaken = previousYearIsTracked
        ? await prisma.tenantVacationRequest.aggregate({
            where: {
              employeeId: employee.id,
              status: "approved",
              startDate: { gte: `${previousYear}-01-01`, lte: `${previousYear}-12-31` },
            },
            _sum: { days: true },
          })
        : null;

      const rolled = rollOverVacationCarryover({
        now,
        currentState: state,
        previousYearTotal: previousYearIsTracked ? employee.vacationTotal : 0,
        previousYearTaken: previousYearIsTracked ? previousYearTaken?._sum.days ?? 0 : 0,
      });

      if (rolled !== state) {
        state = rolled;
        rolledOver += 1;
      }
    }

    if (isCarryoverReminderDue(state, now)) {
      // NUR bei tatsächlichem Zustellversuch (verknüpftes Konto vorhanden)
      // `remindedAt` setzen — sonst könnte ein Mitarbeiter ohne Konto nie
      // benachrichtigt werden und der Anspruch würde trotzdem unten als
      // "rechtzeitig hingewiesen" verfallen (Audit-Finding R05).
      const delivered = await notifyEmployeeOfExpiringVacationCarryover({
        tenantId: employee.tenantId,
        tenantName: employee.tenant.name,
        employeeId: employee.id,
        days: state.carryover,
        expiresAt: state.expiresAt!.toISOString().slice(0, 10),
      });

      if (delivered) {
        await createSystemTenantReminder({
          tenantId: employee.tenantId,
          title: `Resturlaub verfällt: ${employee.name} (${state.expiresAt!.getUTCFullYear()})`,
          dueDate: state.expiresAt!.toISOString().slice(0, 10),
          priority: "important",
          subject: `${employee.name} hat noch ${state.carryover} Tag(e) Resturlaub aus dem Vorjahr`,
          category: "Urlaub",
          notes:
            "Der/die Mitarbeiter:in wurde automatisch per Benachrichtigung auf den drohenden Verfall hingewiesen (BUrlG §7 Abs. 3). Bitte die Urlaubsplanung entsprechend abstimmen.",
        });
        state = { ...state, remindedAt: now };
        remindersSent += 1;
      } else {
        await createSystemTenantReminder({
          tenantId: employee.tenantId,
          title: `Resturlaub-Hinweis nicht zustellbar: ${employee.name} (${state.expiresAt!.getUTCFullYear()})`,
          dueDate: now.toISOString().slice(0, 10),
          priority: "important",
          subject: `${employee.name} hat noch ${state.carryover} Tag(e) Resturlaub aus dem Vorjahr, aber kein verknüpftes Konto`,
          category: "Urlaub",
          notes:
            "Der gesetzlich erforderliche Verfalls-Hinweis (BUrlG §7 Abs. 3) konnte nicht automatisch zugestellt werden, weil kein Benutzerkonto verknüpft ist. Bitte manuell informieren, damit der Anspruch fristgerecht hinweisbar bleibt.",
        });
      }
    }

    if (shouldForfeitCarryover(state, now)) {
      // Kein automatisches Nullsetzen mehr (Audit-Finding R05): Urlaubsverfall
      // bei Krankheit oder abweichenden Anspruchsjahren ist rechtlich
      // differenziert (u. a. BAG 9 AZR 245/19) und lässt sich nicht pauschal
      // per Zeitstempelvergleich entscheiden. Der Fall geht stattdessen an
      // HR zur bewussten Prüfung/Entscheidung; der Anspruch bleibt bis dahin
      // technisch bestehen.
      const { created } = await createSystemTenantReminder({
        tenantId: employee.tenantId,
        title: `Urlaubsverfall prüfen: ${employee.name} (${state.expiresAt!.getUTCFullYear()})`,
        dueDate: now.toISOString().slice(0, 10),
        priority: "important",
        subject: `${employee.name}: ${state.carryover} Tag(e) Resturlaub aus dem Vorjahr sind laut Frist verfallbar`,
        category: "Urlaub",
        notes:
          "Automatische Fristprüfung: rechtzeitiger Hinweis erfolgt, Frist (31.03.) abgelaufen. Vor einer Kürzung bitte prüfen, ob Krankheit oder ein abweichendes Anspruchsjahr den Verfall ausschließt (BAG 9 AZR 245/19). Der Anspruch wurde NICHT automatisch gestrichen.",
      });

      if (created) {
        flaggedForReview += 1;
      }
    }

    const changed =
      state.carryover !== employee.vacationCarryover ||
      state.expiresAt?.getTime() !== employee.vacationCarryoverExpiresAt?.getTime() ||
      state.remindedAt?.getTime() !== employee.vacationCarryoverRemindedAt?.getTime();

    if (changed) {
      await prisma.tenantEmployee.update({
        where: { id: employee.id },
        data: {
          vacationCarryover: state.carryover,
          vacationCarryoverExpiresAt: state.expiresAt,
          vacationCarryoverRemindedAt: state.remindedAt,
        },
      });
    }
  }

  return { checked: employees.length, rolledOver, remindersSent, flaggedForReview };
}
