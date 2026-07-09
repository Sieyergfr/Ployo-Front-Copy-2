import { auth } from "@/lib/auth";
import { isReservedTenantSlug, isTenantSlugAvailable, slugify } from "@/lib/tenants";

export const runtime = "nodejs";

async function getSession(request: Request) {
  return auth.api.getSession({
    headers: request.headers,
  });
}

export async function GET(request: Request) {
  const session = await getSession(request);

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const url = new URL(request.url);
  const slug = slugify(url.searchParams.get("slug") ?? "");

  if (!slug) {
    return Response.json({
      slug,
      available: false,
      reason: "empty",
    });
  }

  if (isReservedTenantSlug(slug)) {
    return Response.json({
      slug,
      available: false,
      reason: "reserved",
    });
  }

  const available = await isTenantSlugAvailable(slug);

  return Response.json({
    slug,
    available,
    reason: available ? null : "taken",
  });
}
