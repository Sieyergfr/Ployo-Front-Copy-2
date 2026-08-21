import { auth } from "@/lib/auth";
import {
  createTenantLocation,
  getLocationForTenant,
  getLocationsForTenant,
  toLocationAdminPayload,
} from "@/lib/location-service";
import { parseOpeningHoursDays } from "@/lib/opening-hours";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

type AddressBody = {
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  careOf?: string;
  country?: string;
};

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
    key: `tenant-locations:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const locations = await getLocationsForTenant(tenant);

    return Response.json({ locations: locations?.map(toLocationAdminPayload) ?? [] });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/** Neuen Standort anlegen. Adresse ist Pflicht (street/houseNumber/postalCode/city). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  const limit = await checkRateLimit({
    key: `tenant-locations-create:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    kind?: string;
    status?: string;
    address?: AddressBody;
    leadEmployeeId?: string;
    email?: string;
    accentClassName?: string;
    openingHours?: unknown[];
  } | null;

  if (!body?.name?.trim()) {
    return Response.json({ error: "Name ist erforderlich." }, { status: 400 });
  }

  try {
    const location = await createTenantLocation({
      tenantSlug: tenant,
      name: body.name,
      kind: body.kind ?? "Standort",
      status: body.status ?? "active",
      address: {
        street: body.address?.street ?? "",
        houseNumber: body.address?.houseNumber ?? "",
        postalCode: body.address?.postalCode ?? "",
        city: body.address?.city ?? "",
        careOf: body.address?.careOf ?? "",
        country: body.address?.country ?? "DE",
      },
      leadEmployeeId: body.leadEmployeeId || undefined,
      email: body.email ?? "",
      accentClassName: body.accentClassName || "bg-ink",
      openingHours: body.openingHours ? parseOpeningHoursDays(body.openingHours) : undefined,
    });
    const full = await getLocationForTenant(tenant, location.key);

    return Response.json({ location: full ? toLocationAdminPayload(full) : null }, { status: 201 });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
