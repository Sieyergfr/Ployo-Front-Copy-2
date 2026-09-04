import { auth } from "@/lib/auth";
import { getMyPayrollStatements } from "@/lib/self-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Eigene Gehaltsabrechnungen für den Tab "Gehaltsabrechnungen" in der
 * Personalakte der Mitarbeiter-App. Heruntergeladen wird anschließend über
 * `GET /api/me/documents/[fileId]/download` — derselbe, auf die eigene Akte
 * begrenzte Weg wie bei jedem anderen eigenen Dokument.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const tenant = new URL(request.url).searchParams.get("tenant")?.trim();

  if (!tenant) {
    return Response.json({ error: "Parameter 'tenant' fehlt." }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `me-payroll-statements:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const statements = await getMyPayrollStatements(tenant);

    return Response.json({ statements });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
