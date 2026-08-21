import { auth } from "@/lib/auth";
import { getEmployeeForTenant } from "@/lib/employee-service";
import { createTenantInvitation } from "@/lib/settings-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Einladung an die hinterlegte E-Mail-Adresse einer Personalakte verschicken (Rolle immer EMPLOYEE). */
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
    key: `tenant-employee-invite:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const employee = await getEmployeeForTenant(tenant, employeeHandle);

    if (!employee) {
      return Response.json({ error: "Mitarbeiter nicht gefunden." }, { status: 404 });
    }

    if (!employee.email) {
      return Response.json(
        { error: "Für diese Personalakte ist keine E-Mail-Adresse hinterlegt." },
        { status: 400 },
      );
    }

    const invitation = await createTenantInvitation({
      tenantSlug: tenant,
      email: employee.email,
      role: "EMPLOYEE",
      source: "Personalakte",
    });

    return Response.json({ invitation }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
