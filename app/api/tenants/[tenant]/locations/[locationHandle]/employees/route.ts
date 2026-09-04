import { auth } from "@/lib/auth";
import {
  addEmployeesToTenantLocation,
  getLocationForTenant,
  removeEmployeesFromTenantLocation,
} from "@/lib/location-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Mitarbeiter (per DB-`dbId`) diesem Standort zuordnen. Body: `{ employeeIds: string[] }`. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string; locationHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, locationHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-location-employees:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as { employeeIds?: string[] } | null;
  const employeeIds = Array.isArray(body?.employeeIds)
    ? body.employeeIds.filter((value): value is string => typeof value === "string")
    : [];

  if (employeeIds.length === 0) {
    return Response.json({ error: "Keine Mitarbeiter ausgewählt." }, { status: 400 });
  }

  try {
    const current = await getLocationForTenant(tenant, locationHandle);

    if (!current?.dbId) {
      return Response.json({ error: "Standort nicht gefunden." }, { status: 404 });
    }

    const location = await addEmployeesToTenantLocation({
      tenantSlug: tenant,
      locationId: current.dbId,
      employeeIds,
    });

    return Response.json({ location });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/**
 * Mitarbeiter (per DB-`dbId`) von diesem Standort entfernen. Body:
 * `{ employeeIds: string[] }` — Gegenstück zu `POST`, für die App-seitige
 * Multiselect-Zuweisung ("MA zuweisen" zeigt bereits zugewiesene Mitarbeiter
 * vorausgewählt an; ein Abwählen ruft diese Route auf).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenant: string; locationHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, locationHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-location-employees:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as { employeeIds?: string[] } | null;
  const employeeIds = Array.isArray(body?.employeeIds)
    ? body.employeeIds.filter((value): value is string => typeof value === "string")
    : [];

  if (employeeIds.length === 0) {
    return Response.json({ error: "Keine Mitarbeiter ausgewählt." }, { status: 400 });
  }

  try {
    const current = await getLocationForTenant(tenant, locationHandle);

    if (!current?.dbId) {
      return Response.json({ error: "Standort nicht gefunden." }, { status: 404 });
    }

    const location = await removeEmployeesFromTenantLocation({
      tenantSlug: tenant,
      locationId: current.dbId,
      employeeIds,
    });

    return Response.json({ location });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
