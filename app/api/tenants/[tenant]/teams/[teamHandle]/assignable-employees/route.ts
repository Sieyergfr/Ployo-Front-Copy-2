import { auth } from "@/lib/auth";
import { getAssignableEmployees } from "@/lib/team-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Mitarbeiter, die diesem Team noch NICHT angehören — für den "Mitglied hinzufügen"-Dialog. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string; teamHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, teamHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-team-assignable:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const employees = await getAssignableEmployees(tenant, teamHandle);

    return Response.json({ employees });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
