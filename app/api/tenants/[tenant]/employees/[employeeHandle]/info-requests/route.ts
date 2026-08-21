import { auth } from "@/lib/auth";
import { createEmployeeInfoRequest, getEmployeeForTenant } from "@/lib/employee-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Informationsanfrage an einen Mitarbeiter stellen (z. B. "bitte Adresse aktualisieren"). */
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
    key: `tenant-employee-info-request:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    message?: string;
    dueAt?: string;
    fileRequested?: boolean;
  } | null;

  if (!body?.title?.trim()) {
    return Response.json(
      { error: "Bitte angeben, welche Information benötigt wird." },
      { status: 400 },
    );
  }

  try {
    const employee = await getEmployeeForTenant(tenant, employeeHandle);

    if (!employee?.dbId) {
      return Response.json({ error: "Mitarbeiter nicht gefunden." }, { status: 404 });
    }

    const infoRequest = await createEmployeeInfoRequest({
      tenantSlug: tenant,
      employeeId: employee.dbId,
      title: body.title,
      message: body.message,
      dueAt: body.dueAt,
      fileRequested: Boolean(body.fileRequested),
    });

    return Response.json({ infoRequest }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
