import { auth } from "@/lib/auth";
import { createTenantEmployee, getEmployeesForTenant } from "@/lib/employee-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { pickEmployeeInput } from "@/lib/api/employee-input";
import { headers } from "next/headers";

/** Mitarbeiterliste (Admin, vollständige Personalakte-Felder, ggf. redaktiert je nach payroll-Recht). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-employees:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  // Filter kommen aus der Query, nicht aus dem Body — die Liste bleibt damit
  // ein normaler, cachebarer GET. Leere Werte werden in `getEmployeesForTenant`
  // wie "kein Filter" behandelt, ein `?search=` ohne Wert schadet also nicht.
  const { searchParams } = new URL(request.url);

  try {
    const employees = await getEmployeesForTenant(tenant, {
      search: searchParams.get("search") ?? undefined,
      location: searchParams.get("location") ?? undefined,
    });

    return Response.json({ employees: employees ?? [] });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Neue Personalakte anlegen. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-employees-create:${session.user.id}`,
    limit: 30,
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

  if (!input.firstName?.trim() && !input.lastName?.trim() && !input.email?.trim()) {
    return Response.json(
      { error: "Name oder E-Mail ist erforderlich." },
      { status: 400 },
    );
  }

  try {
    const employee = await createTenantEmployee({ tenantSlug: tenant, ...input });

    return Response.json({ employee }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
