import { auth } from "@/lib/auth";
import { addTenantTeamMember, getTeamForTenant } from "@/lib/team-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Mitarbeiter (per DB-`dbId`, s. `GET .../assignable-employees`) als Teammitglied hinzufügen. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string; teamHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, teamHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-team-members-add:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    employeeId?: string;
    role?: string;
  } | null;

  if (!body?.employeeId) {
    return Response.json({ error: "'employeeId' ist erforderlich." }, { status: 400 });
  }

  try {
    const team = await getTeamForTenant(tenant, teamHandle);

    if (!team?.dbId) {
      return Response.json({ error: "Team nicht gefunden." }, { status: 404 });
    }

    await addTenantTeamMember({
      tenantSlug: tenant,
      teamId: team.dbId,
      employeeId: body.employeeId,
      role: body.role ?? "",
    });

    return Response.json({ status: true }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
