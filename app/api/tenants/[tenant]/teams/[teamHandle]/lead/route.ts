import { auth } from "@/lib/auth";
import { getTeamForTenant, setTenantTeamLead } from "@/lib/team-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Team-Leitung setzen. Body: `{ memberId }` (Mitgliedschafts-Id, nicht Mitarbeiter-Id). */
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
    key: `tenant-team-lead:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as { memberId?: string } | null;

  if (!body?.memberId) {
    return Response.json({ error: "'memberId' ist erforderlich." }, { status: 400 });
  }

  try {
    const team = await getTeamForTenant(tenant, teamHandle);

    if (!team?.dbId) {
      return Response.json({ error: "Team nicht gefunden." }, { status: 404 });
    }

    await setTenantTeamLead({ tenantSlug: tenant, teamId: team.dbId, memberId: body.memberId });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
