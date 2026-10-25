import "server-only";

import { recordTenantAudit } from "@/lib/audit";
import { parseWeeklyHours } from "@/lib/my-times";
import {
  notifyEmployeeOfShiftOffer,
  notifyShiftOfferAccepted,
} from "@/lib/notifications/events";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  assertArbzgCompliant,
  buildAbsenceCheck,
  getISOWeekFromDate,
  getISOWeekStart,
  requireShiftManager,
} from "@/lib/shift-service";
import {
  scoreShiftOfferCandidate,
  SHIFT_OFFER_ERRORS,
  shiftNetMinutes,
  type ShiftOfferCandidate,
  type ShiftOfferStatus,
} from "@/lib/shift-offers";
import {
  assertEmployeeInScope,
  requireTenantMembership,
  resolveScopeFilter,
  scopeAllowsTarget,
} from "@/lib/tenant-access";

/**
 * Schicht anbieten / Vertretung finden (M8): Die Planung fragt passende
 * Personen per Push an, wer zuerst zusagt, bekommt die Schicht. Angefragt
 * werden kann eine offene Schicht oder eine, deren eingeteilte Person
 * abwesend ist (Vertretung). Annehmen prüft dieselben Regeln wie das
 * Einteilen durch die Planung (Überschneidung, Ruhezeit, Höchstarbeitszeit,
 * Jugend-/Mutterschutz).
 *
 * Die App kennt Angebote noch nicht (`/api/me/shift-offers` ist vorbereitet);
 * bis zum App-Update lassen sie sich im Web unter "Mein Bereich" annehmen.
 */

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function weekBounds(date: string) {
  const { year, week } = getISOWeekFromDate(new Date(`${date}T12:00:00Z`));
  const start = getISOWeekStart(year, week);
  const end = new Date(start);

  end.setUTCDate(start.getUTCDate() + 6);

  return { year, week, from: isoDate(start), to: isoDate(end) };
}

async function loadManagedShift(tenantSlug: string, shiftId: string) {
  const access = await requireShiftManager(tenantSlug);
  const shift = await prisma.tenantShift.findFirst({
    where: { id: shiftId, tenantId: access.tenantId },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      breakMinutes: true,
      team: true,
      teamId: true,
      locationId: true,
      employeeId: true,
      location: { select: { name: true } },
      employee: { select: { name: true } },
    },
  });

  if (!shift) {
    throw new Error(SHIFT_OFFER_ERRORS.shiftNotFound);
  }

  if (shift.employeeId) {
    await assertEmployeeInScope(access, shift.employeeId);
  }

  return { access, shift };
}

export type ShiftOfferContext = {
  shift: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    location: string;
    team: string;
    replacedEmployeeName: string | null;
    /** "vacation" | "sickness", wenn die eingeteilte Person abwesend ist. */
    replacedAbsence: "vacation" | "sickness" | null;
  };
  candidates: ShiftOfferCandidate[];
};

