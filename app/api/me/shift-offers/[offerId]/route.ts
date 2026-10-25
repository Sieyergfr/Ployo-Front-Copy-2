import { auth } from "@/lib/auth";
import { mapSelfServiceError } from "@/lib/api/self-service-errors";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { respondToMyShiftOffer } from "@/lib/shift-offer-service";
import { headers } from "next/headers";

/** Angebotene Schicht annehmen (`decision: "accept"`) oder ablehnen (`"decline"`). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const limit = await checkRateLimit({
    key: `me-shift-offers-respond:${session.user.id}`,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => null)) as {
    tenant?: string;
    decision?: string;
  } | null;

  if (!body?.tenant || (body.decision !== "accept" && body.decision !== "decline")) {
    return Response.json(
      { error: "'tenant' und 'decision' (accept|decline) sind erforderlich." },
      { status: 400 },
    );
  }

  try {
    const { offerId } = await params;
    const result = await respondToMyShiftOffer({
      tenantSlug: body.tenant,
      offerId,
      decision: body.decision,
    });

    return Response.json(result);
  } catch (error) {
    return mapSelfServiceError(error);
  }
}
