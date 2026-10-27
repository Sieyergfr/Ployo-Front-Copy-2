import "server-only";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * Kein Text wird hier mehr formuliert — die Ereignisse liefern nur noch
 * Schlüssel + Daten (`NotificationMessage`), gerendert wird pro Empfänger in
 * dessen Sprache (`lib/notifications/messages.ts`, aufgelöst in
 * `dispatchNotification`).
 */

/**
 * Rein fachliche Kategorie-Schalter ("soll diese Art Ereignis überhaupt
 * benachrichtigt werden") — bewusst OHNE `mailNotifications`/`mobilePush`/
 * `inAppNotifications`: das sind Kanal-Schalter, keine Kategorie-Schalter,
 * und werden seitdem ausschließlich in `dispatchNotification` je Kanal
 * geprüft. Vorher fungierte `mailNotifications` hier fälschlich als
 * Vorfilter für ALLE Kanäle (Audit-Finding M11) — ein deaktiviertes
 * `mobilePush`/`inAppNotifications` wurde dagegen nirgends geprüft.
 */
async function getTenantNotificationFlags(tenantId: string) {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { absenceAlerts: true, shiftAlerts: true },
  });

  return {
    absenceAlerts: settings?.absenceAlerts ?? true,
    shiftAlerts: settings?.shiftAlerts ?? true,
  };
}

async function getTenantManagers(tenantId: string) {
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId, role: { in: ["OWNER", "ADMIN", "HR"] } },
    select: { userId: true, user: { select: { email: true } } },
  });

  return memberships;
}

/** Konto + E-Mail hinter einer Personalakte — `null`, wenn (noch) keins verknüpft ist. */
async function getEmployeeAccount(employeeId: string) {
  const employee = await prisma.tenantEmployee.findUnique({
    where: { id: employeeId },
    select: { userId: true },
  });

  if (!employee?.userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: employee.userId },
    select: { email: true },
  });

  return { userId: employee.userId, email: user?.email ?? null };
}

/** Benachrichtigt einen Mitarbeiter, sobald über seinen Urlaubsantrag entschieden wurde. */
export async function notifyVacationRequestDecided(input: {
  tenantId: string;
  tenantName: string;
  employeeId: string;
  /** Für den Deep-Link in die App — ohne ihn bleibt die Meldung eine Sackgasse. */
  requestId: string;
  status: "approved" | "rejected";
  startDate: string;
  endDate: string;
}) {
  const flags = await getTenantNotificationFlags(input.tenantId);

  if (!flags.absenceAlerts) {
    return;
  }

  const account = await getEmployeeAccount(input.employeeId);

  if (!account) {
    return;
  }

  await dispatchNotification({
    userId: account.userId,
    email: account.email,
    message: {
      key: "vacationDecided",
      tenantName: input.tenantName,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
    },
    tenantId: input.tenantId,
    category: "vacation",
    entityType: "vacation-request",
    entityId: input.requestId,
  });
}

/**
 * Benachrichtigt einen Mitarbeiter mit dem aktuellen Stand seiner Schichten
 * einer Woche — als einzige Sammel-Mail statt einer Einzel-Mail pro Schicht.
 * Wird sowohl beim erstmaligen Veröffentlichen einer Woche verwendet
 * (`publishShiftWeek`) als auch bei jeder weiteren Änderung an einer bereits
 * veröffentlichten Woche (`notifyEmployeeWeekOverview` in shift-service.ts).
 */
export async function notifyEmployeeOfShiftPlanPublished(input: {
  tenantId: string;
  tenantName: string;
  employeeId: string;
  /** ISO-Jahr der Woche — zusammen mit `week` der Deep-Link-Ziel-Schlüssel. */
  year: number;
  /** Kalenderwoche als Zahl — die Beschriftung entsteht in der Sprache des Empfängers. */
  week: number;
  weekRange: string;
  shifts: Array<{ date: string; startTime: string; endTime: string }>;
}) {
  const flags = await getTenantNotificationFlags(input.tenantId);

  if (!flags.shiftAlerts) {
    return;
  }

  const account = await getEmployeeAccount(input.employeeId);

  if (!account) {
    return;
  }

  await dispatchNotification({
    userId: account.userId,
    email: account.email,
    message: {
      key: "shiftPlanPublished",
      tenantName: input.tenantName,
      week: input.week,
      weekRange: input.weekRange,
      shifts: input.shifts.map((shift) => ({
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
      })),
    },
    tenantId: input.tenantId,
    category: "shift",
    // Die Mitarbeiter-App öffnet damit genau diese Woche im Schichtplan,
    // statt die Einzeltage in der Benachrichtigung aufzulisten.
    entityType: "shift-week",
    entityId: `${input.year}-W${String(input.week).padStart(2, "0")}`,
  });
}

