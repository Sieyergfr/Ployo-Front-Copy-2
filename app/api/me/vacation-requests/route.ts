import { auth } from "@/lib/auth";
import { createMyVacationRequest } from "@/lib/vacation-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Quick Action "Urlaub beantragen". */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-vacation-request:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    tenant?: string;
    startDate?: string;
    endDate?: string;
    note?: string;
  } | null;

  if (!body?.tenant || !body.startDate || !body.endDate) {
    return Response.json(
      { error: "'tenant', 'startDate' und 'endDate' sind erforderlich." },
      { status: 400 },
    );
  }

  try {
    const vacationRequest = await createMyVacationRequest({
      tenantSlug: body.tenant,
      startDate: body.startDate,
      endDate: body.endDate,
      note: body.note?.trim() ?? "",
    });

    return Response.json({ request: vacationRequest }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
