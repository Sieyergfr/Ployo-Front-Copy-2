import { auth } from "@/lib/auth";
import { createTenantVacationRequest, getVacationRequestsForTenant } from "@/lib/vacation-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Urlaubsanträge (Admin/Manager-Sicht, own/team/all-Scope je nach Rolle). */
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
    key: `tenant-vacation-requests:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const requests = await getVacationRequestsForTenant(tenant);

    return Response.json({ requests: requests ?? [] });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Urlaubsantrag im Namen eines Mitarbeiters anlegen (z. B. telefonisch gemeldeter Urlaub). */
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
    key: `tenant-vacation-requests-create:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    employeeId?: string;
    startDate?: string;
    endDate?: string;
    note?: string;
  } | null;

  if (!body?.employeeId || !body.startDate || !body.endDate) {
    return Response.json(
      { error: "'employeeId', 'startDate' und 'endDate' sind erforderlich." },
      { status: 400 },
    );
  }

  try {
    const vacationRequest = await createTenantVacationRequest({
      tenantSlug: tenant,
      employeeId: body.employeeId,
      startDate: body.startDate,
      endDate: body.endDate,
      note: body.note ?? "",
    });

    return Response.json({ request: vacationRequest }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