/**
 * Benachrichtigt alle mit Schichtplan-Admin-Recht: ein Mitarbeiter mit
 * bereits veröffentlichten Schichten wurde nachträglich für denselben
 * Zeitraum als abwesend markiert (Urlaub genehmigt / Krankmeldung erfasst).
 * Ausgelöst von `notifyIfAbsenceConflictsWithPublishedShifts` in shift-service.ts,
 * das vorab prüft, ob überhaupt ein echter Überschneidungs-Konflikt vorliegt.
 */
export async function notifyShiftPlanManagersOfAbsenceConflict(input: {
  tenantId: string;
  tenantName: string;
  employeeName: string;
  reason: "vacation" | "sickness";
  startDate: string;
  endDate: string | null;
  managers: Array<{ userId: string; email: string | null; canViewSicknessReason: boolean }>;
}) {
  const flags = await getTenantNotificationFlags(input.tenantId);

  if (!flags.shiftAlerts) {
    return;
  }

  await Promise.all(
    input.managers.map((manager) =>
      dispatchNotification({
        userId: manager.userId,
        email: manager.email,
        message: {
          key: "absenceConflict",
          tenantName: input.tenantName,
          employeeName: input.employeeName,
          reason: input.reason,
          startDate: input.startDate,
          endDate: input.endDate,
          // Krankheitsbezug (Art. 9 DSGVO) nur an Empfänger mit
          // sickness:read ausliefern (Audit-Finding H14).
          redactReason: input.reason === "sickness" && !manager.canViewSicknessReason,
        },
        tenantId: input.tenantId,
        category: "system",
        // Der Konflikt hängt an keiner eigenen Entität — gemeint ist der
        // Schichtplan im betroffenen Zeitraum. Das Startdatum reicht als
        // Ziel: die App öffnet damit dessen Woche im Gesamtplan.
        entityType: "shift-conflict",
        entityId: input.startDate,
      }),
    ),
  );
}

/** Benachrichtigt die Mandanten-Manager (OWNER/ADMIN/HR) über einen neuen Self-Service-Urlaubsantrag. */
export async function notifyManagersOfNewVacationRequest(input: {
  tenantId: string;
  tenantName: string;
  employeeName: string;
  requestId: string;
  startDate: string;
  endDate: string;
}) {
  const flags = await getTenantNotificationFlags(input.tenantId);

  if (!flags.absenceAlerts) {
    return;
  }

  const managers = await getTenantManagers(input.tenantId);

  await Promise.all(
    managers.map((manager) =>
      dispatchNotification({
        userId: manager.userId,
        email: manager.user.email,
        message: {
          key: "newVacationRequest",
          tenantName: input.tenantName,
          employeeName: input.employeeName,
          startDate: input.startDate,
          endDate: input.endDate,
        },
        tenantId: input.tenantId,
        // "system": Handlungsaufforderung an Manager, keine persönliche
        // Statusmeldung — nicht über notifyVacationEvents abbestellbar.
        category: "system",
        entityType: "vacation-request",
        entityId: input.requestId,
      }),
    ),
  );
}

/** Benachrichtigt die Mandanten-Manager über eine neue Self-Service-Krankmeldung. */
export async function notifyManagersOfNewSicknessReport(input: {
  tenantId: string;
  tenantName: string;
  employeeName: string;
  reportId: string;
  startDate: string;
}) {
  const flags = await getTenantNotificationFlags(input.tenantId);

  if (!flags.absenceAlerts) {
    return;
  }

  const managers = await getTenantManagers(input.tenantId);

  await Promise.all(
    managers.map((manager) =>
      dispatchNotification({
        userId: manager.userId,
        email: manager.user.email,
        message: {
          key: "newSicknessReport",
          tenantName: input.tenantName,
          employeeName: input.employeeName,
          startDate: input.startDate,
        },
        tenantId: input.tenantId,
        category: "system",
        entityType: "sickness-report",
        entityId: input.reportId,
      }),
    ),
  );
}

