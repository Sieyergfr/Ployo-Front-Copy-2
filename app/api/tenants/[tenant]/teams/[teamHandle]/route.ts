import { auth } from "@/lib/auth";
import {
  deleteTenantTeam,
  getTeamForTenant,
  toTeamAdminPayload,
  updateTenantTeam,
} from "@/lib/team-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** `teamHandle` ist der `key`; PATCH/DELETE lösen intern auf die DB-`id` auf (s. Employees-Route für dieselbe Konvention). */
async function resolveTeam(tenant: string, teamHandle: string) {
  const team = await getTeamForTenant(tenant, teamHandle);

  if (!team?.dbId) {
    throw new Error("Team nicht gefunden.");
  }

  return team;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; teamHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, teamHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-team:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const team = await getTeamForTenant(tenant, teamHandle);

    if (!team) {
      return Response.json({ error: "Team nicht gefunden." }, { status: 404 });
    }

    return Response.json({ team: toTeamAdminPayload(team) });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string; teamHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, teamHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-team-update:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    locations?: string[];
    colorClassName?: string;
  } | null;

  if (!body?.name?.trim()) {
    return Response.json({ error: "Teamname ist erforderlich." }, { status: 400 });
  }

  try {
    const team = await resolveTeam(tenant, teamHandle);

    const updated = await updateTenantTeam({
      tenantSlug: tenant,
      teamId: team.dbId as string,
      name: body.name,
      locations: Array.isArray(body.locations)
        ? body.locations.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [],
      colorClassName: body.colorClassName || "bg-[#C9622A]",
    });
    // `updateTenantTeam` liefert ebenfalls nur den rohen Prisma-Datensatz –
    // vollständigen `Team`-Datensatz für die Admin-Payload nachladen.
    const refreshed = await getTeamForTenant(tenant, updated.key);

    return Response.json({ team: refreshed ? toTeamAdminPayload(refreshed) : null });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenant: string; teamHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, teamHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-team-delete:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const team = await resolveTeam(tenant, teamHandle);

    await deleteTenantTeam({ tenantSlug: tenant, teamId: team.dbId as string });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
