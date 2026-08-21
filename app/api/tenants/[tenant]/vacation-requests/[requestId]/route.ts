import { auth } from "@/lib/auth";
import { deleteTenantVacationRequest, updateTenantVacationRequest } from "@/lib/vacation-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Datum/Notiz eines Antrags korrigieren — ändert NICHT den Status (dafür: /approve, /reject). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string; requestId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, requestId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-vacation-request-update:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    startDate?: string;
    endDate?: string;
    note?: string;
  } | null;

  if (!body?.startDate || !body.endDate) {
    return Response.json({ error: "'startDate' und 'endDate' sind erforderlich." }, { status: 400 });
  }

  try {
    await updateTenantVacationRequest({
      tenantSlug: tenant,
      requestId,
      startDate: body.startDate,
      endDate: body.endDate,
      note: body.note ?? "",
    });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenant: string; requestId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, requestId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-vacation-request-delete:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    await deleteTenantVacationRequest({ tenantSlug: tenant, requestId });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
