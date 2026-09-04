import { auth } from "@/lib/auth";
import { deleteEmployeeAccess, getEmployeeForTenant } from "@/lib/employee-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Löscht den Konto-Zugang (Login) der mit dieser Personalakte verknüpften
 * Person — NICHT die Personalakte selbst (Stammdaten bleiben erhalten, s.
 * lib/employee-service.ts deleteEmployeeAccess). Für ein vollständiges
 * Löschen der Personalakte siehe DELETE auf `[employeeHandle]/route.ts`.
 */
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
    key: `tenant-employee-access-delete:${session.user.id}`,
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

    await deleteEmployeeAccess({ tenantSlug: tenant, employeeId: employee.dbId });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
