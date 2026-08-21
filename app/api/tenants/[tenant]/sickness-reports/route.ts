import { auth } from "@/lib/auth";
import { createTenantSicknessReport, getSicknessForTenant } from "@/lib/sickness";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Krankheits-Dashboard (Admin/Manager-Sicht): Metriken, aktuell Kranke, Verlauf (6 Monate). */
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
    key: `tenant-sickness-reports:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const dashboard = await getSicknessForTenant(tenant);

    return Response.json(dashboard);
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Krankmeldung im Namen eines Mitarbeiters erfassen. `employeeId` akzeptiert key oder DB-id. */
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
    key: `tenant-sickness-reports-create:${session.user.id}`,
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
    certificateStatus?: string;
    reportChannel?: string;
    note?: string;
  } | null;

  if (!body?.employeeId || !body.startDate) {
    return Response.json(
      { error: "'employeeId' und 'startDate' sind erforderlich." },
      { status: 400 },
    );
  }

  try {
    const report = await createTenantSicknessReport({
      tenantSlug: tenant,
      employeeId: body.employeeId,
      startDate: body.startDate,
      endDate: body.endDate,
      certificateStatus: body.certificateStatus,
      reportChannel: body.reportChannel,
      note: body.note,
    });

    return Response.json({ report }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
