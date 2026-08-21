import { auth } from "@/lib/auth";
import { getEmployeeForTenant, reactivateEmployee } from "@/lib/employee-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Ausscheiden rückgängig machen (siehe lib/employee-service.ts reactivateEmployee). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string; employeeHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, employeeHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-employee-reactivate:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const employee = await getEmployeeForTenant(tenant, employeeHandle);

    if (!employee?.dbId) {
      return Response.json({ error: "Mitarbeiter nicht gefunden." }, { status: 404 });
    }

    await reactivateEmployee({ tenantSlug: tenant, employeeId: employee.dbId });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