/** Passende Personen für eine Schicht, bewertet und absteigend sortiert. */
export async function getShiftOfferCandidates(input: {
  tenantSlug: string;
  shiftId: string;
}): Promise<ShiftOfferContext> {
  const { access, shift } = await loadManagedShift(input.tenantSlug, input.shiftId);
  const scopeFilter = await resolveScopeFilter(access);
  const bounds = weekBounds(shift.date);
  const employees = (
    await prisma.tenantEmployee.findMany({
      where: {
        tenantId: access.tenantId,
        status: { not: "former" },
        ...(shift.employeeId ? { id: { not: shift.employeeId } } : {}),
      },
      select: {
        id: true,
        name: true,
        initials: true,
        team: true,
        userId: true,
        weeklyHours: true,
        birthDate: true,
        maternityProtectionActive: true,
        locationMemberships: { select: { locationId: true } },
        teamMemberships: { select: { teamId: true } },
      },
      orderBy: { name: "asc" },
    })
  ).filter((employee) => scopeFilter.type === "all" || scopeAllowsTarget(scopeFilter, employee));
  const employeeIds = employees.map((employee) => employee.id);
  const [isAbsent, weekShifts, wishFree, offers] = await Promise.all([
    buildAbsenceCheck(
      access.tenantId,
      [...employeeIds, ...(shift.employeeId ? [shift.employeeId] : [])],
      shift.date,
      shift.date,
    ),
    prisma.tenantShift.findMany({
      where: {
        tenantId: access.tenantId,
        employeeId: { in: employeeIds },
        date: { gte: bounds.from, lte: bounds.to },
      },
      select: { employeeId: true, startTime: true, endTime: true, breakMinutes: true },
    }),
    prisma.tenantWishFreeRequest.findMany({
      where: { tenantId: access.tenantId, employeeId: { in: employeeIds }, date: shift.date, status: "approved" },
      select: { employeeId: true },
    }),
    prisma.tenantShiftOffer.findMany({
      where: { shiftId: shift.id },
      select: { employeeId: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const wishFreeIds = new Set(wishFree.map((item) => item.employeeId));
  const offerStatus = new Map(offers.map((offer) => [offer.employeeId, offer.status as ShiftOfferStatus]));
  const shiftMinutes = shiftNetMinutes(shift.startTime, shift.endTime, shift.breakMinutes);
  const candidates: ShiftOfferCandidate[] = [];

  for (const employee of employees) {
    const absence = isAbsent(employee.id, shift.date);
    let blockedReason: string | null = absence === "vacation" ? "Urlaub" : absence === "sickness" ? "Abwesend" : null;
    let restOk = true;

    if (!blockedReason && wishFreeIds.has(employee.id)) {
      blockedReason = "Wunschfrei";
    }

    if (!blockedReason) {
      try {
        await assertArbzgCompliant({
          tenantId: access.tenantId,
          employeeId: employee.id,
          date: shift.date,
          startTime: shift.startTime,
          endTime: shift.endTime,
          breakMinutes: shift.breakMinutes,
          employeeBirthDate: employee.birthDate,
          employeeMaternityProtectionActive: employee.maternityProtectionActive,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";

        if (message.startsWith("Konflikt mit bestehender Schicht")) {
          blockedReason = "Bereits eingeplant";
        } else {
          restOk = false;
          blockedReason = message || "Arbeitszeitregeln";
        }
      }
    }

    const plannedMinutes =
      weekShifts
        .filter((item) => item.employeeId === employee.id)
        .reduce((sum, item) => sum + shiftNetMinutes(item.startTime, item.endTime, item.breakMinutes), 0) + shiftMinutes;
    const weeklyHours = parseWeeklyHours(employee.weeklyHours);
    const targetMinutes = weeklyHours ? Math.round(weeklyHours * 60) : null;
    const checks = {
      available: blockedReason === null,
      rest: restOk,
      hours: targetMinutes === null || plannedMinutes <= targetMinutes,
      team: Boolean(
        (shift.teamId && employee.teamMemberships.some((membership) => membership.teamId === shift.teamId)) ||
          (shift.team && employee.team === shift.team),
      ),
      location: Boolean(
        shift.locationId && employee.locationMemberships.some((membership) => membership.locationId === shift.locationId),
      ),
    };

    candidates.push({
      employeeId: employee.id,
      name: employee.name,
      initials: employee.initials,
      team: employee.team,
      hasAccount: Boolean(employee.userId),
      plannedMinutes,
      targetMinutes,
      checks: (Object.keys(checks) as Array<keyof typeof checks>).map((id) => ({ id, ok: checks[id] })),
      score: scoreShiftOfferCandidate(checks),
      blockedReason,
      offerStatus: offerStatus.get(employee.id) ?? null,
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "de"));

  return {
    shift: {
      id: shift.id,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      location: shift.location?.name ?? "",
      team: shift.team,
      replacedEmployeeName: shift.employee?.name ?? null,
      replacedAbsence: shift.employeeId ? isAbsent(shift.employeeId, shift.date) : null,
    },
    candidates,
  };
}

/**
 * Bietet die Schicht den gewählten Personen per Push an. Wer schon ein
 * offenes Angebot für diese Schicht hat, wird nicht erneut angefragt;
 * Personen ohne App-Konto werden übersprungen und gezählt.
 */
export async function offerShiftToEmployees(input: {
  tenantSlug: string;
  shiftId: string;
  employeeIds: string[];
}) {
  const { access, shift } = await loadManagedShift(input.tenantSlug, input.shiftId);
  const requestedIds = Array.from(new Set(input.employeeIds.filter(Boolean))).slice(0, 200);

  if (requestedIds.length === 0) {
    throw new Error(SHIFT_OFFER_ERRORS.noRecipients);
  }

  const [tenant, employees, existing] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: access.tenantId }, select: { name: true } }),
    prisma.tenantEmployee.findMany({
      where: { tenantId: access.tenantId, id: { in: requestedIds }, status: { not: "former" } },
      select: { id: true, name: true, userId: true },
    }),
    prisma.tenantShiftOffer.findMany({
      where: { shiftId: shift.id, status: "pending" },
      select: { employeeId: true },
    }),
  ]);
  const alreadyAsked = new Set(existing.map((offer) => offer.employeeId));
  let sent = 0;
  let withoutAccount = 0;

  for (const employee of employees) {
    if (employee.id === shift.employeeId || alreadyAsked.has(employee.id)) {
      continue;
    }

    await assertEmployeeInScope(access, employee.id);

    if (!employee.userId) {
      withoutAccount += 1;
      continue;
    }

    const offer = await prisma.tenantShiftOffer.create({
      data: {
        tenantId: access.tenantId,
        shiftId: shift.id,
        employeeId: employee.id,
        replacedEmployeeId: shift.employeeId,
        createdBy: access.userId,
      },
      select: { id: true },
    });

    await notifyEmployeeOfShiftOffer({
      tenantId: access.tenantId,
      tenantName: tenant?.name ?? "",
      employeeId: employee.id,
      offerId: offer.id,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      location: shift.location?.name ?? "",
    });
    sent += 1;
  }

  if (sent > 0) {
    await recordTenantAudit({
      tenantId: access.tenantId,
      actorId: access.userId,
      actorName: access.userName,
      action: "Schicht angeboten",
      source: "Schichtplanung",
      entityType: "shift",
      entityId: shift.id,
      detail: `${shift.date} ${shift.startTime}–${shift.endTime}${shift.employee ? ` · Vertretung für ${shift.employee.name}` : ""} · ${sent} angefragt`,
    });
  }

  return { sent, withoutAccount };
}

/** Offene Angebote je Schicht (für die Kennzeichnung im Plan). */
export async function getPendingShiftOfferCounts(tenantSlug: string, shiftIds: string[]) {
  if (shiftIds.length === 0) {
    return {} as Record<string, number>;
  }

  const access = await requireShiftManager(tenantSlug);
  const rows = await prisma.tenantShiftOffer.groupBy({
    by: ["shiftId"],
    where: { tenantId: access.tenantId, shiftId: { in: shiftIds }, status: "pending" },
    _count: { _all: true },
  });

  return Object.fromEntries(rows.map((row) => [row.shiftId, row._count._all])) as Record<string, number>;
}

export type MyShiftOffer = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  location: string;
  team: string;
  /** Vertretung für … — nur der Vorname, keine Angabe zum Abwesenheitsgrund. */
  replacesFirstName: string | null;
  createdAt: string;
};

async function resolveMyEmployee(tenantSlug: string) {
  const access = await requireTenantMembership(tenantSlug);
  const employee = await prisma.tenantEmployee.findFirst({
    where: { tenantId: access.tenantId, userId: access.userId },
    select: { id: true, name: true, birthDate: true, maternityProtectionActive: true },
  });

  if (!employee) {
    throw new Error(SHIFT_OFFER_ERRORS.notLinked);
  }

  return { access, employee };
}

/** Eigene offene Angebote, deren Schicht noch zu haben ist (heute oder später). */
export async function getMyShiftOffers(tenantSlug: string): Promise<MyShiftOffer[]> {
  const { access, employee } = await resolveMyEmployee(tenantSlug);
  const rows = await prisma.tenantShiftOffer.findMany({
    where: {
      tenantId: access.tenantId,
      employeeId: employee.id,
      status: "pending",
      shift: { date: { gte: isoDate(new Date()) } },
    },
    include: {
      shift: {
        select: {
          date: true,
          startTime: true,
          endTime: true,
          breakMinutes: true,
          team: true,
          employeeId: true,
          location: { select: { name: true } },
          employee: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return rows
    .filter((row) => row.shift.employeeId === row.replacedEmployeeId)
    .map((row) => ({
      id: row.id,
      date: row.shift.date,
      startTime: row.shift.startTime,
      endTime: row.shift.endTime,
      breakMinutes: row.shift.breakMinutes,
      location: row.shift.location?.name ?? "",
      team: row.shift.team,
      replacesFirstName: row.shift.employee?.name.trim().split(/\s+/)[0] ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

type PublishedEntry = { key?: string; employeeId: string | null } & Record<string, unknown>;

/**
 * Annehmen oder ablehnen. Beim Annehmen wird die Schicht nur übertragen,
 * solange sie noch so eingeteilt ist wie beim Anfragen (sonst "bereits
 * vergeben"); die übrigen offenen Angebote derselben Schicht werden
 * geschlossen. Ist die Woche veröffentlicht, wird der veröffentlichte Stand
 * gleich mit angepasst — die angenommene Schicht soll sofort in "Meine
 * Schichten" stehen, ohne dass der Plan neu veröffentlicht werden muss.
 */
export async function respondToMyShiftOffer(input: {
  tenantSlug: string;
  offerId: string;
  decision: "accept" | "decline";
}) {
  if (input.decision !== "accept" && input.decision !== "decline") {
    throw new Error(SHIFT_OFFER_ERRORS.invalidDecision);
  }

  const { access, employee } = await resolveMyEmployee(input.tenantSlug);
  const offer = await prisma.tenantShiftOffer.findFirst({
    where: { id: input.offerId, tenantId: access.tenantId, employeeId: employee.id },
    include: {
      shift: {
        select: {
          id: true,
          key: true,
          date: true,
          startTime: true,
          endTime: true,
          breakMinutes: true,
          employeeId: true,
          location: { select: { name: true } },
          employee: { select: { name: true } },
        },
      },
    },
  });

  if (!offer) {
    throw new Error(SHIFT_OFFER_ERRORS.notFound);
  }

  if (offer.status !== "pending") {
    throw new Error(SHIFT_OFFER_ERRORS.notPending);
  }

  if (input.decision === "decline") {
    await prisma.tenantShiftOffer.update({
      where: { id: offer.id },
      data: { status: "declined", respondedAt: new Date() },
    });

    return { status: "declined" as const };
  }

  const shift = offer.shift;

  if (shift.employeeId !== offer.replacedEmployeeId) {
    await prisma.tenantShiftOffer.update({ where: { id: offer.id }, data: { status: "closed", respondedAt: new Date() } });
    throw new Error(SHIFT_OFFER_ERRORS.taken);
  }

  const isAbsent = await buildAbsenceCheck(access.tenantId, [employee.id], shift.date, shift.date);

  if (isAbsent(employee.id, shift.date)) {
    throw new Error(SHIFT_OFFER_ERRORS.absent);
  }

  await assertArbzgCompliant({
    tenantId: access.tenantId,
    employeeId: employee.id,
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    breakMinutes: shift.breakMinutes,
    excludeShiftId: shift.id,
    employeeBirthDate: employee.birthDate,
    employeeMaternityProtectionActive: employee.maternityProtectionActive,
  });

  const bounds = weekBounds(shift.date);
  const accepted = await prisma.$transaction(async (tx) => {
    const { count } = await tx.tenantShift.updateMany({
      where: { id: shift.id, employeeId: offer.replacedEmployeeId },
      data: { employeeId: employee.id, conflict: false },
    });

    if (count === 0) {
      return false;
    }

    const now = new Date();

    await tx.tenantShiftOffer.update({ where: { id: offer.id }, data: { status: "accepted", respondedAt: now } });
    await tx.tenantShiftOffer.updateMany({
      where: { shiftId: shift.id, status: "pending", id: { not: offer.id } },
      data: { status: "closed", respondedAt: now },
    });

    const week = await tx.tenantShiftWeek.findUnique({
      where: { tenantId_year_week: { tenantId: access.tenantId, year: bounds.year, week: bounds.week } },
      select: { id: true, status: true, publishedShiftsJson: true },
    });
    const snapshot = Array.isArray(week?.publishedShiftsJson) ? (week.publishedShiftsJson as PublishedEntry[]) : null;

    if (week?.status === "published" && snapshot?.some((entry) => entry.key === shift.key)) {
      await tx.tenantShiftWeek.update({
        where: { id: week.id },
        data: {
          publishedShiftsJson: snapshot.map((entry) =>
            entry.key === shift.key ? { ...entry, employeeId: employee.id } : entry,
          ) as Prisma.InputJsonValue,
        },
      });
    }

    return true;
  });

  if (!accepted) {
    await prisma.tenantShiftOffer.update({ where: { id: offer.id }, data: { status: "closed", respondedAt: new Date() } });
    throw new Error(SHIFT_OFFER_ERRORS.taken);
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: access.tenantId }, select: { name: true } });

  await recordTenantAudit({
    tenantId: access.tenantId,
    actorId: access.userId,
    actorName: employee.name,
    action: "Angebotene Schicht angenommen",
    source: "Schichtplanung",
    entityType: "shift",
    entityId: shift.id,
    detail: `${shift.date} ${shift.startTime}–${shift.endTime}${shift.employee ? ` · statt ${shift.employee.name}` : ""}`,
  });

  if (offer.createdBy) {
    await notifyShiftOfferAccepted({
      tenantId: access.tenantId,
      tenantName: tenant?.name ?? "",
      recipientUserId: offer.createdBy,
      employeeName: employee.name,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
    });
  }

  return { status: "accepted" as const };
}
