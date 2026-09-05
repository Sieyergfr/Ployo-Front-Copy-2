import { getPageViewSummary } from "@/lib/analytics";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Aggregierte Seitenaufrufe der letzten `days` Tage (Default 30, max. 90).
 * Kein eigenes Nutzerkonto für Betreiber-Analytics vorhanden — wiederverwendet
 * dasselbe Betreiber-Secret wie /api/cron/* (Bearer-Token), statt dafür eine
 * weitere Pflicht-Env-Variable einzuführen.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    logger.error("CRON_SECRET ist nicht konfiguriert.");
    return Response.json({ error: "CRON_SECRET ist nicht konfiguriert." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const daysParam = Number(new URL(request.url).searchParams.get("days"));
  const days = Number.isInteger(daysParam) && daysParam > 0 ? Math.min(daysParam, 90) : 30;

  const rows = await getPageViewSummary(days);

  return Response.json({ days, rows });
}