/**
 * Benachrichtigt einen Mitarbeiter über eine neue Info-Anfrage (HR/Admin
 * bittet um Angaben/eine Datei). "system"-Kategorie wie bei den
 * Manager-Benachrichtigungen: eine Handlungsaufforderung, kein persönlicher
 * Statuswechsel — nicht über notifyShiftEvents/notifyVacationEvents abbestellbar.
 */
export async function notifyEmployeeOfInfoRequest(input: {
  tenantId: string;
  tenantName: string;
  employeeId: string;
  requestId: string;
  title: string;
  dueAt: Date | null;
}) {
  const account = await getEmployeeAccount(input.employeeId);

  if (!account) {
    return;
  }

  await dispatchNotification({
    userId: account.userId,
    email: account.email,
    message: {
      key: "infoRequest",
      tenantName: input.tenantName,
      title: input.title,
      dueAt: input.dueAt,
    },
    tenantId: input.tenantId,
    category: "system",
    entityType: "info-request",
    entityId: input.requestId,
  });
}

/**
 * Benachrichtigt die Mandanten-Manager über eine neue Wunschfrei-Anfrage aus
 * der App. Wunschfrei aus der Planung heraus (`createTenantWishFreeRequest`)
 * wird direkt genehmigt eingetragen und löst deshalb nichts aus.
 */
export async function notifyManagersOfNewWishFreeRequest(input: {
  tenantId: string;
  tenantName: string;
  employeeName: string;
  requestId: string;
  date: string;
  reason: string;
}) {
  const flags = await getTenantNotificationFlags(input.tenantId);

  if (!flags.shiftAlerts) {
    return;
  }

  const managers = await getTenantManagers(input.tenantId);

  await Promise.all(
    managers.map((manager) =>
      dispatchNotification({
        userId: manager.userId,
        email: manager.user.email,
        message: {
          key: "newWishFreeRequest",
          tenantName: input.tenantName,
          employeeName: input.employeeName,
          date: input.date,
          reason: input.reason,
        },
        tenantId: input.tenantId,
        category: "system",
        entityType: "wish-free-request",
        entityId: input.requestId,
      }),
    ),
  );
}

/** Benachrichtigt einen Mitarbeiter über die Entscheidung zu seiner Wunschfrei-Anfrage. */
export async function notifyWishFreeRequestDecided(input: {
  tenantId: string;
  tenantName: string;
  employeeId: string;
  requestId: string;
  date: string;
  status: "approved" | "rejected";
  rejectReason: string;
}) {
  const flags = await getTenantNotificationFlags(input.tenantId);

  if (!flags.shiftAlerts) {
    return;
  }

  const account = await getEmployeeAccount(input.employeeId);

  if (!account) {
    return;
  }

  await dispatchNotification({
    userId: account.userId,
    email: account.email,
    message: {
      key: "wishFreeDecided",
      tenantName: input.tenantName,
      date: input.date,
      status: input.status,
      rejectReason: input.rejectReason,
    },
    tenantId: input.tenantId,
    category: "shift",
    entityType: "wish-free-request",
    entityId: input.requestId,
  });
}

/**
 * Benachrichtigt einen Mitarbeiter über drohend verfallenden Resturlaub
 * (BUrlG §7 Abs. 3, BAG 9 AZR 541/15) — der eigentliche rechtlich
 * erforderliche Hinweis, nicht nur eine interne HR-Erinnerung. "system":
 * eine gesetzliche Pflichtmitteilung, keine abbestellbare persönliche
 * Statusmeldung (Audit-Finding M02).
 */
/**
 * Liefert `true` nur, wenn ein tatsächlicher Zustellversuch unternommen
 * wurde (verknüpftes Konto vorhanden, `dispatchNotification` ist nicht
 * geworfen) — der Aufrufer (`runVacationCarryoverRollover`) darf
 * `vacationCarryoverRemindedAt` NUR bei `true` setzen. Vorher lieferte diese
 * Funktion bei fehlendem Konto stillschweigend `undefined` zurück, und der
 * Aufrufer setzte den Hinweis-Zeitstempel trotzdem — ohne Konto kein
 * Versand, aber `shouldForfeitCarryover` erlaubte den Verfall danach
 * trotzdem (Audit-Finding R05). Kein Nachweis tatsächlicher Zustellung
 * (E-Mail-Bounce, deaktivierter Kanal) — nur eine notwendige, keine
 * hinreichende Bedingung.
 */
