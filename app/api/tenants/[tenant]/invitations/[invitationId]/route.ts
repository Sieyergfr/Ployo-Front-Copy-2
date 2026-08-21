import { auth } from "@/lib/auth";
import { deleteTenantInvitation } from "@/lib/settings-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenant: string; invitationId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, invitationId } = await params;

  const limit = await checkRateLimit({
    key: `tenant-invitations-delete:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    await deleteTenantInvitation({ tenantSlug: tenant, invitationId });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
