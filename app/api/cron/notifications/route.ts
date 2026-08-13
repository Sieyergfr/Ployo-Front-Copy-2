import { prisma } from "@/lib/prisma";
import { daysUntil } from "@/lib/reminders";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { isDigestDue } from "@/lib/notifications/digest-schedule";
import { logger, runWithRequestId } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Wöchentlicher E-Mail-Digest für fällige Erinnerungen/Fristen
 * ("deadlineAlerts"). Per externem Scheduler täglich aufrufen:
 * GET /api/cron/notifications mit Authorization: Bearer <CRON_SECRET>
 * — sendet nur an Mandanten, deren `digestTime` gerade erreicht ist.
 *
 * Urlaubs-/Krankmeldungen ("absenceAlerts") laufen NICHT über diesen Job,
 * sondern werden sofort ausgelöst (siehe lib/notifications/events.ts, wird
 * beim Stellen/Entscheiden eines Antrags aufgerufen).
 */
export async function GET(request: Request) {
  return runWithRequestId((requestId) => handleNotifications(request, requestId));
}

async function handleNotifications(request: Request, requestId: string) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    logger.error("CRON_SECRET ist nicht konfiguriert.");
    return Response.json(
      { error: "CRON_SECRET ist nicht konfiguriert." },
      { status: 503, headers: { "x-request-id": requestId } },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    logger.warn("Cron notifications: nicht autorisierter Aufruf.");
    return Response.json(
      { error: "Nicht autorisiert." },
      { status: 401, headers: { "x-request-id": requestId } },
    );
  }

  logger.info("Cron notifications gestartet.");
  const now = new Date();
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      settings: {
        select: { mailNotifications: true, deadlineAlerts: true, digestTime: true },
      },
      memberships: {
        where: { role: { in: ["OWNER", "ADMIN", "HR"] } },
        select: { userId: true, user: { select: { email: true } } },
      },
    },
  });

  let digestsSent = 0;

  for (const tenant of tenants) {
    const settings = tenant.settings;

    if (!settings?.mailNotifications || !settings.deadlineAlerts) continue;
    if (!isDigestDue(settings.digestTime, now)) continue;

    const reminders = await prisma.tenantReminder.findMany({
      where: { tenantId: tenant.id, status: "open" },
      select: { title: true, dueDate: true },
    });

    const urgent = reminders
      .filter((reminder) => daysUntil(reminder.dueDate) <= 7)
      .sort((a, b) => daysUntil(a.dueDate) - daysUntil(b.dueDate))
      .slice(0, 10);

    if (urgent.length === 0 || tenant.memberships.length === 0) continue;

    const textLines = urgent
      .map((reminder) => `- ${reminder.title} (fällig ${reminder.dueDate})`)
      .join("\n");
    const htmlLines = urgent
      .map((reminder) => `<li>${reminder.title} — fällig ${reminder.dueDate}</li>`)
      .join("");

    await Promise.all(
      tenant.memberships.map((manager) =>
        dispatchNotification({
          userId: manager.userId,
          email: manager.user.email,
          subject: `${urgent.length} fällige Erinnerung(en) bei ${tenant.name}`,
          text: `Diese Woche fällige Erinnerungen bei ${tenant.name}:\n\n${textLines}`,
          html: `<p style="font-size:14px;">Diese Woche fällige Erinnerungen bei ${tenant.name}:</p><ul style="font-size:14px;">${htmlLines}</ul>`,
        }),
      ),
    );
    digestsSent += tenant.memberships.length;
  }

  logger.info("Cron notifications abgeschlossen.", { digestsSent });

  return Response.json(
    { status: "ok", digestsSent },
    { headers: { "x-request-id": requestId } },
  );
}
