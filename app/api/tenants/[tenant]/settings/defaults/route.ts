import { auth } from "@/lib/auth";
import { updateTenantDefaults } from "@/lib/settings-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/** Betriebs-Defaults (Firmenadresse, Standard-Standort, Wochenbeginn, Personalnummern-Regeln). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-settings-defaults:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    companyAddress?: {
      street?: string;
      houseNumber?: string;
      postalCode?: string;
      city?: string;
      careOf?: string;
      country?: string;
    };
    taxId?: string;
    defaultLocationId?: string;
    weekStart?: string;
    workHours?: string;
    vacationDays?: string;
    employeeNumberRequired?: boolean;
    employeeNumberPrefix?: string;
    employeeNumberSuffix?: string;
    archiveFormerEmployees?: boolean;
  } | null;

  if (!body) {
    return Response.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  try {
    const settings = await updateTenantDefaults({ tenantSlug: tenant, ...body });

    return Response.json({ settings });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
