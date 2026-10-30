import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getShiftOfferCandidates, offerShiftToEmployees } from "@/lib/shift-offer-service";

type Context = { params: Promise<{ tenant: string; shiftId: string }> };

/** Same candidate scoring and authorization as the web planning drawer. */
export async function GET(_request: Request, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  const limit = await checkRateLimit({ key: `shift-offer-candidates:${session.user.id}`, limit: 120, windowSeconds: 60 });
  if (!limit.allowed) return tooManyRequests(limit);
  const { tenant, shiftId } = await params;
  try {
    return Response.json({ context: await getShiftOfferCandidates({ tenantSlug: tenant, shiftId }) });
  } catch (error) { return mapSelfServiceError(error); }
}

/** Offer an existing shift to selected employees; the backend keeps the first acceptance atomic. */
export async function POST(request: Request, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  const limit = await checkRateLimit({ key: `shift-offer-create:${session.user.id}`, limit: 30, windowSeconds: 3600 });
  if (!limit.allowed) return tooManyRequests(limit);
  const body = await request.json().catch(() => null) as { employeeIds?: unknown } | null;
  if (!Array.isArray(body?.employeeIds) || body.employeeIds.length === 0 || body.employeeIds.length > 200 || !body.employeeIds.every((id: unknown) => typeof id === "string" && id.trim())) {
    return Response.json({ error: "Bitte 1 bis 200 gültige Mitarbeiter auswählen." }, { status: 400 });
  }
  const { tenant, shiftId } = await params;
  try {
    return Response.json(await offerShiftToEmployees({ tenantSlug: tenant, shiftId, employeeIds: body.employeeIds.map((id: string) => id.trim()) }));
  } catch (error) { return mapSelfServiceError(error); }
}
