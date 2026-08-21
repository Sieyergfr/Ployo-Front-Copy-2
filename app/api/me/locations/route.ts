import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireTenantMembership } from "@/lib/tenant-access";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { getDefaultOpeningHours } from "@/lib/shift-service";
import { parseOpeningHoursDays, resolveEffectiveOpeningHours } from "@/lib/opening-hours";
import { headers } from "next/headers";

/**
 * Standort-Farben + Öffnungszeiten für die App (Schichtplan-Akzentfarben,
 * "geschlossen"-Kennzeichnung bei der Standortauswahl). Bewusst nur
 * `requireTenantMembership`, keine `locations`-Bereichsprüfung — ein
 * normaler Mitarbeiter hat dort i. d. R. "none" und würde sonst gar keine
 * Farben sehen, obwohl Name/Farbe/Öffnungszeiten des eigenen Standorts
 * ohnehin über die eigenen Schichten sichtbar sind (nichts
 * Schutzbedürftiges). Deshalb bewusst nur dieses schlanke Set statt des
 * vollen `TenantLocation`-Modells (Adresse, Auslastung, Leitungskontakt
 * bleiben admin-only).
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
    key: `me-locations:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const access = await requireTenantMembership(tenant);

    const [locationRecords, tenantDefaultOpeningHours] = await Promise.all([
      prisma.tenantLocation.findMany({
        where: { tenantId: access.tenantId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          key: true,
          name: true,
          kind: true,
          status: true,
          // Rohe Tailwind-Klasse (z. B. "bg-[#C9622A]" oder "bg-ink") — bewusst
          // nicht serverseitig zu Hex aufgelöst, die App kennt beide Formen
          // und die semantischen Tokens.
          accentClassName: true,
          openingHoursJson: true,
        },
      }),
      getDefaultOpeningHours(tenant),
    ]);

    const locations = locationRecords.map((location) => ({
      id: location.id,
      key: location.key,
      name: location.name,
      kind: location.kind,
      status: location.status,
      accentClassName: location.accentClassName,
      openingHours: resolveEffectiveOpeningHours(
        parseOpeningHoursDays(location.openingHoursJson),
        tenantDefaultOpeningHours,
      ),
    }));

    return Response.json({ locations });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
