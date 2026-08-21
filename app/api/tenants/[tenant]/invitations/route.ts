import { auth } from "@/lib/auth";
import { createTenantInvitation, getTenantSettings } from "@/lib/settings-service";
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
    key: `tenant-invitations:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const data = await getTenantSettings(tenant);

    if (!data) {
      return Response.json({ error: "Mandant nicht gefunden." }, { status: 404 });
    }

    return Response.json({ invitations: data.tenant.invitations });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Einladung verschicken. `role`: nur `"ADMIN"`/`"HR"` werden übernommen, alles andere wird zu `"EMPLOYEE"`. */
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
    key: `tenant-invitations-create:${session.user.id}`,
    limit: 20,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as { email?: string; role?: string } | null;

  if (!body?.email?.trim()) {
    return Response.json({ error: "'email' ist erforderlich." }, { status: 400 });
  }

  try {
    const invitation = await createTenantInvitation({
      tenantSlug: tenant,
      email: body.email,
      role: body.role ?? "EMPLOYEE",
      source: "API",
    });

    return Response.json({ invitation }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
