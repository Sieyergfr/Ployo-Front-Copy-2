import { logger, runWithRequestId } from "@/lib/logger";
import { runTimeTrackingJobs } from "@/lib/time-tracking-service";

export const runtime = "nodejs";

/**
 * Zeiterfassung: Push-Erinnerung zum Ein-/Ausstempeln (5 Min. nach
 * Schichtbeginn/-ende) und automatisches Ausstempeln vergessener Einträge.
 * Per externem Scheduler ALLE 5 MINUTEN aufrufen:
 * GET /api/cron/time-tracking mit Authorization: Bearer <CRON_SECRET>.
 * Idempotent — ein doppelter oder verspäteter Aufruf verschickt nichts doppelt.
 */
export async function GET(request: Request) {
  return runWithRequestId((requestId) => handleTimeTracking(request, requestId));
}

async function handleTimeTracking(request: Request, requestId: string) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    logger.error("CRON_SECRET ist nicht konfiguriert.");
    return Response.json(
      { error: "CRON_SECRET ist nicht konfiguriert." },
      { status: 503, headers: { "x-request-id": requestId } },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    logger.warn("Cron time-tracking: nicht autorisierter Aufruf.");
    return Response.json(
      { error: "Nicht autorisiert." },
      { status: 401, headers: { "x-request-id": requestId } },
    );
  }

  const result = await runTimeTrackingJobs();

  logger.info("Cron time-tracking abgeschlossen.", result);

  return Response.json({ status: "ok", ...result }, { headers: { "x-request-id": requestId } });
}
