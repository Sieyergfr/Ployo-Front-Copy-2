import { auth } from "@/lib/auth";
import { updateTenantProfile } from "@/lib/settings-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

// Gleiche Grenze wie bei der Mandanten-Anlage (app/api/tenants/route.ts) —
// der Name landet ungekürzt in Einladungs-E-Mails (Betreff + Titel).
const MAX_TENANT_NAME_LENGTH = 120;

/** Firmenprofil (Name, Arbeitsbereich-URL, Branding, Plan-Anzeige). `slug` ändert die Tenant-URL. */
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
    key: `tenant-settings-profile:${session.user.id}`,
    limit: 30,
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
  } | null;

  const name = body?.name?.trim();
  const slug = body?.slug?.trim();

  if (!name || !slug || name.length > MAX_TENANT_NAME_LENGTH) {
    return Response.json(
      { error: `'name' und 'slug' sind erforderlich (Name maximal ${MAX_TENANT_NAME_LENGTH} Zeichen).` },
      { status: 400 },
    );
  }

  try {
    const tenantRecord = await updateTenantProfile({ tenantSlug: tenant, ...body, name, slug });

    return Response.json({ tenant: tenantRecord });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