export async function notifyEmployeeOfExpiringVacationCarryover(input: {
  tenantId: string;
  tenantName: string;
  employeeId: string;
  days: number;
  expiresAt: string;
}): Promise<boolean> {
  const account = await getEmployeeAccount(input.employeeId);

  if (!account) {
    return false;
  }

  await dispatchNotification({
    userId: account.userId,
    email: account.email,
    message: {
      key: "vacationCarryoverExpiring",
      tenantName: input.tenantName,
      days: input.days,
      expiresAt: input.expiresAt,
    },
    tenantId: input.tenantId,
    category: "system",
    entityType: "vacation-carryover",
    entityId: input.employeeId,
  });

  return true;
}

/**
 * Empfänger einer Korrektur-Anfrage: Mandanten-Manager plus alle Mitglieder,
 * deren Rolle `timeTracking` mit Schreibrecht hat und deren Ausschnitt den
 * Mitarbeiter enthält (Scope "all" bzw. gemeinsames Team bei "team").
 * "own" zählt nie — das wäre die Person selbst.
 */
async function getTimeCorrectionApprovers(tenantId: string, employeeId: string) {
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId },
    select: {
      userId: true,
      role: true,
      user: { select: { email: true } },
      roleRef: {
        select: { permissions: { where: { area: "timeTracking" }, select: { level: true, scope: true }, take: 1 } },
      },
    },
  });
  const employeeTeams = (
    await prisma.tenantTeamMember.findMany({ where: { employeeId }, select: { teamId: true } })
  ).map((membership) => membership.teamId);
  const subject = await prisma.tenantEmployee.findUnique({ where: { id: employeeId }, select: { userId: true } });

  const approvers: Array<{ userId: string; email: string | null }> = [];

  for (const membership of memberships) {
    if (membership.userId === subject?.userId) continue;

    if (["OWNER", "ADMIN", "HR"].includes(membership.role)) {
      approvers.push({ userId: membership.userId, email: membership.user.email });
      continue;
    }

    const permission = membership.roleRef?.permissions[0];
    if (!permission || !["write", "admin"].includes(permission.level)) continue;

    if (permission.scope === "all") {
      approvers.push({ userId: membership.userId, email: membership.user.email });
    } else if (permission.scope === "team" && employeeTeams.length) {
      const me = await prisma.tenantEmployee.findFirst({
        where: { tenantId, userId: membership.userId },
        select: { id: true },
      });
      const shared = me
        ? await prisma.tenantTeamMember.findFirst({
            where: { employeeId: me.id, teamId: { in: employeeTeams } },
            select: { teamId: true },
          })
        : null;
      if (shared) approvers.push({ userId: membership.userId, email: membership.user.email });
    }
  }

  return approvers;
}

/** Neue Korrektur-Anfrage zu gestempelten Zeiten → alle, die sie freigeben dürfen. */
export async function notifyApproversOfTimeCorrectionRequest(input: {
  tenantId: string;
  tenantName: string;
  employeeId: string;
  employeeName: string;
  requestId: string;
  date: string;
  startTime: string;
  endTime: string;
}) {
  const approvers = await getTimeCorrectionApprovers(input.tenantId, input.employeeId);

  await Promise.all(
    approvers.map((approver) =>
      dispatchNotification({
        userId: approver.userId,
        email: approver.email,
        message: {
          key: "timeCorrectionRequested",
          tenantName: input.tenantName,
          employeeName: input.employeeName,
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
        },
        tenantId: input.tenantId,
        category: "system",
        entityType: "time-correction-request",
        entityId: input.requestId,
      }),
    ),
  );
}

/** Entscheidung zur eigenen Korrektur-Anfrage. */
export async function notifyTimeCorrectionDecided(input: {
  tenantId: string;
  tenantName: string;
  employeeId: string;
  requestId: string;
  date: string;
  status: "approved" | "rejected";
  rejectReason: string;
}) {
  const account = await getEmployeeAccount(input.employeeId);

  if (!account) {
    return;
  }

  await dispatchNotification({
    userId: account.userId,
    email: account.email,
    message: {
      key: "timeCorrectionDecided",
      tenantName: input.tenantName,
      date: input.date,
      status: input.status,
      rejectReason: input.rejectReason,
    },
    tenantId: input.tenantId,
    category: "system",
    entityType: "time-correction-request",
    entityId: input.requestId,
  });
}
