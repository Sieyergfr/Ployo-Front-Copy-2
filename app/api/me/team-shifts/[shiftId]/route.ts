import { auth } from "@/lib/auth";
import { deleteTenantShift, updateTenantShift } from "@/lib/shift-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

function breakMinutesFromBody(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 30;
}

/** Bestehende Schicht ändern (voller Ersatz von Datum/Zeit/Zuordnung, wie im Web-Dashboard). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ shiftId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-team-shifts-update:${session.user.id}`,
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

  const { shiftId } = await params;

  try {
    await updateTenantShift({
      tenantSlug: body.tenant,
      shiftId,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      breakMinutes: breakMinutesFromBody(body.breakMinutes),
      employeeId: body.employeeId || undefined,
      locationId: body.locationId || undefined,
      team: body.team,
      note: body.note,
    });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Schicht löschen (nur Nutzer mit Lösch-Berechtigung auf "shifts"). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ shiftId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const tenant = new URL(request.url).searchParams.get("tenant")?.trim();

  if (!tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `me-team-shifts-delete:${session.user.id}`,
    limit: 120,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const { shiftId } = await params;

  try {
    await deleteTenantShift({ tenantSlug: tenant, shiftId });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
