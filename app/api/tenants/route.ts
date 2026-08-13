import { auth } from "@/lib/auth";
import { createTenantForOwner, getTenantsForUser } from "@/lib/tenants";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

async function getSession(request: Request) {
  return auth.api.getSession({
    headers: request.headers,
  });
}

export async function GET(request: Request) {
  const session = await getSession(request);
  const userId = session?.user?.id;

  if (!userId) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const memberships = await getTenantsForUser(userId);

  return Response.json({
    tenants: memberships.map((membership) => ({
      id: membership.tenant.id,
      slug: membership.tenant.slug,
      name: membership.tenant.name,
      industry: membership.tenant.industry,
      primaryColor: membership.tenant.primaryColor,
      logoUrl: membership.tenant.logoUrl,
      role: membership.role,
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSession(request);
  const userId = session?.user?.id;

  if (!userId) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  // Legt Mandanten an – eng begrenzen.
  const limit = await checkRateLimit({
    key: `tenant-create:${userId}`,
    limit: 10,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    slug?: string;
    country?: string;
    timezone?: string;
    size?: string;
    industry?: string;
    contactEmail?: string;
    logoUrl?: string;
    primaryColor?: string;
    plan?: string;
    billingCycle?: string;
    invitations?: Array<{
      email?: string;
      role?: string;
    }>;
  } | null;
  const name = body?.name?.trim();

  if (!name) {
    return Response.json(
      { error: "Unternehmensname ist erforderlich." },
      { status: 400 },
    );
  }

  try {
    const tenant = await createTenantForOwner({
      name,
      userId,
      slug: body?.slug,
      country: body?.country,
      timezone: body?.timezone,
      size: body?.size,
      industry: body?.industry,
      contactEmail: body?.contactEmail,
      logoUrl: body?.logoUrl,
      primaryColor: body?.primaryColor,
      plan: body?.plan,
      billingCycle: body?.billingCycle,
      invitations: body?.invitations,
    });

    return Response.json(
      {
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          country: tenant.country,
          timezone: tenant.timezone,
          size: tenant.size,
          industry: tenant.industry,
          contactEmail: tenant.contactEmail,
          logoUrl: tenant.logoUrl,
          primaryColor: tenant.primaryColor,
          plan: tenant.plan,
          billingCycle: tenant.billingCycle,
          role: "OWNER",
          invitationCount: tenant.invitations.length,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "TENANT_SLUG_TAKEN") {
      return Response.json(
        { error: "Diese Arbeitsbereich-URL ist bereits vergeben." },
        { status: 409 },
      );
    }

    throw error;
  }
}
