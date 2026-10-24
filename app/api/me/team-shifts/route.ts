import { auth } from "@/lib/auth";
import {
  createTenantShift,
  getISOWeekFromDate,
  getShiftPlanForTenant,
} from "@/lib/shift-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError, subscriptionRequiredResponse } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Team-/Alle-Schichten-Ansicht (Schichtplan-Screen, Umschalter "Alle
 * Schichten"). Nutzt dieselbe berechtigungsabhängige Scope-Auflösung
 * (own/team/all) wie die Web-Schichtplanung — ein Mitarbeiter ohne
 * "shifts"-Leserecht bekommt entsprechend nur seine eigene Schicht bzw.
 * einen 403, je nach Rolle.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const tenant = params.get("tenant")?.trim();

  if (!tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  const yearParam = params.get("year");
  const weekParam = params.get("week");
  const { year: currentYear, week: currentWeek } = getISOWeekFromDate(new Date());
  const year = yearParam ? Number(yearParam) : currentYear;
  const week = weekParam ? Number(weekParam) : currentWeek;

  if (!Number.isInteger(year) || !Number.isInteger(week)) {
    return Response.json({ error: "'year'/'week' müssen ganze Zahlen sein." }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `me-team-shifts:${session.user.id}`,
    limit: 120,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const plan = await getShiftPlanForTenant({ tenantSlug: tenant, year, week });

    return Response.json({ plan });
  } catch (error) {
    if (error instanceof Error && (error.message === "FORBIDDEN" || error.message === "TWO_FACTOR_REQUIRED")) {
      return Response.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof Error && error.message === "SUBSCRIPTION_REQUIRED") {
      return subscriptionRequiredResponse();
    }

    throw error;
  }
}

function breakMinutesFromBody(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 30;
}

/** Neue Schicht anlegen (Schichtplanung, nur Nutzer mit "shifts"-Schreibrecht). */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-team-shifts-create:${session.user.id}`,
    limit: 120,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    tenant?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    breakMinutes?: number;
    employeeId?: string;
    locationId?: string;
    team?: string;
    note?: string;
  } | null;

  if (!body?.tenant || !body.date || !body.startTime || !body.endTime) {
    return Response.json(
      { error: "'tenant', 'date', 'startTime' und 'endTime' sind erforderlich." },
      { status: 400 },
    );
  }

  try {
    const shift = await createTenantShift({
      tenantSlug: body.tenant,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      breakMinutes: breakMinutesFromBody(body.breakMinutes),
      employeeId: body.employeeId || undefined,
      locationId: body.locationId || undefined,
      team: body.team,
      note: body.note,
    });

    return Response.json({ shift }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
