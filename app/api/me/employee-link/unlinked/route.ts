import { auth } from "@/lib/auth";
import { getUnlinkedEmployeesForTenant } from "@/lib/employee-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Personalakten im Mandanten ohne verknüpftes Konto — Auswahl für die App,
 * die (anders als das Web-Pendant `mein-bereich/page.tsx`) keinen direkten
 * Server-Zugriff auf `getUnlinkedEmployeesForTenant` hat und daher einen
 * eigenen Endpunkt braucht, um "Bestehendes Profil verknüpfen" (statt neu
 * anlegen) anzubieten.
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
    key: `me-employee-link-unlinked:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const employees = await getUnlinkedEmployeesForTenant(tenant);

    return Response.json({
      employees: employees.map((employee) => ({
        id: employee.id,
        name: employee.name,
        location: employee.location,
        team: employee.team,
        role: employee.role,
      })),
    });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
