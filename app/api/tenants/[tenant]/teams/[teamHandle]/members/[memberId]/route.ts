import { auth } from "@/lib/auth";
import {
  getTeamForTenant,
  removeTenantTeamMember,
  updateTenantTeamMember,
} from "@/lib/team-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Rolle/Leitungsstatus eines Teammitglieds ändern. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string; teamHandle: string; memberId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, teamHandle, memberId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-team-member-update:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    role?: string;
    isLead?: boolean;
  } | null;

  if (typeof body?.role !== "string") {
    return Response.json({ error: "'role' ist erforderlich." }, { status: 400 });
  }

  try {
    const team = await getTeamForTenant(tenant, teamHandle);

    if (!team?.dbId) {
      return Response.json({ error: "Team nicht gefunden." }, { status: 404 });
    }

    await updateTenantTeamMember({
      tenantSlug: tenant,
      teamId: team.dbId,
      memberId,
      role: body.role,
      isLead: Boolean(body.isLead),
    });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Teammitglied entfernen (Team-Leitung kann nicht entfernt werden — zuerst neue Leitung setzen). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenant: string; teamHandle: string; memberId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, teamHandle, memberId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-team-member-remove:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const team = await getTeamForTenant(tenant, teamHandle);

    if (!team?.dbId) {
      return Response.json({ error: "Team nicht gefunden." }, { status: 404 });
    }

    await removeTenantTeamMember({ tenantSlug: tenant, teamId: team.dbId, memberId });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
