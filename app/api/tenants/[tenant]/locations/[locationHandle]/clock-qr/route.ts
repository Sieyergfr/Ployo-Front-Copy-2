import { auth } from "@/lib/auth";
import { getLocationClockQr, regenerateLocationClockQr } from "@/lib/location-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { headers } from "next/headers";

/**
 * Stempel-QR-Code eines Standorts für die App ("Standorte · Stempel-QR").
 * Gleiche Rechteprüfung wie die Druckseite im Dashboard
 * (`getLocationClockQr` → `requireLocationManager` + Standort-Scope).
 * Antwort: `{ clockQr: LocationClockQr }`; `payload` ist `null`, solange noch
 * kein Code erzeugt wurde.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenant: string; locationHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, locationHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-location-clock-qr:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const clockQr = await getLocationClockQr(tenant, locationHandle);

    if (!clockQr) {
      return Response.json({ error: "Standort nicht gefunden." }, { status: 404 });
    }

    return Response.json({ clockQr });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/**
 * Erzeugt bzw. erneuert den Code — ein bereits ausgehängter Ausdruck wird
 * damit ungültig (Gegenstück zu `regenerateLocationClockQrAction`).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ tenant: string; locationHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, locationHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-location-clock-qr-renew:${session.user.id}`,
    limit: 10,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const current = await getLocationClockQr(tenant, locationHandle);

    if (!current) {
      return Response.json({ error: "Standort nicht gefunden." }, { status: 404 });
    }

    await regenerateLocationClockQr({ tenantSlug: tenant, locationId: current.locationId });
    const clockQr = await getLocationClockQr(tenant, current.locationId);

    return Response.json({ clockQr });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
