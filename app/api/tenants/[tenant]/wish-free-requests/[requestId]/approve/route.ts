import { auth } from "@/lib/auth";
import { setTenantWishFreeRequestStatus } from "@/lib/wish-free-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string; requestId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, requestId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-wish-free-decide:${session.user.id}`,
    limit: 60,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    await setTenantWishFreeRequestStatus({ tenantSlug: tenant, requestId, status: "approved" });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
