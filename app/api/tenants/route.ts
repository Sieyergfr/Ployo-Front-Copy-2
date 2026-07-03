import { auth } from "@/lib/auth";
import { createTenantForOwner, getTenantsForUser } from "@/lib/tenants";

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

  const body = (await request.json().catch(() => null)) as {
    name?: string;
  } | null;
  const name = body?.name?.trim();

  if (!name) {
    return Response.json(
      { error: "Unternehmensname ist erforderlich." },
      { status: 400 },
    );
  }

  const tenant = await createTenantForOwner({ name, userId });

  return Response.json(
    {
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        role: "OWNER",
      },
    },
    { status: 201 },
  );
}
