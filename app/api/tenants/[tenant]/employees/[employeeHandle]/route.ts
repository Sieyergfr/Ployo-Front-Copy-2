import { auth } from "@/lib/auth";
import {
  deleteTenantEmployee,
  getEmployeeForTenant,
  updateTenantEmployee,
} from "@/lib/employee-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { pickEmployeeInput } from "@/lib/api/employee-input";
import { headers } from "next/headers";

/**
 * `employeeHandle` ist überall der sprechende `key` (nicht die DB-`id`) —
 * dieselbe Konvention, die die Web-Dashboard-URLs schon verwenden. Für
 * PATCH/DELETE, deren Service-Funktionen die echte DB-`id` erwarten, wird
 * hier zunächst per `getEmployeeForTenant` aufgelöst (liefert `dbId`).
 */
async function resolveEmployee(tenant: string, employeeHandle: string) {
  const employee = await getEmployeeForTenant(tenant, employeeHandle);

  if (!employee?.dbId) {
    throw new Error("Mitarbeiter nicht gefunden.");
  }

  return employee;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; employeeHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, employeeHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-employee:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const employee = await getEmployeeForTenant(tenant, employeeHandle);

    if (!employee) {
      return Response.json({ error: "Mitarbeiter nicht gefunden." }, { status: 404 });
    }

    return Response.json({ employee });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Personalakte-Felder aktualisieren (Partial-Update, nur mitgeschickte Felder ändern sich). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string; employeeHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, employeeHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-employee-update:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const rawBody = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!rawBody) {
    return Response.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const input = pickEmployeeInput(rawBody);

  try {
    const employee = await resolveEmployee(tenant, employeeHandle);

    const updated = await updateTenantEmployee({
      tenantSlug: tenant,
      employeeId: employee.dbId as string,
      ...input,
    });

    return Response.json({ employee: updated });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenant: string; employeeHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, employeeHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-employee-delete:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const employee = await resolveEmployee(tenant, employeeHandle);

    await deleteTenantEmployee({ tenantSlug: tenant, employeeId: employee.dbId as string });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
