import { auth } from "@/lib/auth";
import { createTenantRole, getRolesForTenant } from "@/lib/role-service";
import { parseRolePermissions } from "@/lib/api/role-input";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Rollenliste — erfordert `roles:admin` (nicht nur `read`), s. Doku. */
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
    key: `tenant-roles:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const roles = await getRolesForTenant(tenant);

    return Response.json({ roles: roles ?? [] });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Neue Rolle anlegen. Siehe `GET /api/permission-config` für die gültigen Bereiche/Level/Scopes. */
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
    key: `tenant-roles-create:${session.user.id}`,
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
    const role = await createTenantRole({
      tenantSlug: tenant,
      name,
      description: typeof body?.description === "string" ? body.description : "",
      ...parseRolePermissions(body ?? {}),
    });

    return Response.json({ role }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
