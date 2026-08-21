import { auth } from "@/lib/auth";
import { deleteTenantRole, getRoleForTenant, updateTenantRole } from "@/lib/role-service";
import { parseRolePermissions } from "@/lib/api/role-input";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; roleId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, roleId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-role:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const role = await getRoleForTenant(tenant, roleId);

    if (!role) {
      return Response.json({ error: "ROLE_NOT_FOUND" }, { status: 404 });
    }

    return Response.json({ role });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Rolle bearbeiten — voller Ersatz der Berechtigungsmatrix, nicht mitgeschickte Bereiche fallen auf none/all/false zurück. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string; roleId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, roleId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-role-update:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return Response.json({ error: "Rollenname ist erforderlich." }, { status: 400 });
  }

  try {
    await updateTenantRole({
      tenantSlug: tenant,
      roleId,
      name,
      description: typeof body?.description === "string" ? body.description : "",
      ...parseRolePermissions(body ?? {}),
    });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Rolle löschen — schlägt fehl bei System-Rollen (`SYSTEM_ROLE`) oder noch zugewiesenen Mitgliedern (`ROLE_IN_USE`). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenant: string; roleId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, roleId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-role-delete:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    await deleteTenantRole({ tenantSlug: tenant, roleId });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
