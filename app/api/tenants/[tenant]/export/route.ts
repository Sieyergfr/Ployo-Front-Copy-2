import { auth } from "@/lib/auth";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { buildTenantExport } from "@/lib/tenant-export";
import { headers } from "next/headers";

export const runtime = "nodejs";

/**
 * Vollständiger Mandanten-Datenexport (AGB §6). Nur für Mitglieder mit
 * Schreibrecht auf "settings" (OWNER/ADMIN oder explizite Rolle) — geprüft
 * in buildTenantExport()/requireSettingsManager().
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return Response.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { tenant } = await params;

  // Der Export ist teuer; wenige Aufrufe pro Stunde genügen.
  const limit = await checkRateLimit({
    key: `tenant-export:${session.user.id}`,
    limit: 5,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return tooManyRequests(limit);
  }

  let payload: Awaited<ReturnType<typeof buildTenantExport>>;

  try {
    payload = await buildTenantExport(tenant);
  } catch (error) {
    // Nur bekannte, kontrollierte Fehlertexte an den Client durchreichen —
    // gleiches Muster wie app/api/me/*/route.ts. Alles andere (z. B. eine
    // unerwartete DB-Ausnahme) würde sonst Interna leaken; stattdessen
    // weiterwerfen und Next die generische 500-Antwort erzeugen lassen.
    if (
      error instanceof Error &&
      (error.message === "Nicht angemeldet." ||
        error.message === "UNAUTHORIZED" ||
        error.message === "FORBIDDEN" ||
        error.message === "TWO_FACTOR_REQUIRED")
    ) {
      const status =
        error.message === "Nicht angemeldet." || error.message === "UNAUTHORIZED" ? 401 : 403;

      return Response.json({ error: error.message }, { status });
    }

    throw error;
  }

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="ployo-export-${tenant}.json"`,
    },
  });
}
