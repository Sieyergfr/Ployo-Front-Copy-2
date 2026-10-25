import { auth } from "@/lib/auth";
import {
  deleteTenantLocation,
  getLocationForTenant,
  toLocationAdminPayload,
  updateTenantLocation,
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
  { params }: { params: Promise<{ tenant: string; locationHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, locationHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-location:${session.user.id}`,
    limit: 60,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const location = await getLocationForTenant(tenant, locationHandle);

    if (!location) {
      return Response.json({ error: "Standort nicht gefunden." }, { status: 404 });
    }

    return Response.json({ location: toLocationAdminPayload(location) });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

/**
 * Partial-Update: `updateTenantLocation` selbst erwartet immer den
 * vollständigen Datensatz (u. a. die Standort-Kennzahlen als Strings) —
 * hier werden nicht mitgeschickte Felder mit dem aktuellen Stand aufgefüllt,
 * damit die Route wie ein echtes PATCH funktioniert, ohne die
 * Service-Funktion zu ändern.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenant: string; locationHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, locationHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-location-update:${session.user.id}`,
    limit: 60,
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
    employeeCount?: number;
    activeToday?: number;
    shiftCount?: number;
    openPositions?: number;
    utilization?: string;
    utilizationCaption?: string;
    /** Leitung wird aus dem Mitarbeiterprofil übernommen; leer = Leitung entfernen. */
    leadEmployeeId?: string;
    leadName?: string;
    leadInitials?: string;
    leadPhone?: string;
    leadEmail?: string;
    /** Kontakt-E-Mail des Standorts; fehlt das Feld, bleibt sie unverändert. */
    contactEmail?: string;
    accentClassName?: string;
    /** Leer = Standard des Unternehmens verwenden. `undefined` (Feld fehlt) = unverändert lassen. */
    openingHours?: unknown[];
    /** `null` = Unternehmensvorgabe gilt. `undefined` (Feld fehlt) = unverändert lassen. */
    shiftMinStaffing?: number | null;
  } | null;

  if (!body) {
    return Response.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  try {
    const current = await getLocationForTenant(tenant, locationHandle);

    if (!current?.dbId) {
      return Response.json({ error: "Standort nicht gefunden." }, { status: 404 });
    }

    const updated = await updateTenantLocation({
      tenantSlug: tenant,
      locationId: current.dbId,
      name: body.name ?? current.name,
      kind: body.kind ?? current.kind,
      status: body.status ?? current.status,
      address: {
        street: body.address?.street ?? current.addressFields?.street ?? "",
        houseNumber: body.address?.houseNumber ?? current.addressFields?.houseNumber ?? "",
        postalCode: body.address?.postalCode ?? current.addressFields?.postalCode ?? "",
        city: body.address?.city ?? current.addressFields?.city ?? "",
        careOf: body.address?.careOf ?? current.addressFields?.careOf ?? "",
        country: body.address?.country ?? current.addressFields?.country ?? "DE",
      },
      employeeCount: String(body.employeeCount ?? current.employeeCount),
      activeToday: String(body.activeToday ?? current.activeToday),
      shiftCount: String(body.shiftCount ?? current.shiftCount),
      openPositions: String(body.openPositions ?? current.openPositions),
      utilization: body.utilization ?? current.utilization,
      utilizationCaption: body.utilizationCaption ?? current.utilizationCaption,
      // `leadEmployeeId` fehlt (undefined) = unverändert lassen (alte
      // Freitextfelder erneut mitgeben); "" = Leitung bewusst entfernen.
      ...(body.leadEmployeeId !== undefined
        ? { leadEmployeeId: body.leadEmployeeId }
        : {
            leadName: body.leadName ?? current.lead.name,
            leadInitials: body.leadInitials ?? current.lead.initials,
            leadPhone: body.leadPhone ?? current.lead.phone,
            leadEmail: body.leadEmail ?? current.lead.email,
          }),
      ...(typeof body.contactEmail === "string" ? { contactEmail: body.contactEmail } : {}),
      accentClassName: body.accentClassName ?? current.accentClassName,
      // Bewusst nicht wie die Felder oben mit `current` auffüllen: `current.openingHours`
      // ist bereits der aufgelöste Wert (ggf. der Mandanten-Standard). Ohne
      // diese Ausnahme würde jedes Speichern eines Standorts, der bisher den
      // Standard nutzt, diesen Standard fälschlich als eigene Öffnungszeiten
      // festschreiben.
      ...(body.openingHours !== undefined
        ? { openingHours: parseOpeningHoursDays(body.openingHours) }
        : {}),
      // Gleiche Ausnahme wie bei den Öffnungszeiten: `current.effectiveMinStaffing`
      // ist bereits der aufgelöste Wert und würde die Unternehmensvorgabe beim
      // Speichern als eigenen Wert des Standorts festschreiben.
      ...(body.shiftMinStaffing !== undefined
        ? { shiftMinStaffing: body.shiftMinStaffing }
        : {}),
    });
    // Ein geänderter Name berechnet einen neuen Key — mit der ursprünglichen
    // Route-URL (locationHandle) neu laden würde dann ins Leere laufen.
    const refreshed = await getLocationForTenant(tenant, updated.key);

    return Response.json({ location: refreshed ? toLocationAdminPayload(refreshed) : null });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tenant: string; locationHandle: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant, locationHandle } = await params;

  const limit = await checkRateLimit({
    key: `tenant-location-delete:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const current = await getLocationForTenant(tenant, locationHandle);

    if (!current?.dbId) {
      return Response.json({ error: "Standort nicht gefunden." }, { status: 404 });
    }

    await deleteTenantLocation({ tenantSlug: tenant, locationId: current.dbId });

    return Response.json({ status: true });
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
