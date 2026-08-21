import { auth } from "@/lib/auth";
import { getInfoRequestsForTenant } from "@/lib/employee-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Info-Anfragen an Mitarbeiter inkl. Status (Admin/Manager-Sicht, own/team/all-Scope je nach Rolle). */
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
    key: `tenant-info-requests:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const infoRequests = await getInfoRequestsForTenant(tenant);

    return Response.json({ infoRequests });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
