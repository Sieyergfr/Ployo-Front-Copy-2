import { auth } from "@/lib/auth";
import { deleteEmployeeInfoRequest, updateInfoRequestStatus } from "@/lib/employee-service";
import { infoRequestStatuses } from "@/lib/employees";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Status einer Info-Anfrage manuell setzen — z. B. stornieren oder eine offline erhaltene Antwort nachtragen. */
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
    key: `tenant-info-request-update:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as { status?: string } | null;

  if (!body?.status || !infoRequestStatuses.includes(body.status as (typeof infoRequestStatuses)[number])) {
    return Response.json(
      { error: `'status' muss einer von ${infoRequestStatuses.join(", ")} sein.` },
      { status: 400 },
    );
  }

  try {
    const infoRequest = await updateInfoRequestStatus({
      tenantSlug: tenant,
      requestId,
      status: body.status as (typeof infoRequestStatuses)[number],
    });

    return Response.json({ infoRequest });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Info-Anfrage endgültig löschen (die verknüpfte Antwortdatei bleibt in der Personalakte erhalten). */
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
    key: `tenant-info-request-delete:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    await deleteEmployeeInfoRequest({ tenantSlug: tenant, requestId });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
