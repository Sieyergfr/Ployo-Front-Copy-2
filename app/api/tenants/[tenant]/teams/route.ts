import { auth } from "@/lib/auth";
import {
  createTenantTeam,
  getTeamForTenant,
  getTeamsForTenant,
  toTeamAdminPayload,
} from "@/lib/team-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

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
    key: `tenant-teams:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const teams = await getTeamsForTenant(tenant);

    return Response.json({ teams: teams.map(toTeamAdminPayload) });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Neues Team anlegen. */
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
    key: `tenant-teams-create:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    description?: string;
    locations?: string[];
    colorClassName?: string;
    leadEmployeeId?: string;
  } | null;

  if (!body?.name?.trim()) {
    return Response.json({ error: "Teamname ist erforderlich." }, { status: 400 });
  }

  try {
    const team = await createTenantTeam({
      tenantSlug: tenant,
      name: body.name,
      description: body.description ?? "",
      locations: Array.isArray(body.locations)
        ? body.locations.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [],
      colorClassName: body.colorClassName || "bg-[#C9622A]",
      leadEmployeeId: body.leadEmployeeId || undefined,
    });
    // `createTenantTeam` liefert den rohen Prisma-Datensatz ohne Relationen
    // (members/lead/Dateien) zurück – für die Admin-Payload brauchen wir den
    // vollständig aufgelösten `Team`-Typ, den nur `getTeamForTenant` liefert.
    const created = await getTeamForTenant(tenant, team.key);

    return Response.json(
      { team: created ? toTeamAdminPayload(created) : null },
      { status: 201 },
    );
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
