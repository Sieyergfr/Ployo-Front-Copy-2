import { auth } from "@/lib/auth";
import { getMyPersonalakteExport } from "@/lib/self-service";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { subscriptionRequiredResponse } from "@/lib/api/self-service-errors";

export const runtime = "nodejs";

/**
 * Vollständiger Export der eigenen Personalakte für den angegebenen
 * Mandanten (Art. 15 / Art. 20 DSGVO) — Pendant zu `/api/me/export`, das nur
 * Konto-/Mitgliedschaftsdaten liefert, nicht die Personalakte selbst.
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

  // Der Export ist teuer (entschlüsselt mehrere Felder); wenige Aufrufe pro
  // Stunde genügen, analog zu /api/me/export.
  const limit = await checkRateLimit({
    key: `me-personalakte-export:${session.user.id}`,
    limit: 5,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  try {
    const data = await getMyPersonalakteExport(tenant);

    const payload = {
      exportedAt: new Date().toISOString(),
      tenant,
      ...data,
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="ployo-personalakte-export.json"',
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "FORBIDDEN" || error.message === "TWO_FACTOR_REQUIRED")
    ) {
      return Response.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof Error && error.message === "SUBSCRIPTION_REQUIRED") {
      return subscriptionRequiredResponse();
    }

    throw error;
  }
}
